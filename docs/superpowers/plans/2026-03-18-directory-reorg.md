# Directory Reorganization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize runtime code under `src/` while preserving current public entrypoints and cleaning the repository root.

**Architecture:** Keep `server.js`, `annotate.js`, and `config-ui/launch.js` as compatibility shims, and move actual runtime modules into `src/`. Split the two oversized root files by coarse responsibility only, then consolidate tests and fixtures into `tests/` after imports stabilize.

**Tech Stack:** Node.js, CommonJS, Jest, Express, Sharp, MCP SDK

---

## Chunk 1: Runtime Layout

### Task 1: Shared Modules And Annotate Runtime

**Files:**
- Create: `src/annotate/index.js`
- Create: `src/annotate/cli.js`
- Create: `src/annotate/render.js`
- Create: `src/annotate/runtime.js`
- Modify: `annotate.js`
- Modify: `src/config-loader.js`
- Modify: `src/annotate-errors.js`

- [ ] **Step 1: Move low-risk shared files into `src/`**

Move `config-loader.js` to `src/config-loader.js` and `annotate-errors.js` to `src/annotate-errors.js`, then update all imports that reference them.

- [ ] **Step 2: Write or update a regression test for the annotate public API shape**

Use the existing annotate-focused tests as the guardrail. Add a focused assertion if needed so the `annotate.js` shim still exports the expected functions after the split.

- [ ] **Step 3: Run the targeted annotate API test and confirm it fails for the missing split if you introduce the shim first**

Run: `npx jest annotate.test.js --runInBand`

Expected: fail only if the temporary split breaks exports or paths.

- [ ] **Step 4: Extract annotate responsibilities into `src/annotate/`**

Move rendering/constants helpers into `src/annotate/render.js`, move image-processing/runtime helpers into `src/annotate/runtime.js`, move CLI parsing and subcommand routing into `src/annotate/cli.js`, and expose the public API from `src/annotate/index.js`.

- [ ] **Step 5: Replace root `annotate.js` with a compatibility shim**

Keep the shebang, re-export `require('./src/annotate')`, and call `main()` when executed directly.

- [ ] **Step 6: Run targeted annotate tests**

Run: `npx jest annotate.test.js annotate.cli.annotate.test.js annotate.cli.commands.test.js annotate.cli.step-guide.test.js --runInBand`

Expected: all selected tests pass.

### Task 2: MCP Runtime Split

**Files:**
- Create: `src/server/index.js`
- Create: `src/server/tools.js`
- Create: `src/server/handlers.js`
- Create: `src/server/config-ui.js`
- Modify: `server.js`

- [ ] **Step 1: Write or extend a focused server export test**

Use the existing server tests to confirm the `server.js` shim still exposes the same public members after the split.

- [ ] **Step 2: Run the targeted server test and confirm the failure mode if the split is incomplete**

Run: `npx jest server.test.js --runInBand`

Expected: fail only when exports/imports are temporarily broken.

- [ ] **Step 3: Split `server.js` by coarse responsibility**

Move the `tools` array into `src/server/tools.js`, request handlers and helper functions into `src/server/handlers.js`, config UI lifecycle helpers into `src/server/config-ui.js`, and bootstrap/export wiring into `src/server/index.js`.

- [ ] **Step 4: Replace root `server.js` with a compatibility shim**

Keep the shebang, re-export `require('./src/server')`, and call `main()` when executed directly.

- [ ] **Step 5: Run targeted server tests**

Run: `npx jest server.test.js hybrid.integration.test.js --runInBand`

Expected: all selected tests pass.

## Chunk 2: UI, Preview, And Test Layout

### Task 3: Config UI And Preview Runtime Moves

**Files:**
- Create: `src/config-ui/server.js`
- Create: `src/preview/renderer.js`
- Modify: `config-ui/launch.js`
- Modify: `config-ui/public/*` if paths need adjustment

- [ ] **Step 1: Move config UI server and preview renderer into `src/`**

Move `config-ui/server.js` to `src/config-ui/server.js` and `preview/renderer.js` to `src/preview/renderer.js`, then update imports and static file serving paths.

- [ ] **Step 2: Keep `config-ui/launch.js` as the compatibility launcher**

Ensure the root launcher still exports the launcher function and preserves direct CLI execution.

- [ ] **Step 3: Run targeted config UI and preview tests**

Run: `npx jest config-ui/server.test.js preview.renderer.test.js --runInBand`

Expected: all selected tests pass.

### Task 4: Consolidate Tests, Fixtures, And Snapshots

**Files:**
- Create: `tests/annotate/`
- Create: `tests/server/`
- Create: `tests/config-ui/`
- Create: `tests/preview/`
- Create: `tests/integration/`
- Create: `tests/fixtures/`
- Create: `tests/__snapshots__/` or localized snapshot directories as needed
- Modify: moved test files and their fixture imports

- [ ] **Step 1: Move root test files into `tests/` by concern**

Keep names recognizable so diffs stay reviewable, and update relative imports after the move.

- [ ] **Step 2: Consolidate fixture and snapshot directories**

Merge `__fixtures__/` and `fixtures/` into `tests/fixtures/`, and move snapshots under the matching test area.

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --runInBand`

Expected: all Jest suites pass from the new locations.

## Chunk 3: Validation And Docs

### Task 5: Hybrid Release Validation And Documentation

**Files:**
- Modify: `scripts/validate-hybrid-release.js`
- Modify: `docs/hybrid-architecture.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update hybrid validation expectations**

Keep checking the published root entrypoints, and add checks that the new `src/` runtime files exist or import cleanly where useful.

- [ ] **Step 2: Update architecture docs to describe root shims + `src/` runtime layout**

Revise internal structure sections so they no longer describe the root files as monolithic implementations.

- [ ] **Step 3: Run release-smoke validation**

Run: `node scripts/validate-hybrid-release.js`

Expected: validation exits 0.

- [ ] **Step 4: Run packaging smoke test**

Run: `npm pack --dry-run --json`

Expected: pack succeeds and still contains the documented public entrypoints.
