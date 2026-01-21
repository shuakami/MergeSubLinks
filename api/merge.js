const https = require('https');
const http = require('http');
const yaml = require('js-yaml');

// 使用Node.js内置的http/https模块发起请求
async function fetchUrl(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const requestTimeout = setTimeout(() => {
      req.destroy();
      reject(new Error('请求超时'));
    }, timeout);

    const req = protocol.get(url, (res) => {
      clearTimeout(requestTimeout);
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP error! status: ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    });
    
    req.on('error', (error) => {
      clearTimeout(requestTimeout);
      reject(error);
    });
  });
}

// 自定义数组去重函数
function uniqueArray(array) {
  return [...new Set(array)];
}

// 解析单个订阅链接并获取完整配置
async function parseSubscription(url) {
  try {
    // 使用自定义函数发起请求
    const text = await fetchUrl(url, 10000);
    
    // 尝试解析配置
    let config = null;
    
    // 检查是否为 YAML/JSON 格式的 Clash 配置
    if (text.includes('proxies:') || text.includes('"proxies":')) {
      try {
        config = yaml.load(text);
      } catch (e) {
        // 可能是 JSON 格式
        try {
          config = JSON.parse(text);
        } catch (e2) {
          console.error('解析配置失败:', e2);
        }
      }
    }
    
    // 检查是否为 Base64 编码
    if (!config) {
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf-8');
        if (decoded.includes('proxies:') || decoded.includes('"proxies":')) {
          try {
            config = yaml.load(decoded);
          } catch (e) {
            try {
              config = JSON.parse(decoded);
            } catch (e2) {
              console.error('解析解码后的配置失败:', e2);
            }
          }
        } else {
          // 可能是普通的代理节点格式
          const nodes = extractNodes(decoded);
          return {
            success: true,
            nodes,
            config: null,
            nodeCount: nodes.length
          };
        }
      } catch (e) {
        // 不是 Base64 编码也不是直接的 YAML/JSON 配置
        const nodes = extractNodes(text);
        return {
          success: true,
          nodes,
          config: null,
          nodeCount: nodes.length
        };
      }
    }
    
    // 如果成功解析为配置对象
    if (config && config.proxies) {
      return {
        success: true,
        nodes: [],  // 放在 config 中，不需要单独列出
        config,
        nodeCount: config.proxies.length
      };
    }
    
    // 如果以上都失败，尝试直接提取节点
    const nodes = extractNodes(text);
    return {
      success: true,
      nodes,
      config: null,
      nodeCount: nodes.length
    };
  } catch (error) {
    console.error(`获取订阅内容失败: ${error.message}`);
    return {
      success: false, 
      nodes: [],
      config: null,
      nodeCount: 0,
      error: error.message
    };
  }
}

// 提取节点信息
function extractNodes(text) {
  const nodes = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith('vmess://') || 
        trimmed.startsWith('trojan://') || 
        trimmed.startsWith('ss://') || 
        trimmed.startsWith('ssr://')) {
      nodes.push(trimmed);
    } else if (trimmed.startsWith('proxies:')) {
      // 处理 Clash 配置
      try {
        const config = yaml.load(text);
        if (config && Array.isArray(config.proxies)) {
          for (const proxy of config.proxies) {
            const encoded = Buffer.from(JSON.stringify(proxy)).toString('base64');
            nodes.push(`vmess://${encoded}`);
          }
        }
      } catch (e) {
        console.error('解析 Clash 配置失败:', e);
      }
    }
  }
  
  return nodes;
}

