/**
 * Regression cover for the drop-shadow filter region.
 *
 * A filter region expressed in objectBoundingBox units collapses to nothing
 * when the element's box has zero width or height, and the renderer then drops
 * the element entirely. That made every perfectly horizontal or vertical arrow
 * and measure - the common case for both - vanish from raster output while the
 * SVG still looked correct, so these tests rasterize and inspect pixels rather
 * than asserting on markup.
 */
const sharp = require('sharp');
const { buildSvg } = require('../../src/annotate/render');

const SIZE = 200;

async function readPixels(svg) {
  const { data, info } = await sharp(Buffer.from(svg))
    .flatten({ background: '#FFFFFF' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
}

// True when the pixel is neither the white background nor a faint shadow
// smudge - i.e. actual stroke ink landed here.
function isInk([r, g, b]) {
  return Math.min(r, g, b) < 200;
}

// A few pixels either side of the ideal centre line, so the assertion does not
// hinge on rasterizer rounding.
async function hasInkNear(svg, x, y) {
  const at = await readPixels(svg);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (isInk(at(x + dx, y + dy))) return true;
    }
  }
  return false;
}

describe('axis-aligned strokes survive their drop shadow', () => {
  const cases = [
    ['horizontal arrow', { type: 'arrow', from: [20, 100], to: [180, 100], strokeWidth: 4 }, 100, 100],
    ['vertical arrow', { type: 'arrow', from: [100, 20], to: [100, 180], strokeWidth: 4 }, 100, 100],
    ['double-headed horizontal arrow', { type: 'arrow', from: [20, 100], to: [180, 100], strokeWidth: 4, heads: 'both' }, 100, 100],
    ['straight curved-arrow (curve: 0)', { type: 'curved-arrow', from: [20, 100], to: [180, 100], curve: 0, strokeWidth: 4 }, 100, 100],
    ['horizontal measure', { type: 'measure', from: [20, 40], to: [180, 40], strokeWidth: 3 }, 45, 40],
    ['vertical measure', { type: 'measure', from: [40, 20], to: [40, 180], strokeWidth: 3 }, 40, 45],
    ['collinear polyline', { type: 'polyline', points: [[20, 100], [100, 100], [180, 100]], strokeWidth: 4, shadow: true }, 100, 100]
  ];

  test.each(cases)('%s renders its stroke', async (_name, annotation, x, y) => {
    const svg = buildSvg(SIZE, SIZE, [annotation]);
    await expect(hasInkNear(svg, x, y)).resolves.toBe(true);
  });

  test('diagonal strokes still render (the case that never broke)', async () => {
    const svg = buildSvg(SIZE, SIZE, [{ type: 'arrow', from: [20, 20], to: [180, 180], strokeWidth: 4 }]);
    await expect(hasInkNear(svg, 100, 100)).resolves.toBe(true);
  });

  test('the filter region is user-space and non-degenerate for a flat shape', () => {
    const svg = buildSvg(SIZE, SIZE, [{ type: 'arrow', from: [20, 100], to: [180, 100] }]);
    const filter = svg.match(/<filter[^>]*-shadow"([^>]*)>/);
    expect(filter).not.toBeNull();
    expect(filter[1]).toContain('filterUnits="userSpaceOnUse"');
    const height = Number(filter[1].match(/height="([-\d.]+)"/)[1]);
    expect(height).toBeGreaterThan(0);
  });

  test('shapes with area keep the cheaper bounding-box region', () => {
    const svg = buildSvg(SIZE, SIZE, [{ type: 'callout', x: 100, y: 100, text: 'hi' }]);
    expect(svg).toContain('<filter id="callout-');
    expect(svg).not.toContain('filterUnits="userSpaceOnUse"');
  });
});
