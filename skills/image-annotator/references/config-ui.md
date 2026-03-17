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
1. Current working directory
2. Parent directories (up to 3 levels)
3. User home directory
4. Default values

## When to use standalone vs MCP
- **Standalone**: Use when you don't have MCP available or want to launch independently
- **MCP**: Use when already working with Claude Desktop or another MCP-enabled client
- **Manual**: If no browser opens automatically, copy the URL and open it yourself

## See Also
- [guardrails.md](./guardrails.md) — path safety rules
