const axios = require('axios');
const yaml = require('js-yaml');
const { Base64 } = require('js-base64');

// 解析订阅链接
async function parseSubscription(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'SubMerge/1.0.0'
      }
    });
    
    const content = response.data;
    
    // 判断内容类型
    if (typeof content === 'string') {
      // 可能是Base64编码的订阅
      if (content.trim().startsWith('proxies:') || content.includes('proxies:')) {
        // 是Clash配置
        return parseClashConfig(content);
      } else {
        // 尝试Base64解码
        try {
          const decoded = Base64.decode(content);
          if (decoded.startsWith('proxies:') || decoded.includes('proxies:')) {
            // 解码后是Clash配置
            return parseClashConfig(decoded);
          } else {
            // 普通Base64编码的订阅
            return parseBase64Subscription(content);
          }
        } catch (e) {
          console.error(`解析订阅内容失败: ${e.message}`);
          return [];
        }
      }
    } else if (typeof content === 'object' && content.proxies) {
      // 已经是Clash配置对象
      return content.proxies;
    }
    
    return [];
  } catch (error) {
    console.error(`获取订阅内容失败: ${error.message}`);
    return [];
  }
}

// 解析Clash配置
function parseClashConfig(content) {
  try {
    // 如果是字符串，解析YAML
    const config = typeof content === 'string' ? yaml.load(content) : content;
    
    if (config && config.proxies && Array.isArray(config.proxies)) {
      return config.proxies;
    }
    
    console.warn("Clash配置中未找到有效的proxies字段");
    return [];
  } catch (e) {
    console.error(`解析Clash配置失败: ${e.message}`);
    return [];
  }
}

// 解析Base64编码的订阅
function parseBase64Subscription(content) {
  try {
    // 解码Base64内容
    const decoded = Base64.decode(content);
    const nodes = [];
    
    // 按行分割，每行一个节点
    const lines = decoded.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // 解析不同类型的节点
      if (line.startsWith('vmess://') || 
          line.startsWith('trojan://') || 
          line.startsWith('ss://') || 
          line.startsWith('ssr://')) {
        const nodeInfo = parseNodeUrl(line);
        if (nodeInfo) {
          nodes.push(nodeInfo);
        }
      }
    }
    
    return nodes;
  } catch (e) {
    console.error(`解析Base64订阅失败: ${e.message}`);
    return [];
  }
}

// 解析节点URL
function parseNodeUrl(url) {
  try {
    if (url.startsWith('vmess://')) {
      return parseVmess(url);
    } else if (url.startsWith('trojan://')) {
      return parseTrojan(url);
    } else if (url.startsWith('ss://')) {
      return parseSS(url);
    } else if (url.startsWith('ssr://')) {
      return parseSSR(url);
    }
    
    console.warn(`不支持的节点类型: ${url.substring(0, 10)}...`);
    return null;
  } catch (e) {
    console.error(`解析节点URL失败: ${url.substring(0, 10)}... - ${e.message}`);
    return null;
  }
}

// 解析vmess节点
function parseVmess(url) {
  try {
    // 移除前缀并Base64解码
    const b64Str = url.replace('vmess://', '');
    const decoded = Base64.decode(b64Str);
    
    // 解析JSON格式数据
    const vmessInfo = JSON.parse(decoded);
    
    // 转换为Clash格式
    return {
      name: vmessInfo.ps || `vmess-${vmessInfo.add || 'unknown'}`,
      type: 'vmess',
      server: vmessInfo.add || '',
      port: parseInt(vmessInfo.port || 0),
      uuid: vmessInfo.id || '',
      alterId: parseInt(vmessInfo.aid || 0),
      cipher: vmessInfo.scy || 'auto' || 'auto',
      tls: vmessInfo.tls === 'tls',
      network: vmessInfo.net || '',
      'ws-path': vmessInfo.net === 'ws' ? vmessInfo.path : null,
      'ws-headers': vmessInfo.host ? { Host: vmessInfo.host } : null
    };
  } catch (e) {
    console.error(`解析vmess节点失败: ${e.message}`);
    return null;
  }
}

