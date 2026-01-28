import { useState, useRef } from 'react';
import Head from 'next/head';

export default function Home() {
  const [urls, setUrls] = useState('');
  const [format, setFormat] = useState('clash');
  const [mergeUrl, setMergeUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [enableDoh, setEnableDoh] = useState(false);
  const [dohServer, setDohServer] = useState('');
  const textAreaRef = useRef(null);

  const formatOptions = [
    { value: 'clash', label: 'Clash / Clash.Meta', api: '/api/merge' },
    { value: 'singbox', label: 'sing-box', api: '/api/singbox' },
    { value: 'base64', label: 'Base64 (通用)', api: '/api/merge' },
  ];

  // 检测是否为直接内容（非 URL）
  const isDirectContent = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    
    // 检查是否全部是 URL
    const urlPattern = /^https?:\/\//i;
    const allUrls = lines.every(line => urlPattern.test(line));
    if (allUrls) return false;
    
    // 检查是否包含节点 URI 或 Base64 内容
    const nodePatterns = /^(vmess|vless|trojan|ss|ssr|hysteria2?|hy2?|tuic|wireguard|wg):\/\//i;
    const hasNodes = lines.some(line => nodePatterns.test(line));
    if (hasNodes) return true;
    
    // 检查是否为 Base64（长字符串，无空格，可能包含 = 结尾）
    const base64Pattern = /^[A-Za-z0-9+/=]{50,}$/;
    if (lines.length === 1 && base64Pattern.test(lines[0].replace(/\s/g, ''))) {
      return true;
    }
    
    // 检查是否为 YAML/JSON 配置
    if (text.includes('proxies:') || text.includes('"proxies"')) {
      return true;
    }
    
    return false;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!urls.trim()) {
      alert('请输入订阅链接或节点内容');
      return;
    }
    
    const input = urls.trim();
    const isDirect = isDirectContent(input);
    
    let apiUrl;
    
    if (isDirect) {
      // 直接内容模式 - 使用 content 参数
      const encodedContent = encodeURIComponent(input);
      if (format === 'singbox') {
        apiUrl = `/api/singbox?content=${encodedContent}`;
        if (enableDoh) {
          apiUrl += '&enableDoh=1';
          if (dohServer.trim()) apiUrl += `&dohServer=${encodeURIComponent(dohServer.trim())}`;
        }
      } else {
        apiUrl = `/api/merge?content=${encodedContent}&format=${format}`;
      }
    } else {
      // URL 模式
      const urlList = input.split('\n')
        .map(url => url.trim())
        .filter(Boolean);
      
      if (urlList.length === 0) {
        alert('没有有效的内容');
        return;
      }
      
      const encodedUrls = encodeURIComponent(urlList.join(','));
      if (format === 'singbox') {
        apiUrl = `/api/singbox?urls=${encodedUrls}`;
        if (enableDoh) {
          apiUrl += '&enableDoh=1';
          if (dohServer.trim()) apiUrl += `&dohServer=${encodeURIComponent(dohServer.trim())}`;
        }
      } else {
        apiUrl = `/api/merge?urls=${encodedUrls}&format=${format}`;
      }
    }
    
    setMergeUrl(apiUrl);
    setIsLoading(true);
    
    // 模拟加载
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };
  
  const handleCopy = () => {
    if (!mergeUrl) return;
    
    const fullUrl = window.location.origin + mergeUrl;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  
  const handleClear = () => {
    setUrls('');
    setMergeUrl('');
  };

  return (
    <>
      <Head>
        <title>SubMerge | 订阅合并工具</title>
        <meta name="description" content="合并多个代理订阅链接为一个统一的订阅" />
        <meta name="robots" content="nofollow" />
        <meta name="disclaimer" content="本工具仅供技术研究和学习使用，不提供任何代理服务，也不生产任何代理内容" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100/80">
        {/* 导航栏 */}
        <nav className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-neutral-200/80">
          <div className="container-content flex h-16 items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neutral-800 to-neutral-600">SubMerge</span>
            </div>
            <div>
              <a 
                href="https://github.com/shuakami/MergeSubLinks" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                <svg className="h-5 w-5 mr-1.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </nav>

        <main className="py-12">
          <div className="container-content">
            {/* 头部 */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-neutral-900 mb-3 tracking-tight">
                订阅合并工具
              </h1>
              <p className="text-xl text-neutral-600 max-w-2xl mx-auto">
                将多个代理订阅链接智能合并为一个，轻松管理您的所有节点资源
              </p>
            </div>

            {/* 主内容 */}
            <div className="grid gap-8 md:grid-cols-12">
              {/* 左侧输入部分 */}
              <div className="md:col-span-7">
                <div className="glass-card overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-center mb-5">
                      <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center mr-3">
                        <svg className="h-4 w-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-semibold text-neutral-900">输入订阅链接</h2>
                    </div>
                    
                    <form onSubmit={handleSubmit}>
                      <div className="mb-6">
                        <label htmlFor="urls" className="block text-sm font-medium text-neutral-700 mb-2">
                          粘贴订阅链接或直接粘贴节点内容
                        </label>
                        <textarea
                          id="urls"
                          ref={textAreaRef}
                          value={urls}
                          onChange={(e) => setUrls(e.target.value)}
                          className="input min-h-[180px] bg-neutral-50/50 font-mono text-sm"
                          rows="6"
                          placeholder={"支持以下格式：\n\n1. 订阅链接（每行一个）\nhttps://example.com/sub\n\n2. 节点 URI\nvmess://xxx\nvless://xxx\n\n3. Base64 编码内容\n\n4. Clash YAML 配置"}
                          required
                        ></textarea>
                        <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
                          支持 VMess、VLESS、Trojan、Shadowsocks、Hysteria2、TUIC、WireGuard 等协议 <br/>
                          系统会自动检测格式，无需手动转换
                        </p>
                      </div>

                      <div className="flex space-x-3">
                        <button
                          type="submit"
                          className="btn btn-primary flex-1"
                        >
                          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          生成合并链接
                        </button>
                        <select
                          value={format}
                          onChange={(e) => setFormat(e.target.value)}
                          className="px-4 py-2.5 rounded-xl bg-neutral-100 text-neutral-700 text-sm font-medium border-0 cursor-pointer hover:bg-neutral-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          {formatOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleClear}
                          className="btn btn-secondary"
                        >
                          清空
                        </button>
                      </div>
                      <p className="mt-3 text-xs text-neutral-400 text-center">
                        {format === 'singbox' && '输出 sing-box JSON 配置'}
                        {format === 'clash' && '输出 Clash YAML 配置'}
                        {format === 'base64' && '输出 Base64 通用格式'}
                      </p>
                      
                      {format === 'singbox' && (
                        <div className="mt-4 pt-4 border-t border-neutral-100">
                          <label className="flex items-center cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={enableDoh}
                              onChange={(e) => setEnableDoh(e.target.checked)}
                              className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                            />
                            <span className="ml-2 text-sm text-neutral-600 group-hover:text-neutral-800">
                              启用 DoH (DNS over HTTPS)
                            </span>
                          </label>
                          <p className="mt-1.5 text-xs text-neutral-400 ml-6">
                            默认放行 853 端口兼容系统 Private DNS，启用后劫持 DNS 使用 DoH/H3
                          </p>
                          
                          {enableDoh && (
                            <div className="mt-3 ml-6">
                              <input
                                type="text"
                                value={dohServer}
                                onChange={(e) => setDohServer(e.target.value)}
                                placeholder="DoH 服务器（可选，如 dns.google 或 1.1.1.1）"
                                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                              />
                              <p className="mt-1 text-xs text-neutral-400">
                                留空使用默认 (8.8.8.8)，支持 HTTP/3 QUIC 协议
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              </div>

              {/* 右侧结果部分 */}
              <div className="md:col-span-5">
                {isLoading ? (
                  <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[280px]">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-primary-500 animate-spin"></div>
                      <div className="absolute inset-3 rounded-full border-t-2 border-r-2 border-primary-300 animate-spin"></div>
                    </div>
                    <p className="mt-4 text-neutral-600">正在处理订阅...</p>
                  </div>
                ) : mergeUrl ? (
                  <div className="glass-card overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-center mb-5">
                        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                          <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-neutral-900">合并成功</h2>
                      </div>
                      
                      <div className="mb-5">
                        <div className="bg-neutral-800 rounded-xl px-4 py-3 relative font-mono text-sm overflow-hidden">
                          <p className="break-all pr-10 text-neutral-200 text-xs leading-relaxed overflow-x-auto max-h-32 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900 scrollbar-rounded">
                            {window.location.origin}{mergeUrl}
                          </p>
                          <button
                            onClick={handleCopy}
                            className="absolute right-2 top-2 p-1.5 text-neutral-400 hover:text-neutral-200 rounded-md hover:bg-neutral-700/50 transition-colors"
                            title="复制链接"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                            </svg>
                          </button>
                        </div>
                        {copied && (
                          <div className="flex items-center mt-2 text-sm text-green-600">
                            <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span>链接已成功复制到剪贴板</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        <a
                          href={mergeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary"
                        >
                          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                          </svg>
                          下载配置文件
                        </a>
                        <button
                          onClick={handleCopy}
                          className="btn btn-secondary"
                        >
                          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                          </svg>
                          复制订阅链接
                        </button>
                      </div>
                    </div>
                    
                    <div className="border-t border-neutral-100/50 bg-neutral-50/30 px-6 py-4">
                      <div className="text-sm text-neutral-500 flex items-center">
                        <svg className="h-4 w-4 mr-2 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        每次访问此链接都会自动获取最新的节点信息
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-center mb-5">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                          <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-neutral-900">使用指南</h2>
                      </div>
                      
                      <div className="space-y-4 text-sm text-neutral-600">
                        <p>
                          SubMerge 可以帮您将多个代理订阅链接智能合并为一个，实现统一管理和便捷使用。
                        </p>
                        <div className="space-y-3">
                          <h3 className="font-medium text-neutral-800">使用步骤：</h3>
                          <ol className="grid gap-2">
                            <li className="flex items-start">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600 mr-3">1</span>
                              <span>在左侧文本框中<strong>粘贴您的订阅链接</strong>，每行输入一个</span>
                            </li>
                            <li className="flex items-start">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600 mr-3">2</span>
                              <span>点击<strong>"生成我的合并链接"</strong>按钮进行处理</span>
                            </li>
                            <li className="flex items-start">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600 mr-3">3</span>
                              <span>复制生成的链接或直接下载配置文件</span>
                            </li>
                            <li className="flex items-start">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600 mr-3">4</span>
                              <span>将新链接添加到您的代理客户端中即可使用</span>
                            </li>
                          </ol>
                        </div>
                      </div>
                    </div>
                    
                    <div className="border-t border-neutral-100/50 bg-neutral-50/30 px-6 py-4">
                      <div className="text-sm text-neutral-500 flex items-center">
                        <svg className="h-4 w-4 mr-2 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                        </svg>
                        我们不会存储任何订阅数据
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 特性介绍 */}
            <div className="mt-20">
              <h2 className="text-2xl font-bold text-center mb-10">为什么选择 SubMerge？</h2>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="gradient-border">
                  <div>
                    <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                      <svg className="h-6 w-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium mb-2">智能合并</h3>
                    <p className="text-neutral-600 text-sm leading-relaxed">
                      从多个订阅源获取节点，智能合并为一个统一链接，简化您的节点管理流程
                    </p>
                  </div>
                </div>
                
                <div className="gradient-border">
                  <div>
                    <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                      <svg className="h-6 w-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium mb-2">自动去重</h3>
                    <p className="text-neutral-600 text-sm leading-relaxed">
                      自动识别并删除重复节点，让您的订阅列表保持整洁高效
                    </p>
                  </div>
                </div>
                
                <div className="gradient-border">
                  <div>
                    <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                      <svg className="h-6 w-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium mb-2">多协议支持</h3>
                    <p className="text-neutral-600 text-sm leading-relaxed">
                      全面支持 VMess、VLESS、Trojan、SS、Hysteria2、TUIC、WireGuard 等 10+ 种协议
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 免责声明 */}
            <div className="mt-20 bg-neutral-50 rounded-xl p-6 border border-neutral-100">
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">免责声明</h2>
              <div className="space-y-3 text-sm text-neutral-600">
                <p>1. 本工具（SubMerge）仅供学习与技术研究使用，<strong>请勿用于非法用途</strong>。</p>
                <p>2. 使用本工具的用户需遵守所在国家/地区的相关法律法规，如因使用不当导致的任何法律问题，本工具开发者概不负责。</p>
                <p>3. 本工具不生产任何代理节点数据，仅提供订阅内容的整合服务，不对任何第三方提供的内容负责。</p>
                <p>4. 本项目开源代码不含任何翻墙、爬墙等功能，仅为提高订阅管理效率的工具软件。</p>
                <p>5. 本工具为开源项目，欢迎技术交流，但开发者保留对源代码的最终解释权。</p>
              </div>
            </div>
          </div>
        </main>

        <footer className="bg-white border-t border-neutral-200/80 py-8 mt-20">
          <div className="container-content">
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-lg font-bold text-neutral-900 mb-4">SubMerge</span>
              <p className="text-sm text-neutral-500">
                © {new Date().getFullYear()} SubMerge - Subscription Merger
              </p>
              <div className="mt-3 flex items-center space-x-4">
                <a
                  href="https://github.com/shuakami/MergeSubLinks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-500 hover:text-neutral-700"
                >
                  GitHub
                </a>
                <span className="text-neutral-300">•</span>
                <a
                  href="/api/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-500 hover:text-neutral-700"
                >
                  API Documentation
                </a>
                <span className="text-neutral-300">•</span>
                <a
                  href="https://github.com/shuakami/MergeSubLinks/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-500 hover:text-neutral-700"
                >
                  Feedback
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
} 