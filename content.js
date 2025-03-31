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
          
          // 继续处理SVG元素
          processSvgElement(svgElement);
          finishRender();
        } else if (typeof viz.renderSVGElement === 'function') {
          // 新版API: viz.renderSVGElement方法
          const result = viz.renderSVGElement(dotCode);
          
          // 检查返回值是Promise还是直接的SVG元素
          if (result instanceof Promise) {
            // 如果是Promise，使用.then处理
            result.then(function(svg) {
              processSvgElement(svg);
              finishRender();
            }).catch(function(error) {
              showRenderError(element, loadingElement, error.message);
              finishRender();
            });
          } else {
            // 直接返回SVG元素
            svgElement = result;
            processSvgElement(svgElement);
            finishRender();
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
    
    // 处理渲染完成
    function finishRender() {
      // 移除渲染中标记
      element.removeAttribute('data-dot-rendering');
      
      // 调用回调函数
      if (typeof callback === 'function') {
        callback();
      }
    }
    
    // 处理SVG元素的函数
    function processSvgElement(svgElement) {
      // 创建一个包装容器
      const container = document.createElement('div');
      container.className = 'dot-render-container';
      
      // 移除加载指示器
      loadingElement.remove();
      
      // 添加SVG元素到容器
      container.appendChild(svgElement);
      
      // 添加查看源代码按钮
      const sourceButton = document.createElement('button');
      sourceButton.textContent = '查看源代码';
      sourceButton.className = 'dot-source-button';
      
      // 切换显示源代码和图形
      let showingSource = false;
      sourceButton.addEventListener('click', function() {
        if (showingSource) {
          element.style.display = 'none';
          container.style.display = 'block';
          sourceButton.textContent = '查看源代码';
        } else {
          element.style.display = 'block';
          container.style.display = 'none';
          sourceButton.textContent = '查看图形';
        }
        showingSource = !showingSource;
      });
      
      // 插入SVG容器和按钮
      element.parentNode.insertBefore(container, element.nextSibling);
      container.appendChild(sourceButton);
      
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
  
  // 获取已渲染数量
  function getRenderedCount() {
    return renderedCount;
  }
  
  // 初始化
  init();
  
  // 公开API
  return {
    renderAll: renderAll,
    getRenderedCount: getRenderedCount
  };
})(); 