// 解析trojan节点
function parseTrojan(url) {
  try {
    const parsedUrl = new URL(url);
    const password = parsedUrl.username;
    const server = parsedUrl.hostname;
    const port = parseInt(parsedUrl.port);
    
    // 解析查询参数
    const params = {};
    for (const [key, value] of parsedUrl.searchParams) {
      params[key] = value;
    }
    
    return {
      name: params.remarks || server,
      type: 'trojan',
      server: server,
      port: port,
      password: password,
      sni: params.sni || server,
      'skip-cert-verify': params.allowInsecure === '1'
    };
  } catch (e) {
    console.error(`解析trojan节点失败: ${e.message}`);
    return null;
  }
}

// 解析ss节点
function parseSS(url) {
  try {
    url = url.replace('ss://', '');
    
    if (url.includes('@')) {
      // 新版格式: ss://BASE64(method:password)@server:port#name
      // 或者: ss://method:password@server:port#name (SIP002)
      const atIndex = url.indexOf('@');
      const userInfo = url.substring(0, atIndex);
      const serverPart = url.substring(atIndex + 1);
      
      // 尝试 base64 解码 userInfo
      let method, password;
      try {
        // 处理 URL-safe base64
        const normalizedB64 = userInfo.replace(/-/g, '+').replace(/_/g, '/');
        const decodedUserInfo = Base64.decode(normalizedB64);
        // 检查解码结果是否包含冒号（有效的 method:password 格式）
        if (decodedUserInfo.includes(':')) {
          const colonIndex = decodedUserInfo.indexOf(':');
          method = decodedUserInfo.substring(0, colonIndex);
          password = decodedUserInfo.substring(colonIndex + 1);
        } else {
          // 如果解码后没有冒号，可能不是 base64，尝试直接解析
          const decoded = decodeURIComponent(userInfo);
          const colonIndex = decoded.indexOf(':');
          method = decoded.substring(0, colonIndex);
          password = decoded.substring(colonIndex + 1);
        }
      } catch (e) {
        // base64 解码失败，尝试 URL 解码
        const decoded = decodeURIComponent(userInfo);
        const colonIndex = decoded.indexOf(':');
        method = decoded.substring(0, colonIndex);
        password = decoded.substring(colonIndex + 1);
      }
      
      // 解析 server:port#name
      let server, port, name;
      let serverAndPort = serverPart;
      
      if (serverPart.includes('#')) {
        const hashIndex = serverPart.indexOf('#');
        serverAndPort = serverPart.substring(0, hashIndex);
        name = decodeURIComponent(serverPart.substring(hashIndex + 1));
      }
      
      // 处理可能的查询参数
      if (serverAndPort.includes('?')) {
        serverAndPort = serverAndPort.split('?')[0];
      }
      
      const lastColonIndex = serverAndPort.lastIndexOf(':');
      server = serverAndPort.substring(0, lastColonIndex);
      port = serverAndPort.substring(lastColonIndex + 1);
      
      if (!name) name = server;
      
      return {
        name: name,
        type: 'ss',
        server: server,
        port: parseInt(port),
        cipher: method,
        password: password
      };
    } else {
      // 旧版格式: ss://BASE64(method:password@server:port)#name
      let name = '';
      if (url.includes('#')) {
        const hashIndex = url.indexOf('#');
        name = decodeURIComponent(url.substring(hashIndex + 1));
        url = url.substring(0, hashIndex);
      }
      
      // 处理 URL-safe base64
      const normalizedB64 = url.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Base64.decode(normalizedB64);
      const atIndex = decoded.lastIndexOf('@');
      
      const methodPass = decoded.substring(0, atIndex);
      const serverPort = decoded.substring(atIndex + 1);
      
      const colonIndex = methodPass.indexOf(':');
      const method = methodPass.substring(0, colonIndex);
      const password = methodPass.substring(colonIndex + 1);
      
      const lastColonIndex = serverPort.lastIndexOf(':');
      const server = serverPort.substring(0, lastColonIndex);
      const port = serverPort.substring(lastColonIndex + 1);
      
      return {
        name: name || server,
        type: 'ss',
        server: server,
        port: parseInt(port),
        cipher: method,
        password: password
      };
    }
  } catch (e) {
    console.error(`解析ss节点失败: ${e.message}`);
    return null;
  }
}

