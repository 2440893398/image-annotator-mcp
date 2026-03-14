# Image Annotator MCP - Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all code review issues identified in the review, improving cross-platform compatibility, CLI robustness, error handling, and code quality.

**Architecture:** Incremental fixes across 9 issues, prioritizing P0 (critical) issues first, then P1, then P2. Each issue handled as a separate task with tests.

**Tech Stack:** Node.js, npm, Jest (for unit tests), minimist (for CLI parsing)

---

## Task 1: Fix README Cross-Platform Paths (P0)

**Files:**
- Modify: `README.md:52-60`
- Modify: `README.zh-CN.md:52-60`

**Step 1: Update README.md Option 3**

Replace the hardcoded path with environment variable placeholder:

```markdown
### Option 3: Local Development

```bash
cd image-annotator-mcp
npm install
```

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "node",
      "args": ["${process.cwd()}/server.js"]
    }
  }
}
```

> Note: For Windows, use forward slashes in path or use environment variable \`%CD%\` in args.
```

**Step 2: Update README.zh-CN.md Option 3**

Replace the hardcoded Windows path:

```markdown
### 方式三：本地开发（不推荐用于生产）

```bash
cd image-annotator-mcp
npm install
```

```json
{
  "mcpServers": {
    "image-annotator": {
      "command": "node",
      "args": ["${process.cwd()}/server.js"]
    }
  }
}
```

> 注意：Windows 上请使用正斜杠或环境变量 \`%CD%\`。
```

**Step 3: Commit**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: fix cross-platform path examples in README"
```

---

## Task 2: Fix CLI Argument Parsing with minimist (P0)

**Files:**
- Modify: `package.json`
- Modify: `annotate.js:736-756`

**Step 1: Add minimist dependency**

```bash
npm install minimist
```

**Step 2: Update package.json dependencies**

Add minimist to dependencies (already done by npm install).

**Step 3: Update CLI parsing in annotate.js**

Replace lines 736-756:

```javascript
// CLI argument parsing with minimist
const args = require('minimist')(process.argv.slice(2), {
  string: ['annotations', 'theme'],
  boolean: ['help', 'h'],
  alias: { h: 'help' }
});

if (args.help) {
  console.log(`
Image Annotator CLI

Usage: node annotate.js <input> <output> [options]

Options:
  --annotations, -a  JSON array of annotations (required)
  --theme, -t        Theme name (documentation|tutorial|bugReport|highlight)
  --help, -h          Show this help message

Examples:
  node annotate.js input.png output.png --annotations='[{"type":"marker","x":100,"y":100,"number":1}]'
  node annotate.js input.png output.png --annotations '[{"type":"arrow","from":[0,0],"to":[100,100]}]' --theme tutorial
`);
  process.exit(0);
}

const inputPath = args._[0];
const outputPath = args._[1];

if (!inputPath || !outputPath) {
  console.error('Error: input and output paths required');
  console.error('Usage: node annotate.js <input> <output> --annotations JSON');
  process.exit(1);
}

if (!args.annotations) {
  console.error('Error: --annotations required');
  process.exit(1);
}

let annotations;
try {
  annotations = typeof args.annotations === 'string' 
    ? JSON.parse(args.annotations) 
    : args.annotations;
} catch (e) {
  console.error('Error parsing annotations JSON:', e.message);
  process.exit(1);
}

const theme = args.theme || null;
```

**Step 4: Test CLI parsing**

```bash
# Test basic parsing
node annotate.js test.png out.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'

# Test with spaces in text
node annotate.js test.png out.png --annotations '[{"type":"callout","x":100,"y":100,"text":"Hello World"}]'

# Test theme flag
node annotate.js test.png out.png --annotations '[]' --theme tutorial

# Test help
node annotate.js --help
```

Expected: All commands should work without parsing errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json annotate.js
git commit -m "fix: add minimist for robust CLI argument parsing"
```

---

## Task 3: Create Custom Error Classes (P0)

**Files:**
- Create: `annotate-errors.js`
- Modify: `annotate.js` (import errors)
- Modify: `server.js` (handle different error types)

**Step 1: Create annotate-errors.js**

