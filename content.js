// DOT代码渲染器
window.dotRenderer = (function() {
  // 记录已渲染的图形数量
  let renderedCount = 0;
  // Viz实例
  let vizInstance = null;
  // 标记是否正在处理渲染
  let isProcessing = false;
  // 等待处理的节点集
  let pendingElements = new Set();
  // 渲染配置
  let renderConfig = {
    renderFormat: 'svg' // 默认为SVG格式
  };
  
  // 初始化Viz实例
  function initViz() {
    if (typeof Viz === 'function') {
      // 旧版API: Viz是一个函数
      vizInstance = Viz;
      return Promise.resolve(vizInstance);
    } else if (typeof Viz === 'object' && typeof Viz.instance === 'function') {
      // 新版API: Viz.instance()返回Promise
      if (!vizInstance) {
        return Viz.instance().then(function(viz) {
          vizInstance = viz;
          return vizInstance;
        }).catch(function(error) {
          console.error('Viz.js初始化失败:', error);
          return null;
        });
      } else {
        return Promise.resolve(vizInstance);
      }
    } else {
      console.error('无法识别的Viz.js API');
      return Promise.reject(new Error('无法识别的Viz.js API'));
    }
  }
  
  // 初始化
  function init() {
    // 加载保存的配置
    loadConfig();
    
    // 确保Viz.js已加载
    if (typeof Viz === 'undefined') {
      console.error('Viz.js库未加载');
      return;
    }
    
    // 先初始化Viz实例
    initViz().then(function() {
      // 页面加载完成后自动渲染
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          renderAll();
        });
      } else {
        renderAll();
      }
      
      // 监听DOM变化，处理动态加载的内容
      const observer = new MutationObserver(debounce(function(mutations) {
        // 过滤掉由插件自身创建的DOM变化
        const relevantMutations = mutations.filter(function(mutation) {
          // 检查是否有新节点，且不是插件生成的
          if (mutation.addedNodes && mutation.addedNodes.length > 0) {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
              const node = mutation.addedNodes[i];
              
              // 排除插件生成的容器和元素
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList) {
                  if (node.classList.contains('dot-render-container') || 
                      node.classList.contains('dot-render-error') || 
                      node.classList.contains('dot-render-loading') ||
                      node.hasAttribute('data-dot-rendered')) {
                    continue;
                  }
                }
                
                // 检查是否包含非插件生成的文本节点或元素
                return true;
              } else if (node.nodeType === Node.TEXT_NODE) {
                // 文本节点可能包含dot代码
                return true;
              }
            }
          }
          return false;
        });
        
        if (relevantMutations.length > 0) {
          renderAll();
        }
      }, 300)); // 添加300ms防抖
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }).catch(function(error) {
      console.error('初始化失败:', error);
    });
  }
  
  // 加载保存的配置
  function loadConfig() {
    if (chrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({
        renderFormat: 'svg' // 默认值是SVG
      }, function(items) {
        renderConfig.renderFormat = items.renderFormat;
      });
    }
  }
  
  // 更新配置
  function updateConfig(config) {
    if (config && typeof config === 'object') {
      Object.assign(renderConfig, config);
      return true;
    }
    return false;
  }
  
  // 防抖函数
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  // 渲染所有DOT代码
  function renderAll(forceRender = false) {
    // 如果已经在处理中，不再重复执行
    if (isProcessing) {
      return renderedCount;
    }
    
    isProcessing = true;
    
    try {
      // 查找所有预格式化的DOT代码块
      const preElements = Array.from(document.querySelectorAll('pre.dot, pre[class*="language-dot"], pre.mdr-code-block code'));
      
      // 查找所有标记为DOT的代码块（例如Markdown中的```dot）
      const codeBlocks = Array.from(document.querySelectorAll('code[class*="language-dot"]'));
      
      // 查找纯文本形式的```dot代码块
      const textDotBlocks = findRawDotBlocks();
      
      // 合并所有找到的元素
      const elements = [...preElements, ...codeBlocks, ...textDotBlocks];
      
      // 过滤已处理的元素
      const newElements = elements.filter(element => 
        forceRender || !element.hasAttribute('data-dot-rendered')
      );
      
      // 如果没有新元素需要处理，直接返回
      if (newElements.length === 0) {
        isProcessing = false;
        return renderedCount;
      }
      
      // 开始逐个渲染元素
      let processedCount = 0;
      
      function processNextElement() {
        if (processedCount >= newElements.length) {
          // 所有元素已处理完毕
          isProcessing = false;
          return;
        }
        
        const element = newElements[processedCount++];
        const dotCode = element.textContent.trim();
        
        if (isDotCode(dotCode)) {
          // 渲染此元素
          renderElement(element, dotCode, function() {
            // 元素渲染完成后处理下一个
            setTimeout(processNextElement, 0);
          });
        } else {
          // 不符合DOT语法，直接处理下一个
          setTimeout(processNextElement, 0);
        }
      }
      
      // 开始处理第一个元素
      processNextElement();
    } catch (error) {
      console.error("渲染过程中出错:", error);
      isProcessing = false;
    }
    
    return renderedCount;
  }
  
  // 检查代码是否符合dot语法
  function isDotCode(code) {
    if (!code) return false;
    
    // 检查基本语法特征
    const hasDotKeywords = /(digraph|graph|strict|subgraph|node|edge|rank)\s+/i.test(code);
    const hasGraphDeclaration = /^\s*(digraph|graph|strict\s+digraph|strict\s+graph)\s+[\w\d_]*\s*\{/mi.test(code);
    const hasEdges = /-[->]/.test(code);
    const hasNodes = /\w+\s*(\[.+\])?\s*;/.test(code);
    
    // DOT文件必须包含图声明或至少包含一些DOT关键字和边或节点
    return hasGraphDeclaration || (hasDotKeywords && (hasEdges || hasNodes));
  }
  
  // 查找纯文本形式的```dot代码块
  function findRawDotBlocks() {
    const result = [];
    const allTextNodes = getAllTextNodes(document.body);
    
    // 使用数组存储要处理的文本节点
    let nodesToProcess = [...allTextNodes];
    
    // 处理所有找到的文本节点
    while (nodesToProcess.length > 0) {
      const textNode = nodesToProcess.shift();
      
      // 跳过已经处理过的节点
      if (textNode.nodeType !== Node.TEXT_NODE || textNode.processed) continue;
      
      const text = textNode.textContent;
      
      // 查找```dot开头的文本
      if (text.includes('```dot')) {
        let currentText = text;
        let currentNode = textNode;
        let startIdx = currentText.indexOf('```dot');
        
        // 循环处理同一文本节点中的所有dot代码块
        while (startIdx !== -1) {
          const endIdx = currentText.indexOf('```', startIdx + 5); // 从startIdx之后查找结束标记
          
          if (endIdx > startIdx) {
            // 提取DOT代码内容
            const dotCode = currentText.substring(startIdx + 6, endIdx).trim();
            
            // 验证是否符合dot语法（对于文本形式的代码块，我们确保它真的是dot代码）
            if (isDotCode(dotCode)) {
              // 创建一个pre元素来包装DOT代码
              const preElement = document.createElement('pre');
              preElement.className = 'dot';
              preElement.textContent = dotCode;
              preElement.setAttribute('data-dot-source', 'raw'); // 标记为原始文本
              
              // 将新元素插入到文本节点之后
              const parent = currentNode.parentNode;
              if (parent) {
                // 创建新的文本节点，包含原始文本节点中代码块之前的内容
                const beforeText = document.createTextNode(currentText.substring(0, startIdx));
                parent.insertBefore(beforeText, currentNode);
                
                // 插入包装的DOT代码
                parent.insertBefore(preElement, currentNode);
                
                // 剩余文本作为新节点
                const remainingText = currentText.substring(endIdx + 3);
                const afterNode = document.createTextNode(remainingText);
                parent.insertBefore(afterNode, currentNode);
                
                // 将新创建的pre元素添加到结果列表
                result.push(preElement);
                
                // 删除或更新当前节点
                parent.removeChild(currentNode);
                
                // 更新当前节点和文本为剩余部分，继续处理
                currentNode = afterNode;
                currentText = remainingText;
                
                // 在剩余文本中继续查找
                startIdx = currentText.indexOf('```dot');
                
                // 如果还有更多的dot代码块，将这个新节点添加到处理队列中
                if (startIdx !== -1) {
                  continue;
                }
              } else {
                break;
              }
            } else {
              // 不是dot代码，跳过这个代码块
              const remainingText = currentText.substring(endIdx + 3);
              const afterNode = document.createTextNode(remainingText);
              const parent = currentNode.parentNode;
              
              if (parent) {
                // 保留原文本而不渲染
                parent.insertBefore(afterNode, currentNode.nextSibling);
                parent.removeChild(currentNode);
                
                // 更新当前节点和文本
                currentNode = afterNode;
                currentText = remainingText;
                
                // 继续检查剩余文本
                startIdx = currentText.indexOf('```dot');
                continue;
              } else {
                break;
              }
            }
          } else {
            break; // 没有找到结束标记
          }
        }
      }
    }
    
    return result;
  }
  
  // 获取所有文本节点
  function getAllTextNodes(node) {
    const textNodes = [];
    
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      textNodes.push(node);
    } else {
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        textNodes.push(...getAllTextNodes(children[i]));
      }
    }
    
    return textNodes;
  }
  
  // 渲染单个元素中的DOT代码
  function renderElement(element, dotCode, callback) {
    // 标记元素正在渲染中，防止重复渲染
    element.setAttribute('data-dot-rendering', 'true');
    
    // 创建一个加载指示器
    const loadingElement = document.createElement('div');
    loadingElement.className = 'dot-render-loading';
    loadingElement.textContent = '正在渲染DOT图形...';
    element.parentNode.insertBefore(loadingElement, element.nextSibling);
    
    // 确保Viz实例已初始化
    initViz().then(function(viz) {
      if (!viz) {
        // 初始化失败
        showRenderError(element, loadingElement, '无法初始化渲染引擎');
        finishRender();
        return;
      }
      
      try {
        let svgElement;
        let svgString;
        
        // 检查API类型并适当地渲染
        if (typeof viz === 'function') {
          // 旧版API: viz是一个函数，直接返回SVG字符串
          svgString = viz(dotCode, { format: "svg", engine: "dot" });
          
          // 创建一个div来包含SVG
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = svgString;
          svgElement = tempDiv.firstChild;
          
          // 根据配置格式处理元素
          if (renderConfig.renderFormat === 'png') {
            convertSvgToPng(svgElement, function(imgElement) {
              processImageElement(imgElement);
              finishRender();
            });
          } else {
            // 默认SVG格式
            processSvgElement(svgElement);
            finishRender();
          }
        } else if (typeof viz.renderSVGElement === 'function') {
          // 新版API: viz.renderSVGElement方法
          const result = viz.renderSVGElement(dotCode);
          
          // 检查返回值是Promise还是直接的SVG元素
          if (result instanceof Promise) {
            // 如果是Promise，使用.then处理
            result.then(function(svg) {
              if (renderConfig.renderFormat === 'png') {
                convertSvgToPng(svg, function(imgElement) {
                  processImageElement(imgElement);
                  finishRender();
                });
              } else {
                processSvgElement(svg);
                finishRender();
              }
            }).catch(function(error) {
              showRenderError(element, loadingElement, error.message);
              finishRender();
            });
          } else {
            // 直接返回SVG元素
            svgElement = result;
            if (renderConfig.renderFormat === 'png') {
              convertSvgToPng(svgElement, function(imgElement) {
                processImageElement(imgElement);
                finishRender();
              });
            } else {
              processSvgElement(svgElement);
              finishRender();
            }
          }
        } else {
          throw new Error('不支持的Viz.js API');
        }
      } catch (error) {
        showRenderError(element, loadingElement, error.message);
        finishRender();
      }
    }).catch(function(error) {
      showRenderError(element, loadingElement, error.message);
      finishRender();
    });
    
    // SVG转换为PNG
    function convertSvgToPng(svgElement, callback) {
      // 获取SVG的原始尺寸
      let width = parseInt(svgElement.getAttribute('width') || 0);
      let height = parseInt(svgElement.getAttribute('height') || 0);
      
      // 如果SVG没有设置尺寸属性，创建临时容器获取尺寸
      if (!width || !height) {
        // 创建临时容器，保持不可见
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.pointerEvents = 'none';
        
        // 克隆并添加SVG到临时容器
        const tempSvg = svgElement.cloneNode(true);
        tempContainer.appendChild(tempSvg);
        document.body.appendChild(tempContainer);
        
        // 获取尺寸
        const svgRect = tempSvg.getBoundingClientRect();
        width = svgRect.width || 800;
        height = svgRect.height || 600;
        
        // 设置尺寸到原始SVG元素
        svgElement.setAttribute('width', width);
        svgElement.setAttribute('height', height);
        
        // 移除临时容器
        document.body.removeChild(tempContainer);
      }
      
      // 强制设置viewBox以确保图像正确显示
      if (!svgElement.getAttribute('viewBox')) {
        svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
      }
      
      // 保持宽高比的同时适应屏幕（限制最大宽度）
      const maxWidth = window.innerWidth * 0.8; // 屏幕宽度的80%
      if (width > maxWidth) {
        const ratio = height / width;
        width = maxWidth;
        height = maxWidth * ratio;
      }
      
      // 创建Canvas元素
      const canvas = document.createElement('canvas');
      canvas.width = width * 2; // 2倍缩放获得更高质量
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      
      // 创建图像
      const img = new Image();
      
      // 将SVG转换为Data URL
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
      
      // 图像加载完成后绘制到Canvas并创建PNG图像元素
      img.onload = function() {
        // 绘制白色背景
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 绘制SVG，保持宽高比
        ctx.drawImage(img, 0, 0, width, height);
        
        try {
          // 创建PNG图像元素
          const pngURL = canvas.toDataURL('image/png');
          const imgElement = document.createElement('img');
          imgElement.src = pngURL;
          imgElement.width = width;
          imgElement.height = height;
          imgElement.className = 'dot-render-png';
          imgElement.style.width = width + 'px';
          imgElement.style.height = height + 'px';
          
          // 保存原始SVG用于后续可能的SVG下载
          imgElement.setAttribute('data-original-svg', svgData);
          
          if (typeof callback === 'function') {
            callback(imgElement);
          }
        } catch (e) {
          console.error('PNG转换失败:', e);
          // 失败时回退到SVG
          processSvgElement(svgElement);
          finishRender();
        }
      };
      
      // 加载图像
      img.src = svgURL;
      
      // 图像加载失败处理
      img.onerror = function() {
        console.error('SVG图像加载失败');
        // 失败时回退到SVG
        processSvgElement(svgElement);
        if (typeof callback === 'function') {
          callback(svgElement);
        }
      };
    }
    
    // 处理渲染完成
    function finishRender() {
      // 移除渲染中标记
      element.removeAttribute('data-dot-rendering');
      
      // 调用回调函数
      if (typeof callback === 'function') {
        callback();
      }
    }
    
    // 处理图像元素的函数 (PNG模式)
    function processImageElement(imgElement) {
      // 创建一个包装容器
      const container = document.createElement('div');
      container.className = 'dot-render-wrapper';
      
      // 创建图像容器
      const imgContainer = document.createElement('div');
      imgContainer.className = 'dot-render-container';
      
      // 创建按钮控制区
      const controlPanel = document.createElement('div');
      controlPanel.className = 'dot-control-panel';
      
      // 移除加载指示器
      loadingElement.remove();
      
      // 添加图像元素到容器
      imgContainer.appendChild(imgElement);
      
      // 添加查看源代码按钮
      const sourceButton = document.createElement('button');
      sourceButton.textContent = '查看源代码';
      sourceButton.className = 'dot-control-button';
      
      // 添加放大按钮
      const zoomButton = document.createElement('button');
      zoomButton.textContent = '放大';
      zoomButton.className = 'dot-control-button';
      
      // 添加SVG下载按钮
      const svgButton = document.createElement('button');
      svgButton.textContent = 'SVG';
      svgButton.className = 'dot-control-button';
      svgButton.title = '下载SVG格式';
      
      // 添加PNG下载按钮
      const pngButton = document.createElement('button');
      pngButton.textContent = 'PNG';
      pngButton.className = 'dot-control-button active-format';
      pngButton.title = '下载PNG格式';
      
      // 切换显示源代码和图形
      let showingSource = false;
      sourceButton.addEventListener('click', function() {
        if (showingSource) {
          element.style.display = 'none';
          imgContainer.style.display = 'block';
          sourceButton.textContent = '查看源代码';
        } else {
          element.style.display = 'block';
          imgContainer.style.display = 'none';
          sourceButton.textContent = '查看图形';
        }
        showingSource = !showingSource;
      });
      
      // 放大功能实现
      zoomButton.addEventListener('click', function() {
        // 创建弹出层
        const overlay = document.createElement('div');
        overlay.className = 'dot-zoom-overlay';
        
        // 创建弹出层内容容器
        const zoomContainer = document.createElement('div');
        zoomContainer.className = 'dot-zoom-container';
        
        // 复制图像以在弹出层中显示
        const zoomedImg = imgElement.cloneNode(true);
        zoomContainer.appendChild(zoomedImg);
        
        // 点击弹出层背景关闭弹出层
        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) {
            document.body.removeChild(overlay);
          }
        });
        
        // 按ESC键关闭弹出层
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' && document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
        });
        
        // 将弹出层添加到body
        overlay.appendChild(zoomContainer);
        document.body.appendChild(overlay);
      });
      
      // SVG下载功能
      svgButton.addEventListener('click', function() {
        const svgData = imgElement.getAttribute('data-original-svg');
        if (svgData) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = svgData;
          const svgElement = tempDiv.firstChild;
          downloadAsSVG(svgElement);
        } else {
          alert('SVG数据不可用');
        }
      });
      
      // PNG下载功能
      pngButton.addEventListener('click', function() {
        downloadImageAsPNG(imgElement);
      });
      
      // 根据配置，添加下载按钮点击事件
      const defaultDownloadButton = document.createElement('button');
      defaultDownloadButton.textContent = '下载';
      defaultDownloadButton.className = 'dot-control-button';
      defaultDownloadButton.title = '下载PNG格式';
      
      defaultDownloadButton.addEventListener('click', function() {
        downloadImageAsPNG(imgElement);
      });
      
      // 将按钮添加到控制面板
      controlPanel.appendChild(sourceButton);
      controlPanel.appendChild(zoomButton);
      controlPanel.appendChild(defaultDownloadButton);
      controlPanel.appendChild(svgButton);
      controlPanel.appendChild(pngButton);
      
      // 构建完整的容器结构
      container.appendChild(imgContainer);
      container.appendChild(controlPanel);
      
      // 插入容器
      element.parentNode.insertBefore(container, element.nextSibling);
      
      // 隐藏原始代码
      element.style.display = 'none';
      
      // 标记为已渲染
      element.setAttribute('data-dot-rendered', 'true');
      renderedCount++;
    }
    
    // 处理SVG元素的函数
    function processSvgElement(svgElement) {
      // 创建一个包装容器
      const container = document.createElement('div');
      container.className = 'dot-render-wrapper';
      
      // 创建SVG图像容器
      const svgContainer = document.createElement('div');
      svgContainer.className = 'dot-render-container';
      
      // 创建按钮控制区
      const controlPanel = document.createElement('div');
      controlPanel.className = 'dot-control-panel';
      
      // 移除加载指示器
      loadingElement.remove();
      
      // 添加SVG元素到容器
      svgContainer.appendChild(svgElement);
      
      // 添加查看源代码按钮
      const sourceButton = document.createElement('button');
      sourceButton.textContent = '查看源代码';
      sourceButton.className = 'dot-control-button';
      
      // 添加放大按钮
      const zoomButton = document.createElement('button');
      zoomButton.textContent = '放大';
      zoomButton.className = 'dot-control-button';
      
      // 添加SVG下载按钮
      const svgButton = document.createElement('button');
      svgButton.textContent = 'SVG';
      svgButton.className = 'dot-control-button active-format';
      svgButton.title = '下载SVG格式';
      
      // 添加PNG下载按钮
      const pngButton = document.createElement('button');
      pngButton.textContent = 'PNG';
      pngButton.className = 'dot-control-button';
      pngButton.title = '下载PNG格式';
      
      // 切换显示源代码和图形
      let showingSource = false;
      sourceButton.addEventListener('click', function() {
        if (showingSource) {
          element.style.display = 'none';
          svgContainer.style.display = 'block';
          sourceButton.textContent = '查看源代码';
        } else {
          element.style.display = 'block';
          svgContainer.style.display = 'none';
          sourceButton.textContent = '查看图形';
        }
        showingSource = !showingSource;
      });
      
      // 放大功能实现
      zoomButton.addEventListener('click', function() {
        // 创建弹出层
        const overlay = document.createElement('div');
        overlay.className = 'dot-zoom-overlay';
        
        // 创建弹出层内容容器
        const zoomContainer = document.createElement('div');
        zoomContainer.className = 'dot-zoom-container';
        
        // 复制SVG以在弹出层中显示
        const zoomedSvg = svgElement.cloneNode(true);
        zoomContainer.appendChild(zoomedSvg);
        
        // 点击弹出层背景关闭弹出层
        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) {
            document.body.removeChild(overlay);
          }
        });
        
        // 按ESC键关闭弹出层
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' && document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
        });
        
        // 将弹出层添加到body
        overlay.appendChild(zoomContainer);
        document.body.appendChild(overlay);
      });
      
      // SVG下载功能
      svgButton.addEventListener('click', function() {
        downloadAsSVG(svgElement);
      });
      
      // PNG下载功能
      pngButton.addEventListener('click', function() {
        downloadAsPNG(svgElement);
      });
      
      // 根据配置，添加下载按钮点击事件
      const defaultDownloadButton = document.createElement('button');
      defaultDownloadButton.textContent = '下载';
      defaultDownloadButton.className = 'dot-control-button';
      defaultDownloadButton.title = '下载SVG格式';
      
      defaultDownloadButton.addEventListener('click', function() {
        downloadAsSVG(svgElement);
      });
      
      // 将按钮添加到控制面板
      controlPanel.appendChild(sourceButton);
      controlPanel.appendChild(zoomButton);
      controlPanel.appendChild(defaultDownloadButton);
      controlPanel.appendChild(svgButton);
      controlPanel.appendChild(pngButton);
      
      // 构建完整的容器结构
      container.appendChild(svgContainer);
      container.appendChild(controlPanel);
      
      // 插入容器
      element.parentNode.insertBefore(container, element.nextSibling);
      
      // 隐藏原始代码
      element.style.display = 'none';
      
      // 标记为已渲染
      element.setAttribute('data-dot-rendered', 'true');
      renderedCount++;
    }
  }
  
  // 显示渲染错误
  function showRenderError(element, loadingElement, errorMessage) {
    console.error('DOT渲染错误:', errorMessage);
    
    // 移除加载指示器
    if (loadingElement) {
      loadingElement.remove();
    }
    
    // 创建错误提示
    const errorElement = document.createElement('div');
    errorElement.className = 'dot-render-error';
    errorElement.textContent = '无法渲染DOT代码: ' + errorMessage;
    
    // 插入错误提示
    element.parentNode.insertBefore(errorElement, element.nextSibling);
  }
  
  // 下载图像格式的PNG
  function downloadImageAsPNG(imgElement) {
    // 创建下载链接
    const link = document.createElement('a');
    link.href = imgElement.src;
    link.download = 'dot-diagram.png';
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
  }
  
  // 下载SVG格式
  function downloadAsSVG(svgElement) {
    // 复制SVG元素
    const svgClone = svgElement.cloneNode(true);
    
    // 获取SVG的尺寸
    const svgRect = svgElement.getBoundingClientRect();
    const width = svgRect.width;
    const height = svgRect.height;
    
    // 设置尺寸以确保完整显示
    svgClone.setAttribute('width', width);
    svgClone.setAttribute('height', height);
    
    // 创建SVG字符串
    const svgData = new XMLSerializer().serializeToString(svgClone);
    
    // 添加XML声明和命名空间
    const svgBlob = new Blob([
      '<?xml version="1.0" standalone="no"?>\r\n',
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\r\n',
      svgData
    ], {type: 'image/svg+xml'});
    
    const url = URL.createObjectURL(svgBlob);
    
    // 创建下载链接
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dot-diagram.svg';
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  // 下载PNG格式
  function downloadAsPNG(svgElement) {
    // 获取SVG尺寸
    let width = parseInt(svgElement.getAttribute('width') || 0);
    let height = parseInt(svgElement.getAttribute('height') || 0);
    
    // 如果没有显式设置尺寸，则从元素尺寸获取
    if (!width || !height) {
      const svgRect = svgElement.getBoundingClientRect();
      width = svgRect.width || 800;
      height = svgRect.height || 600;
      
      // 设置尺寸以确保正确显示
      svgElement.setAttribute('width', width);
      svgElement.setAttribute('height', height);
    }
    
    // 强制设置viewBox以确保图像正确显示
    if (!svgElement.getAttribute('viewBox')) {
      svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    
    // 创建Canvas元素，保持原始宽高比
    const canvas = document.createElement('canvas');
    canvas.width = width * 2; // 2倍缩放获得更高质量
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    
    // 创建图像
    const img = new Image();
    
    // 将SVG转换为Data URL
    const svgClone = svgElement.cloneNode(true);
    svgClone.setAttribute('width', width);
    svgClone.setAttribute('height', height);
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
    
    // 图像加载完成后绘制到Canvas并下载
    img.onload = function() {
      // 绘制白色背景
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制SVG，保持宽高比
      ctx.drawImage(img, 0, 0, width, height);
      
      // 转换为PNG并下载
      try {
        const pngURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngURL;
        link.download = 'dot-diagram.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.error('PNG导出失败:', e);
        alert('PNG导出失败，可能是由于浏览器的安全限制。请尝试下载SVG格式。');
      }
    };
    
    // 加载图像
    img.src = svgURL;
    
    // 图像加载失败处理
    img.onerror = function() {
      console.error('图像加载失败');
      alert('图像加载失败，请尝试下载SVG格式。');
    };
  }
  
  // 获取已渲染数量
  function getRenderedCount() {
    return renderedCount;
  }
  
  // 初始化
  init();
  
  // 公开API
  return {
    renderAll: renderAll,
    getRenderedCount: getRenderedCount,
    updateConfig: updateConfig
  };
})(); 