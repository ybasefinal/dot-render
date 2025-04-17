document.addEventListener('DOMContentLoaded', function() {
  const renderButton = document.getElementById('render-button');
  const saveConfigButton = document.getElementById('save-config');
  const formatSvg = document.getElementById('format-svg');
  const formatPng = document.getElementById('format-png');
  
  // 加载保存的配置
  loadConfig();
  
  renderButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: triggerManualRender
      });
    });
  });

  saveConfigButton.addEventListener('click', function() {
    saveConfig();
  });

  // 更新状态显示
  updateStatus();
});

// 保存配置
function saveConfig() {
  // 获取选中的格式
  const formatSvg = document.getElementById('format-svg');
  const format = formatSvg.checked ? 'svg' : 'png';
  
  // 保存到chrome.storage
  chrome.storage.sync.set({
    renderFormat: format
  }, function() {
    // 保存成功后显示提示
    const saveButton = document.getElementById('save-config');
    const originalText = saveButton.textContent;
    saveButton.textContent = '已应用';
    saveButton.disabled = true;
    
    // 将配置传递给当前激活的标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: updateConfig,
        args: [{renderFormat: format}]
      });
    });
    
    // 恢复按钮状态
    setTimeout(function() {
      saveButton.textContent = originalText;
      saveButton.disabled = false;
    }, 1500);
  });
}

// 加载配置
function loadConfig() {
  chrome.storage.sync.get({
    renderFormat: 'svg' // 默认值是SVG
  }, function(items) {
    // 更新单选按钮状态
    if (items.renderFormat === 'svg') {
      document.getElementById('format-svg').checked = true;
    } else {
      document.getElementById('format-png').checked = true;
    }
  });
}

// 更新content script的配置
function updateConfig(config) {
  if (window.dotRenderer && typeof window.dotRenderer.updateConfig === 'function') {
    window.dotRenderer.updateConfig(config);
    return '配置已更新';
  } else {
    return '无法更新配置';
  }
}

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