/**
 * 订阅转换 API - 支持任意格式转换为 sing-box
 * 支持的输入格式: SS, SSR, VMess, VLESS, Trojan, Hysteria, Hysteria2, TUIC, WireGuard, HTTP/SOCKS5, Clash YAML/JSON
 */

const https = require('https');
const http = require('http');

// ==================== 工具函数 ====================

// Base64 解码 (支持 URL-safe 和标准 Base64)
function base64Decode(str) {
  if (!str) return '';
  try {
    // 处理 URL-safe base64
    let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    // 补齐 padding
    const pad = normalized.length % 4;
    if (pad) {
      normalized += '='.repeat(4 - pad);
    }
    return Buffer.from(normalized, 'base64').toString('utf-8');
  } catch (e) {
    return '';
  }
}

// 安全的 JSON 解析
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// 简易 YAML 解析器 (仅解析 proxies 部分)
function parseYaml(text) {
  try {
    // 尝试使用 js-yaml
    const yaml = require('js-yaml');
    return yaml.load(text);
  } catch (e) {
    // 简单的 YAML 解析回退
    return null;
  }
}

// HTTP 请求
async function fetchUrl(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const requestTimeout = setTimeout(() => {
      req.destroy();
      reject(new Error('请求超时'));
    }, timeout);

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'ClashForAndroid/2.5.12',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive'
      }
    };

    const req = protocol.request(options, (res) => {
      clearTimeout(requestTimeout);
      
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    
    req.on('error', (error) => {
      clearTimeout(requestTimeout);
      reject(error);
    });
    
    req.end();
  });
}

// 获取不为空的值
function getIfNotBlank(val, defaultVal = undefined) {
  if (val === null || val === undefined || val === '') return defaultVal;
  return val;
}

// 检查是否为 IPv6
function isIPv6(str) {
  return str && str.includes(':') && !str.includes('.');
}

// 检查是否为 IPv4
function isIPv4(str) {
  return str && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str);
}


// ==================== URI 解析器 ====================

// 解析 SS URI
function parseSSUri(line) {
  try {
    let content = line.split('ss://')[1];
    let name = content.split('#')[1];
    content = content.split('#')[0];
    
    const proxy = { type: 'ss' };
    
    // 处理 @ 分隔的格式
    let serverAndPortArray = content.match(/@([^/?]*)(\/|\?|$)/);
    let rawUserInfoStr = decodeURIComponent(content.split('@')[0]);
    let userInfoStr;
    
    if (rawUserInfoStr?.startsWith('2022-blake3-')) {
      userInfoStr = rawUserInfoStr;
    } else {
      userInfoStr = base64Decode(rawUserInfoStr);
      if (!userInfoStr || !userInfoStr.includes(':')) {
        userInfoStr = rawUserInfoStr;
      }
    }
    
    let query = '';
    if (!serverAndPortArray) {
      if (content.includes('?')) {
        const parsed = content.match(/^(.*)(\?.*)$/);
        content = parsed[1];
        query = parsed[2];
      }
      content = base64Decode(content);
      if (query) content = `${content}${query}`;
      userInfoStr = content.match(/(^.*)@/)?.[1];
      serverAndPortArray = content.match(/@([^/@]*)(\/|$)/);
    } else if (content.includes('?')) {
      query = content.match(/(\?.*)$/)?.[1] || '';
    }
    
    const serverAndPort = serverAndPortArray[1];
    const portIdx = serverAndPort.lastIndexOf(':');
    proxy.server = serverAndPort.substring(0, portIdx);
    proxy.port = parseInt(serverAndPort.substring(portIdx + 1).match(/\d+/)?.[0], 10);
    
    const userInfo = userInfoStr.match(/(^.*?):(.*$)/);
    proxy.method = userInfo?.[1];
    proxy.password = userInfo?.[2];
    
    // 处理插件
    const pluginMatch = content.match(/[?&]plugin=([^&]+)/);
    if (pluginMatch) {
      const pluginInfo = ('plugin=' + decodeURIComponent(pluginMatch[1])).split(';');
      const params = {};
      for (const item of pluginInfo) {
        const [key, val] = item.split('=');
        if (key) params[key] = val || true;
      }
      
      if (params.plugin === 'obfs-local' || params.plugin === 'simple-obfs') {
        proxy.plugin = 'obfs-local';
        proxy.plugin_opts = `obfs=${params.obfs}${params['obfs-host'] ? ';obfs-host=' + params['obfs-host'] : ''}`;
      } else if (params.plugin === 'v2ray-plugin') {
        proxy.plugin = 'v2ray-plugin';
        proxy.plugin_opts = `mode=${params.mode || 'websocket'}${params.host ? ';host=' + params.host : ''}${params.path ? ';path=' + params.path : ''}${params.tls ? ';tls' : ''}`;
      }
    }
    
    if (/(&|\?)uot=(1|true)/i.test(query)) {
      proxy.udp_over_tcp = true;
    }
    
    if (name) proxy.name = decodeURIComponent(name);
    else proxy.name = `SS ${proxy.server}:${proxy.port}`;
    
    return proxy;
  } catch (e) {
    console.error('SS 解析失败:', e.message);
    return null;
  }
}

