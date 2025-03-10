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
  
  // 找到包含最完整规则集的配置
  let mostCompleteConfig = configs[0];
  let maxRulesCount = configs[0]?.rules?.length || 0;
  let maxGroupsCount = configs[0]?.['proxy-groups']?.length || 0;
  
  configs.forEach(config => {
    if (!config) return;
    
    const rulesCount = config.rules?.length || 0;
    const groupsCount = config['proxy-groups']?.length || 0;
    
    // 如果当前配置有更多的规则和代理组，认为它更完整
    if (rulesCount > maxRulesCount || (rulesCount === maxRulesCount && groupsCount > maxGroupsCount)) {
      mostCompleteConfig = config;
      maxRulesCount = rulesCount;
      maxGroupsCount = groupsCount;
    }
  });
  
  // 使用最完整的配置作为基础
  const baseConfig = JSON.parse(JSON.stringify(mostCompleteConfig || {}));
  
  // 确保基本结构存在
  baseConfig.proxies = baseConfig.proxies || [];
  baseConfig['proxy-groups'] = baseConfig['proxy-groups'] || [];
  baseConfig.rules = baseConfig.rules || [];
  
  // 提取所有代理组名称，用于后续检查
  const proxyGroupNames = new Set(baseConfig['proxy-groups'].map(group => group.name));
  
  // 默认添加 DIRECT 和 REJECT 到代理组名称集合
  proxyGroupNames.add('DIRECT');
  proxyGroupNames.add('REJECT');
  
  // 收集所有唯一的节点
  const allProxies = [];
  const processedNodes = new Set();
  
  // 处理所有配置
  configs.forEach(config => {
    if (!config) return;
    
    // 合并节点
    if (config.proxies && Array.isArray(config.proxies)) {
      config.proxies.forEach(proxy => {
        // 过滤无效节点
        if (!proxy || !proxy.name || !proxy.server) return;
        
        // 过滤流量/套餐信息节点
        if (proxy.name.includes('流量') || 
            proxy.name.includes('剩余') || 
            proxy.name.includes('套餐') || 
            proxy.name.includes('过期')) {
          return;
        }
        
        // 处理节点重名
        let baseName = proxy.name;
        let counter = 1;
        while (processedNodes.has(proxy.name)) {
          proxy.name = `${baseName} (${counter})`;
          counter++;
        }
        
        processedNodes.add(proxy.name);
        allProxies.push(proxy);
      });
    }
  });
  
  // 将收集到的所有节点添加到基础配置中
  baseConfig.proxies = allProxies;
  
  // 清理并更新代理组
  const validProxyNames = new Set(allProxies.map(p => p.name));
  
  // 为每个代理组更新节点列表
  baseConfig['proxy-groups'].forEach(group => {
    // 保留原始proxies中的特殊值和有效节点
    const origProxies = group.proxies || [];
    
    // 过滤掉无效的代理
    group.proxies = origProxies.filter(proxy => {
      // 保留特殊代理类型和存在的代理组
      return proxy === 'DIRECT' || 
             proxy === 'REJECT' || 
             proxyGroupNames.has(proxy) || 
             validProxyNames.has(proxy);
    });
    
    // 对于选择类型的代理组，添加所有节点
    if (group.type === 'select' && 
        !group.name.includes('拦截') && 
        !group.name.includes('直连') && 
        !group.name.includes('净化')) {
      // 添加所有节点到选择组
      allProxies.forEach(proxy => {
        if (!group.proxies.includes(proxy.name)) {
          group.proxies.push(proxy.name);
        }
      });
    }
    
    // 对于URL测试/负载均衡类型，也添加所有节点
    if ((group.type === 'url-test' || group.type === 'load-balance') && 
        !group.name.includes('拦截') && 
        !group.name.includes('直连') && 
        !group.name.includes('净化')) {
      allProxies.forEach(proxy => {
        if (!group.proxies.includes(proxy.name)) {
          group.proxies.push(proxy.name);
        }
      });
    }
  });
  
  // 处理规则中的策略组引用
  if (baseConfig.rules && baseConfig.rules.length > 0) {
    baseConfig.rules = baseConfig.rules.map(rule => {
      const parts = rule.split(',');
      if (parts.length < 2) return rule;
      
      // 获取策略名称
      const policyName = parts[parts.length - 1].trim();
      
      // 如果策略名称不存在于代理组列表中
      if (!proxyGroupNames.has(policyName) && policyName !== 'DIRECT' && policyName !== 'REJECT') {
        // 默认使用第一个代理组（通常是节点选择）
        parts[parts.length - 1] = baseConfig['proxy-groups'][0]?.name || 'DIRECT';
      }
      
      return parts.join(',');
    });
  }
  
  // 如果没有代理组，创建默认的代理组
  if (baseConfig['proxy-groups'].length === 0 && allProxies.length > 0) {
    // 创建默认的代理组结构
    baseConfig['proxy-groups'] = [
      {
        name: '节点选择',
        type: 'select',
        proxies: ['DIRECT', ...allProxies.map(p => p.name)]
      },
      {
        name: '自动选择',
        type: 'url-test',
        url: 'http://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 50,
        proxies: [...allProxies.map(p => p.name)]
      }
    ];
    
    // 更新规则，指向节点选择
    if (baseConfig.rules.length === 0) {
      baseConfig.rules = ['MATCH,节点选择'];
    }
  }
  
  return baseConfig;
}

export default async function handler(req, res) {
  const { urls } = req.query;
  
  // 验证请求参数
  if (!urls) {
    return res.status(400).json({ 
      success: false, 
      error: '参数错误',
      message: '请提供至少一个订阅链接 (urls 参数)' 
    });
  }
  
  // 解析URL列表 
  const urlList = urls.split(',').filter(Boolean);
  if (urlList.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: '参数错误',
      message: '请提供至少一个有效的订阅链接'
    });
  }
  
  console.log(`处理 ${urlList.length} 个订阅链接`);

  // 存储处理结果和错误
  const results = [];
  const allNodes = [];
  const allConfigs = [];
  
  // 处理所有订阅链接
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
          // 处理形如 ss://method:password@server:port#name 的格式
          const match = ssUrl.match(/^(?:([^:]+):([^@]+)@)?([^#:]+):(\d+)(?:#(.+))?$/);
          if (match) {
            method = decodeURIComponent(match[1]);
            password = decodeURIComponent(match[2]);
            server = match[3];
            port = parseInt(match[4]);
            name = match[5] ? decodeURIComponent(match[5]) : server;
          } else {
            throw new Error('Invalid SS URL format');
          }
        } else {
          // 处理形如 ss://BASE64(method:password@server:port)#name 的格式
          const parts = ssUrl.split('#');
          const b64 = parts[0];
          name = parts[1] ? decodeURIComponent(parts[1]) : '';
          
          const decoded = Buffer.from(b64, 'base64').toString();
          const match = decoded.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
          if (match) {
            method = match[1];
            password = match[2];
            server = match[3];
            port = parseInt(match[4]);
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