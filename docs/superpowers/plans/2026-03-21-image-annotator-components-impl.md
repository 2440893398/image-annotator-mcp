# Semantic Combo Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 new semantic composite components (measure, leadout, bracket-label, magnifier, spotlight) and upgrade global styling to match professional annotation aesthetics.

**Architecture:** We will extend the existing `src/annotate/render.js` (or add modular render functions) and update schema validation in `src/server/tools.js`. We will follow TDD, writing Jest unit tests first for each component rendering logic, verifying the output dimensions/errors, and then implementing the Sharp SVG generation logic.

**Tech Stack:** Node.js, Sharp (SVG overlays), Jest

---

### Task 1: Global Styling Upgrades

**Files:**
- Modify: `src/annotate/render.js`
- Test: `tests/render.test.js` (or test file testing global styles)

- [ ] **Step 1: Write the failing test**
Update tests to expect global background fills and 2px stroke defaults for built-in text labels.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL due to missing styles or mismatched SVG string comparisons.

- [ ] **Step 3: Write minimal implementation**
Update `THEMES` and default line styles in `src/annotate/render.js` to use 2px stroke and apply `badge` or `filled` style by default to labels.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
`git commit -am "feat: upgrade global styling defaults"`

### Task 2: Implement `measure` Component

**Files:**
- Modify: `src/annotate/render.js`
- Test: `tests/annotate/measure.test.js`

- [ ] **Step 1: Write the failing test**
Write a test that calls the rendering engine with `{ type: "measure", from: [10, 10], to: [100, 10], text: "90px" }`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test`
Expected: FAIL (unsupported type).

- [ ] **Step 3: Write minimal implementation**
Add `measure` case in `render.js`. Draw line between `from` and `to`, construct SVG lines for perpendicular tickets, and center `text`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm run test`
Expected: PASS

- [ ] **Step 5: Commit**
`git commit -am "feat: add measure component"`

### Task 3: Implement `leadout` Component

**Files:**
- Modify: `src/annotate/render.js`
- Test: `tests/annotate/leadout.test.js`

- [ ] **Step 1: Write the failing test**
Create test for `{ type: "leadout", target: [50, 50], anchor: [100, 100], text: "Test" }`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test`

- [ ] **Step 3: Write minimal implementation**
Add `leadout` case. Draw small circle at `target`, line to `anchor`, and filled text tag at `anchor`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm run test`

- [ ] **Step 5: Commit**
`git commit -am "feat: add leadout component"`

### Task 4: Implement `bracket-label` Component

**Files:**
- Modify: `src/annotate/render.js`
- Test: `tests/annotate/bracket.test.js`

- [ ] **Step 1: Write the failing test**
Create test for `{ type: "bracket-label", from: [10,10], to: [10,100], direction: "left", text: "Group" }`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test`

- [ ] **Step 3: Write minimal implementation**
Add `bracket-label` case. Construct SVG path for a straight bracket (e.g., three lines forming a `[`) and connect a line to a text label.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm run test`

- [ ] **Step 5: Commit**
`git commit -am "feat: add bracket-label component"`

### Task 5: Implement `magnifier` Component

**Files:**
- Modify: `src/annotate/render.js`
- Modify: `src/annotate/index.js` (might need to handle Sharp pixel extraction before SVG composite)
- Test: `tests/annotate/magnifier.test.js`

- [ ] **Step 1: Write the failing test**
Create test for `{ type: "magnifier", target: [50, 50], anchor: [150, 150], radius: 30, zoom: 2 }`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test`

- [ ] **Step 3: Write minimal implementation**
Extract `{ left: 35, top: 35, width: 30, height: 30 }` from original image using Sharp. Scale by `zoom`. Composite it as a circle at `anchor`. Draw connecting arrow.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm run test`

- [ ] **Step 5: Commit**
`git commit -am "feat: add extracted magnifier component"`

### Task 6: Implement `spotlight` Component

**Files:**
- Modify: `src/annotate/render.js`
- Modify: `src/annotate/index.js` (if Sharp operations like background darkening require separate layers)
- Test: `tests/annotate/spotlight.test.js`

- [ ] **Step 1: Write the failing test**
Create test for `{ type: "spotlight", x: 100, y: 100, radius: 50 }`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test`

- [ ] **Step 3: Write minimal implementation**
Generate SVG overlay: a full-image `<rect fill="rgba(0,0,0,0.5)">` with `<mask id="spotlight"><rect fill="white"/><circle fill="black" cx="100" cy="100" r="50"/></mask>`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm run test`

- [ ] **Step 5: Commit**
`git commit -am "feat: add spotlight component"`

### Task 7: Update MCP Server Schemas

**Files:**
- Modify: `src/server/tools.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Write the failing test**
Test JSON schema validation for new types in `annotate_screenshot` tool parameters.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test`

- [ ] **Step 3: Write minimal implementation**
Add JSON schema properties for `measure`, `leadout`, `bracket-label`, `magnifier`, and `spotlight` to `annotate_screenshot` in `src/server/tools.js`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm run test`

- [ ] **Step 5: Commit**
`git commit -am "feat: expose new semantic components via MCP tools"`