```javascript
/**
 * Custom error classes for image annotator
 */

class AnnotationError extends Error {
  constructor(message, code = 'ANNOTATION_ERROR') {
    super(message);
    this.name = 'AnnotationError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class FileNotFoundError extends AnnotationError {
  constructor(filePath) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    this.name = 'FileNotFoundError';
    this.filePath = filePath;
  }
}

class InvalidParameterError extends AnnotationError {
  constructor(message, param) {
    super(message, 'INVALID_PARAMETER');
    this.name = 'InvalidParameterError';
    this.param = param;
  }
}

class ImageProcessingError extends AnnotationError {
  constructor(message, originalError) {
    super(message, 'IMAGE_PROCESSING_ERROR');
    this.name = 'ImageProcessingError';
    this.originalError = originalError;
  }
}

class AnnotationTypeError extends AnnotationError {
  constructor(type) {
    super(`Unknown annotation type: ${type}`, 'ANNOTATION_TYPE_ERROR');
    this.name = 'AnnotationTypeError';
    this.type = type;
  }
}

module.exports = {
  AnnotationError,
  FileNotFoundError,
  InvalidParameterError,
  ImageProcessingError,
  AnnotationTypeError
};
```

**Step 2: Update annotate.js imports**

Add at top of annotate.js after existing requires:

```javascript
const {
  AnnotationError,
  FileNotFoundError,
  InvalidParameterError,
  ImageProcessingError,
  AnnotationTypeError
} = require('./annotate-errors');
```

**Step 3: Update annotate.js to use custom errors**

Find and replace error throws:

```javascript
// In getImageDimensions:
throw new FileNotFoundError(inputPath);

// In buildSvg:
throw new AnnotationTypeError(type);

// In annotateImage (validation):
throw new InvalidParameterError('Annotations must be an array', 'annotations');
```

**Step 4: Update server.js error handling**

Replace the catch block around line 269:

```javascript
} catch (error) {
  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = error.message;
  
  if (error instanceof FileNotFoundError) {
    errorCode = error.code;
    errorMessage = `File not found: ${error.filePath}`;
  } else if (error instanceof InvalidParameterError) {
    errorCode = error.code;
    errorMessage = `Invalid parameter: ${error.param} - ${error.message}`;
  } else if (error instanceof ImageProcessingError) {
    errorCode = error.code;
    errorMessage = `Image processing failed: ${error.message}`;
  } else if (error instanceof AnnotationTypeError) {
    errorCode = error.code;
    errorMessage = `Annotation error: ${error.message}`;
  } else if (error instanceof AnnotationError) {
    errorCode = error.code;
  }
  
  return {
    content: [{ type: 'text', text: `Error (${errorCode}): ${errorMessage}` }],
    isError: true,
    errorCode
  };
}
```

**Step 5: Commit**

```bash
git add annotate-errors.js annotate.js server.js
git commit -m "fix: add custom error classes for better error handling"
```

---

## Task 4: Replace Global ID Counter with UUID (P1)

**Files:**
- Modify: `annotate.js:103-106`

**Step 1: Update generateId function**

Replace lines 103-106:

```javascript
const crypto = require('crypto');

function generateId(prefix = 'ann') {
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${randomPart}`;
}
```

**Step 2: Test uniqueness**

```bash
node -e "const {generateId} = require('./annotate'); console.log([...Array(10)].map(() => generateId()))"
```

Expected: 10 unique IDs

**Step 3: Commit**

```bash
git add annotate.js
git commit -m "fix: replace global ID counter with crypto UUID"
```

---

## Task 5: Update Font Fallback Lists (P1)

**Files:**
- Modify: `annotate.js:17-18`

**Step 1: Update font constants**

Replace lines 17-18:

```javascript
// Handwriting-style font stack (more reliable cross-platform)
const HANDWRITING_FONT = "Comic Sans MS, Chalkboard SE, Patrick Hand, cursive";

// Clean sans-serif font stack
const CLEAN_FONT = "Segoe UI, Helvetica Neue, Arial, sans-serif";
```

**Step 2: Commit**

```bash
git add annotate.js
git commit -m "fix: improve font fallback for cross-platform consistency"
```

---

## Task 6: Optimize Memory for Large Images (P1)

**Files:**
- Modify: `annotate.js` (add image size check)

**Step 1: Add size warning function**

Add after getImageDimensions function:

```javascript
/**
 * Check image size and warn if large
 */
