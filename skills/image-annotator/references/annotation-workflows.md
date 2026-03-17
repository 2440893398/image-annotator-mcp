# Annotation Workflows

This guide covers common annotation patterns and how to compose them using the CLI.

## Common Annotation Types

### 1. Markers
Numbered circles used to identify specific UI elements.
```json
{"type": "marker", "x": 100, "y": 100, "number": 1, "color": "primary"}
```

### 2. Arrows
Point from one location to another.
```json
{"type": "arrow", "from": [100, 100], "to": [200, 200], "color": "red"}
```

### 3. Callouts
Text boxes with a pointer, ideal for explanations.
```json
{"type": "callout", "x": 300, "y": 200, "text": "Click this button", "pointer": "left", "color": "blue"}
```

### 4. Rectangles
Highlight areas or group elements.
```json
{"type": "rect", "x": 50, "y": 50, "width": 200, "height": 100, "color": "green", "style": "dashed"}
```

### 5. Labels
Simple text labels without pointers.
```json
{"type": "label", "x": 150, "y": 150, "text": "Settings Menu", "background": "white"}
```

### 6. Blur
Hide sensitive information like emails or API keys.
```json
{"type": "blur", "x": 400, "y": 100, "width": 150, "height": 30}
```

## Composing Multi-Annotation Arrays

You can combine multiple types in a single command:

```bash
node annotate.js input.png output.png --annotations '[
  {"type": "rect", "x": 100, "y": 100, "width": 200, "height": 50, "color": "primary"},
  {"type": "marker", "x": 110, "y": 125, "number": 1},
  {"type": "callout", "x": 320, "y": 125, "text": "Main Navigation", "pointer": "left"}
]'
```

## Playwright Workflow

For precise annotations on web UI, use Playwright to capture coordinates:

1. **Navigate**: Use `browser_navigate` to reach the page.
2. **Capture Coordinates**: Use `browser_evaluate` to get element bounds.
   ```javascript
   const rect = document.querySelector('#submit-btn').getBoundingClientRect();
   // { x: 100, y: 200, width: 80, height: 40 }
   ```
3. **Screenshot**: Use `browser_take_screenshot`.
4. **Scale**: If the screenshot is Retina (DPR 2), multiply coordinates by 2.
5. **Annotate**: Pass the scaled coordinates to `node annotate.js`.

## Best Practices
- **Contrast**: Choose colors that stand out from the background.
- **Consistency**: Use the same theme and color scheme throughout a document.
- **Clarity**: Don't overcrowd the image; use multiple screenshots if needed.
- **Redaction**: Always blur or redact sensitive data before sharing screenshots.
