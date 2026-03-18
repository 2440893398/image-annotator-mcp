# Hybrid Architecture

## Overview
Image Annotator uses a hybrid distribution model: MCP server + CLI + Skills package.
Public entrypoints stay in the repository root for compatibility, while runtime code now lives under `src/`.

## Architecture Boundaries

### Shared Engine (`src/annotate/`)
- `index.js` — stable internal export surface for the annotation engine and CLI `main()`
- `render.js` — SVG generation, shapes, colors, themes, and size presets
- `runtime.js` — Sharp compositing, metadata, validation, redaction, accessibility, and geometry helpers
- `cli.js` — CLI argument parsing and subcommand routing used by the root `annotate.js` shim

### MCP Server (`server.js`)
- Root compatibility shim that forwards to `src/server/`
- Keeps `node server.js` and package `bin` usage unchanged
- Used by: Claude Desktop, MCP-enabled clients

### MCP Runtime (`src/server/`)
- `index.js` — stdio bootstrap and public exports
- `tools.js` — MCP tool schemas and metadata
- `handlers.js` — request handlers and reannotation helpers
- `config-ui.js` — config UI child-process lifecycle for `open_config_ui`

### CLI (`annotate.js` main function)
- Root compatibility shim that forwards to `src/annotate/cli.js`
- Subcommands: annotate (default), dimensions, reannotate, step-guide
- Uses the same engine exports as MCP
- Used by: coding agents, automation scripts, CI/CD

### Config UI (`config-ui/`)
- `config-ui/launch.js` remains the public launcher shim
- `src/config-ui/launch.js` and `src/config-ui/server.js` contain the runtime launcher/server logic
- `config-ui/public/` remains the static asset root used by the runtime server
- `src/preview/renderer.js` is served to the browser for preview rendering
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
server.js (root MCP shim)
└── src/server/
    ├── tools.js
    ├── handlers.js
    └── config-ui.js

annotate.js (root CLI/library shim)
└── src/annotate/
    ├── render.js
    ├── runtime.js
    └── cli.js

config-ui/launch.js (root launcher shim)
└── src/config-ui/
    ├── launch.js
    └── server.js

src/config-ui/server.js
└── src/preview/renderer.js

skills/
└── skills/ (documentation only)
```