// 解析ssr节点
function parseSSR(url) {
  try {
    // 移除前缀并Base64解码
    let b64Str = url.replace('ssr://', '');
    // 处理填充
    b64Str = b64Str + '='.repeat((4 - b64Str.length % 4) % 4);
    const decoded = Base64.decode(b64Str);
    
    // 格式: server:port:protocol:method:obfs:BASE64(password)/?params
    const mainParts = decoded.split('/?', 2);
    const serverParts = mainParts[0].split(':');
    
    if (serverParts.length < 6) {
      return null;
    }
    
    const server = serverParts[0];
    const port = serverParts[1];
    const protocol = serverParts[2];
    const method = serverParts[3];
    const obfs = serverParts[4];
    
    // 解码密码
    const passwordBase64 = serverParts[5];
    const password = Base64.decode(passwordBase64 + '='.repeat((4 - passwordBase64.length % 4) % 4));
    
    // 解析参数
    const params = {};
    if (mainParts.length > 1) {
      const paramStr = mainParts[1];
      for (const part of paramStr.split('&')) {
        if (!part) continue;
        
        const [key, value] = part.split('=', 2);
        if (value) {
          const decodedValue = Base64.decode(value + '='.repeat((4 - value.length % 4) % 4));
          params[key] = decodedValue;
        }
      }
    }
    
    return {
      name: params.remarks || server,
      type: 'ssr',
      server: server,
      port: parseInt(port),
      cipher: method,
      password: password,
      protocol: protocol,
      'protocol-param': params.protoparam || '',
      obfs: obfs,
      'obfs-param': params.obfsparam || ''
    };
  } catch (e) {
    console.error(`解析ssr节点失败: ${e.message}`);
    return null;
  }
}

// 合并节点，去除重复
function mergeNodes(nodesList) {
  const mergedNodes = [];
  const nodeNames = new Set();
  
  for (const nodes of nodesList) {
    for (const node of nodes) {
      // 检查是否有必要字段
      if (!node || !node.type || !node.server) {
        continue;
      }
      
      // 生成唯一名称
      if (!node.name) {
        node.name = `${node.type}-${node.server}`;
      }
      
      // 处理重名节点
      let originalName = node.name;
      let counter = 1;
      while (nodeNames.has(node.name)) {
        node.name = `${originalName}-${counter}`;
        counter++;
      }
      
      nodeNames.add(node.name);
      mergedNodes.push(node);
    }
  }
  
  console.log(`合并完成，共有 ${mergedNodes.length} 个唯一节点`);
  return mergedNodes;
}

// 生成Clash配置
function generateClashConfig(nodes) {
  const config = {
    proxies: nodes,
    'proxy-groups': [
      {
        name: '自动选择',
        type: 'url-test',
        proxies: nodes.map(node => node.name),
        url: 'https://www.gstatic.com/generate_204',
        interval: 300
      },
      {
        name: '节点选择',
        type: 'select',
        proxies: ['自动选择', ...nodes.map(node => node.name)]
      }
    ]
  };
  
  return yaml.dump(config);
}

