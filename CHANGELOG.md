# Changelog

## Unreleased

### Added

- **`target` and `attach` on markers** — pass the element's bounding box as
  `target: [x, y, width, height]` (a Playwright `boundingBox()` drops straight
  in; width/height optional) and the marker places itself *outside* that box
  with a hairline white-cased leader back to the edge, instead of covering the
  control it numbers. `attach` picks the side: `left`/`right`/`top`/`bottom`,
  `auto` (the default once a target is given — prefers a left-hand rail so a
  run of markers forms a column, flipping right near the canvas edge), or
  `none` for the historical centred behaviour. `leader: false` drops the tick.
  An 18px checkbox is now numberable; before, the marker simply swallowed it.
- **`auto_layout` now moves markers**, which it never did — `resolveCollisions`
  skipped every type except leadout and callout, so the one case that most
  needs automatic spacing (a page with many numbers) got nothing. A marker with
  a `target` tries the other sides of it; one with only `x`/`y` steps out along
  the compass. `getBoundingBox` follows the drawn placement, and counts the
  casing ring, so two markers are not judged clear when their rings touch.
- **Top-level `active: <step>`** (MCP `active`, CLI `--active`): every marker
  whose number differs is drawn in a neutral slate while the current step keeps
  its colour. A screenshot can carry a whole sequence and still have one place
  for the eye to land.
- **`style: "ghost"` for markers** — tinted fill with an accent ring and
  numeral, for a quiet series. Needs a light background to stay readable, so it
  is opt-in rather than the default.
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

### Documentation

- Corrected and expanded the config-file docs (README, README.zh-CN,
  `skills/image-annotator/references/config-ui.md`). Discovery was documented as
  starting at the current working directory and searching 3 parent levels; it
  actually starts at the **input image's directory** and searches 5. Added the
  precedence rule that most often explains a surprising annotation size:
  `defaultSizes` in a config file overrides the size presets for every image
  beneath it, and `markerSize` is a radius. This repository's own root
  `.image-annotator.json` (`markerSize: 44`, `theme: "tutorial"`) is called out
  explicitly, since it applies to anything annotated from inside the repo.

### Fixed

- Alt text and aria labels described a marker positioned by `target` alone as
  having "no position", discarding the only locator a screen reader had. They
  now report the element it points at.
- **Canvas padding and cropping silently un-attached markers.**
  `offsetAnnotationCoords` rebuilt `target` as a bare `[x, y]` pair, which
  collapsed a marker's target box to a point, so any image with
  `canvas_padding`, `crop`, or a `background` card placed its attached markers
  against a zero-size box instead of the real element.
- **Horizontal and vertical `arrow` and `measure` annotations vanished from
  raster output.** Their drop shadow used a filter region in
  objectBoundingBox units, and an axis-aligned stroke has a zero-height (or
  zero-width) bounding box, which collapses the region to nothing and makes
  the renderer drop the element — so a `measure` between two points on the
  same row drew its end ticks and its label but no shaft, and a horizontal
  arrow disappeared entirely. The SVG looked correct throughout, so this only
  showed up in PNG/JPEG/WebP output; `sketch: true` was never affected
  because it does not use the filter. `arrow`, `curved-arrow` (including
  `curve: 0`), `measure`, and `polyline`/`polygon` with collinear points now
  pass an explicit user-space filter region; shapes with area keep the
  cheaper bounding-box region.
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

- **Markers were redesigned for dense pages; existing calls render differently.**
  Numbering a busy screen used to bury it, for three measurable reasons, all now
  addressed:
  - `SIZE_PRESETS.markerSize` is a **radius**, and the values were twice what
    they should have been: a 1280-1920px screenshot picked the `l` preset and
    got an **80px** circle, roughly three times what Snagit/Scribe/CleanShot
    draw. Every preset is halved, giving 20-40px discs.
  - The `filled` style stacked a vertical gradient, an inner white ring, and a
    drop shadow on every marker. None carried information and together they
    tripled its visual weight. It is now a flat disc with a **white casing
    ring** (`halo`, on by default) — casing, not shadow, is what keeps a small
    marker legible over arbitrary UI. `shadow` is now opt-in.
  - The four built-in themes hardcoded `size: 32`/`36`, which beat the size
    preset outright and put a 64px circle on every themed screenshot. Themes
    now pick colours and fonts only.
  Numerals were rescaled to suit a small disc (single digit `size * 1.1`, two
  digits `size * 0.95`, so a two-digit number no longer spills over the edge),
  and marker geometry is rounded to two decimals instead of emitting values like
  `15.400000000000002`. Pass an explicit `size` to keep the old dimensions.

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
