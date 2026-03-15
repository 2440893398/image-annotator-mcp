# 响应式尺寸控制与专业字体系统设计

**版本**: 1.0  
**日期**: 2026-03-14  
**状态**: 已批准

---

## 1. 概述

本文档描述 Image Annotator MCP Server 的两项功能增强：

1. **响应式尺寸控制** - 根据图片尺寸自动调整标注元素大小
2. **专业字体系统** - 替换 Comic Sans 为专业字体，绑定主题并支持微调

---

## 2. 响应式尺寸控制

### 2.1 设计目标

- 标注元素（marker、arrow、label、callout）的大小应根据图片尺寸自动调整
- 提供 5 个预设档位：xs/s/m/l/xl
- 支持自动选择和手动指定

### 2.2 尺寸档位定义

| 档位 | 图片宽度范围 | marker size | strokeWidth | fontSize | 适用场景 |
|------|-------------|-------------|-------------|----------|----------|
| xs   | < 400px    | 20          | 3           | 12       | 小图/icon |
| s    | 400-800px  | 24          | 4           | 14       | 社交分享图 |
| m    | 800-1200px | 32          | 5           | 18       | 标准截图（当前默认值） |
| l    | 1200-1920px| 40          | 6           | 22       | 博客/文档 |
| xl   | > 1920px   | 48          | 8           | 28       | 大屏截图/幻灯片 |

### 2.3 自动选择逻辑

```javascript
function getSizePreset(imageWidth) {
  if (imageWidth < 400) return 'xs';
  if (imageWidth < 800) return 's';
  if (imageWidth < 1200) return 'm';
  if (imageWidth < 1920) return 'l';
  return 'xl';
}
```

### 2.4 API 变更

新增参数 `size`（可选）：

```javascript
// 用户可以显式指定档位
{
  "type": "marker",
  "x": 100,
  "y": 100,
  "number": 1,
  "size": "m"  // 覆盖自动计算
}
```

### 2.5 优先级

```
命令行/调用参数中的 size > 配置文件 > 自动计算
```

---

## 3. 专业字体系统

### 3.1 设计目标

- 移除 Comic Sans MS，使用专业字体
- 主题绑定配套字体
- 保留向后兼容性

### 3.2 主题字体绑定

| 主题 | 配套字体 | 字体栈 | 适用场景 |
|------|----------|--------|----------|
| documentation | Inter | Inter, -apple-system, BlinkMacSystemFont, sans-serif | 技术文档 |
| tutorial | Nunito | Nunito, Quicksand, sans-serif | 教程/新手引导 |
| bugReport | JetBrains Mono | JetBrains Mono, Fira Code, monospace | 错误说明 |
| highlight | Noto Sans | Noto Sans, Noto Sans CJK, sans-serif | 多语言支持 |

### 3.3 色彩心理学参考

| 主题 | Marker 颜色 | Arrow 颜色 | 心理含义 |
|------|------------|-----------|----------|
| documentation | #1976D2 (蓝) | #1976D2 | 信任、冷静 |
| tutorial | #43A047 (绿) | #43A047 | 成长、友好 |
| bugReport | #F44336 (红) | #F44336 | 紧急、错误 |
| highlight | #FF9800 (橙) | #FF9800 | 注意、重要 |

### 3.4 向后兼容性

- 保留 `handwriting: true/false` 参数（标记为 deprecated）
- 如果用户显式设置 `fontFamily`，则使用用户值
- 新增 `font` 参数供独立指定字体

```javascript
// 新增参数
{
  "type": "label",
  "text": "Step 1",
  "font": "Inter"  // 覆盖主题默认字体
}
```

---

## 4. 配置生成器 UI

### 4.1 设计思路

提供一个基于 Web 的可视化配置界面，用户可以：
1. 选择尺寸预设
2. 选择并微调主题
3. 实时预览效果
4. 导出配置文件

### 4.2 新增 MCP 工具

```javascript
{
  name: "open_config_ui",
  description: "Open browser-based configuration UI to customize annotation presets",
  inputSchema: {
    type: "object",
    properties: {
      port: { type: "number", description: "Port for config server (default: random)" },
      configPath: { type: "string", description: "Where to save the config file" }
    }
  }
}
```

### 4.3 配置界面布局

```
┌─────────────────────────────────────────────────────────┐
│  📷 Image Annotator 配置器                      [导出] │
├─────────────────────────────────────────────────────────┤
│  📏 尺寸预设                                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │ [ xs ] [ s ] [ *m ] [ l ] [ xl ]               │    │
│  │ 建议尺寸: m (基于图片宽度 800-1200px)          │    │
│  │ ☑️ 自动根据图片尺寸选择                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  🎨 主题 (点击选择或微调)                                 │
│  ┌──────────┬──────────┬──────────┬──────────┐        │
│  │📄文档    │📚教程    │🐛Bug报告  │💡高亮    │        │
│  │[选中]    │          │          │          │        │
│  └──────────┴──────────┴──────────┴──────────┘        │
│                                                          │
│  ⚙️ 微调选中主题                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Marker 颜色: [primary ▼]  大小: [32]           │    │
│  │ Arrow  颜色: [primary ▼]  线宽: [5]            │    │
│  │ Label  字体: [Inter    ▼]  大小: [20]          │    │
│  │ Callout 背景: [white   ▼]                      │    │
│  │ [ ⟲ 重置为默认值 ]                               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  👁️ 实时预览                                             │
│  ┌─────────────────────────────────────────────────┐    │
│  │     ┌────────────────────────────┐              │    │
│  │     │  🟢 1 ──────────▶  Step 1 │              │    │
│  │     │                            │              │    │
│  │     │     示例截图区域            │              │    │
│  │     │                            │              │    │
│  │     └────────────────────────────┘              │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 4.4 配置文件格式

```json
{
  "version": "1.0",
  "sizePreset": "auto",
  "themes": {
    "documentation": {
      "marker": { "color": "primary", "size": 32 },
      "arrow": { "color": "primary", "strokeWidth": 5 },
      "label": { "color": "primary", "fontSize": 20, "font": "Inter" },
      "callout": { "color": "primary", "background": "white", "font": "Inter" }
    },
    "tutorial": { ... },
    "bugReport": { ... },
    "highlight": { ... }
  },
  "defaults": {
    "shadow": true,
    "handwriting": false
  }
}
```

### 4.5 配置读取优先级

```
命令行参数 > 配置文件 > 硬编码默认值
```

---

## 5. 技术实现要点

### 5.1 字体加载

- 使用 Google Fonts CDN 作为回退
- 优先使用系统已安装字体
- SVG 中使用 `font-face` 引用

### 5.2 预览图片

- 使用占位图或用户提供图片
- 实时渲染 SVG 叠加层

### 5.3 本地服务器

- 使用 Express + 静态文件服务
- 临时启动，配置完成后自动关闭
- 支持自定义端口

---

## 6. 后续功能（Future）

- **裁剪/缩放工具** - 添加新的标注类型
- **MCP 配置端点** - 运行时调整默认值

---

## 7. 参考资料

- [MCP Best Practices](https://mcp-best-practice.github.io/mcp-best-practice/best-practice/)
- [Snagit Themes](https://www.techsmith.com/learn/tutorials/snagit/snagit-themes/)
- [Annotorious Styling Guide](https://annotorious.github.io/guides/customizing-styles)
- [Ghostty Config Generator](https://spectre-ghostty-config.vercel.app/)