// 生成Base64编码的标准订阅
function generateBase64Subscription(nodes) {
  const lines = [];
  
  for (const node of nodes) {
    if (node.type === 'vmess') {
      // 转换为vmess URI
      const vmessInfo = {
        v: '2',
        ps: node.name,
        add: node.server,
        port: node.port,
        id: node.uuid,
        aid: node.alterId || 0,
        scy: node.cipher || 'auto',
        net: node.network || '',
        type: 'none',
        host: node['ws-headers'] ? node['ws-headers'].Host || '' : '',
        path: node['ws-path'] || '',
        tls: node.tls ? 'tls' : ''
      };
      
      const vmessUri = `vmess://${Base64.encode(JSON.stringify(vmessInfo))}`;
      lines.push(vmessUri);
    } else if (node.type === 'trojan') {
      // 转换为trojan URI
      const params = [];
      if (node.sni) {
        params.push(`sni=${node.sni}`);
      }
      if (node['skip-cert-verify']) {
        params.push('allowInsecure=1');
      }
      if (node.name) {
        params.push(`remarks=${encodeURIComponent(node.name)}`);
      }
      
      const paramStr = params.length > 0 ? `?${params.join('&')}` : '';
      const trojanUri = `trojan://${node.password}@${node.server}:${node.port}${paramStr}`;
      lines.push(trojanUri);
    } else if (node.type === 'ss') {
      // 转换为ss URI
      const ssUserInfo = `${node.cipher}:${node.password}`;
      const ssUri = `ss://${Base64.encode(ssUserInfo)}@${node.server}:${node.port}#${encodeURIComponent(node.name)}`;
      lines.push(ssUri);
    } else if (node.type === 'ssr') {
      // 转换为ssr URI
      const ssrStr = `${node.server}:${node.port}:${node.protocol}:${node.cipher}:${node.obfs}:${Base64.encode(node.password)}`;
      
      const params = [];
      if (node['obfs-param']) {
        params.push(`obfsparam=${Base64.encode(node['obfs-param'])}`);
      }
      if (node['protocol-param']) {
        params.push(`protoparam=${Base64.encode(node['protocol-param'])}`);
      }
      if (node.name) {
        params.push(`remarks=${Base64.encode(node.name)}`);
      }
      
      const paramStr = params.length > 0 ? `/?${params.join('&')}` : '';
      const fullStr = ssrStr + paramStr;
      const ssrUri = `ssr://${Base64.encode(fullStr)}`;
      lines.push(ssrUri);
    }
  }
  
  return Base64.encode(lines.join('\n'));
}

// 生成统计信息
function generateStats(nodes) {
  const stats = {
    total_nodes: nodes.length,
    node_types: {}
  };
  
  for (const node of nodes) {
    if (!stats.node_types[node.type]) {
      stats.node_types[node.type] = 0;
    }
    stats.node_types[node.type]++;
  }
  
  return stats;
}

// API处理函数
module.exports = async (req, res) => {
  // 允许CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // 检查请求方法
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支持GET请求' });
  }
  
  const { urls, format = 'base64' } = req.query;
  
  // 检查urls参数
  if (!urls) {
    return res.status(400).json({ 
      error: '缺少urls参数', 
      message: '请提供要合并的订阅链接，多个链接用逗号分隔',
      example: '/api/merge?urls=https://example1.com/sub,https://example2.com/sub'
    });
  }
  
  try {
    // 分割并处理订阅链接
    const urlList = urls.split(',').map(url => url.trim()).filter(Boolean);
    
    if (urlList.length === 0) {
      return res.status(400).json({ error: '没有有效的订阅链接' });
    }
    
    console.log(`处理 ${urlList.length} 个订阅链接`);
    
    // 获取和解析所有订阅
    const allNodes = [];
    for (const url of urlList) {
      console.log(`解析订阅: ${url}`);
      const nodes = await parseSubscription(url);
      allNodes.push(nodes);
      console.log(`从订阅链接获取了 ${nodes.length} 个节点`);
    }
    
    // 合并节点
    const mergedNodes = mergeNodes(allNodes);
    
    // 根据请求的格式生成输出
    if (format.toLowerCase() === 'clash') {
      // 返回Clash配置
      const clashConfig = generateClashConfig(mergedNodes);
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="merged_clash.yaml"');
      return res.status(200).send(clashConfig);
    } else {
      // 默认返回Base64编码的订阅
      const base64Sub = generateBase64Subscription(mergedNodes);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="merged_subscription.txt"');
      return res.status(200).send(base64Sub);
    }
  } catch (error) {
    console.error(`处理订阅时出错: ${error.message}`);
    return res.status(500).json({ error: '服务器内部错误', message: error.message });
  }
}; 