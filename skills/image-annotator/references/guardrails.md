# Guardrails

Safety rules for agents using the Image Annotator.

## Config UI Save Restrictions

**MUST**: Only `.image-annotator.json` can be saved via the config UI.
**MUST**: The file must be inside the working directory of the running server.
**PROHIBITED**: Any path outside the working directory will return HTTP 403.
**PROHIBITED**: Any filename other than `.image-annotator.json` will return HTTP 403.

## Redaction Rules

- **MUST**: Use `{"type": "redact"}` with the default `solid` mode for anything sensitive. Solid is the only irreversible mode: the region becomes pure fill colour in the flattened raster output.
- **PROHIBITED**: Never use `mode: "pixelate"` or `mode: "blur"` (or the legacy `blur` type) to hide sensitive content. Both are reversible — pixelation preserves block averages (Depix-style attacks) and Gaussian blur is an invertible convolution. Every use produces a runtime warning.
- **PROHIBITED**: Never use `svg` output for redaction. It is an annotation layer without image pixels; hand-placed regions only warn, and `redact_patterns` matches are rejected with an error.
- **MUST**: Regions require explicit numeric `x`, `y`, `width`, `height`. A region that ends up outside the canvas is an error, never silently skipped.
- **Layering**: `solid` paints above every other annotation (it covers matched callout text); `pixelate`/`blur` alter the base image and annotations draw on top of them. Magnifiers sample already-redacted pixels.
- **Scope**: `redact_patterns` covers the matched annotation's own text box (inflated by a safety margin), not text inside the screenshot — no OCR is performed. Extremely wide glyph runs can exceed the margin: **visually verify redacted output before sharing**.
- **History**: images produced before v1.1.0 with the old `blur` type are NOT redacted — the content is readable and recoverable. Regenerate them.

## General Guardrails

- **No OCR**: The tool does not read text from images. Redaction only applies to text in annotations you add.
- **No arbitrary file writes**: The annotate CLI and MCP only write to the output_path you specify.
- **Validate coordinates**: Always get image dimensions first (`node annotate.js dimensions <image>`) to ensure annotations fit within bounds.
- **Absolute paths**: Use absolute paths to avoid ambiguity, especially in multi-directory projects.
- **No secrets in annotations**: Do not put API keys, passwords, or PII in callout/label text.
- **Malformed JSON fails loudly**: The CLI will exit non-zero with a clear error; fix the JSON before retrying.
