# Image Annotator MCP Server

Professional MCP server for annotating screenshots with markers, arrows, callouts, and more. Works seamlessly with Playwright MCP for documentation workflows.

![Example Annotation](examples/annotated.png?v=2)

## Features

- **Hybrid Distribution**: Available as an MCP server, a standalone CLI tool, and a portable Skills package for coding agents
- **Multiple Annotation Types**: Markers, arrows, callouts, rectangles, circles, labels, highlights, blur, connectors, and icons
- **Professional Styling**: Gradient markers with shadows, customizable colors and themes
- **Theme Support**: Pre-built themes for documentation, tutorials, bug reports, and highlights
- **5 MCP Tools**: Annotation, dimensions, step guides, reannotation help, and config UI

## Installation

### Option 1: Using npx (Recommended)

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

### Option 2: Global Install

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

### Option 3: Local Development

```bash
cd image-annotator
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

> Note: For Windows, use forward slashes in path or use environment variable `%CD%` in args.

### Option 4: Skills Package (for coding agents)

Copy `skills/image-annotator/` to your agent's skills directory. See `skills/image-annotator/references/portability.md` for details.

## Hybrid Distribution

This project is distributed in three complementary formats:

- **MCP Server**: Standard Model Context Protocol implementation for Claude Desktop and other MCP-enabled clients.
- **CLI Tool**: Direct command-line access for automation scripts, CI/CD pipelines, and manual use.
- **Skills Package**: A portable guidance and reference package designed for coding agents to understand and use the toolset in any environment.

## MCP Tools

### `annotate_screenshot`
Add multiple annotations to a screenshot image.

Supports raster output (`png`, `jpeg`, `webp`, `avif`) plus annotation-layer `svg` output. Also supports `redact_patterns` for regex-based redaction of annotation text (labels/callouts only; no OCR).

**Annotation Types:**
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

**Themes:** `documentation`, `tutorial`, `bugReport`, `highlight`

**Colors:** red, orange, yellow, green, blue, purple, pink, cyan, teal, white, black, gray, lightGray, darkGray, success, warning, error, info, primary, secondary, accent

### `get_image_dimensions`
Get width, height, and format of an image. Essential for calculating annotation coordinates.

### `create_step_guide`
Create a numbered step-by-step guide on a screenshot. Automatically places numbered markers with labels and connecting arrows.

### `reannotate_screenshot`
Proportionally remap an existing annotation set onto a new screenshot size. This is a helper for resized screenshots, not visual matching.

### `open_config_ui`
Open browser-based configuration UI to customize annotation presets. Pass `working_directory` to save `.image-annotator.json` into a specific project; otherwise it defaults to the MCP server directory.

## Size Presets

The tool automatically adjusts annotation sizes based on image width:

| Preset | Image Width | Marker Size | Stroke Width | Font Size |
|--------|-------------|-------------|--------------|------------|
| xs     | < 400px    | 20px        | 3px          | 12px       |
| s      | 400-800px  | 24px        | 4px          | 14px       |
| m      | 800-1200px | 32px        | 5px          | 18px       |
| l      | 1200-1920px| 40px        | 6px          | 22px       |
| xl     | > 1920px   | 48px        | 8px          | 28px       |

By default, the appropriate preset is automatically selected based on image width. You can also manually specify a preset in the config file.

## Configuration File

Create a `.image-annotator.json` file in your project directory to customize default settings:

```json
{
  "version": "1.0",
  "sizePreset": "auto",
  "theme": "documentation"
}
```

**Config Discovery:** The tool searches for config in this order:
1. Current working directory
2. Parent directories (up to 3 levels)
3. User home directory
4. Default values

## Configuration UI

Use the `open_config_ui` tool to open a visual configuration interface in your browser:

- Select size presets
- Choose themes with professional fonts
- Customize colors and sizes
- Live preview

The config file is saved to the `working_directory` you pass to `open_config_ui`. If omitted, it defaults to the MCP server directory.

## Professional Fonts

Each theme comes with a professionally matched font:

| Theme       | Font Family                    | Use Case            |
|-------------|--------------------------------|---------------------|
| documentation| Inter                        | Technical docs      |
| tutorial   | Nunito                         | Tutorials           |
| bugReport  | JetBrains Mono                 | Bug reports         |
| highlight  | Noto Sans                      | Multi-language      |

## Usage Example

```json
{
  "input_path": "/path/to/screenshot.png",
  "annotations": [
    {"type": "marker", "x": 100, "y": 100, "number": 1, "color": "primary", "size": 28},
    {"type": "arrow", "from": [130, 100], "to": [200, 150], "color": "red", "strokeWidth": 3},
    {"type": "label", "x": 210, "y": 155, "text": "Click here!", "background": "white", "shadow": true},
    {"type": "callout", "x": 300, "y": 200, "text": "Important!", "pointer": "left", "color": "orange"},
    {"type": "rect", "x": 50, "y": 250, "width": 200, "height": 100, "color": "green", "style": "dashed"},
    {"type": "icon", "x": 400, "y": 100, "icon": "check", "color": "success"}
  ]
}
```

## Workflow with Playwright MCP

For accurate annotation positioning, use Playwright to get real element coordinates:

### Step 1: Navigate and Screenshot
```
browser_navigate → browser_take_screenshot
```

### Step 2: Get Element Positions
Use `browser_evaluate` to get bounding boxes:
```javascript
() => {
  const el = document.querySelector('[role="tab"]');
  const rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
```

### Step 3: Scale for Retina (2x)
If screenshot is at 2x scale, multiply coordinates by 2.

### Step 4: Annotate with Real Positions
```json
{
  "input_path": "/path/to/screenshot.png",
  "annotations": [
    {"type": "marker", "x": 1010, "y": 630, "number": 1, "color": "primary"},
    {"type": "callout", "x": 1010, "y": 500, "text": "Click here", "pointer": "bottom"}
  ]
}
```

### Step 5: Upload
Upload annotated image to Basecamp: `basecamp_comment_with_file`

## CLI Usage

The CLI supports several modes for different annotation tasks.

### Annotate Image
Add multiple annotations to an image.
```bash
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'
```

**Advanced Options:**
```bash
node annotate.js input.png output.webp \
  --annotations '[...]' \
  --output-format webp \
  --quality 80 \
  --device-pixel-ratio 2 \
  --theme documentation
```

### Get Dimensions
Get width, height, and format of an image.
```bash
node annotate.js dimensions input.png
```

### Reannotate
Proportionally remap annotations onto a new screenshot size.
```bash
node annotate.js reannotate \
  --new-screenshot new.png \
  --previous-annotations '[...]' \
  --previous-width 1280 \
  --previous-height 720
```

### Step Guide
Create a numbered step-by-step guide.
```bash
node annotate.js step-guide input.png output.png \
  --steps '[{"x":100,"y":200,"label":"Click here"}]'
```

### Configuration UI
Launch the browser-based configuration interface.
```bash
# Standalone launch
node config-ui/launch.js --working-directory /path/to/project

# Via npm script
npm run config-ui
```

## License

MIT License - see [LICENSE](LICENSE) file.

## Author

Varun Dubey <varun@wbcomdesigns.com>