// 解析直接粘贴的内容
function parseDirectContent(text) {
  const nodes = [];
  
  // 尝试 Base64 解码
  let content = text;
  try {
    const decoded = Buffer.from(text.trim(), 'base64').toString('utf-8');
    if (decoded.includes('://') || decoded.includes('proxies:')) {
      content = decoded;
    }
  } catch (e) {
    // 不是 Base64，使用原始内容
  }
  
  // 尝试解析为 YAML/JSON 配置
  if (content.includes('proxies:') || content.includes('"proxies"')) {
    try {
      const config = yaml.load(content);
      if (config && Array.isArray(config.proxies)) {
        for (const proxy of config.proxies) {
          nodes.push(JSON.stringify(proxy));
        }
        return nodes;
      }
    } catch (e) {
      try {
        const config = JSON.parse(content);
        if (config && Array.isArray(config.proxies)) {
          for (const proxy of config.proxies) {
            nodes.push(JSON.stringify(proxy));
          }
          return nodes;
        }
      } catch (e2) {}
    }
  }
  
  // 按行解析 URI
  const lines = content.split(/[\r\n]+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith('vmess://') || 
        trimmed.startsWith('vless://') ||
        trimmed.startsWith('trojan://') || 
        trimmed.startsWith('ss://') || 
        trimmed.startsWith('ssr://') ||
        trimmed.startsWith('hysteria://') ||
        trimmed.startsWith('hysteria2://') ||
        trimmed.startsWith('hy://') ||
        trimmed.startsWith('hy2://') ||
        trimmed.startsWith('tuic://') ||
        trimmed.startsWith('wireguard://') ||
        trimmed.startsWith('wg://')) {
      nodes.push(trimmed);
    }
  }
  
  return nodes;
}

// 将节点转换为Clash配置
function convertToClash(nodes) {
  const config = {
    port: 7890,
    'socks-port': 7891,
    'allow-lan': true,
    mode: 'rule',
    'log-level': 'info',
    proxies: [],
    'proxy-groups': [
      {
        name: '🚀 节点选择',
        type: 'select',
        proxies: ['♻️ 自动选择']
      },
      {
        name: '♻️ 自动选择',
        type: 'url-test',
        url: 'http://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 50,
        proxies: []
      }
    ],
    rules: [
      'MATCH,🚀 节点选择'
    ]
  };

  // 处理每个节点
  for (const node of nodes) {
    try {
      let proxy;
      if (node.startsWith('vmess://')) {
        const decoded = JSON.parse(Buffer.from(node.replace('vmess://', ''), 'base64').toString());
        proxy = {
          name: decoded.ps || '未命名节点',
          type: 'vmess',
          server: decoded.add,
          port: parseInt(decoded.port),
          uuid: decoded.id,
          alterId: parseInt(decoded.aid) || 0,
          cipher: decoded.scy || 'auto',
          tls: decoded.tls === 'tls',
          network: decoded.net || 'tcp',
          'ws-opts': decoded.net === 'ws' ? {
            path: decoded.path || '/',
            headers: decoded.host ? { Host: decoded.host } : undefined
          } : undefined
        };
      } else if (node.startsWith('trojan://')) {
        const url = new URL(node);
        proxy = {
          name: url.hash ? decodeURIComponent(url.hash.slice(1)) : url.hostname,
          type: 'trojan',
          server: url.hostname,
          port: parseInt(url.port),
          password: url.username,
          sni: url.searchParams.get('sni') || url.hostname,
          'skip-cert-verify': url.searchParams.get('allowInsecure') === '1'
        };
      } else if (node.startsWith('ss://')) {
        const ssUrl = node.replace('ss://', '');
        let server, port, method, password, name;
        
        if (ssUrl.includes('@')) {
          const [userInfo, serverInfo] = ssUrl.split('@');
          const decodedUserInfo = Buffer.from(userInfo, 'base64').toString();
          [method, password] = decodedUserInfo.split(':');
          
          const serverParts = serverInfo.split('#');
          [server, port] = serverParts[0].split(':');
          name = serverParts[1] ? decodeURIComponent(serverParts[1]) : server;
        } else {
          const decodedUrl = Buffer.from(ssUrl.split('#')[0], 'base64').toString();
          const [methodAndPass, serverAndPort] = decodedUrl.split('@');
          [method, password] = methodAndPass.split(':');
          [server, port] = serverAndPort.split(':');
          name = ssUrl.includes('#') ? decodeURIComponent(ssUrl.split('#')[1]) : server;
        }
        
        proxy = {
          name,
          type: 'ss',
          server,
          port: parseInt(port),
          cipher: method,
          password
        };
      }

      if (proxy) {
        config.proxies.push(proxy);
        config['proxy-groups'][0].proxies.push(proxy.name);
        config['proxy-groups'][1].proxies.push(proxy.name);
      }
    } catch (e) {
      console.error('节点解析失败:', e);
    }
  }

  return yaml.dump(config);
}

