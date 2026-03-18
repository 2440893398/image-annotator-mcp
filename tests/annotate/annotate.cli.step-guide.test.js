'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const CLI = path.join(__dirname, '..', '..', 'annotate.js');

async function createTestPng(filePath, width = 300, height = 300) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } }
  }).png().toFile(filePath);
}

describe('annotate.js CLI – step-guide command', () => {
  let tmpDir, inputPng, outputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-stepguide-test-'));
    inputPng = path.join(tmpDir, 'input.png');
    outputPng = path.join(tmpDir, 'output.png');
    await createTestPng(inputPng);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a guide image and exits 0', () => {
    const steps = JSON.stringify([{ x: 50, y: 50, label: 'Open settings' }]);
    const result = spawnSync('node', [
      CLI, 'step-guide', inputPng, outputPng,
      '--steps', steps,
      '--theme', 'documentation'
    ], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Step guide created:');
    expect(result.stdout).toContain('Steps: 1');
    expect(fs.existsSync(outputPng)).toBe(true);
  });

  it('exits non-zero with JSON error for malformed --steps', () => {
    const result = spawnSync('node', [
      CLI, 'step-guide', inputPng, outputPng,
      '--steps', '[{"x":10'
    ], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Error parsing steps JSON/);
  });

  it('exits non-zero when --steps is missing', () => {
    const result = spawnSync('node', [CLI, 'step-guide', inputPng, outputPng], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });

  it('exits non-zero when input or output path is missing', () => {
    const result = spawnSync('node', [CLI, 'step-guide'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });
});
