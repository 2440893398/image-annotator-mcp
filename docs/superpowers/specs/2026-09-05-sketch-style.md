# Sketch (Hand-Drawn) Style

Excalidraw-like rendering for all annotation components, built on the engine
Excalidraw itself uses: rough.js (MIT), vendored at `src/vendor/rough.js`.

## Why vendor instead of depending on the npm package

`src/annotate/render.js` is dual-host: Node loads it with `require`, browser
pages (examples gallery, config UI) load it with a plain `<script>` tag and no
bundler. The vendored file is the upstream IIFE build plus a dual-host export
footer, so one file serves both hosts exactly like render.js itself. Only the
generator API is used (headless — no DOM), via `getRoughGenerator()` in
render.js, which degrades to clean rendering with a warning when the library
is absent.

To upgrade: re-run the vendoring step against a newer roughjs release (IIFE
build + license header + export footer; see the header of the vendored file).

## API

- `options.sketch: true` (MCP top-level `sketch`) — sketch every annotation.
- `theme: "sketch"` — same, plus near-black ink defaults.
- Per annotation: `sketch` (overrides the global flag either way),
  `roughness` (default 1 = Excalidraw "artist"; 0.5 subtle, 2+ cartoonish),
  `seed` (defaults to the annotation index, clamped to >= 1 because rough.js
  treats 0 as "randomize"). Same input therefore always renders the same
  pixels, which keeps snapshot tests meaningful.
- Excalidraw parameter mapping lives in `sketchOptions()`: bowing 1,
  `fillWeight = strokeWidth / 2`, `hachureGap = strokeWidth * 4`, dashed
  strokes disable the double-stroke pass (as Excalidraw does).
- Text components default to the handwriting font stack in sketch mode
  (explicit `font` still wins). The stack includes KaiTi / Kaiti SC for CJK.

## Per-component notes

- **arrow / curved-arrow / magnifier connector**: heads are inlined as two
  wobbly strokes; `<marker>` refs cannot wobble. Curves are flattened to 17
  samples and redrawn with `rough.curve`.
- **callout**: rough bubble + a clean background-colored wedge that extends a
  few px into the bubble to hide the border segment under the pointer, then
  two sketchy pointer edges on top.
- **leadout**: the elbow geometry is shared with the clean renderer
  (`buildLeadoutPoints`); the white halo casing is drawn along the *wobbled*
  strokes so halo and ink cannot drift apart.
- **spotlight**: one rough drawable supplies both the mask cutout (its solid
  fill path) and the visible ring (its stroke paths), so the hole and outline
  coincide.
- **magnifier**: the lens ring stays a clean circle on purpose — Sharp crops
  the magnified pixels as a perfect circle and a wobbly ring would expose the
  seam.
- **redact / blur — excluded, hard rule**: redaction must stay pixel-aligned
  and opaque; a hand-drawn edge would leak border pixels of the covered
  content. Both the per-annotation flag and the global flag are ignored
  (enforced in `createRedact` and `buildSvgParts`, locked by tests).

## Determinism

`buildSvgParts` assigns `seed = index + 1` to sketch annotations without an
explicit seed. Two builds of the same annotation list are byte-identical
(covered in `tests/annotate/sketch.test.js`).

## Fonts

Latin handwriting comes from installed fonts (Comic Sans MS / Segoe Print
etc.); CJK falls back to KaiTi (Windows/macOS). For pixel-parity with
Excalidraw's own look, bundle Excalifont (latin) and Xiaolai (CJK, OFL) and
register them with fontconfig — documented as a follow-up, not done by
default because of the ~10–20 MB font payload.
