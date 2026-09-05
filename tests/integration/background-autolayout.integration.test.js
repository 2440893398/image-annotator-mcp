'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const { annotateImage, resolveCollisions, detectCollisions } = require('../../src/annotate/runtime');
const { InvalidParameterError } = require('../../annotate-errors');

async function createTestPng(filePath, width = 200, height = 160) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } }
  }).png().toFile(filePath);
}

async function pixelAt(filePath, x, y) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

describe('background export card', () => {
  let tmpDir;
  let inputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'background-card-'));
    inputPng = path.join(tmpDir, 'input.png');
    await createTestPng(inputPng);
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      if (!error || error.code !== 'EBUSY') throw error;
    }
  });

  test('adds default 48px padding and paints the canvas in the background color', async () => {
    const out = path.join(tmpDir, 'card.png');
    const result = await annotateImage(inputPng, out, [
      { type: 'marker', x: 100, y: 80, number: 1 }
    ], { background: { color: '#336699' } });

    expect(result.width).toBe(200 + 96);
    expect(result.height).toBe(160 + 96);
    const corner = await pixelAt(out, 2, 2);
    expect(corner).toEqual({ r: 0x33, g: 0x66, b: 0x99 });
    // center still shows the screenshot
    const center = await pixelAt(out, 148, 128);
    expect(center.r).toBeGreaterThan(100);
  });

  test('accepts a color string shorthand and stacks with canvas_padding', async () => {
    const out = path.join(tmpDir, 'card-stacked.png');
    const result = await annotateImage(inputPng, out, [
      { type: 'marker', x: 100, y: 80, number: 1 }
    ], { background: 'black', canvasPadding: 20 });

    expect(result.width).toBe(200 + 2 * (48 + 20));
    const corner = await pixelAt(out, 2, 2);
    expect(corner).toEqual({ r: 0x21, g: 0x21, b: 0x21 }); // preset "black" is #212121
  });

  test('gradient backgrounds vary across the canvas', async () => {
    const out = path.join(tmpDir, 'card-gradient.png');
    await annotateImage(inputPng, out, [
      { type: 'marker', x: 100, y: 80, number: 1 }
    ], { background: { gradient: { from: '#000000', to: '#ffffff', direction: 'to-right' }, shadow: false } });

    const left = await pixelAt(out, 2, 100);
    const right = await pixelAt(out, 293, 100);
    expect(right.r).toBeGreaterThan(left.r + 100);
  });

  test('rounded corners cut the screenshot but not the background', async () => {
    const out = path.join(tmpDir, 'card-rounded.png');
    await annotateImage(inputPng, out, [
      { type: 'marker', x: 100, y: 80, number: 1 }
    ], { background: { color: '#ff0000', imageCornerRadius: 24, shadow: false } });

    // The screenshot's top-left corner pixel (at 48,48) is inside the rounded
    // cut, so the background should show through there.
    const cardCorner = await pixelAt(out, 49, 49);
    expect(cardCorner.r).toBeGreaterThan(200);
    expect(cardCorner.g).toBeLessThan(60);
    // Just inside the rounded area the screenshot is intact.
    const inside = await pixelAt(out, 80, 80);
    expect(inside).toEqual({ r: 128, g: 128, b: 128 });
  });

  test('jpeg output flattens onto the background without errors', async () => {
    const out = path.join(tmpDir, 'card.jpg');
    const result = await annotateImage(inputPng, out, [
      { type: 'marker', x: 100, y: 80, number: 1 }
    ], { background: { color: 'purple' }, outputFormat: 'jpeg' });
    expect(result.outputPath.endsWith('.jpg')).toBe(true);
    expect(fs.existsSync(result.outputPath)).toBe(true);
  });

  test('background with svg output is rejected', async () => {
    const out = path.join(tmpDir, 'card.svg');
    await expect(annotateImage(inputPng, out, [
      { type: 'marker', x: 100, y: 80, number: 1 }
    ], { background: { color: 'red' }, outputFormat: 'svg' })).rejects.toThrow(InvalidParameterError);
  });

  test('invalid background configs are rejected', async () => {
    const out = path.join(tmpDir, 'never.png');
    await expect(annotateImage(inputPng, out, [], { background: {} })).rejects.toThrow(/color.*gradient|gradient.*color/i);
    await expect(annotateImage(inputPng, out, [], { background: { color: 'red', gradient: { from: 'a', to: 'b' } } })).rejects.toThrow(InvalidParameterError);
  });
});

describe('auto layout', () => {
  const overlappingLeadouts = () => [
    { type: 'leadout', target: [200, 150], anchor: [280, 150], text: 'first', fontSize: 16 },
    { type: 'rect', x: 240, y: 120, width: 100, height: 60 }
  ];

  test('resolveCollisions mirrors a leadout anchor into free space', () => {
    const { annotations, warnings } = resolveCollisions(overlappingLeadouts(), 'm', 400, 300);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('auto-layout');
    expect(annotations[0].anchor).toEqual([120, 150]);
    expect(detectCollisions(annotations, 'm')).toHaveLength(0);
  });

  test('resolveCollisions flips a callout pointer', () => {
    const input = [
      { type: 'callout', x: 200, y: 150, text: 'hello', pointer: 'bottom' },
      { type: 'rect', x: 150, y: 40, width: 100, height: 80 }
    ];
    const { annotations, warnings } = resolveCollisions(input, 'm', 400, 300);
    expect(warnings).toHaveLength(1);
    expect(annotations[0].pointer).toBe('top');
  });

  test('unsolvable overlaps stay put', () => {
    const input = [
      { type: 'leadout', target: [200, 150], anchor: [280, 150], text: 'first', fontSize: 16 },
      // giant rect covering the whole canvas - nowhere to go
      { type: 'rect', x: 0, y: 0, width: 400, height: 300 }
    ];
    const { annotations, warnings } = resolveCollisions(input, 'm', 400, 300);
    expect(warnings).toHaveLength(0);
    expect(annotations[0].anchor).toEqual([280, 150]);
  });

  describe('through annotateImage', () => {
    let tmpDir;
    let inputPng;

    beforeAll(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-layout-'));
      inputPng = path.join(tmpDir, 'input.png');
      await createTestPng(inputPng, 400, 300);
    });

    afterAll(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (error) {
        if (!error || error.code !== 'EBUSY') throw error;
      }
    });

    test('opt-in resolves overlaps and reports the move', async () => {
      const out = path.join(tmpDir, 'resolved.png');
      const result = await annotateImage(inputPng, out, overlappingLeadouts(), { autoLayout: true });
      expect(result.warnings.some((w) => w.type === 'auto-layout')).toBe(true);
      expect(result.warnings.some((w) => w.type === 'overlap')).toBe(false);
    });

    test('without opt-in the overlap stays and a hint is emitted', async () => {
      const out = path.join(tmpDir, 'hinted.png');
      const result = await annotateImage(inputPng, out, overlappingLeadouts(), {});
      expect(result.warnings.some((w) => w.type === 'overlap')).toBe(true);
      expect(result.warnings.some((w) => w.type === 'hint' && /auto_layout/.test(w.message))).toBe(true);
    });
  });
});
