'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const CLI = path.join(__dirname, 'annotate.js');

async function createTestPng(filePath, width = 200, height = 200) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 128, b: 255 } }
  }).png().toFile(filePath);
}

describe('annotate.js CLI – dimensions command', () => {
  let tmpDir, inputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-commands-test-'));
    inputPng = path.join(tmpDir, 'input.png');
    await createTestPng(inputPng);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns JSON metadata with width, height, and format', () => {
    const result = spawnSync('node', [CLI, 'dimensions', inputPng], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(typeof json.width).toBe('number');
    expect(typeof json.height).toBe('number');
    expect(typeof json.format).toBe('string');
  });

  it('exits non-zero when image does not exist', () => {
    const result = spawnSync('node', [CLI, 'dimensions', '/nonexistent/path.png'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });

  it('exits non-zero when no path given', () => {
    const result = spawnSync('node', [CLI, 'dimensions'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });
});

describe('annotate.js CLI – reannotate command', () => {
  let tmpDir, inputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-reannotate-test-'));
    inputPng = path.join(tmpDir, 'input.png');
    await createTestPng(inputPng, 200, 200);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('remaps annotations to new screenshot dimensions', () => {
    const prevAnnotations = JSON.stringify([{"type":"marker","x":50,"y":50,"number":1}]);
    const result = spawnSync('node', [
      CLI, 'reannotate',
      '--new-screenshot', inputPng,
      '--previous-annotations', prevAnnotations,
      '--previous-width', '100',
      '--previous-height', '100'
    ], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty('remappedAnnotations');
    expect(json).toHaveProperty('newWidth');
    expect(json).toHaveProperty('newHeight');
    expect(json.remappedAnnotations[0].x).toBe(100); // 50 * (200/100)
  });

  it('exits non-zero when screenshot file does not exist', () => {
    const result = spawnSync('node', [
      CLI, 'reannotate',
      '--new-screenshot', path.join(tmpDir, 'missing.png'),
      '--previous-annotations', '[]',
      '--previous-width', '100',
      '--previous-height', '100'
    ], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('File not found');
  });

  it('exits non-zero when previous-annotations is malformed JSON', () => {
    const result = spawnSync('node', [
      CLI, 'reannotate',
      '--new-screenshot', inputPng,
      '--previous-annotations', '[{"x":',
      '--previous-width', '100',
      '--previous-height', '100'
    ], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });
});
