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

// 解析单个订阅链接
async function parseSubscription(url) {
  try {
    // 使用自定义函数发起请求
    const text = await fetchUrl(url, 10000);
    
    // 尝试解码Base64
    let decodedText;
    try {
      decodedText = Buffer.from(text, 'base64').toString('utf-8');
      // 检查解码是否成功（解码后应该包含至少一个代理节点）
      if (!decodedText.includes('vmess://') && 
          !decodedText.includes('trojan://') && 
          !decodedText.includes('ss://') && 
          !decodedText.includes('ssr://')) {
        decodedText = text; // 不是Base64编码，使用原始文本
      }
    } catch (e) {
      decodedText = text; // 解码失败，使用原始文本
    }
    
    // 提取节点
    const nodes = extractNodes(decodedText);
    
    return {
      success: true,
      nodes,
      nodeCount: nodes.length
    };
  } catch (error) {
    console.error(`获取订阅内容失败: ${error.message}`);
    return {
      success: false, 
      nodes: [],
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
  let allNodes = [];
  
  // 并行处理所有订阅链接
  for (const url of urlList) {
    try {
      console.log(`解析订阅: ${url}`);
      const result = await parseSubscription(url);
      
      if (result.success) {
        allNodes.push(...result.nodes);
        console.log(`从订阅链接获取了 ${result.nodes.length} 个节点`);
      } else {
        console.log(`获取订阅内容失败: ${result.error}`);
      }
      
      results.push({
        url,
        success: result.success,
        nodeCount: result.nodes.length,
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
  console.log(`合并完成，共有 ${uniqueNodes.length} 个唯一节点`);
  
  // 如果所有URL都返回错误且没有节点，返回错误
  if (uniqueNodes.length === 0) {
    return res.status(400).json({
      success: false,
      error: '合并失败',
      message: '无法从订阅链接获取任何节点',
      results
    });
  }
  
  // 生成Clash配置
  const clashConfig = convertToClash(uniqueNodes);
  
  // 设置响应头并返回
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  return res.status(200).send(clashConfig);
}