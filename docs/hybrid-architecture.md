# Hybrid Architecture

## Overview
Image Annotator uses a hybrid distribution model: MCP server + CLI + Skills package.
All three entry points share the same annotation engine in `annotate.js`.

## Architecture Boundaries

### Shared Engine (`annotate.js`)
- `annotateImage()` — core annotation rendering
- `getImageDimensions()` — image metadata
- `buildSvg()` — SVG generation
- Exported for use by both MCP server and CLI

### MCP Server (`server.js`)
- Exposes 5 tools via Model Context Protocol
- Handles request validation, error formatting, tool schemas
- Manages config UI child process lifecycle
- Used by: Claude Desktop, MCP-enabled clients

### CLI (`annotate.js` main function)
- Subcommands: annotate (default), dimensions, reannotate, step-guide
- Uses same `annotateImage()` and `getImageDimensions()` as MCP
- Used by: coding agents, automation scripts, CI/CD

### Config UI (`config-ui/`)
- Express-based web UI for visual configuration
- Standalone launcher: `config-ui/launch.js`
- MCP launcher: `open_config_ui` tool in `server.js`
- Writes only `.image-annotator.json` within working directory

### Skills Package (`skills/image-annotator/`)
- Portable markdown guidance for agent environments
- `SKILL.md` — activation metadata and process guidance
- `references/` — command docs, recipes, guardrails
- No runtime code — pure documentation

## Non-goals
- **Not removing MCP**: MCP remains the primary distribution for Claude Desktop users
- **Not adding remote services**: All processing is local, no cloud dependencies
- **Not forking the engine**: CLI and MCP must share `annotateImage()` — no separate code paths
- **Not vendor-locking Skills**: The `skills/` package works with any agent that reads markdown skills

## Portability
To use the Skills package in a specific agent environment:
1. Copy or symlink `skills/image-annotator/` to your agent's skills directory
2. Examples:
   - Claude Code: `.claude/skills/image-annotator/`
   - OpenCode: `.opencode/skills/image-annotator/`
   - Any agent: wherever it looks for skill markdown files
3. The `SKILL.md` file is the entry point the agent reads for activation

## Dependency Map
```
annotate.js (shared engine)
├── server.js (MCP wrapper)
│   └── config-ui/launch.js (config UI spawner)
├── annotate.js main() (CLI wrapper)
└── skills/ (documentation only)
```
