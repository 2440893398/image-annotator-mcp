# Config UI Reference

## Overview
The Config UI lets you visually configure annotation presets (size, theme, colors) 
and saves them as `.image-annotator.json` in your project.

## Launching the Config UI

### Option 1: Standalone (for coding agents / CLI environments)
```bash
node config-ui/launch.js
# With working directory (recommended):
node config-ui/launch.js --working-directory /path/to/your/project
```
The server starts on http://localhost:3456. Open in your browser to configure.

### Option 2: MCP Tool (for Claude Desktop)
Use the `open_config_ui` tool:
```json
{ "working_directory": "/path/to/your/project" }
```

## The `working_directory` parameter

When you pass `--working-directory`, `.image-annotator.json` is saved into that directory.
Subsequent `annotate_screenshot` calls will use this config when the image path is under that directory.

If omitted, config defaults to the MCP server/script directory.

## Config Discovery Order

The search starts at the **directory of the input image**, not the process working
directory, and stops at the first file it finds:

1. The input image's own directory
2. Its parent directories, up to 5 levels
3. `~/.image-annotator.json`
4. Built-in defaults

Only one file is used; configs at different levels do not merge with each other.

## `defaultSizes` overrides the size presets

This is the setting that most often explains "my annotations came out the wrong
size". A config anywhere above the screenshot pins sizes for every image under
it, whatever the size preset would have chosen:

```json
{ "defaultSizes": { "markerSize": 44, "strokeWidth": 1, "fontSize": 20 } }
```

`markerSize` is a **radius**, so 44 draws an 88px disc — more than double the
largest preset (xl, radius 20). Precedence, strongest first:

1. An annotation's own `size` / `strokeWidth` / `fontSize`
2. `defaultSizes` from the config file (merged over the preset, so a partial
   object overrides only the keys it lists)
3. The preset named by `sizePreset`, or chosen by image width when it is `"auto"`

If annotations look wrong and nothing in the call explains it, check for a
config file above the image before changing the annotations. Note that this
repository ships its own `.image-annotator.json` at the root with
`defaultSizes.markerSize: 44` and `theme: "tutorial"`.

## When to use standalone vs MCP
- **Standalone**: Use when you don't have MCP available or want to launch independently
- **MCP**: Use when already working with Claude Desktop or another MCP-enabled client
- **Manual**: If no browser opens automatically, copy the URL and open it yourself

## See Also
- [guardrails.md](./guardrails.md) — path safety rules
