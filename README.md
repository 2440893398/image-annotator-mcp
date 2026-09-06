# Image Annotator MCP Server

Professional MCP server for annotating screenshots with markers, arrows, callouts, and more. Works seamlessly with Playwright MCP for documentation workflows.

![Example Annotation](examples/annotated.png?v=2)

## Features

- **Hybrid Distribution**: Available as an MCP server, a standalone CLI tool, and a portable Skills package for coding agents
- **Multiple Annotation Types**: Markers, arrows, callouts, rectangles, circles, labels, highlights, redaction, connectors, and icons
- **Professional Styling**: Compact numbered markers with white casing rings, customizable colors and themes
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

Supports raster output (`png`, `jpeg`, `webp`, `avif`) plus annotation-layer `svg` output. Also supports `redact_patterns` for regex-based redaction of annotation text (covers the matched annotation's own text box with a solid rectangle — not the underlying screenshot content; no OCR; not available with `svg` output).

**Annotation Types:**
- `marker` - Small numbered discs with a white casing ring; `number` may be omitted and auto-increments in array order. Pass the element's box as `target: [x, y, width, height]` to place the marker *beside* the control rather than on top of it
- `arrow` - Straight or elbow arrows (`lineStyle`), heads on either or both ends (`heads`)
- `curved-arrow` - Smooth curved arrows
- `callout` - Text boxes with pointers (speech bubbles); text wraps automatically when `width`/`maxWidth` is set
- `rect` - Rectangle highlights
- `circle` - Circle highlights
- `ellipse` - Ellipse outline (`rx`/`ry` around a center) for wide or flat UI regions
- `polyline` / `polygon` - Open or closed multi-point shapes (`points: [[x,y],...]`)
- `freehand` - Freehand stroke through a points array
- `label` - Text labels with optional backgrounds (`maxWidth` wraps)
- `highlight` - Semi-transparent overlays
- `redact` - Cover a region (see [Redaction](#redaction) below)
- `blur` - Deprecated alias for `redact` with `mode: "blur"` (reversible de-emphasis, not privacy protection)
- `connector` - Dashed lines between elements
- `icon` - Icon badges (check, x, warning, info, question, lock, star, cursor, thumbs-up, thumbs-down, plus, minus, eye) or any emoji character
- `measure` - Dimension lines with tick marks; omit `text` to auto-show the measured distance
- `leadout` - Leader-line callout with elbow routing and a label chip
- `bracket-label` - Square or curly bracket (`bracketStyle`) grouping an area with a label
- `spotlight` - Dark overlay with a cutout to focus attention
- `magnifier` - Circular zoomed-in patch of the target area

**Top-level options:** `crop` (annotate a region using original-image coordinates), `background` (CleanShot-style export card: padding + rounded corners + shadow on a color/gradient canvas), `auto_layout` (opt-in overlap avoidance for leadout/callout/marker), `active` (dim every marker but the current step), `canvas_padding`, `device_pixel_ratio`, `sketch`, `redact_patterns`.

### Numbering a dense page

Dropping numbered markers on a busy screen covers the very controls they point at. Three things help, and they compose:

```json
[
  {"type": "marker", "target": [262, 96, 210, 30]},
  {"type": "marker", "target": [486, 96, 96, 30]},
  {"type": "marker", "target": [236, 190, 18, 18]}
]
```

- **`target: [x, y, width, height]`** — the element's bounding box (a Playwright `boundingBox()` drops straight in). The marker places itself *outside* that box with a hairline leader back to it, so an 18px checkbox stays visible. `width`/`height` are optional.
- **`attach`** — which side: `left`, `right`, `top`, `bottom`, `auto` (default when `target` is set; prefers a left-hand rail and flips right near the canvas edge), or `none` to centre on the target the old way.
- **`auto_layout: true`** — markers now take part in overlap resolution: one with a `target` tries the other sides of it, one with only `x`/`y` steps out along the compass.
- **`active: 5`** — every marker except number 5 drops to a neutral slate, so a screenshot carrying a whole sequence still has one place for the eye to land.
- **`style: "ghost"`** — a tinted disc with an accent ring and numeral, for a quieter series. Needs a light background to stay readable.

**Themes:** `documentation`, `tutorial`, `bugReport`, `highlight`, `sketch`

**Colors:** red, orange, yellow, green, blue, purple, pink, cyan, teal, white, black, gray, lightGray, darkGray, success, warning, error, info, primary, secondary, accent

### Redaction

```json
{"type": "redact", "x": 100, "y": 100, "width": 200, "height": 24, "label": "REDACTED"}
```

Three modes with very different guarantees:

| Mode | Reversible? | Drawn | Use for |
|------|-------------|-------|---------|
| `solid` (default) | **No** — the region becomes pure fill colour in the flattened output | Above every other annotation | Sensitive content |

The default fill is `#64748B` (slate): softer than a black censor bar, but far enough from both white page backgrounds and dark app chrome to read as deliberate. Any `color` works — every solid fill is equally irreversible.
| `pixelate` | **Yes** — block averages survive and can be attacked (Depix-style) | On the base image, below annotations | Visual de-emphasis only |
| `blur` | **Yes** — Gaussian blur is an invertible convolution | On the base image, below annotations | Visual de-emphasis only |

Rules that follow from this:

- **Only `solid` redacts.** `pixelate`/`blur` produce a warning on every use; never rely on them to hide secrets. There is no blur strength that becomes safe.
- **Layering differs by design**: `solid` covers anything under it (including other annotations); `pixelate`/`blur` alter the base image and annotations still draw on top.
- **`svg` output cannot redact** — it is an annotation layer without image pixels. Hand-placed redact regions produce a warning; `redact_patterns` matches are rejected with an error (the matched text would sit verbatim in the file). Use `png`/`jpeg`/`webp`.
- **Magnifiers sample redacted pixels**: a `magnifier` aimed at a redacted region shows the fill colour, not the original content.
- `redact_patterns` boxes cover the **annotation's own text box** (with a safety margin), not text inside the screenshot — the tool performs no OCR. Visually verify redacted output before sharing.

Examples (regenerate with `node examples/generate-redaction-example.js`):

![Redaction modes](examples/redaction-modes.png)

*The same line under all three modes. Only `solid` destroys the content; `pixelate` and `blur` leave word shapes intact.*

![Redaction on a real screenshot](examples/redaction.png)

*The magnifier is aimed straight at a redacted region and samples the redacted pixels, so it cannot be used to reveal what was covered.*

> ⚠️ **Trust note for existing images**: before v1.1.0 the `blur` type drew a translucent grey wash that left content readable and recoverable. Any screenshot "redacted" with an earlier version should be regenerated. See [CHANGELOG.md](CHANGELOG.md).

### `get_image_dimensions`
Get width, height, and format of an image. Essential for calculating annotation coordinates.

### `create_step_guide`
Create a numbered step-by-step guide on a screenshot. Automatically places numbered markers with labels and connecting arrows.

### `reannotate_screenshot`
Proportionally remap an existing annotation set onto a new screenshot size. This is a helper for resized screenshots, not visual matching.

### `open_config_ui`
Open browser-based configuration UI to customize annotation presets. Pass `working_directory` to save `.image-annotator.json` into a specific project; otherwise it defaults to the MCP server directory.

## Size Presets

The tool automatically adjusts annotation sizes based on image width. **Marker size is a radius**, so the drawn disc is twice the listed number:

| Preset | Image Width | Marker Radius | Disc Diameter | Stroke Width | Font Size |
|--------|-------------|---------------|---------------|--------------|------------|
| xs     | < 400px    | 10px          | 20px          | 3px          | 12px       |
| s      | 400-800px  | 12px          | 24px          | 4px          | 14px       |
| m      | 800-1200px | 14px          | 28px          | 5px          | 18px       |
| l      | 1200-1920px| 16px          | 32px          | 6px          | 22px       |
| xl     | > 1920px   | 20px          | 40px          | 8px          | 28px       |

By default, the appropriate preset is automatically selected based on image width. You can also manually specify a preset in the config file.

> If your annotations come out at a size these rows do not explain, a `.image-annotator.json` above the image is probably setting `defaultSizes` — see [Configuration File](#configuration-file). That file wins over every preset here.

## Configuration File

Create a `.image-annotator.json` file in your project directory to customize default settings:

```json
{
  "version": "1.0",
  "sizePreset": "auto",
  "theme": "documentation"
}
```

**Config discovery.** The search starts at the **directory of the input image**, not the process working directory, and stops at the first file it finds:

1. The input image's own directory
2. Its parent directories, up to 5 levels
3. `~/.image-annotator.json`
4. Built-in defaults

Only one file is used — configs found at different levels do not merge with each other.

**`defaultSizes` overrides the size presets.** This is the setting most likely to surprise you: a config anywhere above your screenshot can pin annotation sizes for every image under it, whatever the [size preset](#size-presets) would have chosen.

```json
{ "defaultSizes": { "markerSize": 44, "strokeWidth": 1, "fontSize": 20 } }
```

That `markerSize: 44` is a radius, so every marker becomes an 88px disc — more than double the largest preset. Precedence, strongest first:

1. An annotation's own `size` / `strokeWidth` / `fontSize`
2. `defaultSizes` from the config file (merged over the preset, so a partial object only overrides the keys it lists)
3. The size preset chosen by `sizePreset`, or by image width when it is `"auto"`

To opt out for one run without touching the file, pass an explicit config through the library API:

```js
await annotateImage(input, output, annotations, {
  config: { sizePreset: 'auto', theme: null, themes: null, defaultSizes: null }
});
```

> This repository ships its own `.image-annotator.json` at the root with `defaultSizes.markerSize: 44` and `theme: "tutorial"`. Anything you annotate from inside the repo picks it up, so the examples here will not match the documented defaults unless you override it.

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