// 解析 SSR URI
function parseSSRUri(line) {
  try {
    const decoded = base64Decode(line.split('ssr://')[1]);
    
    let splitIdx = decoded.indexOf(':origin');
    if (splitIdx === -1) splitIdx = decoded.indexOf(':auth_');
    
    const serverAndPort = decoded.substring(0, splitIdx);
    const server = serverAndPort.substring(0, serverAndPort.lastIndexOf(':'));
    const port = parseInt(serverAndPort.substring(serverAndPort.lastIndexOf(':') + 1), 10);
    
    const params = decoded.substring(splitIdx + 1).split('/?')[0].split(':');
    const protocol = params[0];
    const method = params[1];
    const obfs = params[2];
    const password = base64Decode(params[3]);
    
    // 解析其他参数
    const otherParams = {};
    const paramStr = decoded.split('/?')[1];
    if (paramStr) {
      for (const item of paramStr.split('&')) {
        const [key, val] = item.split('=');
        if (val && val.trim() && val !== '(null)') {
          otherParams[key] = base64Decode(val);
        }
      }
    }
    
    return {
      type: 'ssr',
      name: otherParams.remarks || `SSR ${server}:${port}`,
      server,
      port,
      method,
      password,
      protocol,
      protocol_param: otherParams.protoparam || '',
      obfs,
      obfs_param: otherParams.obfsparam || ''
    };
  } catch (e) {
    console.error('SSR 解析失败:', e.message);
    return null;
  }
}

// 解析 VMess URI
function parseVMessUri(line) {
  try {
    const content = base64Decode(line.split('vmess://')[1].replace(/\?.*?$/, ''));
    
    // Quantumult X 格式
    if (/=\s*vmess/.test(content)) {
      return parseQXVMess(content);
    }
    
    let params = {};
    try {
      params = JSON.parse(content);
    } catch (e) {
      // Shadowrocket 格式
      const [base64Line, qs] = line.split('vmess://')[1].match(/(^[^?]+?)\/?\?(.*)$/)?.slice(1) || [];
      const decoded = base64Decode(base64Line);
      
      for (const addon of (qs || '').split('&')) {
        const [key, valueRaw] = addon.split('=');
        params[key] = decodeURIComponent(valueRaw || '');
      }
      
      const match = /(^[^:]+?):([^:]+?)@(.*):(\d+)$/.exec(decoded);
      if (match) {
        params.scy = match[1];
        params.id = match[2];
        params.add = match[3];
        params.port = match[4];
      }
    }
    
    const server = params.add;
    const port = parseInt(params.port, 10);
    
    const proxy = {
      type: 'vmess',
      name: params.ps || params.remarks || `VMess ${server}:${port}`,
      server,
      port,
      uuid: params.id,
      alterId: parseInt(params.aid || params.alterId || 0, 10),
      security: ['auto', 'aes-128-gcm', 'chacha20-poly1305', 'none'].includes(params.scy) ? params.scy : 'auto',
      tls: ['tls', true, 1, '1'].includes(params.tls),
      skip_cert_verify: params.allowInsecure === '1' || params.allowInsecure === 'true'
    };
    
    if (proxy.tls && (params.sni || params.peer)) {
      proxy.sni = params.sni || params.peer;
    }
    
    // 传输层配置
    let network = params.net || 'tcp';
    if (network === 'httpupgrade') {
      network = 'ws';
      proxy.httpupgrade = true;
    }
    
    if (network === 'ws') {
      proxy.transport = {
        type: 'ws',
        path: params.path || '/',
        headers: params.host ? { Host: params.host } : undefined
      };
      if (proxy.httpupgrade) {
        proxy.transport.type = 'httpupgrade';
      }
    } else if (network === 'grpc') {
      proxy.transport = {
        type: 'grpc',
        service_name: params.path || ''
      };
    } else if (network === 'h2' || network === 'http') {
      proxy.transport = {
        type: 'http',
        host: params.host ? [params.host] : undefined,
        path: params.path || '/'
      };
    }
    
    if (params.fp) proxy.fingerprint = params.fp;
    if (params.alpn) proxy.alpn = params.alpn.split(',');
    
    return proxy;
  } catch (e) {
    console.error('VMess 解析失败:', e.message);
    return null;
  }
}

function parseQXVMess(content) {
  const partitions = content.split(',').map(p => p.trim());
  const params = {};
  for (const part of partitions) {
    if (part.includes('=')) {
      const [key, val] = part.split('=');
      params[key.trim()] = val.trim();
    }
  }
  
  return {
    type: 'vmess',
    name: partitions[0].split('=')[0].trim(),
    server: partitions[1],
    port: parseInt(partitions[2], 10),
    uuid: partitions[4].match(/^"(.*)"$/)?.[1] || partitions[4],
    security: partitions[3] || 'auto',
    tls: params.obfs === 'wss',
    transport: (params.obfs === 'ws' || params.obfs === 'wss') ? {
      type: 'ws',
      path: (params['obfs-path'] || '"/').match(/^"(.*)"$/)?.[1] || '/',
      headers: params['obfs-header']?.includes('Host') ? { Host: params['obfs-header'].match(/Host:\s*([a-zA-Z0-9-.]*)/)?.[1] } : undefined
    } : undefined
  };
}


