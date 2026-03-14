const {
  annotateImage,
  buildSvg,
  getImageDimensions,
  COLORS,
  THEMES,
  validateAnnotation,
  validateAnnotations,
  validateImagePath,
  ValidationError,
  FileNotFoundError
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
