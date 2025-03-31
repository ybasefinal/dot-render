document.addEventListener('DOMContentLoaded', function() {
  const renderButton = document.getElementById('render-button');
  
  renderButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: triggerManualRender
      });
    });
  });

  // 更新状态显示
  updateStatus();
});

// 手动触发渲染函数
function triggerManualRender() {
  // 发送消息给content script执行渲染
  if (window.dotRenderer && typeof window.dotRenderer.renderAll === 'function') {
    window.dotRenderer.renderAll(true);
    return '手动渲染已完成';
  } else {
    return '无法访问渲染引擎';
  }
}

// 更新插件状态
function updateStatus() {
  const statusMessage = document.getElementById('status-message');
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      function: checkRendererStatus
    }, function(results) {
      if (chrome.runtime.lastError) {
        statusMessage.textContent = '无法在当前页面上运行';
        statusMessage.style.color = '#d32f2f';
        return;
      }
      
      const result = results[0].result;
      if (result.enabled) {
        statusMessage.textContent = '已启用 - 自动渲染页面中的DOT代码';
        statusMessage.style.color = '#2e7d32';
      } else {
        statusMessage.textContent = '渲染引擎未启动';
        statusMessage.style.color = '#d32f2f';
      }
    });
  });
}

// 检查渲染器状态
function checkRendererStatus() {
  return {
    enabled: window.dotRenderer && typeof window.dotRenderer.renderAll === 'function',
    rendered: window.dotRenderer ? window.dotRenderer.getRenderedCount() : 0
  };
} 