// 解析 VLESS URI
function parseVLESSUri(line) {
  try {
    line = line.split('vless://')[1];
    let isShadowrocket = false;
    let parsed = /^(.*?)@(.*?):(\d+)\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
    
    if (!parsed) {
      const [base64, other] = line.match(/^(.*?)(\?.*?$)/)?.slice(1) || [];
      line = `${base64Decode(base64)}${other}`;
      parsed = /^(.*?)@(.*?):(\d+)\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
      isShadowrocket = true;
    }
    
    let [, uuid, server, port, , addons = '', name] = parsed;
    if (isShadowrocket) uuid = uuid.replace(/^.*?:/g, '');
    
    port = parseInt(port, 10);
    uuid = decodeURIComponent(uuid);
    if (name) name = decodeURIComponent(name);
    
    const proxy = {
      type: 'vless',
      name: name || `VLESS ${server}:${port}`,
      server,
      port,
      uuid
    };
    
    const params = {};
    for (const addon of addons.split('&')) {
      if (addon) {
        const [key, valueRaw] = addon.split('=');
        params[key] = decodeURIComponent(valueRaw || '');
      }
    }
    
    proxy.tls = params.security && params.security !== 'none';
    if (isShadowrocket && /TRUE|1/i.test(params.tls)) {
      proxy.tls = true;
      params.security = params.security || 'reality';
    }
    
    proxy.sni = params.sni || params.peer;
    proxy.flow = params.flow;
    proxy.fingerprint = params.fp;
    proxy.alpn = params.alpn ? params.alpn.split(',') : undefined;
    proxy.skip_cert_verify = /(TRUE)|1/i.test(params.allowInsecure);
    
    // Reality 配置
    if (params.security === 'reality') {
      proxy.reality = {
        enabled: true,
        public_key: params.pbk,
        short_id: params.sid
      };
    }
    
    // 传输层
    let network = params.type || 'tcp';
    if (network === 'httpupgrade') {
      network = 'ws';
      proxy.httpupgrade = true;
    }
    
    if (network === 'ws' || network === 'websocket') {
      proxy.transport = {
        type: proxy.httpupgrade ? 'httpupgrade' : 'ws',
        path: params.path || '/',
        headers: params.host ? { Host: params.host } : undefined
      };
    } else if (network === 'grpc') {
      proxy.transport = {
        type: 'grpc',
        service_name: params.serviceName || params.path || ''
      };
    } else if (network === 'h2' || network === 'http') {
      proxy.transport = {
        type: 'http',
        host: params.host ? [params.host] : undefined,
        path: params.path || '/'
      };
    }
    
    return proxy;
  } catch (e) {
    console.error('VLESS 解析失败:', e.message);
    return null;
  }
}