// 获取节点类型统计信息
function getNodeTypesStats(nodes) {
  const stats = {
    vmess: 0,
    trojan: 0,
    ss: 0,
    ssr: 0
  };
  
  nodes.forEach(node => {
    if (node.startsWith('vmess://')) {
      stats.vmess++;
    } else if (node.startsWith('trojan://')) {
      stats.trojan++;
    } else if (node.startsWith('ss://')) {
      stats.ss++;
    } else if (node.startsWith('ssr://')) {
      stats.ssr++;
    }
  });
  
  // 移除计数为0的类型
  return Object.fromEntries(Object.entries(stats).filter(([_, count]) => count > 0));
}

// 合并配置
function mergeConfigs(configs) {
  if (!configs || configs.length === 0) {
    return null;
  }
  
  // 从所有配置中收集节点
  const allProxies = [];
  const processedNodes = new Set();
  
  // 首先从所有配置中收集所有节点
  configs.forEach(config => {
    if (!config || !config.proxies || !Array.isArray(config.proxies)) return;
    
    config.proxies.forEach(proxy => {
      // 基本验证
      if (!proxy || !proxy.server) return;
      
      // 确保节点有名称
      if (!proxy.name) {
        proxy.name = `${proxy.type || 'unknown'}-${proxy.server}:${proxy.port || '0'}`;
      }
      
      // 处理节点重名
      let baseName = proxy.name;
      let counter = 1;
      while (processedNodes.has(proxy.name)) {
        proxy.name = `${baseName} (${counter})`;
        counter++;
      }
      
      processedNodes.add(proxy.name);
      allProxies.push({...proxy}); // 复制节点对象，避免引用问题
    });
  });
  
  // 根据配置完整度排序配置
  configs.sort((a, b) => {
    if (!a || !b) return !a ? 1 : -1;
    
    // 计算配置完整度得分
    const scoreA = (a.rules?.length || 0) * 2 + 
                  (a['proxy-groups']?.length || 0) * 3 + 
                  (a.dns ? 5 : 0) + 
                  (a.hosts ? 3 : 0);
                  
    const scoreB = (b.rules?.length || 0) * 2 + 
                  (b['proxy-groups']?.length || 0) * 3 + 
                  (b.dns ? 5 : 0) + 
                  (b.hosts ? 3 : 0);
                  
    return scoreB - scoreA; // 降序，最完整的配置排在前面
  });
  
  // 选择最完整的配置作为基础
  const baseConfig = configs[0] ? JSON.parse(JSON.stringify(configs[0])) : {};
  
  // 确保基本字段存在
  baseConfig.port = baseConfig.port || 7890;
  baseConfig['socks-port'] = baseConfig['socks-port'] || 7891;
  baseConfig['log-level'] = baseConfig['log-level'] || 'info';
  baseConfig.proxies = [];
  baseConfig['proxy-groups'] = baseConfig['proxy-groups'] || [];
  baseConfig.rules = baseConfig.rules || [];
  
  // 添加所有收集到的代理节点
  baseConfig.proxies = allProxies;
  
  // 获取所有现有代理组的名称
  const proxyGroupNames = new Set(baseConfig['proxy-groups'].map(group => group.name));
  
  // 获取所有节点的名称
  const proxyNames = new Set(allProxies.map(proxy => proxy.name));
  
  // 更新每个代理组
  baseConfig['proxy-groups'].forEach(group => {
    // 确保proxies字段存在
    group.proxies = group.proxies || [];
    
    // 过滤掉不存在的代理
    group.proxies = group.proxies.filter(proxyName => {
      return proxyName === 'DIRECT' || 
             proxyName === 'REJECT' || 
             proxyGroupNames.has(proxyName) || 
             proxyNames.has(proxyName);
    });
    
    // 添加所有代理到url-test类型的组
    if (group.type === 'url-test' || group.type === 'fallback' || group.type === 'load-balance') {
      allProxies.forEach(proxy => {
        if (!group.proxies.includes(proxy.name)) {
          group.proxies.push(proxy.name);
        }
      });
    }
  });
  
  // 修复规则中引用的不存在的代理组
  if (baseConfig.rules && baseConfig.rules.length > 0) {
    baseConfig.rules = baseConfig.rules.map(rule => {
      const parts = rule.split(',');
      if (parts.length < 2) return rule;
      
      const policyName = parts[parts.length - 1].trim();
      
      // 检查策略是否存在
      if (policyName !== 'DIRECT' && 
          policyName !== 'REJECT' && 
          !proxyGroupNames.has(policyName)) {
        // 如果策略不存在，替换为一个存在的策略
        // 尝试找到通常用作默认策略的组（包含关键字的）
        const defaultGroup = baseConfig['proxy-groups'].find(g => 
          g.name.toLowerCase().includes('选择') || 
          g.name.toLowerCase().includes('select') ||
          g.name.toLowerCase().includes('auto')
        );
        
        if (defaultGroup) {
          parts[parts.length - 1] = defaultGroup.name;
        } else if (baseConfig['proxy-groups'].length > 0) {
          // 如果没有找到符合条件的，就使用第一个组
          parts[parts.length - 1] = baseConfig['proxy-groups'][0].name;
        } else {
          // 如果没有代理组，使用DIRECT
          parts[parts.length - 1] = 'DIRECT';
        }
      }
      
      return parts.join(',');
    });
  }
  
  // 如果没有代理组但有代理，尝试从其他配置中合并代理组结构
  if (baseConfig['proxy-groups'].length === 0 && allProxies.length > 0) {
    // 寻找有代理组的配置
    for (const config of configs) {
      if (config && config['proxy-groups'] && config['proxy-groups'].length > 0) {
        // 复制代理组结构，但使用我们的代理
        const groups = JSON.parse(JSON.stringify(config['proxy-groups']));
        
        groups.forEach(group => {
          if (group.type === 'select' || group.type === 'url-test' || 
              group.type === 'fallback' || group.type === 'load-balance') {
            // 重置代理列表，添加我们的代理
            group.proxies = [];
            
            // 添加特殊值
            if (group.type === 'select') {
              group.proxies.push('DIRECT');
            }
            
            // 添加所有代理
            allProxies.forEach(proxy => {
              group.proxies.push(proxy.name);
            });
          }
        });
        
        baseConfig['proxy-groups'] = groups;
        break;
      }
    }
  }
  
  // 如果仍然没有MATCH规则，添加一个指向第一个代理组
  if (baseConfig.rules.length === 0 && baseConfig['proxy-groups'].length > 0) {
    baseConfig.rules.push(`MATCH,${baseConfig['proxy-groups'][0].name}`);
  } else if (baseConfig.rules.length === 0) {
    baseConfig.rules.push('MATCH,DIRECT');
  }
  
  return baseConfig;
}

