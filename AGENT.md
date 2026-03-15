# Image Annotator MCP Server

An MCP (Model Context Protocol) server for annotating screenshots with professional markers, arrows, callouts, and more. Works seamlessly with Playwright MCP for documentation workflows.

## Project Structure

```
image-annotator-mcp/
├── server.js          # Main MCP server entry point
├── annotate.js        # Annotation engine and CLI tool
├── package.json       # Node.js dependencies
├── README.md          # Documentation
└── LICENSE            # MIT License
```

## Tech Stack

- **Runtime**: Node.js >= 18.0.0
- **Dependencies**:
  - `@modelcontextprotocol/sdk` - MCP protocol implementation
  - `sharp` - High-performance image processing

## Key Files

### `server.js`
- MCP server implementation
- Exposes 7 tools via stdio transport (including `open_config_ui`)
- Handles request validation and response formatting

### `annotate.js`
- Core annotation engine using Sharp
- Supports 11 annotation types: marker, arrow, curved-arrow, callout, rect, circle, label, highlight, blur, connector, icon
- Built-in themes: documentation, tutorial, bugReport, highlight

## MCP Tools

| Tool | Description |
|------|-------------|
| `annotate_screenshot` | Add multiple annotations to a screenshot |
| `get_image_dimensions` | Get width, height, and format of an image |
| `create_step_guide` | Create numbered step-by-step guides |
| `highlight_area` | Quickly highlight a specific area |
| `add_callout` | Add speech bubble callouts |
| `blur_area` | Blur rectangular areas |
| `open_config_ui` | Open the annotation config UI in the browser. **Call with no arguments** to open; optionally pass `working_directory` (absolute path of the project/workspace where config should be saved) so `.image-annotator.json` is written there and used by `annotate_screenshot` for that project. |

## Running the Project

### Development
```bash
npm install
node server.js
```

### CLI Usage
```bash
# Annotate an image
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'

# Get image dimensions
node annotate.js --dimensions input.png
```

### Integration with Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "node",
      "args": ["/path/to/image-annotator/server.js"]
    }
  }
}
```

## Annotation Reference

### Annotation Types
- `marker` - Numbered circles (1, 2, 3...) with gradient and shadow
- `arrow` - Straight arrows with customizable heads
- `curved-arrow` - Smooth curved arrows
- `callout` - Text boxes with pointers (speech bubbles)
- `rect` - Rectangle highlights
- `circle` - Circle highlights
- `label` - Text labels with optional backgrounds
- `highlight` - Semi-transparent overlays
- `blur` - Blur sensitive content
- `connector` - Dashed lines between elements
- `icon` - Icon badges (check, x, warning, info, question)

### Available Colors
red, orange, yellow, green, blue, purple, pink, cyan, teal, white, black, gray, lightGray, darkGray, success, warning, error, info, primary, secondary, accent

### Themes
documentation, tutorial, bugReport, highlight

## Quick Reference for Agents

- **Open config UI**: Call `open_config_ui` with no arguments to open the browser config UI. To save config into the user's project, call `open_config_ui` with `working_directory` set to the workspace root (e.g. the project path where the user is working). No need to look up MCP server names or tool schemas elsewhere; the tool is on this server.

## Common Tasks

### Adding a New Annotation Type
1. Add type handling in `annotate.js` - look for the `drawAnnotation` function
2. Add type validation in `server.js` tool schema
3. Test with CLI before testing MCP tools

### Modifying Themes
Edit theme definitions in `annotate.js` - look for `THEMES` object

### Debugging
Use CLI to test annotations before testing via MCP:
```bash
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'
```

## Code Style

- Use ES6+ JavaScript (async/await)
- Follow existing patterns in `server.js` and `annotate.js`
- Add JSDoc comments for public functions
- Use meaningful variable names

## Coordinate System

Coordinates are in image pixels. When using with Playwright:
1. Get bounding boxes via `browser_evaluate` with `getBoundingClientRect()`
2. Multiply coordinates by 2 for Retina/2x screenshots
3. Use `get_image_dimensions` to validate coordinates don't exceed image bounds

## 文档检索（weknora MCP）

使用 weknora MCP 检索项目文档：

- **知识库 ID**: `f6dd9088-2e05-4dcb-b53e-7eb43d3dda4c`
- **检索**: `hybrid_search` 工具
- **新增文档**: `create_knowledge_from_url` 工具
- **映射文件**: `scripts/weknora-sync-map.json`

自动同步：Git commit 后自动将修改的 `.md` 文件同步到知识库（删除旧记录 → 重新添加）。
