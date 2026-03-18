# Image Annotator Recipes

CLI is the default for coding agents. Use MCP tools when working in Claude Desktop or similar MCP-enabled environments.

## Recipe 1: Annotate a Screenshot
**When to use it**: Use this workflow to add professional markers and callouts to a screenshot for documentation or bug reports.

**CLI Workflow (Preferred for automation)**:
```bash
# Get image dimensions first
node annotate.js dimensions screenshot.png

# Add markers and callouts
node annotate.js screenshot.png annotated.png --annotations '[
  {"type":"marker","x":500,"y":300,"number":1,"color":"primary"},
  {"type":"callout","x":500,"y":200,"text":"Click here","pointer":"bottom","color":"orange"}
]' --theme documentation
```

**MCP Workflow**:
Call the `annotate_screenshot` tool with the same JSON structure for annotations.

**Expected Output**: A new file `annotated.png` with a numbered marker at (500, 300) and a callout pointing to it.

## Recipe 2: Create a Step-by-Step Guide
**When to use it**: Use this when you need to document a multi-step process on a single screenshot.

**CLI Workflow (Preferred for automation)**:
```bash
node annotate.js step-guide screenshot.png guide.png --steps '[
  {"x":100,"y":200,"label":"Open Settings"},
  {"x":300,"y":400,"label":"Click Security"},
  {"x":500,"y":600,"label":"Enable 2FA"}
]' --theme tutorial
```

**MCP Workflow**:
Call the `create_step_guide` tool with the steps array.

**Expected Output**: A `guide.png` file with numbered markers (1, 2, 3) and corresponding labels for each step.

## Recipe 3: Reannotate a Resized Screenshot
**When to use it**: Use this when you have annotations for one image size but need to apply them to a different size (e.g., after a browser resize).

**CLI Workflow (Preferred for automation)**:
```bash
# Old annotations were for 1280x720, new screenshot is different
node annotate.js reannotate --new-screenshot new-screenshot.png \
  --previous-annotations '[{"type":"marker","x":640,"y":360,"number":1}]' \
  --previous-width 1280 --previous-height 720
```

**MCP Workflow**:
Call the `reannotate_screenshot` tool with the previous dimensions and annotations.

**Expected Output**: The annotations are proportionally remapped to the new screenshot's dimensions.

## Recipe 4: Launch Config UI
**When to use it**: Use this to visually configure your annotation styles and save them to your project.

**CLI Workflow**:
```bash
# Standalone (saves config to your project)
node config-ui/launch.js --working-directory /path/to/project

# Via npm script
npm run config-ui
```

**MCP Workflow (Preferred for interactive sessions)**:
Call the `open_config_ui` tool. It will open the browser and optionally save the `.image-annotator.json` to your workspace.

**Expected Output**: A browser window opens with the configuration interface.

## Recipe 5: Playwright + Annotation Workflow
**When to use it**: Use this for automated documentation generation.

**Workflow**:
1. Use Playwright to navigate to a page and take a screenshot.
2. Get the bounding boxes of elements you want to highlight using `page.evaluate()`.
3. Pass those coordinates to the `annotate.js` CLI or `annotate_screenshot` MCP tool.

**CLI Example**:
```bash
# 1. Capture (via Playwright)
# 2. Annotate (via CLI)
node annotate.js playwright-capture.png final-doc.png --annotations '[
  {"type":"rect","x":100,"y":100,"width":200,"height":50,"color":"success"}
]'
```

**MCP Workflow**:
Combine `playwright` MCP tools with `image-annotator` MCP tools in a single session.
