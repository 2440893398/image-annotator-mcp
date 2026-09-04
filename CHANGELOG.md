# Changelog

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