module.exports = async function handler(req, res) {
  const { urls, content, format } = req.query;
  
  // 验证请求参数
  if (!urls && !content) {
    return res.status(400).json({ 
      success: false, 
      error: '参数错误',
      message: '请提供 urls 参数（订阅链接）或 content 参数（直接节点内容）' 
    });
  }
  
  console.log(`处理请求: urls=${urls ? 'yes' : 'no'}, content=${content ? 'yes' : 'no'}`);

  // 存储处理结果和错误
  const results = [];
  const allNodes = [];
  const allConfigs = [];
  
  // 处理直接内容
  if (content) {
    try {
      const decoded = decodeURIComponent(content);
      console.log('解析直接内容...');
      
      // 解析内容
      const parsedNodes = parseDirectContent(decoded);
      if (parsedNodes.length > 0) {
        allNodes.push(...parsedNodes);
        console.log(`从直接内容解析了 ${parsedNodes.length} 个节点`);
      }
    } catch (error) {
      console.error(`解析直接内容失败: ${error.message}`);
    }
  }
  
  // 处理 URL 订阅
  if (urls) {
    const urlList = urls.split(',').filter(Boolean);
    console.log(`处理 ${urlList.length} 个订阅链接`);
    
    for (const url of urlList) {
      try {
        console.log(`解析订阅: ${url}`);
        const result = await parseSubscription(url);
        
        if (result.success) {
          if (result.nodes && result.nodes.length > 0) {
            allNodes.push(...result.nodes);
          }
          if (result.config) {
            allConfigs.push(result.config);
          }
          console.log(`从订阅链接获取了 ${result.nodeCount} 个节点`);
        } else {
          console.log(`获取订阅内容失败: ${result.error}`);
        }
        
        results.push({
          url,
          success: result.success,
          nodeCount: result.nodeCount,
          error: result.error
        });
      } catch (error) {
        console.error(`处理订阅时出错: ${error.message}`);
        results.push({
          url,
          success: false,
          nodeCount: 0,
          error: error.message
        });
      }
    }
  }
  
  // 去重
  const uniqueNodes = uniqueArray(allNodes);
  
  // 处理直接获取到的节点
  if (uniqueNodes.length > 0) {
    // 将简单节点转换为 Clash 节点配置
    const nodeConfigs = [];
    for (const node of uniqueNodes) {
      const nodeConfig = convertNodeToConfig(node);
      if (nodeConfig) {
        nodeConfigs.push(nodeConfig);
      }
    }
    
    if (nodeConfigs.length > 0) {
      allConfigs.push({
        proxies: nodeConfigs
      });
    }
  }
  
  // 如果所有URL都返回错误且没有节点，返回错误
  if (allConfigs.length === 0 && uniqueNodes.length === 0) {
    return res.status(400).json({
      success: false,
      error: '合并失败',
      message: '无法从订阅链接获取任何节点',
      results
    });
  }
  
  // 合并配置
  const mergedConfig = mergeConfigs(allConfigs);
  console.log(`合并完成，共有 ${mergedConfig.proxies.length} 个唯一节点`);
  
  // 如果没有节点，返回错误
  if (!mergedConfig.proxies || mergedConfig.proxies.length === 0) {
    return res.status(400).json({
      success: false,
      error: '合并失败',
      message: '无法从订阅链接获取任何有效节点',
      results
    });
  }
  
  // 生成YAML
  const clashConfig = yaml.dump(mergedConfig);
  
  // 设置响应头并返回
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  return res.status(200).send(clashConfig);
}

