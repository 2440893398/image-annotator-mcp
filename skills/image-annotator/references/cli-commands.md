# CLI Command Reference

The Image Annotator CLI provides a direct way to process images without using the MCP protocol. This is the preferred method for coding agents and automated scripts.

## Commands

### 1. Annotate (Default)
Add multiple annotations to an image.

**Usage:**
```bash
node annotate.js <input> <output> --annotations '<json>' [options]
```

**Example:**
```bash
node annotate.js screenshot.png annotated.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'
```

### 2. Dimensions
Get the width, height, and format of an image.

**Usage:**
```bash
node annotate.js dimensions <image>
```

**Example:**
```bash
node annotate.js screenshot.png
# Output: {"width":1920,"height":1080,"format":"png"}
```

### 3. Reannotate
Proportionally remap annotations from an old screenshot size to a new one.

**Usage:**
```bash
node annotate.js reannotate --new-screenshot <image> --previous-annotations <json> --previous-width <n> --previous-height <n>
```

**Example:**
```bash
node annotate.js reannotate --new-screenshot new.png --previous-annotations '[{"type":"marker","x":500,"y":500}]' --previous-width 1000 --previous-height 1000
```

### 4. Step Guide
Create a numbered step-by-step guide on a screenshot.

**Usage:**
```bash
node annotate.js step-guide <input> <output> --steps <json>
```

**Example:**
```bash
node annotate.js input.png guide.png --steps '[{"x":100,"y":100,"text":"Click here"},{"x":200,"y":200,"text":"Then here"}]'
```

## Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--annotations` | `-a` | JSON array of annotations (required for annotate mode) | - |
| `--theme` | `-t` | Theme: `documentation`, `tutorial`, `bugReport`, `highlight` | `documentation` |
| `--output-format` | - | Output format: `png`, `jpeg`, `webp`, `avif`, `svg` | `png` |
| `--quality` | - | JPEG/WebP quality (1-100) | `90` |
| `--device-pixel-ratio` | - | Scale factor for Retina/HiDPI coordinates (e.g. 2) | `1` |
| `--canvas-padding` | - | Extra canvas padding in pixels | `0` |
| `--redact-patterns` | - | JSON array of regex strings to redact annotation text | `[]` |
| `--help` | `-h` | Show help message | - |

## Output Formats
The tool supports several output formats:
- **PNG**: Lossless, best for screenshots with text.
- **JPEG**: Lossy, good for photos.
- **WebP**: Modern format with good compression.
- **AVIF**: Next-gen format with superior compression.
- **SVG**: Returns only the annotation layer as a vector graphic.

## Windows Usage
When running on Windows, pay special attention to JSON quoting in the terminal. See [windows-notes.md](./windows-notes.md) for detailed guidance.
