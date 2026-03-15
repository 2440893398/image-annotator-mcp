const {
  annotateImage,
  buildSvg,
  getImageDimensions,
  COLORS,
  THEMES,
  validateAnnotation,
  validateAnnotations,
  validateImagePath,
  ValidationError
} = require('./annotate');

describe('annotate.js', () => {
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
});
