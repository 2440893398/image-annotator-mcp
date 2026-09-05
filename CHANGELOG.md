# Changelog

## Unreleased

### Added

- **Text auto-wrapping** for `callout`, `label`, and `leadout`: a callout's
  `width` now doubles as the wrap width, and all three accept `maxWidth`.
  Wrapping breaks CJK per character and latin at word boundaries, using the
  same width estimate the renderer draws with (collision boxes stay in sync).
  Explicit `\n` still forces breaks; without `width`/`maxWidth` nothing
  changes.
- **Marker auto-numbering**: markers without `number` count up from 1 in
  array order; an explicit number sets the cursor for the ones after it
  (`[auto, auto, 10, auto]` → 1, 2, 10, 11). Also fixes markers rendering
  the literal "undefined" when `number` was omitted.
- New **`ellipse`** annotation (center `x`/`y` plus `rx`/`ry`, or
  `width`/`height` as a box), for circling wide UI regions a circle cannot.
- **Arrow upgrades**: `heads: "end" | "start" | "both" | "none"` for
  double-headed/bare arrows, and `lineStyle: "elbow"` reusing the leadout's
  45° leader routing to steer around content.
- New **`polyline`**, **`polygon`** (closed, fillable), and **`freehand`**
  annotations driven by a `points: [[x, y], ...]` array, fully wired through
  DPR scaling, padding offsets, clamping, remapping, and collision boxes.
- **Icon set expansion**: `lock`, `star`, `cursor`/`click`, `thumbs-up`,
  `thumbs-down`, `plus`, `minus`, `eye` join the original five; any **emoji**
  character passed as `icon` renders directly (badge circle opt-in via
  `badge: true`). Emoji artwork comes from the host OS emoji font.
- **`bracketStyle: "curly"`** on `bracket-label` draws a typographic brace in
  all four directions.
- **`halo`** white casing extended beyond leadout to `arrow`/`curved-arrow`/
  `connector` (clean rendering, shaft only), `marker` (outer white ring), and
  background-less `label`s, for legibility over busy screenshots.
- **`crop`** top-level option: extract a region before annotating.
  Coordinates are CSS logical pixels relative to the ORIGINAL image — the
  pipeline shifts annotation coordinates automatically, so Playwright/DOM
  coordinates can be reused unchanged.
- **`background`** top-level option (or a plain color string): CleanShot-style
  export card — padding (default 48), rounded screenshot corners (default 12),
  and a drop shadow on a solid or gradient canvas. Stacks with
  `canvas_padding`; not available with `svg` output.
- **`auto_layout`** top-level option (opt-in): overlapping leadout chips
  mirror their anchor around the target and overlapping callouts flip their
  pointer to the first free position; every move is reported as a warning.
  Without the flag, detected overlaps now emit a hint that the option exists.
- **`measure` auto-distance**: omit `text` to display the measured
  point-to-point distance in logical pixels (DPR-corrected).
- `create_step_guide` accepts the `sketch` theme/flag and warns when a guide
  exceeds the 5–7 step best-practice range; the CLI gains `--sketch`,
  `--crop`, `--background`, and `--auto-layout`.
- The MCP schema now declares previously hidden renderer fields (`headStyle`,
  `fill`, `fillStyle`, `padding`, `fontWeight`, `borderColor`) so agents can
  discover them.

### Fixed

- Multi-line `label` text used to run downward out of its background box;
  the text block is now bottom-anchored on the `y` baseline so every line
  stays inside (single-line output unchanged).

- Hand-drawn **sketch style** (Excalidraw-like) for every annotation type,
  powered by a vendored copy of rough.js (MIT, `src/vendor/rough.js` — the
  same shape engine Excalidraw uses), with Excalidraw's renderer defaults
  (roughness 1, hachure fill weight/gap derived from stroke width):
  - Turn on globally with the `sketch: true` option (MCP: top-level `sketch`)
    or the new `sketch` theme; per annotation via `sketch`, tunable with
    `roughness` and `seed`. Seeds default to the annotation index so
    re-renders are byte-identical.
  - Text in sketch mode falls back to the handwriting font stack, which now
    includes KaiTi/Kaiti SC so CJK text gets a brush-style face on
    Windows/macOS (Linux: install a handwriting font such as LXGW WenKai).
  - Arrow heads are inlined as two wobbly strokes (SVG `<marker>` cannot
    wobble); the spotlight's mask cutout and visible ring share one rough
    outline; the magnifier's lens ring intentionally stays a clean circle to
    match Sharp's circular pixel crop.
  - **`redact`/`blur` never sketch**: a wobbly edge would leak border pixels
    of the covered content, so redaction rectangles stay pixel-aligned and
    crisp under any sketch flag.
  - `font` and `handwriting` are now exposed in the MCP annotation schema.
  - Browser previews (examples gallery, config UI) load `vendor/rough.js`
    via a script tag; if it is missing, sketch requests degrade to clean
    rendering with a warning instead of failing.

