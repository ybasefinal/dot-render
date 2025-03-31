/**
 * 简化版的Viz.js
 * 这个文件提供了基本的DOT代码转SVG的功能
 * 实际开发中，请替换为完整的viz.js (https://github.com/mdaines/viz.js/)
 */

(function() {
  // 一个非常简化的DOT转SVG引擎
  // 注意：这只是一个演示用的简化版本，不能处理复杂的DOT语法
  // 实际使用时，请替换为完整的viz.js库
  
  window.Viz = function(dotSource, options) {
    options = options || {};
    var format = options.format || "svg";
    
    if (format !== "svg") {
      throw new Error("简化版viz.js只支持SVG格式输出");
    }
    
    try {
      return generateSimpleSVG(dotSource);
    } catch (e) {
      console.error("DOT解析错误:", e);
      throw e;
    }
  };
  
  // 生成简单的SVG
  function generateSimpleSVG(dotSource) {
    // 解析DOT源代码
    var graph = parseSimpleDOT(dotSource);
    
    // 计算节点位置（非常简化版本）
    var nodes = graph.nodes;
    var edges = graph.edges;
    
    // 计算每个节点的位置
    var nodePositions = calculateNodePositions(nodes, edges);
    
    // 生成SVG
    return generateSVGFromGraph(graph, nodePositions);
  }
  
  // 简化的DOT解析器
  function parseSimpleDOT(dotSource) {
    var graph = {
      type: "digraph",
      id: "G",
      nodes: [],
      edges: []
    };
    
    // 查找图表类型和ID
    var matchGraph = dotSource.match(/\s*(di|sub)?graph\s+([A-Za-z0-9_]*)\s*\{/);
    if (matchGraph) {
      graph.type = matchGraph[1] ? matchGraph[1] + "graph" : "graph";
      graph.id = matchGraph[2] || "G";
    }
    
    // 解析节点和边
    var lines = dotSource.split('\n');
    var nodeSet = new Set();
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      
      // 跳过注释和空行
      if (line.startsWith('//') || line === '' || line.startsWith('#')) continue;
      
      // 解析边
      var edgePattern = graph.type === "digraph" ? 
        /\s*(.+?)\s*->\s*(.+?)\s*(?:\[(.*?)\])?\s*;/ : 
        /\s*(.+?)\s*--\s*(.+?)\s*(?:\[(.*?)\])?\s*;/;
      
      var edgeMatch = line.match(edgePattern);
      if (edgeMatch) {
        var sourceId = edgeMatch[1].trim();
        var targetId = edgeMatch[2].trim();
        var attrs = edgeMatch[3] ? parseAttributes(edgeMatch[3]) : {};
        
        // 确保节点存在
        if (!nodeSet.has(sourceId)) {
          graph.nodes.push({ id: sourceId, attrs: {} });
          nodeSet.add(sourceId);
        }
        
        if (!nodeSet.has(targetId)) {
          graph.nodes.push({ id: targetId, attrs: {} });
          nodeSet.add(targetId);
        }
        
        graph.edges.push({
          source: sourceId,
          target: targetId,
          attrs: attrs
        });
        
        continue;
      }
      
      // 解析节点
      var nodeMatch = line.match(/\s*(.+?)\s*\[(.*?)\]\s*;/);
      if (nodeMatch) {
        var nodeId = nodeMatch[1].trim();
        var nodeAttrs = parseAttributes(nodeMatch[2]);
        
        if (!nodeSet.has(nodeId)) {
          graph.nodes.push({ id: nodeId, attrs: nodeAttrs });
          nodeSet.add(nodeId);
        } else {
          // 更新已有节点的属性
          for (var j = 0; j < graph.nodes.length; j++) {
            if (graph.nodes[j].id === nodeId) {
              graph.nodes[j].attrs = Object.assign({}, graph.nodes[j].attrs, nodeAttrs);
              break;
            }
          }
        }
      }
    }
    
    return graph;
  }
  
  // 解析属性字符串
  function parseAttributes(attrString) {
    var attrs = {};
    var parts = attrString.split(',');
    
    for (var i = 0; i < parts.length; i++) {
      var keyValue = parts[i].split('=');
      if (keyValue.length === 2) {
        var key = keyValue[0].trim();
        var value = keyValue[1].trim();
        
        // 去掉引号
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        
        attrs[key] = value;
      }
    }
    
    return attrs;
  }
  
  // 计算节点位置（简化版，实际上需要更复杂的算法）
  function calculateNodePositions(nodes, edges) {
    var positions = {};
    var radius = 200;
    var centerX = 300;
    var centerY = 200;
    
    // 为简化起见，我们将节点放置在一个圆上
    for (var i = 0; i < nodes.length; i++) {
      var angle = (2 * Math.PI * i) / nodes.length;
      positions[nodes[i].id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    }
    
    return positions;
  }
  
  // 从图和节点位置生成SVG
  function generateSVGFromGraph(graph, nodePositions) {
    var width = 600;
    var height = 400;
    var nodeRadius = 20;
    
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">';
    
    // 添加一个背景矩形
    svg += '<rect width="100%" height="100%" fill="white"/>';
    
    // 绘制边
    for (var i = 0; i < graph.edges.length; i++) {
      var edge = graph.edges[i];
      var source = nodePositions[edge.source];
      var target = nodePositions[edge.target];
      
      if (!source || !target) continue;
      
      // 计算边的路径
      var dx = target.x - source.x;
      var dy = target.y - source.y;
      var length = Math.sqrt(dx * dx + dy * dy);
      
      // 调整端点，使其位于节点边界上
      var sourceX = source.x + (dx * nodeRadius) / length;
      var sourceY = source.y + (dy * nodeRadius) / length;
      var targetX = target.x - (dx * nodeRadius) / length;
      var targetY = target.y - (dy * nodeRadius) / length;
      
      // 绘制边
      svg += '<g class="edge">';
      svg += '<path d="M' + sourceX + ',' + sourceY + ' L' + targetX + ',' + targetY + '" stroke="black" stroke-width="1.5"/>';
      
      // 如果是有向图，添加箭头
      if (graph.type === "digraph") {
        var arrowSize = 6;
        var angle = Math.atan2(dy, dx);
        
        // 计算箭头的点
        var arrowX1 = targetX - arrowSize * Math.cos(angle - Math.PI/6);
        var arrowY1 = targetY - arrowSize * Math.sin(angle - Math.PI/6);
        var arrowX2 = targetX - arrowSize * Math.cos(angle + Math.PI/6);
        var arrowY2 = targetY - arrowSize * Math.sin(angle + Math.PI/6);
        
        svg += '<polygon points="' + targetX + ',' + targetY + ' ' + arrowX1 + ',' + arrowY1 + ' ' + arrowX2 + ',' + arrowY2 + '" fill="black"/>';
      }
      
      // 如果边有标签，添加标签
      if (edge.attrs.label) {
        var labelX = (sourceX + targetX) / 2;
        var labelY = (sourceY + targetY) / 2 - 5;
        svg += '<text x="' + labelX + '" y="' + labelY + '" text-anchor="middle" font-size="12">' + edge.attrs.label + '</text>';
      }
      
      svg += '</g>';
    }
    
    // 绘制节点
    for (var j = 0; j < graph.nodes.length; j++) {
      var node = graph.nodes[j];
      var pos = nodePositions[node.id];
      
      if (!pos) continue;
      
      var shape = node.attrs.shape || "ellipse";
      var fillColor = node.attrs.fillcolor || node.attrs.color || "#e3f2fd";
      var strokeColor = node.attrs.color || "#2196f3";
      var label = node.attrs.label || node.id;
      
      svg += '<g class="node">';
      
      // 绘制节点形状
      if (shape === "box" || shape === "rect" || shape === "rectangle") {
        svg += '<rect x="' + (pos.x - nodeRadius) + '" y="' + (pos.y - nodeRadius) + '" width="' + (nodeRadius * 2) + '" height="' + (nodeRadius * 2) + '" rx="3" ry="3" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="1.5"/>';
      } else if (shape === "diamond") {
        var diamondSize = nodeRadius * 1.4;
        svg += '<polygon points="' + pos.x + ',' + (pos.y - diamondSize) + ' ' + (pos.x + diamondSize) + ',' + pos.y + ' ' + pos.x + ',' + (pos.y + diamondSize) + ' ' + (pos.x - diamondSize) + ',' + pos.y + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="1.5"/>';
      } else {
        // 默认为椭圆
        svg += '<ellipse cx="' + pos.x + '" cy="' + pos.y + '" rx="' + nodeRadius + '" ry="' + nodeRadius + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="1.5"/>';
      }
      
      // 添加节点标签
      svg += '<text x="' + pos.x + '" y="' + (pos.y + 5) + '" text-anchor="middle" font-size="12">' + label + '</text>';
      
      svg += '</g>';
    }
    
    svg += '</svg>';
    return svg;
  }
})(); 