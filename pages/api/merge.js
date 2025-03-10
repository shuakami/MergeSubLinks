const https = require('https');
const http = require('http');

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
async function parseSubscription(url, format = 'base64') {
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

// 从文本中提取节点
function extractNodes(text) {
  const nodes = [];
  
  // 提取VMess节点
  const vmessRegex = /vmess:\/\/[A-Za-z0-9+/=]+/g;
  const vmessNodes = text.match(vmessRegex) || [];
  nodes.push(...vmessNodes);
  
  // 提取Trojan节点
  const trojanRegex = /trojan:\/\/[A-Za-z0-9+/=]+@[A-Za-z0-9.-]+:[0-9]+/g;
  const trojanNodes = text.match(trojanRegex) || [];
  nodes.push(...trojanNodes);
  
  // 提取SS节点
  const ssRegex = /ss:\/\/[A-Za-z0-9+/=]+/g;
  const ssNodes = text.match(ssRegex) || [];
  nodes.push(...ssNodes);
  
  // 提取SSR节点
  const ssrRegex = /ssr:\/\/[A-Za-z0-9+/=]+/g;
  const ssrNodes = text.match(ssrRegex) || [];
  nodes.push(...ssrNodes);
  
  return nodes;
}

// 将节点转换为指定格式
function convertNodes(nodes, format = 'base64') {
  if (format === 'base64') {
    return Buffer.from(nodes.join('\n')).toString('base64');
  } else if (format === 'clash') {
    // TODO: 实现Clash配置生成
    return Buffer.from(nodes.join('\n')).toString('base64');
  }
  
  return Buffer.from(nodes.join('\n')).toString('base64');
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
  const { urls, format = 'base64' } = req.query;
  
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
      const result = await parseSubscription(url, format);
      
      if (result.success) {
        allNodes.push(...result.nodes);
        console.log(`从订阅链接获取了 ${result.nodes.length} 个节点`);
      } else {
        console.log(`获取订阅内容失败: ${result.error}`);
      }
      
      // 记录处理结果
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
    return res.status(200).json({
      success: false,
      error: '合并失败',
      message: '无法从订阅链接获取任何节点',
      results,
      stats: {
        total_nodes: 0,
        node_types: {}
      }
    });
  }
  
  // 转换为指定格式
  const output = convertNodes(uniqueNodes, format);
  
  // 生成节点统计信息
  const stats = {
    total_nodes: uniqueNodes.length,
    node_types: getNodeTypesStats(uniqueNodes)
  };
  
  // 判断客户端接受的返回类型
  const acceptHeader = req.headers.accept || '';
  
  if (acceptHeader.includes('application/json')) {
    // 返回JSON格式的信息
    return res.status(200).json({
      success: true,
      output,
      results,
      stats
    });
  } else {
    // 直接返回合并后的节点数据
    res.setHeader('Content-Type', format === 'clash' ? 'text/yaml' : 'text/plain');
    return res.status(200).send(output);
  }
}