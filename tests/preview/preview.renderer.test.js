const preview = require('../../src/preview/renderer');
const annotate = require('../../src/annotate/render');

const { SIZE_PRESETS, getSizePreset, createMarker } = preview;
const { SIZE_PRESETS: ANNOTATE_SIZE_PRESETS } = annotate;

const fontFamilyOf = (result) => (result.element.match(/font-family="([^"]*)"/) || [])[1];

describe('preview/renderer.js', () => {
  it('matches annotate.js size preset values', () => {
    expect(SIZE_PRESETS).toEqual(ANNOTATE_SIZE_PRESETS);
  });

  it('matches annotate.js theme defaults', () => {
    expect(preview.THEMES).toEqual(annotate.THEMES);
  });

  it('matches annotate.js color palette', () => {
    expect(preview.COLORS).toEqual(annotate.COLORS);
  });

  it('bumps tall images to a larger preset', () => {
    expect(getSizePreset(500, 5000)).toBe('m');
  });

  it('keeps width-only fallback behavior', () => {
    expect(getSizePreset(1000)).toBe('m');
  });

  it('uses the same multi-digit badge width as annotate.js', () => {
    const result = createMarker({ x: 50, y: 50, number: 12, size: 20, style: 'badge', shadow: false });
    expect(result.element).toContain('width="48"');
  });

  // The config UI is a WYSIWYG preview, so a font that renders differently here
  // than in the exported image makes the whole panel misleading.
  describe('font parity with annotate.js', () => {
    const cases = [
      ['label', 'createLabel', {}],
      ['label with explicit font', 'createLabel', { font: 'Inter' }],
      ['label with handwriting: true', 'createLabel', { handwriting: true }],
      ['label with handwriting: false', 'createLabel', { handwriting: false }],
      ['callout', 'createCallout', {}],
      ['callout with explicit font', 'createCallout', { font: 'JetBrains Mono' }],
      ['callout with handwriting: true', 'createCallout', { handwriting: true }]
    ];

    it.each(cases)('resolves the same font-family for a %s', (_label, fn, extra) => {
      const args = { x: 50, y: 50, text: 'sample', shadow: false, ...extra };
      expect(fontFamilyOf(preview[fn](args))).toBe(fontFamilyOf(annotate[fn](args)));
    });

    it('defaults to the clean font rather than the handwriting face', () => {
      expect(fontFamilyOf(preview.createLabel({ x: 1, y: 1, text: 'x' }))).toMatch(/^Segoe UI/);
      expect(fontFamilyOf(preview.createCallout({ x: 1, y: 1, text: 'x' }))).toMatch(/^Segoe UI/);
    });

    it('honours every theme font the same way annotate.js does', () => {
      // The sketch theme sets no explicit fonts (its text falls back to the
      // handwriting stack via the sketch flag), so only font-carrying themes
      // are asserted here.
      const themed = Object.entries(annotate.THEMES).filter(([, theme]) => theme.label && theme.label.font);
      expect(themed.length).toBeGreaterThanOrEqual(4);
      for (const [name, theme] of themed) {
        const args = { x: 50, y: 50, text: 'sample', shadow: false, font: theme.label.font };
        expect(fontFamilyOf(preview.createLabel(args))).toBe(theme.label.font);
        expect(fontFamilyOf(annotate.createLabel(args))).toBe(theme.label.font);
        expect(name).toBeTruthy();
      }
    });
  });

  describe('color handling parity with annotate.js', () => {
    it('resolves named and literal colors identically', () => {
      for (const color of ['primary', 'error', '#00FF00', 'rebeccapurple', 'rgba(1, 2, 3, 0.5)']) {
        expect(preview.getColor(color)).toBe(annotate.getColor(color));
      }
    });

    it('rejects values that would break out of the attribute', () => {
      const payload = '"><script>alert(1)</script><text fill="red';
      expect(preview.getColor(payload)).toBe(preview.COLORS.red);
      expect(preview.createRect({ x: 0, y: 0, width: 10, height: 10, color: payload }).element)
        .not.toContain('<script>');
    });
  });
});