// 解析 Trojan URI
function parseTrojanUri(line) {
  try {
    // 补全默认端口
    const matched = /^(trojan:\/\/.*?@.*?)(:(\d+))?\/?(\?.*?)?$/.exec(line);
    if (matched && !matched[2]) {
      line = line.replace(matched[1], `${matched[1]}:443`);
    }
    
    const [newLine, name] = line.split(/#(.+)/, 2);
    const url = new URL(newLine);
    
    const proxy = {
      type: 'trojan',
      name: name ? decodeURIComponent(name) : `Trojan ${url.hostname}:${url.port}`,
      server: url.hostname,
      port: parseInt(url.port, 10),
      password: decodeURIComponent(url.username),
      tls: true
    };
    
    const params = Object.fromEntries(url.searchParams);
    
    proxy.sni = params.sni || params.peer || url.hostname;
    proxy.skip_cert_verify = /(TRUE)|1/i.test(params.allowInsecure);
    proxy.fingerprint = params.fp;
    proxy.alpn = params.alpn ? params.alpn.split(',') : undefined;
    
    // Reality 配置
    if (params.security === 'reality') {
      proxy.reality = {
        enabled: true,
        public_key: params.pbk,
        short_id: params.sid
      };
    }
    
    // 传输层
    const network = params.type || 'tcp';
    if (network === 'ws' || network === 'websocket') {
      proxy.transport = {
        type: 'ws',
        path: params.path || '/',
        headers: params.host ? { Host: params.host } : undefined
      };
    } else if (network === 'grpc') {
      proxy.transport = {
        type: 'grpc',
        service_name: params.serviceName || ''
      };
    }
    
    return proxy;
  } catch (e) {
    console.error('Trojan 解析失败:', e.message);
    return null;
  }
}

// 解析 Hysteria2 URI
function parseHysteria2Uri(line) {
  try {
    line = line.split(/(hysteria2|hy2):\/\//)[2];
    
    const match = /^(.*?)@(.*?)(:((\d+(-\d+)?)([,;]\d+(-\d+)?)*))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
    let [, password, server, , port, , , , , , addons = '', name] = match;
    
    if (/^\d+$/.test(port)) {
      port = parseInt(port, 10);
    } else if (port) {
      // 端口跳跃，取第一个端口
      port = parseInt(port.split(/[-,;]/)[0], 10);
    } else {
      port = 443;
    }
    
    password = decodeURIComponent(password);
    if (name) name = decodeURIComponent(name);
    
    const proxy = {
      type: 'hysteria2',
      name: name || `Hysteria2 ${server}:${port}`,
      server,
      port,
      password
    };
    
    const params = {};
    for (const addon of addons.split('&')) {
      if (addon) {
        const [key, valueRaw] = addon.split('=');
        params[key] = decodeURIComponent(valueRaw || '');
      }
    }
    
    proxy.sni = params.sni || params.peer;
    proxy.skip_cert_verify = /(TRUE)|1/i.test(params.insecure);
    
    if (params.obfs && params.obfs !== 'none') {
      proxy.obfs = {
        type: params.obfs,
        password: params['obfs-password']
      };
    }
    
    return proxy;
  } catch (e) {
    console.error('Hysteria2 解析失败:', e.message);
    return null;
  }
}

// 解析 Hysteria URI
function parseHysteriaUri(line) {
  try {
    line = line.split(/(hysteria|hy):\/\//)[2];
    const match = /^(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
    let [, server, , port, , addons = '', name] = match;
    
    port = parseInt(port, 10) || 443;
    if (name) name = decodeURIComponent(name);
    
    const proxy = {
      type: 'hysteria',
      name: name || `Hysteria ${server}:${port}`,
      server,
      port
    };
    
    for (const addon of addons.split('&')) {
      if (addon) {
        let [key, value] = addon.split('=');
        key = key.replace(/_/g, '-');
        value = decodeURIComponent(value || '');
        
        if (key === 'alpn') proxy.alpn = value.split(',');
        else if (key === 'insecure') proxy.skip_cert_verify = /(TRUE)|1/i.test(value);
        else if (key === 'auth') proxy.auth_str = value;
        else if (key === 'upmbps') proxy.up_mbps = parseInt(value, 10);
        else if (key === 'downmbps') proxy.down_mbps = parseInt(value, 10);
        else if (key === 'obfsParam') proxy.obfs = value;
        else if (key === 'peer' || key === 'sni') proxy.sni = value;
      }
    }
    
    return proxy;
  } catch (e) {
    console.error('Hysteria 解析失败:', e.message);
    return null;
  }
}

// 解析 TUIC URI
function parseTUICUri(line) {
  try {
    line = line.split(/tuic:\/\//)[1];
    const match = /^(.*?)@(.*?)(?::(\d+))?\/?(?:\?(.*?))?(?:#(.*?))?$/.exec(line);
    let [, auth, server, port, addons = '', name] = match;
    
    auth = decodeURIComponent(auth);
    const [uuid, ...passwordParts] = auth.split(':');
    const password = passwordParts.join(':');
    
    port = parseInt(port, 10) || 443;
    if (name) name = decodeURIComponent(name);
    
    const proxy = {
      type: 'tuic',
      name: name || `TUIC ${server}:${port}`,
      server,
      port,
      uuid,
      password
    };
    
    for (const addon of addons.split('&')) {
      if (addon) {
        let [key, value] = addon.split('=');
        key = key.replace(/_/g, '-');
        value = decodeURIComponent(value || '');
        
        if (key === 'alpn') proxy.alpn = value.split(',');
        else if (key === 'allow-insecure' || key === 'insecure') proxy.skip_cert_verify = /(TRUE)|1/i.test(value);
        else if (key === 'sni') proxy.sni = value;
        else if (key === 'congestion-control') proxy.congestion_control = value;
      }
    }
    
    return proxy;
  } catch (e) {
    console.error('TUIC 解析失败:', e.message);
    return null;
  }
}

// 解析 WireGuard URI
function parseWireGuardUri(line) {
  try {
    line = line.split(/(wireguard|wg):\/\//)[2];
    const match = /^((.*?)@)?(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
    let [, , privateKey, server, , port, , addons = '', name] = match;
    
    port = parseInt(port, 10) || 51820;
    if (privateKey) privateKey = decodeURIComponent(privateKey);
    if (name) name = decodeURIComponent(name);
    
    const proxy = {
      type: 'wireguard',
      name: name || `WireGuard ${server}:${port}`,
      server,
      port,
      private_key: privateKey
    };
    
    for (const addon of addons.split('&')) {
      if (addon) {
        let [key, value] = addon.split('=');
        key = key.replace(/_/g, '-');
        value = decodeURIComponent(value || '');
        
        if (key === 'reserved') {
          const parsed = value.split(',').map(i => parseInt(i.trim(), 10)).filter(i => Number.isInteger(i));
          if (parsed.length === 3) proxy.reserved = parsed;
        } else if (key === 'address' || key === 'ip') {
          value.split(',').forEach(i => {
            const ip = i.trim().replace(/\/\d+$/, '').replace(/^\[/, '').replace(/\]$/, '');
            if (isIPv4(ip)) proxy.local_address = proxy.local_address || [];
            if (isIPv4(ip)) proxy.local_address.push(`${ip}/32`);
            else if (isIPv6(ip)) {
              proxy.local_address = proxy.local_address || [];
              proxy.local_address.push(`${ip}/128`);
            }
          });
        } else if (key === 'mtu') proxy.mtu = parseInt(value, 10);
        else if (/publickey/i.test(key)) proxy.peer_public_key = value;
        else if (/privatekey/i.test(key)) proxy.private_key = value;
      }
    }
    
    return proxy;
  } catch (e) {
    console.error('WireGuard 解析失败:', e.message);
    return null;
  }
}

// 解析 HTTP/SOCKS5 Proxy URI
function parseProxyUri(line) {
  try {
    const match = /^(socks5|http|http)(\+tls|s)?:\/\/(?:(.*?):(.*?)@)?(.*?)(?::(\d+?))?\/?(\?.*?)?(?:#(.*?))?$/.exec(line);
    let [, type, tls, username, password, server, port, , name] = match;
    
    if (port) port = parseInt(port, 10);
    else port = tls ? 443 : (type === 'http' ? 80 : 1080);
    
    const proxy = {
      type: type === 'http' ? 'http' : 'socks',
      name: name ? decodeURIComponent(name) : `${type} ${server}:${port}`,
      server,
      port,
      tls: !!tls
    };
    
    if (username) proxy.username = decodeURIComponent(username);
    if (password) proxy.password = decodeURIComponent(password);
    
    return proxy;
  } catch (e) {
    console.error('Proxy URI 解析失败:', e.message);
    return null;
  }
}


// ==================== Clash 格式解析 ====================

function parseClashProxy(proxy) {
  if (!proxy || !proxy.type) return null;
  
  const result = {
    type: proxy.type,
    name: proxy.name || `${proxy.type} ${proxy.server}:${proxy.port}`,
    server: proxy.server,
    port: proxy.port
  };
  
  // 通用字段
  if (proxy.password) result.password = proxy.password;
  if (proxy.uuid) result.uuid = proxy.uuid;
  if (proxy.sni || proxy.servername) result.sni = proxy.sni || proxy.servername;
  if (proxy['skip-cert-verify']) result.skip_cert_verify = proxy['skip-cert-verify'];
  if (proxy.alpn) result.alpn = proxy.alpn;
  if (proxy.tls) result.tls = proxy.tls;
  if (proxy['client-fingerprint'] || proxy.fingerprint) {
    result.fingerprint = proxy['client-fingerprint'] || proxy.fingerprint;
  }
  
  // 协议特定字段
  switch (proxy.type) {
    case 'ss':
      result.method = proxy.cipher;
      result.password = proxy.password;
      if (proxy.plugin) {
        result.plugin = proxy.plugin;
        if (proxy['plugin-opts']) {
          const opts = proxy['plugin-opts'];
          if (proxy.plugin === 'obfs') {
            result.plugin = 'obfs-local';
            result.plugin_opts = `obfs=${opts.mode}${opts.host ? ';obfs-host=' + opts.host : ''}`;
          } else if (proxy.plugin === 'v2ray-plugin') {
            result.plugin = 'v2ray-plugin';
            result.plugin_opts = `mode=${opts.mode || 'websocket'}${opts.host ? ';host=' + opts.host : ''}${opts.path ? ';path=' + opts.path : ''}${opts.tls ? ';tls' : ''}`;
          }
        }
      }
      if (proxy['udp-over-tcp']) result.udp_over_tcp = true;
      break;
      
    case 'ssr':
      result.method = proxy.cipher;
      result.password = proxy.password;
      result.protocol = proxy.protocol;
      result.protocol_param = proxy['protocol-param'];
      result.obfs = proxy.obfs;
      result.obfs_param = proxy['obfs-param'];
      break;
      
    case 'vmess':
      result.uuid = proxy.uuid;
      result.alterId = proxy.alterId || proxy['alter-id'] || 0;
      result.security = proxy.cipher || 'auto';
      break;
      
    case 'vless':
      result.uuid = proxy.uuid;
      result.flow = proxy.flow;
      break;
      
    case 'trojan':
      result.password = proxy.password;
      break;
      
    case 'hysteria':
      result.auth_str = proxy['auth-str'] || proxy.auth;
      result.up_mbps = proxy.up ? parseInt(proxy.up, 10) : undefined;
      result.down_mbps = proxy.down ? parseInt(proxy.down, 10) : undefined;
      if (proxy.obfs) result.obfs = proxy.obfs;
      break;
      
    case 'hysteria2':
      result.password = proxy.password;
      if (proxy.obfs) {
        result.obfs = {
          type: proxy.obfs,
          password: proxy['obfs-password']
        };
      }
      break;
      
    case 'tuic':
      result.uuid = proxy.uuid;
      result.password = proxy.password;
      result.congestion_control = proxy['congestion-controller'] || proxy['congestion-control'];
      break;
      
    case 'wireguard':
      result.private_key = proxy['private-key'];
      result.peer_public_key = proxy['public-key'];
      result.reserved = proxy.reserved;
      result.mtu = proxy.mtu;
      if (proxy.ip || proxy.ipv6) {
        result.local_address = [];
        if (proxy.ip) result.local_address.push(`${proxy.ip}/32`);
        if (proxy.ipv6) result.local_address.push(`${proxy.ipv6}/128`);
      }
      break;
      
    case 'http':
    case 'socks5':
      result.type = proxy.type === 'socks5' ? 'socks' : 'http';
      result.username = proxy.username;
      result.password = proxy.password;
      break;
  }
  
  // Reality 配置
  if (proxy['reality-opts']) {
    result.reality = {
      enabled: true,
      public_key: proxy['reality-opts']['public-key'],
      short_id: proxy['reality-opts']['short-id']
    };
  }
  
  // 传输层配置
  const network = proxy.network;
  if (network && network !== 'tcp') {
    const opts = proxy[`${network}-opts`] || {};
    
    if (network === 'ws') {
      result.transport = {
        type: opts['v2ray-http-upgrade'] ? 'httpupgrade' : 'ws',
        path: opts.path || '/',
        headers: opts.headers
      };
    } else if (network === 'grpc') {
      result.transport = {
        type: 'grpc',
        service_name: opts['grpc-service-name'] || ''
      };
    } else if (network === 'h2' || network === 'http') {
      result.transport = {
        type: 'http',
        host: opts.host,
        path: opts.path || '/'
      };
    }
  }
  
  return result;
}

// ==================== 主解析函数 ====================

function parseLine(line) {
  line = line.trim();
  if (!line) return null;
  
  try {
    if (line.startsWith('ss://') && !line.startsWith('ssr://')) {
      return parseSSUri(line);
    } else if (line.startsWith('ssr://')) {
      return parseSSRUri(line);
    } else if (line.startsWith('vmess://')) {
      return parseVMessUri(line);
    } else if (line.startsWith('vless://')) {
      return parseVLESSUri(line);
    } else if (line.startsWith('trojan://')) {
      return parseTrojanUri(line);
    } else if (line.startsWith('hysteria2://') || line.startsWith('hy2://')) {
      return parseHysteria2Uri(line);
    } else if (line.startsWith('hysteria://') || line.startsWith('hy://')) {
      return parseHysteriaUri(line);
    } else if (line.startsWith('tuic://')) {
      return parseTUICUri(line);
    } else if (line.startsWith('wireguard://') || line.startsWith('wg://')) {
      return parseWireGuardUri(line);
    } else if (/^(socks5|http|https)(\+tls)?:\/\//.test(line)) {
      return parseProxyUri(line);
    }
    
    // 尝试解析为 Clash YAML 单行或 JSON
    try {
      const parsed = safeJsonParse(line);
      if (parsed && parsed.type) {
        return parseClashProxy(parsed);
      }
    } catch (e) {}
    
    return null;
  } catch (e) {
    console.error('解析行失败:', e.message);
    return null;
  }
}

async function parseSubscription(url) {
  try {
    const text = await fetchUrl(url);
    return parseContent(text);
  } catch (e) {
    console.error(`获取订阅失败 ${url}:`, e.message);
    return { proxies: [], error: e.message };
  }
}

function parseContent(text) {
  const proxies = [];
  
  // 尝试解析为 Clash YAML
  if (text.includes('proxies:')) {
    try {
      const config = parseYaml(text);
      if (config && Array.isArray(config.proxies)) {
        for (const proxy of config.proxies) {
          const parsed = parseClashProxy(proxy);
          if (parsed) proxies.push(parsed);
        }
        return { proxies };
      }
    } catch (e) {}
  }
  
  // 尝试解析为 JSON
  try {
    const json = JSON.parse(text);
    if (json.proxies && Array.isArray(json.proxies)) {
      for (const proxy of json.proxies) {
        const parsed = parseClashProxy(proxy);
        if (parsed) proxies.push(parsed);
      }
      return { proxies };
    }
    // sing-box 格式
    if (json.outbounds && Array.isArray(json.outbounds)) {
      for (const outbound of json.outbounds) {
        if (outbound.server) {
          proxies.push(outbound);
        }
      }
      return { proxies };
    }
  } catch (e) {}
  
  // 尝试 Base64 解码
  let content = text;
  try {
    const decoded = base64Decode(text.trim());
    if (decoded && (decoded.includes('://') || decoded.includes('proxies:'))) {
      content = decoded;
    }
  } catch (e) {}
  
  // 按行解析
  const lines = content.split(/[\r\n]+/);
  for (const line of lines) {
    const proxy = parseLine(line);
    if (proxy) proxies.push(proxy);
  }
  
  return { proxies };
}


// ==================== sing-box 格式生成 ====================

function toSingBoxOutbound(proxy) {
  if (!proxy || !proxy.type || !proxy.server) return null;
  
  const tag = proxy.name || `${proxy.type}-${proxy.server}`;
  
  // 基础 TLS 配置
  function buildTLS(proxy) {
    if (!proxy.tls && !proxy.reality) return undefined;
    
    const tls = { enabled: true };
    
    if (proxy.sni) tls.server_name = proxy.sni;
    if (proxy.skip_cert_verify) tls.insecure = true;
    if (proxy.alpn) tls.alpn = proxy.alpn;
    if (proxy.fingerprint) {
      tls.utls = { enabled: true, fingerprint: proxy.fingerprint };
    }
    
    // Reality
    if (proxy.reality) {
      tls.reality = {
        enabled: true,
        public_key: proxy.reality.public_key,
        short_id: proxy.reality.short_id || ''
      };
    }
    
    return tls;
  }
  
  // 传输层配置
  function buildTransport(proxy) {
    if (!proxy.transport) return undefined;
    
    const t = proxy.transport;
    const transport = { type: t.type };
    
    if (t.type === 'ws' || t.type === 'httpupgrade') {
      if (t.path) transport.path = t.path;
      if (t.headers) transport.headers = t.headers;
      if (t.type === 'httpupgrade') transport.type = 'httpupgrade';
    } else if (t.type === 'grpc') {
      if (t.service_name) transport.service_name = t.service_name;
    } else if (t.type === 'http') {
      if (t.host) transport.host = Array.isArray(t.host) ? t.host : [t.host];
      if (t.path) transport.path = t.path;
    }
    
    return transport;
  }
  
  let outbound = null;
  
  switch (proxy.type) {
    case 'ss':
      outbound = {
        type: 'shadowsocks',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        method: proxy.method,
        password: proxy.password
      };
      if (proxy.plugin) {
        outbound.plugin = proxy.plugin;
        outbound.plugin_opts = proxy.plugin_opts;
      }
      if (proxy.udp_over_tcp) {
        outbound.udp_over_tcp = { enabled: true };
      }
      break;
      
    case 'ssr':
      // sing-box 不原生支持 SSR，需要转换或跳过
      // 这里我们尝试用 shadowsocks 兼容
      console.warn(`SSR 协议在 sing-box 中不被原生支持: ${tag}`);
      return null;
      
    case 'vmess':
      outbound = {
        type: 'vmess',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        uuid: proxy.uuid,
        security: proxy.security || 'auto',
        alter_id: proxy.alterId || 0
      };
      if (proxy.tls || proxy.reality) outbound.tls = buildTLS(proxy);
      if (proxy.transport) outbound.transport = buildTransport(proxy);
      break;
      
    case 'vless':
      outbound = {
        type: 'vless',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        uuid: proxy.uuid
      };
      if (proxy.flow) outbound.flow = proxy.flow;
      if (proxy.tls || proxy.reality) outbound.tls = buildTLS(proxy);
      if (proxy.transport) outbound.transport = buildTransport(proxy);
      break;
      
    case 'trojan':
      outbound = {
        type: 'trojan',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        password: proxy.password
      };
      outbound.tls = buildTLS(proxy) || { enabled: true };
      if (!outbound.tls.server_name) {
        outbound.tls.server_name = proxy.server;
      }
      if (proxy.transport) outbound.transport = buildTransport(proxy);
      break;
      
    case 'hysteria':
      outbound = {
        type: 'hysteria',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        auth_str: proxy.auth_str
      };
      if (proxy.up_mbps) outbound.up_mbps = proxy.up_mbps;
      if (proxy.down_mbps) outbound.down_mbps = proxy.down_mbps;
      if (proxy.obfs) outbound.obfs = proxy.obfs;
      outbound.tls = buildTLS(proxy) || { enabled: true };
      if (!outbound.tls.server_name) {
        outbound.tls.server_name = proxy.sni || proxy.server;
      }
      break;
      
    case 'hysteria2':
      outbound = {
        type: 'hysteria2',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        password: proxy.password
      };
      if (proxy.obfs) outbound.obfs = proxy.obfs;
      outbound.tls = buildTLS(proxy) || { enabled: true };
      if (!outbound.tls.server_name) {
        outbound.tls.server_name = proxy.sni || proxy.server;
      }
      break;
      
    case 'tuic':
      outbound = {
        type: 'tuic',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        uuid: proxy.uuid,
        password: proxy.password
      };
      if (proxy.congestion_control) {
        outbound.congestion_control = proxy.congestion_control;
      }
      outbound.tls = buildTLS(proxy) || { enabled: true };
      if (!outbound.tls.server_name) {
        outbound.tls.server_name = proxy.sni || proxy.server;
      }
      break;
      
    case 'wireguard':
      outbound = {
        type: 'wireguard',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        private_key: proxy.private_key,
        peer_public_key: proxy.peer_public_key
      };
      if (proxy.local_address) outbound.local_address = proxy.local_address;
      if (proxy.reserved) outbound.reserved = proxy.reserved;
      if (proxy.mtu) outbound.mtu = proxy.mtu;
      break;
      
    case 'http':
      outbound = {
        type: 'http',
        tag,
        server: proxy.server,
        server_port: proxy.port
      };
      if (proxy.username) outbound.username = proxy.username;
      if (proxy.password) outbound.password = proxy.password;
      if (proxy.tls) outbound.tls = buildTLS(proxy);
      break;
      
    case 'socks':
      outbound = {
        type: 'socks',
        tag,
        server: proxy.server,
        server_port: proxy.port,
        version: '5'
      };
      if (proxy.username) outbound.username = proxy.username;
      if (proxy.password) outbound.password = proxy.password;
      break;
      
    default:
      console.warn(`不支持的协议类型: ${proxy.type}`);
      return null;
  }
  
  return outbound;
}

function generateSingBoxConfig(proxies, options = {}) {
  const outbounds = [];
  const proxyTags = [];
  
  // 转换所有代理
  for (const proxy of proxies) {
    const outbound = toSingBoxOutbound(proxy);
    if (outbound) {
      // 确保 tag 唯一
      let tag = outbound.tag;
      let counter = 1;
      while (proxyTags.includes(tag)) {
        tag = `${outbound.tag} (${counter++})`;
      }
      outbound.tag = tag;
      proxyTags.push(tag);
      outbounds.push(outbound);
    }
  }
  
  // 构建完整配置 (sing-box 1.11+ 格式)
  const config = {
    log: {
      level: 'info',
      timestamp: true
    },
    experimental: {
      clash_api: {
        external_controller: '127.0.0.1:9090',
        external_ui: 'ui',
        secret: '',
        default_mode: 'rule'
      },
      cache_file: {
        enabled: true,
        store_fakeip: false
      }
    },
    dns: {
      servers: [
        {
          tag: 'dns-remote',
          address: 'tls://1.1.1.1',
          address_resolver: 'dns-local',
          detour: 'proxy'
        },
        {
          tag: 'dns-direct',
          address: 'tls://223.5.5.5',
          address_resolver: 'dns-local',
          detour: 'direct'
        },
        {
          tag: 'dns-local',
          address: '223.5.5.5',
          detour: 'direct'
        },
        {
          tag: 'dns-block',
          address: 'rcode://success'
        }
      ],
      rules: [
        {
          outbound: 'any',
          server: 'dns-local'
        },
        {
          domain_suffix: ['.in-addr.arpa', '.ip6.arpa'],
          server: 'dns-local'
        }
      ],
      final: 'dns-remote',
      strategy: 'prefer_ipv4',
      independent_cache: true
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'tun0',
        address: [
          '172.19.0.1/30',
          'fdfe:dcba:9876::1/126'
        ],
        mtu: 9000,
        auto_route: true,
        strict_route: false,
        stack: 'mixed',
        sniff: true,
        sniff_override_destination: false
      },
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: 7890,
        sniff: true
      }
    ],
    outbounds: [
      // 代理选择组
      {
        type: 'selector',
        tag: 'proxy',
        outbounds: ['auto', ...proxyTags, 'direct'],
        default: 'auto'
      },
      // 自动选择组
      {
        type: 'urltest',
        tag: 'auto',
        outbounds: proxyTags,
        url: 'https://www.gstatic.com/generate_204',
        interval: '5m',
        tolerance: 50
      },
      // 所有代理节点
      ...outbounds,
      // 直连
      {
        type: 'direct',
        tag: 'direct'
      }
    ],
    route: {
      rules: [
        {
          protocol: 'dns',
          action: 'hijack-dns'
        },
        {
          ip_is_private: true,
          outbound: 'direct'
        },
        {
          rule_set: 'geosite-cn',
          outbound: 'direct'
        },
        {
          rule_set: 'geoip-cn',
          outbound: 'direct'
        }
      ],
      rule_set: [
        {
          tag: 'geosite-cn',
          type: 'remote',
          format: 'binary',
          url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs',
          download_detour: 'proxy'
        },
        {
          tag: 'geoip-cn',
          type: 'remote',
          format: 'binary',
          url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs',
          download_detour: 'proxy'
        }
      ],
      final: 'proxy',
      auto_detect_interface: true
    }
  };
  
  // 如果只需要 outbounds
  if (options.outboundsOnly) {
    return { outbounds };
  }
  
  return config;
}


// ==================== API Handler ====================

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { urls, url, content, outboundsOnly } = req.query;
  
  // 验证参数
  const urlList = (urls || url || '').split(',').filter(Boolean).map(u => u.trim());
  
  if (urlList.length === 0 && !content) {
    return res.status(400).json({
      success: false,
      error: '参数错误',
      message: '请提供 urls 参数（订阅链接，多个用逗号分隔）或 content 参数（直接传入节点内容）',
      example: '/api/singbox?urls=https://example.com/sub1,https://example.com/sub2'
    });
  }
  
  try {
    const allProxies = [];
    const errors = [];
    
    // 处理 URL 订阅
    for (const subUrl of urlList) {
      console.log(`解析订阅: ${subUrl}`);
      const result = await parseSubscription(subUrl);
      
      if (result.error) {
        errors.push({ url: subUrl, error: result.error });
      }
      
      if (result.proxies.length > 0) {
        allProxies.push(...result.proxies);
        console.log(`从 ${subUrl} 获取了 ${result.proxies.length} 个节点`);
      }
    }
    
    // 处理直接传入的内容
    if (content) {
      const decoded = decodeURIComponent(content);
      const result = parseContent(decoded);
      if (result.proxies.length > 0) {
        allProxies.push(...result.proxies);
        console.log(`从 content 参数获取了 ${result.proxies.length} 个节点`);
      }
    }
    
    // 检查是否有节点
    if (allProxies.length === 0) {
      return res.status(400).json({
        success: false,
        error: '无有效节点',
        message: '无法从提供的订阅链接中解析出任何有效节点',
        errors
      });
    }
    
    console.log(`共解析 ${allProxies.length} 个节点，开始生成 sing-box 配置`);
    
    // 生成 sing-box 配置
    const config = generateSingBoxConfig(allProxies, {
      outboundsOnly: outboundsOnly === 'true' || outboundsOnly === '1'
    });
    
    // 统计信息
    const stats = {
      total: allProxies.length,
      converted: config.outbounds ? config.outbounds.filter(o => o.server).length : 0,
      types: {}
    };
    
    for (const proxy of allProxies) {
      stats.types[proxy.type] = (stats.types[proxy.type] || 0) + 1;
    }
    
    // 返回配置
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sing-box-config.json"');
    res.setHeader('X-Subscription-Userinfo', `total=${stats.total};converted=${stats.converted}`);
    
    return res.status(200).json(config);
    
  } catch (error) {
    console.error('处理订阅时出错:', error);
    return res.status(500).json({
      success: false,
      error: '服务器错误',
      message: error.message
    });
  }
}
