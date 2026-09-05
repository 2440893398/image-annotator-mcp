'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const { annotateImage } = require('../../src/annotate/runtime');
const { InvalidParameterError } = require('../../annotate-errors');

async function createTestPng(filePath, width = 200, height = 160) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } }
  }).png().toFile(filePath);
}

describe('crop option', () => {
  let tmpDir;
  let inputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-measure-'));
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

  test('crops the output canvas to the requested region', async () => {
    const out = path.join(tmpDir, 'cropped.png');
    const result = await annotateImage(inputPng, out, [
      { type: 'marker', x: 60, y: 40, number: 1 }
    ], { crop: { x: 50, y: 30, width: 100, height: 80 } });

    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(80);
  });

  test('annotation coordinates stay relative to the ORIGINAL image', async () => {
    const out = path.join(tmpDir, 'cropped.svg');
    await annotateImage(inputPng, out, [
      { type: 'marker', x: 60, y: 40, number: 1, shadow: false }
    ], { crop: { x: 50, y: 30, width: 100, height: 80 }, outputFormat: 'svg' });

    const svg = fs.readFileSync(out, 'utf8');
    // original (60,40) minus crop origin (50,30) -> (10,10)
    expect(svg).toContain('cx="10"');
    expect(svg).toContain('cy="10"');
  });

  test('crop is interpreted in CSS logical pixels under device_pixel_ratio', async () => {
    const out = path.join(tmpDir, 'cropped-dpr.png');
    const result = await annotateImage(inputPng, out, [
      { type: 'marker', x: 15, y: 15, number: 1 }
    ], { crop: { x: 10, y: 10, width: 50, height: 40 }, devicePixelRatio: 2 });

    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
  });

  test('crop combines with canvas_padding', async () => {
    const out = path.join(tmpDir, 'cropped-padded.png');
    const result = await annotateImage(inputPng, out, [
      { type: 'marker', x: 60, y: 40, number: 1 }
    ], { crop: { x: 50, y: 30, width: 100, height: 80 }, canvasPadding: 20 });

    expect(result.width).toBe(140);
    expect(result.height).toBe(120);
  });

  test('out-of-bounds crop region is rejected', async () => {
    const out = path.join(tmpDir, 'never.png');
    await expect(annotateImage(inputPng, out, [
      { type: 'marker', x: 10, y: 10, number: 1 }
    ], { crop: { x: 500, y: 500, width: 50, height: 50 } })).rejects.toThrow(InvalidParameterError);
  });

  test('oversized crop is clamped to the image instead of failing', async () => {
    const out = path.join(tmpDir, 'clamped.png');
    const result = await annotateImage(inputPng, out, [
      { type: 'marker', x: 10, y: 10, number: 1 }
    ], { crop: { x: 150, y: 100, width: 500, height: 500 } });
    expect(result.width).toBe(50);
    expect(result.height).toBe(60);
  });
});

describe('measure auto distance', () => {
  let tmpDir;
  let inputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-auto-'));
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

  test('omitted text becomes the measured distance in logical px', async () => {
    const out = path.join(tmpDir, 'measure.svg');
    const result = await annotateImage(inputPng, out, [
      { type: 'measure', from: [10, 20], to: [40, 60] }
    ], { outputFormat: 'svg', devicePixelRatio: 2 });

    // device distance = hypot(60, 80) = 100; /dpr 2 -> 50 px
    const svg = fs.readFileSync(out, 'utf8');
    expect(svg).toContain('50 px');
    expect(result.altText).toContain('50 px');
  });

  test('explicit text wins over the auto distance', async () => {
    const out = path.join(tmpDir, 'measure-explicit.svg');
    await annotateImage(inputPng, out, [
      { type: 'measure', from: [10, 20], to: [40, 60], text: '3.2 cm' }
    ], { outputFormat: 'svg' });

    const svg = fs.readFileSync(out, 'utf8');
    expect(svg).toContain('3.2 cm');
    expect(svg).not.toContain(' px<');
  });
});
