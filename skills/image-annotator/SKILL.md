---
name: Image Annotator
description: Professional image annotation for screenshots, documentation, and bug reports.
version: 1.0.0
---

# Image Annotator Skill

## When to use
Use this skill when you need to add professional visual markers, arrows, callouts, or highlights to a screenshot or image. It's particularly useful for:
- Creating step-by-step documentation
- Highlighting specific UI elements in bug reports
- Blurring sensitive information in screenshots
- Adding explanatory callouts to complex diagrams

## Supported workflows
1. **Annotate a screenshot**: Add markers, arrows, callouts, rectangles, circles, labels, highlights, blur, connectors, and icons.
2. **Get image dimensions**: Retrieve width, height, and format to calculate precise annotation coordinates.
3. **Create step-by-step guides**: Automatically generate numbered markers with labels and connecting arrows.
4. **Reannotate resized screenshots**: Proportionally remap existing annotations to a new image size.
5. **Launch config UI**: Open a browser-based interface to customize annotation presets and themes.

## How to use

### CLI (default for coding agents)
Coding agents should prefer the CLI for direct file manipulation.
```bash
# Basic annotation
node annotate.js input.png output.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'
```
Note: Additional subcommands for dimensions, step-guides, and reannotation are being implemented.

### MCP (for Claude Desktop and similar)
Use MCP tools when working in environments that support the Model Context Protocol.
- `annotate_screenshot`: Main tool for adding annotations.
- `get_image_dimensions`: Get image metadata.
- `create_step_guide`: Generate step-by-step guides.
- `reannotate_screenshot`: Remap annotations for resized images.
- `open_config_ui`: Launch the configuration interface.

Prefer MCP tools when you need to interact with the server's state or when CLI access is restricted.

## Guardrails
- **No OCR**: The tool does not perform Optical Character Recognition. Redaction patterns only apply to text in labels/callouts you add.
- **Coordinate Validation**: Always check image dimensions before placing annotations to ensure they are within bounds.
- **File Paths**: Use absolute paths when possible to avoid ambiguity.
- **Sensitive Data**: Do not include secrets or private keys in annotation text.

## Installation & Portability
This skill is designed to be portable across different agent environments. See [portability.md](./references/portability.md) for details on how to install and use this skill in various setups.
