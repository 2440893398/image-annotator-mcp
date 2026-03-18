# Image Annotator Workflow Recipes

This guide provides complete, copyable workflow examples for the four core use cases of the Image Annotator MCP Server.

## Recipe 1: Annotate a Screenshot

Add professional markers, callouts, and arrows to your screenshots.

### Basic Marker Annotation
Add a single numbered marker to a specific coordinate.
```bash
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'
```

### Multi-Annotation Workflow
Combine multiple annotation types for a comprehensive guide.
```bash
node annotate.js input.png output.png --annotations '[
  {"type":"marker","x":100,"y":100,"number":1},
  {"type":"callout","x":200,"y":200,"content":"Click here to save","color":"blue"},
  {"type":"arrow","x":150,"y":150,"toX":100,"toY":100,"color":"red"}
]'
```

### Retina/2x Workflow
When working with high-DPI screenshots (e.g., macOS Retina), use the `--device-pixel-ratio` flag.
1. Get dimensions to verify scale:
   ```bash
   node annotate.js dimensions input.png
   ```
2. Annotate with 2x scaling:
   ```bash
   node annotate.js input.png output.webp --annotations '[...]' --output-format webp --quality 80 --device-pixel-ratio 2 --theme documentation
   ```

> **Note:** Use the CLI for batch processing and automation. Use the MCP `annotate_screenshot` tool when working interactively within Claude Desktop.

---

## Recipe 2: Create a Step-by-Step Guide

Generate numbered guides with labels automatically.

### Documentation Guide
Create a 2-step guide with the documentation theme.
```bash
node annotate.js step-guide input.png output.png --steps '[
  {"x":100,"y":200,"label":"Click Settings"},
  {"x":300,"y":400,"label":"Select Theme"}
]' --theme documentation
```

> **Note:** Use the CLI for batch guide generation; use the MCP `create_step_guide` tool for interactive workflows during a chat session.

---

## Recipe 3: Reannotate a Resized Screenshot

Proportionally remap annotations when the underlying screenshot size changes.

### Remapping Workflow
1. Get dimensions of the new (resized) screenshot:
   ```bash
   node annotate.js dimensions new.png
   ```
2. Remap previous annotations to the new size:
   ```bash
   node annotate.js reannotate --new-screenshot new.png --previous-annotations '[{"type":"marker","x":640,"y":360,"number":1}]' --previous-width 1280 --previous-height 720
   ```

> **Note:** This is a helper for proportional remapping based on canvas size, not visual feature matching.

---

## Recipe 4: Launch Config UI

Configure themes and defaults using the visual editor.

### Standalone CLI
Launch the UI and save configuration to your current project.
```bash
node config-ui/launch.js --working-directory D:/IdeaProjects/image-annotator-mcp
```

### MCP Workflow
In Claude Desktop, call the `open_config_ui` tool:
```json
{
  "working_directory": "D:/IdeaProjects/image-annotator-mcp"
}
```

> **Note:** Use the standalone launcher when no MCP client is available; use the MCP tool for seamless integration in Claude Desktop.