### Changed

- `leadout` visual redesign, following leader-line conventions from technical
  illustration and boundary-labeling research (see
  `docs/superpowers/specs/2026-09-05-leadout-visual-redesign.md`):
  - Leader is now a 45°-then-axis-aligned **elbow** that meets the label edge
    head-on at its centre, instead of a straight line entering at a random
    angle (`lineStyle: "straight"` restores the old routing).
  - A white **halo casing** under the line and target dot keeps them legible
    over busy screenshot content (`halo: false` to disable).
  - The target dot gained a white ring; unless set, the leader stroke scales
    with the label font size (`max(2, 0.15em)`), and `leadout` now follows
    the image-size font presets like `label`/`callout` do.
  - The label is a **soft chip** by default: a light tint of the accent color
    with an accent border and dark text (calm and readable, Excalidraw-palette
    style), plus a soft drop shadow. `variant: "filled"` gives a solid accent
    chip with luminance-picked text for maximum emphasis; `variant: "outline"`
    a white chip with accent border.
  - `leadout` accepts `font`/`handwriting`, supports multi-line `text`, and
    picks up per-theme colors/fonts from all four built-in themes.
  - `estimateAnnotationBounds` sizes leadout labels from the real text metrics
    instead of a hard-coded 100px width.

## 1.1.0 (2026-09-05)

### ⚠️ Security notice: the old `blur` type never redacted anything

Before this release, the `blur` annotation type drew a Gaussian-blurred grey
rectangle **on top of** the image instead of blurring the image itself. For
typical text-sized boxes the whole rectangle was semi-transparent: measured on a
striped test pattern, content under a default-settings blur box remained **100%
readable** and could be recovered **bit-for-bit** by simple per-pixel
thresholding — no special tooling required. `redact_patterns` was built on this
blur, so it offered no protection either.

**Any screenshot "redacted" with `blur` or `redact_patterns` before 1.1.0 must
be treated as unredacted. Regenerate and re-share those images.**

### Added

- New `redact` annotation type with three modes:
  - `solid` (default) — an opaque rectangle painted above every other
    annotation. In the flattened raster output the region is pure fill colour
    (per-pixel std = 0; two images differing only in covered content produce
    identical output). This is the only irreversible mode.
  - `pixelate` / `blur` — pixel operations on the base image, below the
    annotation layer. Both are **reversible** (pixelation preserves block
    averages, Gaussian blur is an invertible convolution) and exist for visual
    de-emphasis only. Every use emits a runtime warning.
  - Optional `label` (e.g. `"REDACTED"`) drawn on solid rectangles, `color`,
    `blockSize` (pixelate), `intensity` (blur sigma). The default solid fill is
    `#64748B` (slate) and label text picks white or near-black automatically
    from the fill's luminance.
- Magnifiers now sample **already-redacted** pixels: aiming a `magnifier` at a
  redacted region shows the fill colour, not the original content.
- The config-UI preview renders solid redactions faithfully and shows an
  explicitly approximate hatched placeholder for pixelate/blur.
- Pixel-level regression suite (`tests/annotate/redact.test.js`): per-pixel
  solidity, anti-restoration (MAE = 0), magnifier bypass, DPR/padding
  combinations, and metadata stripping.

### Changed

- `redact_patterns` now generates **solid** redactions (labelled `REDACTED`)
  instead of the broken blur, computes boxes after DPR scaling/clamping (fixing
  a misalignment at devicePixelRatio > 1), and inflates them by a safety margin
  because rendered glyphs can be wider than the estimated text box. It still
  covers the matched annotation's own text box — not content inside the
  screenshot (no OCR). Visually verify redacted output before sharing.
- `svg` output: hand-placed redact/blur regions add an explicit warning (an
  annotation layer has no pixels to redact and can be edited); a
  `redact_patterns` match with `svg` output is now an **error**, because the
  matched text would sit verbatim in the file.

### Breaking

- `blur` is now an alias for `{"type": "redact", "mode": "blur"}` and really
  blurs the underlying image:
  1. `width`/`height` (and `x`/`y`) are now **required** numeric fields; the
     old implicit 100×60 default is gone.
  2. It renders below the annotation layer instead of above earlier
     annotations. To cover an annotation, use `redact` (solid).
  3. In `svg` output it no longer produces any element.
- A redact/blur region that would cover nothing (invalid size, or clamped to
  zero at the canvas edge) is now an `InvalidParameterError` instead of being
  silently dropped.
