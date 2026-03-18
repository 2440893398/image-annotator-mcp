const { SIZE_PRESETS, getSizePreset, createMarker } = require('./preview/renderer');
const { SIZE_PRESETS: ANNOTATE_SIZE_PRESETS } = require('./annotate');

describe('preview/renderer.js', () => {
  it('matches annotate.js size preset values', () => {
    expect(SIZE_PRESETS).toEqual(ANNOTATE_SIZE_PRESETS);
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
});
