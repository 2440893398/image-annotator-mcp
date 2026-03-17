# Guardrails

Safety rules for agents using the Image Annotator.

## Config UI Save Restrictions

**MUST**: Only `.image-annotator.json` can be saved via the config UI.
**MUST**: The file must be inside the working directory of the running server.
**PROHIBITED**: Any path outside the working directory will return HTTP 403.
**PROHIBITED**: Any filename other than `.image-annotator.json` will return HTTP 403.

## General Guardrails

- **No OCR**: The tool does not read text from images. Redaction only applies to text in annotations you add.
- **No arbitrary file writes**: The annotate CLI and MCP only write to the output_path you specify.
- **Validate coordinates**: Always get image dimensions first (`node annotate.js dimensions <image>`) to ensure annotations fit within bounds.
- **Absolute paths**: Use absolute paths to avoid ambiguity, especially in multi-directory projects.
- **No secrets in annotations**: Do not put API keys, passwords, or PII in callout/label text.
- **Malformed JSON fails loudly**: The CLI will exit non-zero with a clear error; fix the JSON before retrying.
