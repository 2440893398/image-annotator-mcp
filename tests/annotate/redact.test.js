/**
 * Pixel-level verification of redaction.
 *
 * Everything here reads pixels via raw().toBuffer() — sharp's stats() reports
 * on the *input* image and silently ignores a chained extract(), which is
 * exactly the trap that made the original blur look like it worked.
 *
 * All assertions run on png output; lossy formats would fail std===0 without
 * indicating a leak (the content is already replaced before encoding).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const { annotateImage } = require('../../annotate');
const { InvalidParameterError, ValidationError } = require('../../annotate-errors');

const FILL = { r: 0x64, g: 0x74, b: 0x8B }; // #64748B, the solid default

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-pixel-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let fileCounter = 0;
function tmpPath(name) {
  return path.join(tmpDir, `${fileCounter++}-${name}`);
}

// High-contrast 2px horizontal stripes simulating a line of text. `phase`
// shifts the stripes so two images have different "content" in the same spot.
async function makeStripedImage(filePath, width, height, phase = 0) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const value = ((y + phase) % 4) < 2 ? 0 : 255;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
  await sharp(data, { raw: { width, height, channels: 3 } }).png().toFile(filePath);
  return filePath;
}

async function readRaw(filePath) {
  // ensureAlpha keeps every buffer at 4 channels: composited outputs gain an
  // alpha channel while the raw fixtures have none, and comparing buffers
  // with different strides silently compares the wrong pixels.
  return sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function* regionPixels(data, info, { left, top, width, height }) {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      const i = (y * info.width + x) * info.channels;
      yield { x, y, r: data[i], g: data[i + 1], b: data[i + 2] };
    }
  }
}

function expectRegionSolid(data, info, region, fill = FILL) {
  for (const p of regionPixels(data, info, region)) {
    if (p.r !== fill.r || p.g !== fill.g || p.b !== fill.b) {
      throw new Error(`pixel (${p.x},${p.y}) = rgb(${p.r},${p.g},${p.b}), expected rgb(${fill.r},${fill.g},${fill.b})`);
    }
  }
}

function regionMae(a, b, info, region) {
  let sum = 0;
  let count = 0;
  for (let y = region.top; y < region.top + region.height; y++) {
    for (let x = region.left; x < region.left + region.width; x++) {
      const i = (y * info.width + x) * info.channels;
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(a[i + c] - b[i + c]);
        count++;
      }
    }
  }
  return sum / count;
}

describe('solid redaction (pixel level)', () => {
  // Boxes 12/16/20px tall are where the old blur failed hardest: the whole
  // rectangle was semi-transparent and content stayed 100% readable.
  it.each([12, 16, 20, 60])('fills a %ipx-tall region with pure fill colour (std === 0)', async (boxHeight) => {
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');
    const region = { left: 40, top: 48, width: 120, height: boxHeight };

    await annotateImage(input, output, [
      { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height }
    ], {});

    const { data, info } = await readRaw(output);
    expectRegionSolid(data, info, region);
  }, 20000);

  it('keeps sharp edges: pixels just outside the box match the original image', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');
    const region = { left: 40, top: 48, width: 120, height: 16 };

    await annotateImage(input, output, [
      { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height }
    ], {});

    const original = await readRaw(input);
    const annotated = await readRaw(output);
    const ring = [
      { left: region.left - 2, top: region.top - 2, width: region.width + 4, height: 2 }, // above
      { left: region.left - 2, top: region.top + region.height, width: region.width + 4, height: 2 }, // below
      { left: region.left - 2, top: region.top, width: 2, height: region.height }, // left
      { left: region.left + region.width, top: region.top, width: 2, height: region.height } // right
    ];
    for (const strip of ring) {
      expect(regionMae(annotated.data, original.data, annotated.info, strip)).toBe(0);
    }
  }, 20000);

  it('anti-restoration: two images differing only in content are identical inside the box (MAE === 0)', async () => {
    const region = { left: 40, top: 48, width: 120, height: 16 };
    const annotation = { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height };

    const inputA = await makeStripedImage(tmpPath('a.png'), 240, 160, 0);
    const inputB = await makeStripedImage(tmpPath('b.png'), 240, 160, 2);
    const outputA = tmpPath('a-out.png');
    const outputB = tmpPath('b-out.png');
    await annotateImage(inputA, outputA, [annotation], {});
    await annotateImage(inputB, outputB, [annotation], {});

    const a = await readRaw(outputA);
    const b = await readRaw(outputB);
    expect(regionMae(a.data, b.data, a.info, region)).toBe(0);
  }, 20000);

  it('paints above other annotations regardless of array order', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');
    const region = { left: 20, top: 20, width: 200, height: 100 };

    // The redact comes FIRST in the array: only the structural top-layer
    // partition keeps it above the label. Relying on array order would let a
    // later annotation draw sensitive text on top of the redaction.
    await annotateImage(input, output, [
      { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height },
      { type: 'label', x: 60, y: 80, text: 'PEEK', color: 'red', background: 'white' }
    ], {});

    const { data, info } = await readRaw(output);
    expectRegionSolid(data, info, region);
  }, 20000);

  it('honours a custom fill colour', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');
    const region = { left: 40, top: 40, width: 100, height: 40 };

    await annotateImage(input, output, [
      { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height, color: '#ff0000' }
    ], {});

    const { data, info } = await readRaw(output);
    expectRegionSolid(data, info, region, { r: 255, g: 0, b: 0 });
  }, 20000);

  it('lands correctly under devicePixelRatio and canvasPadding', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');
    // CSS-pixel annotation; device region = css * dpr, then offset by padding.
    const dpr = 2;
    const padding = { top: 20, right: 0, bottom: 0, left: 30 };
    const css = { x: 20, y: 24, width: 60, height: 8 };
    const region = {
      left: css.x * dpr + padding.left,
      top: css.y * dpr + padding.top,
      width: css.width * dpr,
      height: css.height * dpr
    };

    await annotateImage(input, output, [
      { type: 'redact', x: css.x, y: css.y, width: css.width, height: css.height }
    ], { devicePixelRatio: dpr, canvasPadding: padding });

    const { data, info } = await readRaw(output);
    expect(info.width).toBe(240 + 30);
    expect(info.height).toBe(160 + 20);
    expectRegionSolid(data, info, region);

    // The stripe rows just below the box must still be the original content
    // (shifted by the padding), proving the box did not smear or misalign.
    const original = await readRaw(input);
    let mismatched = 0;
    for (const p of regionPixels(data, info, { left: region.left, top: region.top + region.height + 1, width: region.width, height: 4 })) {
      const srcY = p.y - padding.top;
      const srcX = p.x - padding.left;
      const i = (srcY * original.info.width + srcX) * original.info.channels;
      if (p.r !== original.data[i]) mismatched++;
    }
    expect(mismatched).toBe(0);
  }, 20000);
});

describe('redact_patterns end to end', () => {
  it('produces bit-identical output for equal-length secrets (full-image MAE === 0)', async () => {
    // Same layout, different sensitive text: after redaction nothing anywhere
    // in the image may depend on the secret. This is the feature's original
    // promise — the matched annotation text must be unrecoverable.
    const input = await makeStripedImage(tmpPath('in.png'), 320, 200);
    const outputA = tmpPath('a-out.png');
    const outputB = tmpPath('b-out.png');

    const annotate = (text, output) => annotateImage(input, output, [
      { type: 'label', x: 60, y: 80, text, background: 'white' }
    ], { redactPatterns: ['PIN'] });

    await annotate('PIN 1234', outputA);
    await annotate('PIN 9876', outputB);

    const a = await readRaw(outputA);
    const b = await readRaw(outputB);
    expect(regionMae(a.data, b.data, a.info, { left: 0, top: 0, width: a.info.width, height: a.info.height })).toBe(0);
  }, 20000);
});

describe('pixelate/blur de-emphasis', () => {
  it('is explicitly reversible (MAE > 0) and flagged with a warning', async () => {
    const region = { left: 40, top: 40, width: 120, height: 40 };
    const annotation = { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height, mode: 'blur', intensity: 12 };

    const inputA = await makeStripedImage(tmpPath('a.png'), 240, 160, 0);
    const inputB = await makeStripedImage(tmpPath('b.png'), 240, 160, 2);
    const outputA = tmpPath('a-out.png');
    const outputB = tmpPath('b-out.png');
    const resultA = await annotateImage(inputA, outputA, [annotation], {});
    await annotateImage(inputB, outputB, [annotation], {});

    // Reversible: the de-emphasised region still distinguishes the contents.
    const a = await readRaw(outputA);
    const b = await readRaw(outputB);
    expect(regionMae(a.data, b.data, a.info, region)).toBeGreaterThan(0);

    // And the caller is told so, every time.
    const redactionWarnings = resultA.warnings.filter((w) => w.type === 'redaction');
    expect(redactionWarnings.length).toBe(1);
    expect(redactionWarnings[0].message).toContain('reversible');
  }, 20000);

  it('pixelate actually alters the region and warns', async () => {
    const region = { left: 40, top: 40, width: 120, height: 40 };
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');

    const result = await annotateImage(input, output, [
      { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height, mode: 'pixelate', blockSize: 8 }
    ], {});

    const original = await readRaw(input);
    const annotated = await readRaw(output);
    expect(regionMae(annotated.data, original.data, annotated.info, region)).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.type === 'redaction' && w.message.includes('pixelate'))).toBe(true);
  }, 20000);

  it('legacy blur type behaves as redact mode blur and changes the base image', async () => {
    const region = { left: 40, top: 40, width: 120, height: 16 };
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');

    const result = await annotateImage(input, output, [
      { type: 'blur', x: region.left, y: region.top, width: region.width, height: region.height }
    ], {});

    const original = await readRaw(input);
    const annotated = await readRaw(output);
    // The old implementation left stripes readable through a translucent grey
    // wash; real blur flattens them, so extremes must be gone from the region.
    let extremes = 0;
    for (const p of regionPixels(annotated.data, annotated.info, region)) {
      if (p.r < 10 || p.r > 245) extremes++;
    }
    expect(extremes).toBe(0);
    expect(regionMae(annotated.data, original.data, annotated.info, region)).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.type === 'redaction')).toBe(true);
  }, 20000);

  it('draws annotations above de-emphasised regions', async () => {
    const region = { left: 20, top: 20, width: 200, height: 120 };
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.png');

    await annotateImage(input, output, [
      { type: 'redact', x: region.left, y: region.top, width: region.width, height: region.height, mode: 'pixelate' },
      { type: 'marker', x: 120, y: 80, number: 1, color: 'red', shadow: false }
    ], {});

    // The marker (red) must be visible on top of the greyscale pixelated area.
    const { data, info } = await readRaw(output);
    let redPixels = 0;
    for (const p of regionPixels(data, info, { left: 100, top: 60, width: 40, height: 40 })) {
      if (p.r > 150 && p.g < 100 && p.b < 100) redPixels++;
    }
    expect(redPixels).toBeGreaterThan(50);
  }, 20000);
});

describe('magnifier and redaction', () => {
  // Any greyscale extreme inside the magnifier circle would be original stripe
  // content leaking through. Fill colour, ring, connector and shadow all live
  // safely between those extremes.
  function countExtremesInCircle(data, info, cx, cy, r) {
    let extremes = 0;
    for (const p of regionPixels(data, info, { left: cx - r, top: cy - r, width: r * 2, height: r * 2 })) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy > (r - 3) * (r - 3)) continue;
      const grey = p.r === p.g && p.g === p.b;
      if (grey && (p.r < 10 || p.r > 245)) extremes++;
    }
    return extremes;
  }

  it('samples redacted pixels: a magnifier aimed at a solid redaction shows only fill', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 320, 200);
    const output = tmpPath('out.png');

    await annotateImage(input, output, [
      { type: 'redact', x: 40, y: 60, width: 100, height: 60 },
      { type: 'magnifier', target: [90, 90], anchor: [250, 60], radius: 30, zoom: 2, shadow: false }
    ], {});

    const { data, info } = await readRaw(output);
    expect(countExtremesInCircle(data, info, 250, 60, 30)).toBe(0);
  }, 20000);

  it('keeps sampling correct with DPR and canvasPadding combined', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 320, 200);
    const output = tmpPath('out.png');
    const dpr = 2;
    const padding = { top: 20, right: 0, bottom: 0, left: 30 };

    // CSS coordinates; device positions = css * dpr + padding offset.
    await annotateImage(input, output, [
      { type: 'redact', x: 20, y: 30, width: 50, height: 30 },
      { type: 'magnifier', target: [45, 45], anchor: [125, 30], radius: 15, zoom: 2, shadow: false }
    ], { devicePixelRatio: dpr, canvasPadding: padding });

    const { data, info } = await readRaw(output);
    const anchorX = 125 * dpr + padding.left;
    const anchorY = 30 * dpr + padding.top;
    // radius is scaled by dpr too (scaleAnnotationCoords covers radius).
    expect(countExtremesInCircle(data, info, anchorX, anchorY, 15 * dpr)).toBe(0);
  }, 20000);

  it('without redaction the magnifier still shows original content (sanity check)', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 320, 200);
    const output = tmpPath('out.png');

    await annotateImage(input, output, [
      { type: 'magnifier', target: [90, 90], anchor: [250, 60], radius: 30, zoom: 2, shadow: false }
    ], {});

    const { data, info } = await readRaw(output);
    expect(countExtremesInCircle(data, info, 250, 60, 30)).toBeGreaterThan(0);
  }, 20000);
});

describe('svg output', () => {
  it('warns for hand-placed redactions and renders solid as a top-layer rect', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.svg');

    const result = await annotateImage(input, output, [
      { type: 'marker', x: 60, y: 60, number: 1 },
      { type: 'redact', x: 40, y: 40, width: 100, height: 40 }
    ], { outputFormat: 'svg' });

    const svgWarnings = result.warnings.filter((w) => w.type === 'redaction');
    expect(svgWarnings.some((w) => w.message.includes('svg'))).toBe(true);

    const svgContent = fs.readFileSync(result.outputPath, 'utf8');
    expect(svgContent).toContain('shape-rendering="crispEdges"');
    // Top layer: the redact rect markup appears after the marker markup.
    expect(svgContent.indexOf('crispEdges')).toBeGreaterThan(svgContent.indexOf('marker'));
  }, 20000);

  it('emits no element for pixelate/blur in svg output but still warns', async () => {
    const input = await makeStripedImage(tmpPath('in.png'), 240, 160);
    const output = tmpPath('out.svg');

    const result = await annotateImage(input, output, [
      { type: 'redact', x: 40, y: 40, width: 100, height: 40, mode: 'pixelate' }
    ], { outputFormat: 'svg' });

    const svgContent = fs.readFileSync(result.outputPath, 'utf8');
    expect(svgContent).not.toContain('hatch');
    expect(result.warnings.filter((w) => w.type === 'redaction').length).toBeGreaterThanOrEqual(2);
  }, 20000);
});

describe('strict validation', () => {
  let input;
  beforeAll(async () => {
    input = await makeStripedImage(tmpPath('in.png'), 240, 160);
  });

  it('rejects redact without width/height', async () => {
    await expect(annotateImage(input, tmpPath('out.png'), [
      { type: 'redact', x: 10, y: 10 }
    ], {})).rejects.toThrow(ValidationError);
  });

  it('rejects legacy blur without width/height (breaking change, was 100x60 default)', async () => {
    await expect(annotateImage(input, tmpPath('out.png'), [
      { type: 'blur', x: 10, y: 10 }
    ], {})).rejects.toThrow(ValidationError);
  });

  it('rejects a redact region whose size is NaN (dropped by clamping)', async () => {
    await expect(annotateImage(input, tmpPath('out.png'), [
      { type: 'redact', x: 10, y: 10, width: NaN, height: 20 }
    ], {})).rejects.toThrow(InvalidParameterError);
  });

  it('rejects a redact region clamped to zero size at the canvas edge', async () => {
    await expect(annotateImage(input, tmpPath('out.png'), [
      { type: 'redact', x: 240, y: 10, width: 50, height: 20 }
    ], {})).rejects.toThrow(InvalidParameterError);
  });

  it('accepts a partially out-of-bounds region and clamps it', async () => {
    const output = tmpPath('out.png');
    await annotateImage(input, output, [
      { type: 'redact', x: 200, y: 10, width: 500, height: 20 }
    ], {});

    const { data, info } = await readRaw(output);
    expectRegionSolid(data, info, { left: 200, top: 10, width: 40, height: 20 });
  }, 20000);
});

describe('metadata stripping (regression lock)', () => {
  it('does not carry exif/icc/xmp into the annotated output', async () => {
    // sharp strips metadata unless withMetadata() is called. This test exists
    // so that anyone adding withMetadata() (e.g. to keep colour profiles)
    // notices they would resurrect EXIF alongside it.
    const input = tmpPath('in.jpg');
    await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 200, b: 200 } }
    })
      .withExif({ IFD0: { Copyright: 'sensitive-owner', Artist: 'sensitive-artist' } })
      .jpeg()
      .toFile(input);

    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.exif).toBeDefined();

    const output = tmpPath('out.png');
    await annotateImage(input, output, [
      { type: 'redact', x: 10, y: 10, width: 50, height: 20 }
    ], {});

    const outputMeta = await sharp(output).metadata();
    expect(outputMeta.exif).toBeUndefined();
    expect(outputMeta.icc).toBeUndefined();
    expect(outputMeta.xmp).toBeUndefined();
  }, 20000);
});