function checkImageSize(metadata) {
  const pixels = metadata.width * metadata.height;
  const FOUR_K_PIXELS = 3840 * 2160; // ~8.3MP
  
  if (pixels > FOUR_K_PIXELS) {
    console.warn(`Warning: Large image detected (${metadata.width}x${metadata.height}, ${(pixels/1000000).toFixed(1)}MP). Processing may be slow.`);
  }
  
  return pixels > FOUR_K_PIXELS;
}
```

**Step 2: Add check in annotateImage**

After getting metadata (around line 644), add:

```javascript
// Check image size
checkImageSize(metadata);
```

**Step 3: Commit**

```bash
git add annotate.js
git commit -m "feat: add large image size warning"
```

---

## Task 7: Remove Unused width Parameter (P2)

**Files:**
- Modify: `annotate.js` (createCallout function)

**Step 1: Review createCallout usage**

Search for where createCallout is called to see if width is ever provided:

```bash
grep -n "createCallout" annotate.js
```

**Step 2: If width is unused, remove it**

If width is truly unused, update the function signature:

```javascript
function createCallout({ x, y, text, color = 'primary', background = 'white', pointer = 'bottom', fontSize = 18, shadow = true, handwriting = true }) {
```

**Step 3: Commit**

```bash
git add annotate.js
git commit -m "refactor: remove unused width parameter from createCallout"
```

---

## Task 8: Extract Magic Numbers to Constants (P2)

**Files:**
- Modify: `annotate.js` (add constants section)

**Step 1: Add constants after COLORS/THEMES**

Add after line 78:

```javascript
// Text width estimation coefficient (average character width / font size ratio)
const TEXT_WIDTH_RATIO = 0.65;

// Default padding for callouts and labels
const DEFAULT_PADDING = 14;

// Line height coefficient
const LINE_HEIGHT_RATIO = 1.5;
```

**Step 2: Replace magic numbers**

Find and replace:
- `0.65` → `TEXT_WIDTH_RATIO`
- `14` (in text calculations) → `DEFAULT_PADDING`
- `1.5` (line height) → `LINE_HEIGHT_RATIO`

**Step 3: Commit**

```bash
git add annotate.js
git commit -m "refactor: extract magic numbers to named constants"
```

---

## Task 9: Add Input Validation (P2)

**Files:**
- Modify: `annotate.js` (add validation functions)

**Step 1: Add validation functions**

Add after the constants section:

```javascript
/**
 * Validate coordinates are within image bounds
 */
function validateCoordinates(x, y, imageWidth, imageHeight) {
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new InvalidParameterError('Coordinates must be numbers', 'coordinates');
  }
  if (x < 0 || y < 0) {
    throw new InvalidParameterError('Coordinates cannot be negative', 'coordinates');
  }
  if (x > imageWidth || y > imageHeight) {
    throw new InvalidParameterError(
      `Coordinates (${x}, ${y}) exceed image bounds (${imageWidth}x${imageHeight})`,
      'coordinates'
    );
  }
  return true;
}

/**
 * Validate annotation object
 */
function validateAnnotation(annotation, imageWidth, imageHeight) {
  if (!annotation || typeof annotation !== 'object') {
    throw new InvalidParameterError('Annotation must be an object', 'annotation');
  }
  
  if (annotation.x !== undefined && annotation.y !== undefined) {
    validateCoordinates(annotation.x, annotation.y, imageWidth, imageHeight);
  }
  
  if (annotation.from && annotation.to) {
    annotation.from.forEach((coord, i) => {
      if (typeof coord !== 'number') {
        throw new InvalidParameterError('Arrow coordinates must be numbers', 'coordinates');
      }
    });
    annotation.to.forEach((coord, i) => {
      if (typeof coord !== 'number') {
        throw new InvalidParameterError('Arrow coordinates must be numbers', 'coordinates');
      }
    });
  }
  
  return true;
}
```

**Step 2: Add validation in buildSvg**

At the start of buildSvg function:

```javascript
function buildSvg(annotations, options = {}) {
  // Validate annotations array
  if (!Array.isArray(annotations)) {
    throw new InvalidParameterError('Annotations must be an array', 'annotations');
  }
  
  // Image dimensions for validation (if provided in options)
  const imageWidth = options.imageWidth || Infinity;
  const imageHeight = options.imageHeight || Infinity;
  
  // Validate each annotation
  annotations.forEach((ann, index) => {
    validateAnnotation(ann, imageWidth, imageHeight);
  });
  
  // ... rest of function
```

**Step 3: Commit**

```bash
git add annotate.js
git commit -f "feat: add input validation for coordinates and annotations"
```

---

## Task 10: Add Unit Tests with Jest

**Files:**
- Create: `jest.config.js`
- Create: `tests/annotate.test.js`
- Create: `tests/__fixtures__/sample.png`
- Modify: `package.json`

**Step 1: Install Jest**

```bash
npm install --save-dev jest
```

**Step 2: Create jest.config.js**

```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'annotate.js',
    '!annotate.js' // exclude CLI code
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ]
};
```

**Step 3: Update package.json**

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

**Step 4: Create tests/annotate.test.js**

```javascript
const {
  escapeXml,
  getColor,
  adjustColor,
  generateId,
  createMarker,
  createArrow,
  createCallout,
  createRect,
  createCircle,
  createLabel,
  createHighlight,
  createBlur,
  createConnector,
  createIcon,
  buildSvg,
  annotateImage,
  COLORS,
  THEMES
} = require('../annotate');

