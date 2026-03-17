# 图片标注 MCP 服务器

专业的 MCP（模型上下文协议）服务器，用于为截图添加标记、箭头、标注等标注。支持与 Playwright MCP 无缝集成，适用于文档工作流。

![标注示例](examples/annotated.png?v=2)

## 功能特性

- **多种标注类型**：标记、箭头、标注框、矩形、圆形、标签、高亮、模糊、连接线和图标
- **专业样式**：渐变标记带阴影、可自定义颜色和主题
- **主题支持**：文档、教程、错误报告、高亮等预设主题
- **5 个 MCP 工具**：标注、尺寸获取、步骤指南、重新标注辅助和配置 UI
- **混合分发模式**：支持 MCP 服务器、命令行工具 (CLI) 和可移植 Skills 包

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

### 方式三：本地开发

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
```

> 注意：Windows 上请使用正斜杠或环境变量 `%CD%`。

### 方式四：Skills 包（适用于编程智能体）

将 `skills/image-annotator/` 复制到您的智能体 skills 目录。
详见 `skills/image-annotator/references/portability.md`。

## MCP 工具

### `annotate_screenshot`
为截图添加多个标注。

支持位图输出（`png`、`jpeg`、`webp`、`avif`）以及标注层 `svg` 输出。还支持 `redact_patterns`，用于通过正则表达式对标注文本（仅限标签/标注框）进行脱敏。

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
- `icon` - 图标徽章（check、x、warning、info、question）

**主题：** `documentation`、`tutorial`、`bugReport`、`highlight`

**颜色：** red, orange, yellow, green, blue, purple, pink, cyan, teal, white, black, gray, lightGray, darkGray, success, warning, error, info, primary, secondary, accent

### `get_image_dimensions`
获取图片的宽度、高度和格式。计算标注坐标的必备工具。

### `create_step_guide`
在截图上创建带数字的逐步指南。自动放置带标签的数字标记和连接箭头。

### `reannotate_screenshot`
按比例将现有的标注集重新映射到新的截图尺寸。这是针对缩放截图的辅助工具，而非视觉匹配。

### `open_config_ui`
打开基于浏览器的配置 UI 以自定义标注预设。传递 `working_directory` 以将 `.image-annotator.json` 保存到特定项目；否则默认为 MCP 服务器目录。

## 尺寸预设

工具会根据图片宽度自动调整标注尺寸：

| 预设 | 图片宽度 | 标记尺寸 | 线条宽度 | 字体大小 |
|------|----------|----------|----------|----------|
| xs   | < 400px  | 20px     | 3px      | 12px     |
| s    | 400-800px| 24px     | 4px      | 14px     |
| m    | 800-1200px| 32px    | 5px      | 18px     |
| l    | 1200-1920px| 40px   | 6px      | 22px     |
| xl   | > 1920px | 48px     | 8px      | 28px     |

默认情况下，系统会根据图片宽度自动选择合适的预设。您也可以在配置文件中手动指定预设。

## 配置文件

在项目目录中创建 `.image-annotator.json` 文件以自定义默认设置：

```json
{
  "version": "1.0",
  "sizePreset": "auto",
  "theme": "documentation"
}
```

**配置查找顺序：**
1. 当前工作目录
2. 父级目录（最多 3 层）
3. 用户主目录
4. 默认值

## 配置 UI

使用 `open_config_ui` 工具在浏览器中打开可视化配置界面：

- 选择尺寸预设
- 选择配有专业字体的方案
- 自定义颜色和尺寸
- 实时预览

配置文件将保存到您传递给 `open_config_ui` 的 `working_directory`。如果省略，则默认为 MCP 服务器目录。

## 专业字体

每个主题都配有专业匹配的字体：

| 主题 | 字体系列 | 使用场景 |
|------|----------|----------|
| documentation | Inter | 技术文档 |
| tutorial | Nunito | 教程 |
| bugReport | JetBrains Mono | 错误报告 |
| highlight | Noto Sans | 多语言支持 |

## 使用示例

```json
{
  "input_path": "/path/to/screenshot.png",
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
  "input_path": "/path/to/screenshot.png",
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
# 标注图片（位置参数模式）
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'

# 获取图片尺寸
node annotate.js dimensions input.png

# 重新映射标注（适用于缩放后的截图）
node annotate.js reannotate --new-screenshot new.png --previous-annotations '[...]' --previous-width 1280 --previous-height 720

# 创建步骤指南
node annotate.js step-guide input.png output.png --steps '[{"x":100,"y":200,"label":"点击这里"}]'

# 启动配置 UI
node config-ui/launch.js --working-directory /path/to/project
```

## 混合分发说明

- **MCP**：适用于 Claude Desktop 等 MCP 客户端，提供即插即用的工具集成。
- **CLI**：适用于编程智能体和自动化脚本，支持灵活的命令行调用。
- **Skills**：适用于任何智能体环境的可移植指导包，包含完整的提示词和上下文。

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 作者

Varun Dubey <varun@wbcomdesigns.com>
