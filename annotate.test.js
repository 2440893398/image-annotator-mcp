const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  annotateImage,
  buildSvg,
  getImageDimensions,
  COLORS,
  THEMES,
  normalizeOutputFormat,
  resolveOutputPathForFormat,
  getDefaultQuality,
  scaleAnnotationCoords,
  normalizeCanvasPadding,
  offsetAnnotationCoords,
  generateAltText,
  getSizePreset,
  clampAnnotations,
  optimizeSvg,
  setIdGenerator,
  resetIdGenerator,
  validateAnnotation,
  validateAnnotations,
  validateImagePath,
  ValidationError
} = require('./annotate');

describe('annotate.js', () => {
  beforeEach(() => {
    let counter = 0;
    setIdGenerator((prefix) => `${prefix}-${String(counter++).padStart(4, '0')}`);
  });

  afterEach(() => {
    resetIdGenerator();
  });

  describe('COLORS', () => {
    it('should have primary color defined', () => {
      expect(COLORS.primary).toBeDefined();
    });

    it('should have error color defined', () => {
      expect(COLORS.error).toBeDefined();
    });
  });

  describe('THEMES', () => {
    it('should have documentation theme', () => {
      expect(THEMES.documentation).toBeDefined();
    });

    it('should have tutorial theme', () => {
      expect(THEMES.tutorial).toBeDefined();
    });
  });

  describe('buildSvg', () => {
    it('should build valid SVG with width and height', () => {
      const svg = buildSvg(100, 100, []);
      expect(svg).toContain('width="100"');
      expect(svg).toContain('height="100"');
    });

    it('should include SVG namespace', () => {
      const svg = buildSvg(100, 100, []);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('should render a marker annotation', () => {
      const svg = buildSvg(200, 200, [{ type: 'marker', x: 50, y: 50, number: 1 }]);
      expect(svg).toContain('<circle');
      expect(svg).toContain('>1</text>');
    });

    it('should render an arrow annotation', () => {
      const svg = buildSvg(200, 200, [{ type: 'arrow', from: [10, 10], to: [100, 100] }]);
      expect(svg).toContain('<line');
      expect(svg).toContain('marker-end');
    });

    it('should render a label annotation', () => {
      const svg = buildSvg(200, 200, [{ type: 'label', x: 10, y: 20, text: 'Test Label' }]);
      expect(svg).toContain('Test Label');
    });

    it('should render a callout annotation', () => {
      const svg = buildSvg(200, 200, [{ type: 'callout', x: 50, y: 50, text: 'Callout' }]);
      expect(svg).toContain('Callout');
      expect(svg).toContain('<rect');
    });

    it('should apply theme defaults', () => {
      const svg = buildSvg(200, 200, [{ type: 'marker', x: 50, y: 50, number: 1 }], { theme: 'tutorial' });
      // Tutorial theme uses green color (#43A047)
      expect(svg).toContain('#43A047');
    });

    it('should skip unknown annotation types without crashing', () => {
      const svg = buildSvg(200, 200, [{ type: 'nonexistent', x: 10, y: 10 }]);
      expect(svg).toContain('width="200"');
    });

    it('should escape XML special characters in text', () => {
      const svg = buildSvg(200, 200, [{ type: 'label', x: 10, y: 20, text: '<script>alert("xss")</script>' }]);
      expect(svg).toContain('&lt;script&gt;');
      expect(svg).not.toContain('<script>');
    });

    it('matches snapshots for all supported annotation types', () => {
      const fixtures = {
        marker: [{ type: 'marker', x: 50, y: 50, number: 1 }],
        arrow: [{ type: 'arrow', from: [10, 10], to: [100, 100] }],
        curvedArrow: [{ type: 'curved-arrow', from: [10, 10], to: [100, 100], curve: 40 }],
        callout: [{ type: 'callout', x: 60, y: 60, text: 'Callout', pointer: 'bottom' }],
        rect: [{ type: 'rect', x: 20, y: 20, width: 80, height: 50 }],
        circle: [{ type: 'circle', x: 60, y: 60, radius: 30 }],
        label: [{ type: 'label', x: 20, y: 40, text: 'Label' }],
        highlight: [{ type: 'highlight', x: 15, y: 15, width: 90, height: 40, opacity: 0.35 }],
        blur: [{ type: 'blur', x: 15, y: 15, width: 90, height: 40 }],
        connector: [{ type: 'connector', from: [20, 20], to: [120, 70] }],
        icon: [{ type: 'icon', x: 50, y: 50, icon: 'check' }]
      };

      Object.entries(fixtures).forEach(([name, annotations]) => {
        expect(buildSvg(200, 200, annotations)).toMatchSnapshot(name);
      });
    });
  });

  describe('validateAnnotation', () => {
    it('should accept valid marker annotation', () => {
      expect(() => validateAnnotation({
        type: 'marker',
        x: 10,
        y: 20
      })).not.toThrow();
    });

    it('should accept valid label annotation', () => {
      expect(() => validateAnnotation({
        type: 'label',
        text: 'Hello',
        x: 10,
        y: 20
      })).not.toThrow();
    });

    it('should reject annotation without type', () => {
      expect(() => validateAnnotation({ x: 10, y: 20 }))
        .toThrow(ValidationError);
    });

    it('should reject non-object annotation', () => {
      expect(() => validateAnnotation(null))
        .toThrow(ValidationError);
    });

    it('should reject marker without coordinates', () => {
      expect(() => validateAnnotation({ type: 'marker' }))
        .toThrow(ValidationError);
    });

    it('should accept valid arrow annotation with from/to', () => {
      expect(() => validateAnnotation({
        type: 'arrow',
        from: [0, 0],
        to: [100, 100]
      })).not.toThrow();
    });

    it('should reject arrow without from/to arrays', () => {
      expect(() => validateAnnotation({ type: 'arrow', x: 10, y: 20 }))
        .toThrow(ValidationError);
    });

    it('should reject connector without from/to arrays', () => {
      expect(() => validateAnnotation({ type: 'connector' }))
        .toThrow(ValidationError);
    });

    it('should accept valid curved-arrow annotation', () => {
      expect(() => validateAnnotation({
        type: 'curved-arrow',
        from: [0, 0],
        to: [100, 100]
      })).not.toThrow();
    });
  });

  describe('validateAnnotations', () => {
    it('should accept empty array', () => {
      expect(() => validateAnnotations([])).not.toThrow();
    });

    it('should accept valid annotations array', () => {
      expect(() => validateAnnotations([
        { type: 'marker', x: 10, y: 20 },
        { type: 'label', text: 'Test', x: 30, y: 40 }
      ])).not.toThrow();
    });

    it('should reject non-array', () => {
      expect(() => validateAnnotations('not an array'))
        .toThrow(ValidationError);
    });
  });

  describe('validateImagePath', () => {
    it('should accept non-empty string', () => {
      expect(() => validateImagePath('test.png')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateImagePath(''))
        .toThrow(ValidationError);
    });

    it('should reject non-string', () => {
      expect(() => validateImagePath(123))
        .toThrow(ValidationError);
    });
  });

  describe('getSizePreset', () => {
    it('returns l for a standard 1920x1080 image', () => {
      expect(getSizePreset(1920, 1080)).toBe('l');
    });

    it('bumps tall narrow images up by one preset', () => {
      expect(getSizePreset(500, 5000)).toBe('m');
    });

    it('bumps very wide images down by one preset', () => {
      expect(getSizePreset(3000, 200)).toBe('l');
    });

    it('returns s for a 400x400 image', () => {
      expect(getSizePreset(400, 400)).toBe('s');
    });

    it('preserves backward compatibility when height is undefined', () => {
      expect(getSizePreset(1000)).toBe('m');
    });
  });

  describe('clampAnnotations', () => {
    it('clamps out-of-bounds x/y coordinates and reports warnings', () => {
      const result = clampAnnotations([
        { type: 'marker', x: 2000, y: 1500, number: 1 }
      ], 1920, 1080);

      expect(result.annotations[0].x).toBe(1920);
      expect(result.annotations[0].y).toBe(1080);
      expect(result.warnings).toEqual([
        { annotation: 0, property: 'x', original: 2000, clamped: 1920 },
        { annotation: 0, property: 'y', original: 1500, clamped: 1080 }
      ]);
    });

    it('clamps negative coordinates to zero', () => {
      const result = clampAnnotations([
        { type: 'marker', x: -50, y: -100, number: 1 }
      ], 1920, 1080);

      expect(result.annotations[0].x).toBe(0);
      expect(result.annotations[0].y).toBe(0);
      expect(result.warnings).toHaveLength(2);
    });

    it('handles NaN and null by clamping to minimum values', () => {
      const result = clampAnnotations([
        { type: 'marker', x: Number.NaN, y: null, number: 1 }
      ], 1920, 1080);

      expect(result.annotations[0].x).toBe(0);
      expect(result.annotations[0].y).toBe(0);
    });

    it('does not emit warnings for valid coordinates', () => {
      const result = clampAnnotations([
        { type: 'marker', x: 100, y: 100, number: 1 }
      ], 1920, 1080);

      expect(result.warnings).toEqual([]);
    });

    it('clamps only out-of-bounds arrow endpoints', () => {
      const result = clampAnnotations([
        { type: 'arrow', from: [0, 0], to: [3000, 3000] }
      ], 1920, 1080);

      expect(result.annotations[0].from).toEqual([0, 0]);
      expect(result.annotations[0].to).toEqual([1920, 1080]);
      expect(result.warnings).toEqual([
        { annotation: 0, property: 'to[0]', original: 3000, clamped: 1920 },
        { annotation: 0, property: 'to[1]', original: 3000, clamped: 1080 }
      ]);
    });
  });

  describe('optimizeSvg', () => {
    it('reduces svg size for a multi-annotation overlay', () => {
      const svg = buildSvg(300, 300, [
        { type: 'marker', x: 40, y: 40, number: 1 },
        { type: 'marker', x: 100, y: 40, number: 2 },
        { type: 'arrow', from: [20, 20], to: [160, 160] },
        { type: 'label', x: 80, y: 120, text: 'Example label' },
        { type: 'callout', x: 160, y: 180, text: 'Callout' }
      ]);

      const optimized = optimizeSvg(svg);
      expect(optimized.length).toBeLessThan(svg.length);
    });

    it('preserves defs id references used by gradients and filters', () => {
      const svg = buildSvg(200, 200, [{ type: 'marker', x: 50, y: 50, number: 1 }]);
      const optimized = optimizeSvg(svg);

      expect(optimized).toContain('url(#marker-0000-gradient)');
      expect(optimized).toContain('id="marker-0000-gradient"');
      expect(optimized).toContain('url(#marker-0000-shadow)');
      expect(optimized).toContain('id="marker-0000-shadow"');
    });

    it('falls back to original value when optimization input is invalid', () => {
      expect(optimizeSvg(null)).toBeNull();
    });
  });

  describe('output format helpers', () => {
    it('defaults to png when no format or extension is provided', () => {
      expect(normalizeOutputFormat('output', null)).toBe('png');
    });

    it('normalizes extension based output format detection', () => {
      expect(normalizeOutputFormat('output.webp', null)).toBe('webp');
      expect(normalizeOutputFormat('output.jpeg', null)).toBe('jpeg');
    });

    it('rewrites conflicting extensions to the requested format', () => {
      expect(resolveOutputPathForFormat('result.png', 'webp')).toBe('result.webp');
      expect(resolveOutputPathForFormat('result', 'avif')).toBe('result.avif');
    });

    it('returns sensible quality defaults', () => {
      expect(getDefaultQuality('webp')).toBe(80);
      expect(getDefaultQuality('jpeg')).toBe(80);
      expect(getDefaultQuality('avif')).toBe(50);
      expect(getDefaultQuality('png')).toBeUndefined();
    });

    it('detects svg format from .svg extension', () => {
      expect(normalizeOutputFormat('output.svg', null)).toBe('svg');
    });

    it('rewrites extension to .svg when format is svg', () => {
      expect(resolveOutputPathForFormat('result.png', 'svg')).toBe('result.svg');
      expect(resolveOutputPathForFormat('result', 'svg')).toBe('result.svg');
    });

    it('writes explicit webp output with corrected extension', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotate-webp-'));
      const inputPath = path.join(tempDir, 'input.png');
      const requestedOutput = path.join(tempDir, 'result.png');

      await fs.promises.copyFile(path.join(__dirname, '__fixtures__', 'test-100x100.png'), inputPath);
      const result = await annotateImage(inputPath, requestedOutput, [{ type: 'marker', x: 50, y: 50, number: 1 }], {
        outputFormat: 'webp'
      });

      expect(result.outputPath.endsWith('.webp')).toBe(true);
      expect(fs.existsSync(result.outputPath)).toBe(true);

      const metadata = await getImageDimensions(result.outputPath);
      expect(metadata.format).toBe('webp');
    }, 15000);
  });

  describe('scaleAnnotationCoords', () => {
    it('doubles positional coordinates but preserves display properties', () => {
      const scaled = scaleAnnotationCoords({ type: 'marker', x: 100, y: 200, number: 1, fontSize: 18, strokeWidth: 5, size: 24 }, 2);

      expect(scaled.x).toBe(200);
      expect(scaled.y).toBe(400);
      expect(scaled.fontSize).toBe(18);
      expect(scaled.strokeWidth).toBe(5);
      expect(scaled.size).toBe(24);
    });

    it('leaves coordinates unchanged when dpr is 1', () => {
      const annotation = { type: 'marker', x: 100, y: 200, number: 1 };
      expect(scaleAnnotationCoords(annotation, 1)).toEqual(annotation);
    });

    it('scales arrow endpoints correctly', () => {
      const scaled = scaleAnnotationCoords({ type: 'arrow', from: [100, 200], to: [300, 400] }, 2);
      expect(scaled.from).toEqual([200, 400]);
      expect(scaled.to).toEqual([600, 800]);
    });

    it('scales before clamping when combined with clampAnnotations', () => {
      const scaled = scaleAnnotationCoords({ type: 'marker', x: 1000, y: 500, number: 1 }, 2);
      const result = clampAnnotations([scaled], 1920, 1080);

      expect(result.annotations[0].x).toBe(1920);
      expect(result.annotations[0].y).toBe(1000);
      expect(result.warnings).toContainEqual({ annotation: 0, property: 'x', original: 2000, clamped: 1920 });
    });
  });

  describe('canvas padding helpers', () => {
    it('normalizes numeric padding to all four sides', () => {
      expect(normalizeCanvasPadding(50)).toEqual({ top: 50, right: 50, bottom: 50, left: 50 });
    });

    it('normalizes object padding and fills missing sides with zero', () => {
      expect(normalizeCanvasPadding({ top: 100, left: 25 })).toEqual({ top: 100, right: 0, bottom: 0, left: 25 });
    });

    it('offsets marker coordinates by left and top padding', () => {
      const shifted = offsetAnnotationCoords({ type: 'marker', x: 0, y: 0, number: 1 }, 50, 75);
      expect(shifted.x).toBe(50);
      expect(shifted.y).toBe(75);
    });

    it('offsets arrow endpoints by left and top padding', () => {
      const shifted = offsetAnnotationCoords({ type: 'arrow', from: [0, 0], to: [10, 10] }, 50, 75);
      expect(shifted.from).toEqual([50, 75]);
      expect(shifted.to).toEqual([60, 85]);
    });

    it('extends output dimensions when canvas padding is applied', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotate-padding-'));
      const inputPath = path.join(tempDir, 'input.png');
      const outputPath = path.join(tempDir, 'output.png');

      await fs.promises.copyFile(path.join(__dirname, '__fixtures__', 'test-100x100.png'), inputPath);
      const result = await annotateImage(inputPath, outputPath, [{ type: 'marker', x: 50, y: 50, number: 1 }], {
        canvasPadding: 50
      });

      expect(result.width).toBe(200);
      expect(result.height).toBe(200);

      const metadata = await getImageDimensions(result.outputPath);
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(200);
    }, 15000);
  });

  describe('generateAltText', () => {
    it('describes mixed annotation sets with text details', () => {
      const altText = generateAltText([
        { type: 'marker', x: 100, y: 100, number: 1 },
        { type: 'arrow', from: [0, 0], to: [100, 100] },
        { type: 'callout', x: 50, y: 50, text: 'Click here' }
      ], 1920, 1080, { theme: 'documentation' });

      expect(altText).toContain('Annotated image (1920x1080');
      expect(altText).toContain('theme documentation');
      expect(altText).toContain('1 marker');
      expect(altText).toContain('1 arrow');
      expect(altText).toContain('callout "Click here"');
    });

    it('returns a generic description for empty annotations', () => {
      expect(generateAltText([], 1920, 1080)).toBe('Image (1920x1080) with no annotations');
    });
  });

  describe('svg output format', () => {
    async function createTempPng(dir, name = 'input.png') {
      const sharp = require('sharp');
      const filePath = path.join(dir, name);
      await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } }
      }).png().toFile(filePath);
      return filePath;
    }

    it('produces a valid SVG file without requiring sharp compositing', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotate-svg-'));
      const inputPath = await createTempPng(tempDir);
      const outputPath = path.join(tempDir, 'output.svg');

      const result = await annotateImage(inputPath, outputPath, [
        { type: 'marker', x: 50, y: 50, number: 1 },
        { type: 'label', x: 10, y: 10, text: 'SVG test' }
      ], { outputFormat: 'svg' });

      expect(result.outputFormat).toBe('svg');
      expect(result.outputPath.endsWith('.svg')).toBe(true);
      expect(fs.existsSync(result.outputPath)).toBe(true);

      const content = fs.readFileSync(result.outputPath, 'utf8');
      expect(content).toContain('<svg');
      expect(content).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(result.size).toBeGreaterThan(0);
    }, 15000);

    it('auto-corrects extension to .svg when output_format is svg', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotate-svg-ext-'));
      const inputPath = await createTempPng(tempDir);
      const outputPath = path.join(tempDir, 'output.png');

      const result = await annotateImage(inputPath, outputPath, [
        { type: 'marker', x: 50, y: 50, number: 1 }
      ], { outputFormat: 'svg' });

      expect(result.outputPath.endsWith('.svg')).toBe(true);
      expect(fs.existsSync(result.outputPath)).toBe(true);
    }, 15000);
  });

  describe('integration', () => {
    it('combines dpr, canvas padding, webp output, svgo, and coordinate clamping', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotate-integration-'));
      const inputPath = path.join(tempDir, 'input.png');
      const outputPath = path.join(tempDir, 'output.png');

      await fs.promises.copyFile(path.join(__dirname, '__fixtures__', 'test-100x100.png'), inputPath);
      const result = await annotateImage(inputPath, outputPath, [
        { type: 'marker', x: 100, y: 40, number: 1 },
        { type: 'label', x: 10, y: 10, text: 'Integration' }
      ], {
        outputFormat: 'webp',
        devicePixelRatio: 2,
        canvasPadding: 50
      });

      expect(result.outputPath.endsWith('.webp')).toBe(true);
      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
      expect(result.warnings.length).toBeGreaterThan(0);

      const metadata = await getImageDimensions(result.outputPath);
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(200);
    }, 15000);
  });
});