const path = require('path');

describe('Utility Functions', () => {
  describe('escapeXml', () => {
    test('escapes & character', () => {
      expect(escapeXml('A & B')).toBe('A &amp; B');
    });
    
    test('escapes < and > characters', () => {
      expect(escapeXml('<div>')).toBe('&lt;div&gt;');
    });
    
    test('escapes quotes', () => {
      expect(escapeXml('He said "hello"')).toBe('He said &quot;hello&quot;');
    });
    
    test('handles non-string input', () => {
      expect(escapeXml(123)).toBe('123');
    });
    
    test('handles empty string', () => {
      expect(escapeXml('')).toBe('');
    });
  });

  describe('getColor', () => {
    test('returns predefined color hex', () => {
      expect(getColor('red')).toBe('#E53935');
    });
    
    test('returns unknown color as-is', () => {
      expect(getColor('custom-color')).toBe('custom-color');
    });
    
    test('returns default red for empty', () => {
      expect(getColor()).toBe('#E53935');
      expect(getColor(null)).toBe('#E53935');
    });
  });

  describe('adjustColor', () => {
    test('adjusts brightness positively', () => {
      expect(adjustColor('#FF0000', 20)).toBe('#FF1414');
    });
    
    test('adjusts brightness negatively', () => {
      expect(adjustColor('#FF0000', -20)).toBe('#EB0000');
    });
    
    test('handles boundary values', () => {
      expect(adjustColor('#FFFFFF', 10)).toBe('#FFFFFF');
      expect(adjustColor('#000000', -10)).toBe('#000000');
    });
  });
});

