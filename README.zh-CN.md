# 图片标注 MCP 服务器

专业的 MCP（模型上下文协议）服务器，用于为截图添加标记、箭头、标注等标注。支持与 Playwright MCP 无缝集成，适用于文档工作流。

![标注示例](examples/annotated.png?v=2)

## 功能特性

- **多种标注类型**：标记、箭头、标注框、矩形、圆形、标签、高亮、模糊、连接线和图标
- **专业样式**：渐变标记带阴影、可自定义颜色和主题
- **主题支持**：文档、教程、错误报告、高亮等预设主题
- **6 个 MCP 工具**：不同工具适用于不同使用场景

## 安装

### 方式一：使用 npx（推荐，无需安装）

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "npx",
      "args": ["-y", "image-annotator-mcp"]
    }
  }
}
```

### 方式二：全局安装

```bash
npm install -g image-annotator-mcp
```

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "image-annotator"
    }
  }
}
```

### 方式三：本地开发（不推荐用于生产）

```bash
cd image-annotator-mcp
npm install
```

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "node",
      "args": ["${process.cwd()}/server.js"]
    }
  }
}

> 注意：Windows 上请使用正斜杠或环境变量 `%CD%`。

## MCP 工具

### `annotate_screenshot`
为截图添加多个标注。

**标注类型：**
- `marker` - 带渐变和阴影的数字圆形标记（1, 2, 3...）
- `arrow` - 可自定义箭头的直线箭头
- `curved-arrow` - 平滑曲线箭头
- `callout` - 带指针的文字框（气泡标注）
- `rect` - 矩形高亮
- `circle` - 圆形高亮
- `label` - 带可选背景的文字标签
- `highlight` - 半透明覆盖层
- `blur` - 模糊敏感内容
- `connector` - 元素间的虚线连接
- `icon` - 图标徽章（√、×、警告、信息、问号）

**主题：** documentation、tutorial、bugReport、highlight

**颜色：** red、orange、yellow、green、blue、purple、pink、cyan、teal、white、black、gray、lightGray、darkGray、success、warning、error、info、primary、secondary、accent

### `get_image_dimensions`
获取图片的宽度、高度和格式。计算标注坐标的必备工具。

### `create_step_guide`
在截图上创建带数字的逐步指南。自动放置带标签的数字标记和连接箭头。

### `highlight_area`
快速高亮显示指定区域（圆形、矩形、高亮），可选添加标签。

### `add_callout`
添加指向特定位置的气泡标注。

### `blur_area`
模糊矩形区域以隐藏敏感信息。

## 使用示例

```json
{
  "input_path": "D:\\screenshots\\screenshot.png",
  "annotations": [
    {"type": "marker", "x": 100, "y": 100, "number": 1, "color": "primary", "size": 28},
    {"type": "arrow", "from": [130, 100], "to": [200, 150], "color": "red", "strokeWidth": 3},
    {"type": "label", "x": 210, "y": 155, "text": "点击这里！", "background": "white", "shadow": true},
    {"type": "callout", "x": 300, "y": 200, "text": "重要！", "pointer": "left", "color": "orange"},
    {"type": "rect", "x": 50, "y": 250, "width": 200, "height": 100, "color": "green", "style": "dashed"},
    {"type": "icon", "x": 400, "y": 100, "icon": "check", "color": "success"}
  ]
}
```

## 与 Playwright MCP 配合使用

要获得准确的标注位置，请使用 Playwright 获取真实元素坐标：

### 步骤 1：导航和截图
```
browser_navigate → browser_take_screenshot
```

### 步骤 2：获取元素位置
使用 `browser_evaluate` 获取边界框：
```javascript
() => {
  const el = document.querySelector('[role="tab"]');
  const rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
```

### 步骤 3：Retina（2倍）缩放
如果截图是 2 倍缩放，请将坐标乘以 2。

### 步骤 4：使用真实位置标注
```json
{
  "input_path": "D:\\screenshots\\screenshot.png",
  "annotations": [
    {"type": "marker", "x": 1010, "y": 630, "number": 1, "color": "primary"},
    {"type": "callout", "x": 1010, "y": 500, "text": "点击这里", "pointer": "bottom"}
  ]
}
```

### 步骤 5：上传
将标注后的图片上传到 Basecamp：`basecamp_comment_with_file`

## 命令行使用

```bash
# 标注图片
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'

# 获取图片尺寸
node annotate.js --dimensions input.png
```

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 作者

Varun Dubey <varun@wbcomdesigns.com>