// 将节点字符串转换为Clash配置
function convertNodeToConfig(nodeStr) {
  try {
    if (nodeStr.startsWith('vmess://')) {
      // 处理vmess链接
      const b64 = nodeStr.replace('vmess://', '');
      const decoded = JSON.parse(Buffer.from(b64, 'base64').toString());
      
      return {
        name: decoded.ps || decoded.name || '未命名节点',
        type: 'vmess',
        server: decoded.add,
        port: parseInt(decoded.port),
        uuid: decoded.id,
        alterId: parseInt(decoded.aid) || 0,
        cipher: decoded.scy || 'auto',
        tls: decoded.tls === 'tls',
        network: decoded.net || 'tcp',
        'ws-opts': decoded.net === 'ws' ? {
          path: decoded.path || '/',
          headers: decoded.host ? { Host: decoded.host } : undefined
        } : undefined
      };
    } else if (nodeStr.startsWith('trojan://')) {
      // 处理trojan链接
      try {
        const url = new URL(nodeStr);
        return {
          name: url.hash ? decodeURIComponent(url.hash.slice(1)) : url.hostname,
          type: 'trojan',
          server: url.hostname,
          port: parseInt(url.port),
          password: url.username,
          sni: url.searchParams.get('sni') || url.hostname,
          'skip-cert-verify': url.searchParams.get('allowInsecure') === '1'
        };
      } catch (e) {
        console.error('解析trojan链接失败:', e);
        return null;
      }
    } else if (nodeStr.startsWith('ss://')) {
      // 处理ss链接
      try {
        const ssUrl = nodeStr.replace('ss://', '');
        let server, port, method, password, name;
        
        if (ssUrl.includes('@')) {
          // 新版格式: ss://BASE64(method:password)@server:port#name
          // 或者: ss://method:password@server:port#name (SIP002)
          const atIndex = ssUrl.indexOf('@');
          const userInfo = ssUrl.substring(0, atIndex);
          const serverPart = ssUrl.substring(atIndex + 1);
          
          // 尝试 base64 解码 userInfo
          let decodedUserInfo;
          try {
            // 处理 URL-safe base64
            const normalizedB64 = userInfo.replace(/-/g, '+').replace(/_/g, '/');
            decodedUserInfo = Buffer.from(normalizedB64, 'base64').toString();
            // 检查解码结果是否包含冒号（有效的 method:password 格式）
            if (!decodedUserInfo.includes(':')) {
              // 如果解码后没有冒号，可能不是 base64，尝试直接解析
              decodedUserInfo = decodeURIComponent(userInfo);
            }
          } catch (e) {
            // base64 解码失败，尝试 URL 解码
            decodedUserInfo = decodeURIComponent(userInfo);
          }
          
          const colonIndex = decodedUserInfo.indexOf(':');
          if (colonIndex !== -1) {
            method = decodedUserInfo.substring(0, colonIndex);
            password = decodedUserInfo.substring(colonIndex + 1);
          } else {
            throw new Error('Invalid SS userinfo format');
          }
          
          // 解析 server:port#name
          let serverAndPort;
          if (serverPart.includes('#')) {
            const hashIndex = serverPart.indexOf('#');
            serverAndPort = serverPart.substring(0, hashIndex);
            name = decodeURIComponent(serverPart.substring(hashIndex + 1));
          } else {
            serverAndPort = serverPart;
          }
          
          // 处理可能的查询参数
          if (serverAndPort.includes('?')) {
            serverAndPort = serverAndPort.split('?')[0];
          }
          
          const lastColonIndex = serverAndPort.lastIndexOf(':');
          if (lastColonIndex !== -1) {
            server = serverAndPort.substring(0, lastColonIndex);
            port = parseInt(serverAndPort.substring(lastColonIndex + 1));
          } else {
            throw new Error('Invalid SS server:port format');
          }
          
          if (!name) name = server;
        } else {
          // 旧版格式: ss://BASE64(method:password@server:port)#name
          const parts = ssUrl.split('#');
          const b64 = parts[0];
          name = parts[1] ? decodeURIComponent(parts[1]) : '';
          
          // 处理 URL-safe base64
          const normalizedB64 = b64.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = Buffer.from(normalizedB64, 'base64').toString();
          const atIndex = decoded.lastIndexOf('@');
          
          if (atIndex !== -1) {
            const methodPass = decoded.substring(0, atIndex);
            const serverPort = decoded.substring(atIndex + 1);
            
            const colonIndex = methodPass.indexOf(':');
            method = methodPass.substring(0, colonIndex);
            password = methodPass.substring(colonIndex + 1);
            
            const lastColonIndex = serverPort.lastIndexOf(':');
            server = serverPort.substring(0, lastColonIndex);
            port = parseInt(serverPort.substring(lastColonIndex + 1));
            
            if (!name) name = server;
          } else {
            throw new Error('Invalid decoded SS URL format');
          }
        }
        
        return {
          name,
          type: 'ss',
          server,
          port,
          cipher: method,
          password
        };
      } catch (e) {
        console.error('解析ss链接失败:', e);
        return null;
      }
    } else if (nodeStr.startsWith('ssr://')) {
      // 处理ssr链接
      try {
        const b64 = nodeStr.replace('ssr://', '');
        const decoded = Buffer.from(b64, 'base64').toString();
        const parts = decoded.split(':');
        
        if (parts.length >= 6) {
          const server = parts[0];
          const port = parseInt(parts[1]);
          const protocol = parts[2];
          const method = parts[3];
          const obfs = parts[4];
          
          // 处理密码和参数
          const lastPart = parts[5];
          const lastPartSplit = lastPart.split('/?');
          const password = Buffer.from(lastPartSplit[0], 'base64').toString();
          
          // 解析参数
          const params = {};
          if (lastPartSplit.length > 1) {
            const paramStr = lastPartSplit[1];
            const paramPairs = paramStr.split('&');
            for (const pair of paramPairs) {
              const [key, value] = pair.split('=');
              if (key && value) {
                params[key] = Buffer.from(value, 'base64').toString();
              }
            }
          }
          
          return {
            name: params.remarks || server,
            type: 'ssr',
            server,
            port,
            protocol,
            cipher: method,
            obfs,
            password,
            'protocol-param': params.protoparam || '',
            'obfs-param': params.obfsparam || ''
          };
        }
      } catch (e) {
        console.error('解析ssr链接失败:', e);
        return null;
      }
    }
  } catch (e) {
    console.error('转换节点失败:', e);
    return null;
  }
  
  return null;
}