describe('ID Generator', () => {
  test('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
  
  test('uses custom prefix', () => {
    const id = generateId('custom');
    expect(id.startsWith('custom-')).toBe(true);
  });
});

describe('SVG Element Creation', () => {
  describe('createMarker', () => {
    test('creates default marker', () => {
      const result = createMarker({ x: 100, y: 100, number: 1 });
      expect(result.element).toContain('circle');
      expect(result.element).toContain('100');
    });
    
    test('applies custom color', () => {
      const result = createMarker({ x: 100, y: 100, number: 1, color: 'blue' });
      expect(result.element).toContain('#1E88E5');
    });
    
    test('supports outline style', () => {
      const result = createMarker({ x: 100, y: 100, number: 1, style: 'outline' });
      expect(result.element).toContain('stroke');
    });
    
    test('supports badge style', () => {
      const result = createMarker({ x: 100, y: 100, number: 10, style: 'badge' });
      expect(result.element).toContain('rect');
    });
  });

  describe('createArrow', () => {
    test('creates basic arrow', () => {
      const result = createArrow({ from: [0, 0], to: [100, 100] });
      expect(result.element).toContain('line');
    });
    
    test('applies dashed style', () => {
      const result = createArrow({ from: [0, 0], to: [100, 100], style: 'dashed' });
      expect(result.element).toContain('stroke-dasharray');
    });
    
    test('applies custom stroke width', () => {
      const result = createArrow({ from: [0, 0], to: [100, 100], strokeWidth: 10 });
      expect(result.element).toContain('stroke-width="10"');
    });
  });

  describe('createCallout', () => {
    test('creates callout with text', () => {
      const result = createCallout({ x: 100, y: 100, text: 'Hello' });
      expect(result.element).toContain('Hello');
    });
    
    test('supports different pointer positions', () => {
      const result = createCallout({ x: 100, y: 100, text: 'Test', pointer: 'left' });
      expect(result.element).toContain('pointer');
    });
    
    test('applies handwriting font', () => {
      const result = createCallout({ x: 100, y: 100, text: 'Test', handwriting: true });
      expect(result.defs).toContain('font-family');
    });
  });

  describe('createRect', () => {
    test('creates rectangle', () => {
      const result = createRect({ x: 10, y: 10, width: 100, height: 50 });
      expect(result.element).toContain('rect');
    });
    
    test('supports rounded corners', () => {
      const result = createRect({ x: 10, y: 10, width: 100, height: 50, borderRadius: 10 });
      expect(result.element).toContain('rx=');
    });
  });

  describe('createCircle', () => {
    test('creates circle', () => {
      const result = createCircle({ x: 100, y: 100, radius: 50 });
      expect(result.element).toContain('circle');
    });
  });

  describe('createLabel', () => {
    test('creates label with background', () => {
      const result = createLabel({ x: 100, y: 100, text: 'Label', background: 'yellow' });
      expect(result.element).toContain('Label');
    });
  });

  describe('createHighlight', () => {
    test('creates highlight', () => {
      const result = createHighlight({ x: 10, y: 10, width: 100, height: 50 });
      expect(result.element).toContain('rect');
    });
  });

  describe('createBlur', () => {
    test('creates blur', () => {
      const result = createBlur({ x: 10, y: 10, width: 100, height: 50 });
      expect(result.element).toContain('filter');
    });
  });

  describe('createConnector', () => {
    test('creates connector line', () => {
      const result = createConnector({ from: [0, 0], to: [100, 100] });
      expect(result.element).toContain('path');
    });
  });

  describe('createIcon', () => {
    test('creates check icon', () => {
      const result = createIcon({ x: 100, y: 100, type: 'check' });
      expect(result.element).toContain('path');
    });
    
    test('creates all icon types', () => {
      ['check', 'x', 'warning', 'info', 'question'].forEach(type => {
        const result = createIcon({ x: 100, y: 100, type });
        expect(result.element).toContain('path');
      });
    });
  });
});

describe('buildSvg', () => {
  test('handles empty annotations', () => {
    const result = buildSvg([]);
    expect(result).toContain('<svg');
  });
  
  test('applies theme', () => {
    const annotations = [{ type: 'marker', x: 100, y: 100, number: 1 }];
    const result = buildSvg(annotations, { theme: 'tutorial' });
    expect(result).toContain('#43A047'); // green from tutorial theme
  });
  
  test('warns on unknown type', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    buildSvg([{ type: 'unknown', x: 100, y: 100 }]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Constants', () => {
  describe('COLORS', () => {
    test('all colors are valid hex format', () => {
      Object.values(COLORS).forEach(color => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('THEMES', () => {
    test('all themes exist', () => {
      expect(THEMES.documentation).toBeDefined();
      expect(THEMES.tutorial).toBeDefined();
      expect(THEMES.bugReport).toBeDefined();
      expect(THEMES.highlight).toBeDefined();
    });
    
    test('themes have consistent structure', () => {
      Object.values(THEMES).forEach(theme => {
        expect(theme.marker).toBeDefined();
        expect(theme.arrow).toBeDefined();
        expect(theme.label).toBeDefined();
        expect(theme.callout).toBeDefined();
      });
    });
  });
});
```

**Step 5: Create tests/__fixtures__ directory**

```bash
mkdir -p tests/__fixtures__
```

**Step 6: Create a sample test image**

Use a simple 1x1 pixel PNG or create one:

```bash
node -e "require('sharp')({create:{width:100,height:100,channels:4,background:{r:255,g:255,b:255,a:1}}}).png().toFile('tests/__fixtures__/sample.png')"
```

**Step 7: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 8: Commit**

```bash
git add jest.config.js package.json package-lock.json tests/
git commit -m "test: add Jest unit tests for annotate functions"
```

---

## Task 11: Final Verification

**Step 1: Run full test suite**

```bash
npm test
```

**Step 2: Verify CLI still works**

```bash
node annotate.js --help
```

**Step 3: Commit final changes**

```bash
git add .
git commit -m "chore: complete all code review fixes"
```

---

## Summary

| Task | Issue | Priority | Status |
|------|-------|----------|--------|
| 1 | README cross-platform paths | P0 | |
| 2 | CLI argument parsing (minimist) | P0 | |
| 3 | Custom error classes | P0 | |
| 4 | Global ID counter | P1 | |
| 5 | Font fallback lists | P1 | |
| 6 | Large image memory warning | P1 | |
| 7 | Unused width parameter | P2 | |
| 8 | Magic numbers constants | P2 | |
| 9 | Input validation | P2 | |
| 10 | Unit tests with Jest | - | |
| 11 | Final verification | - | |
