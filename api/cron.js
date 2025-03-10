// 这个API端点将由Vercel Cron触发

module.exports = async (req, res) => {
  try {
    console.log('定时任务开始执行，刷新缓存...');
    
    console.log('缓存刷新完成');
    
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      message: '缓存已刷新'
    });
  } catch (error) {
    console.error(`定时任务执行出错: ${error.message}`);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}; 