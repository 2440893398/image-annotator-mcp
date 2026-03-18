'use strict';

/**
 * TDD tests for annotate.js CLI annotate parity.
 * Tests the CLI subprocess behavior for backward-compatible annotate flow
 * with new flags: --output-format, --quality, --device-pixel-ratio,
 * --canvas-padding, --redact-patterns.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const CLI = path.join(__dirname, '..', '..', 'annotate.js');

/**
 * Create a small solid-color PNG for testing.
 * @param {string} filePath - Destination path
 * @param {number} width
 * @param {number} height
 */
async function createTestPng(filePath, width = 100, height = 100) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
    .png()
    .toFile(filePath);
}

describe('annotate.js CLI – annotate parity', () => {
  let tmpDir;
  let inputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotate-cli-test-'));
    inputPng = path.join(tmpDir, 'input.png');
    await createTestPng(inputPng);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── --help ────────────────────────────────────────────────────────────────

  describe('--help flag', () => {
    it('exits 0 and prints usage', () => {
      const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Usage:/);
    });

    it('documents --output-format flag', () => {
      const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/--output-format/);
    });

    it('documents --quality flag', () => {
      const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/--quality/);
    });

    it('documents --device-pixel-ratio flag', () => {
      const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/--device-pixel-ratio/);
    });

    it('documents --canvas-padding flag', () => {
      const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/--canvas-padding/);
    });

    it('documents --redact-patterns flag', () => {
      const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/--redact-patterns/);
    });
  });

  // ─── Positional annotate (backward compat) ─────────────────────────────────

  describe('positional annotate mode (backward compat)', () => {
    it('exits 0 with basic marker annotation', () => {
      const outputPng = path.join(tmpDir, 'out-basic.png');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      const result = spawnSync(
        'node',
        [CLI, inputPng, outputPng, '--annotations', annotations],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Annotated image saved:/);
      expect(result.stdout).toMatch(/Annotations: 1/);
    });

    it('creates the output file', () => {
      const outputPng = path.join(tmpDir, 'out-created.png');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      spawnSync('node', [CLI, inputPng, outputPng, '--annotations', annotations], {
        encoding: 'utf8'
      });
      expect(fs.existsSync(outputPng)).toBe(true);
    });
  });

  // ─── New parity flags ──────────────────────────────────────────────────────

  describe('--output-format flag', () => {
    it('exits 0 when --output-format webp is passed', () => {
      const outputWebp = path.join(tmpDir, 'out-format.webp');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      const result = spawnSync(
        'node',
        [CLI, inputPng, outputWebp, '--annotations', annotations, '--output-format', 'webp'],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Annotated image saved:/);
    });

    it('creates a webp output file when --output-format webp is passed', () => {
      const outputWebp = path.join(tmpDir, 'out-format2.webp');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      spawnSync(
        'node',
        [CLI, inputPng, outputWebp, '--annotations', annotations, '--output-format', 'webp'],
        { encoding: 'utf8' }
      );
      expect(fs.existsSync(outputWebp)).toBe(true);
    });
  });

  describe('--quality flag', () => {
    it('exits 0 when --quality 75 is passed', () => {
      const outputWebp = path.join(tmpDir, 'out-quality.webp');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      const result = spawnSync(
        'node',
        [
          CLI,
          inputPng,
          outputWebp,
          '--annotations',
          annotations,
          '--output-format',
          'webp',
          '--quality',
          '75'
        ],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
    });
  });

  describe('--device-pixel-ratio flag', () => {
    it('exits 0 when --device-pixel-ratio 2 is passed', () => {
      const outputPng = path.join(tmpDir, 'out-dpr.png');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      const result = spawnSync(
        'node',
        [CLI, inputPng, outputPng, '--annotations', annotations, '--device-pixel-ratio', '2'],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
    });
  });

  describe('--canvas-padding flag', () => {
    it('exits 0 when --canvas-padding 20 is passed', () => {
      const outputPng = path.join(tmpDir, 'out-padding.png');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      const result = spawnSync(
        'node',
        [CLI, inputPng, outputPng, '--annotations', annotations, '--canvas-padding', '20'],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
    });
  });

  describe('--theme flag (existing, parity check)', () => {
    it('exits 0 when --theme documentation is passed', () => {
      const outputPng = path.join(tmpDir, 'out-theme.png');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      const result = spawnSync(
        'node',
        [CLI, inputPng, outputPng, '--annotations', annotations, '--theme', 'documentation'],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
    });
  });

  describe('combined parity flags', () => {
    it('exits 0 with --output-format webp --quality 75 --device-pixel-ratio 2 --theme documentation', () => {
      const outputWebp = path.join(tmpDir, 'out-combined.webp');
      const annotations = JSON.stringify([{ type: 'marker', x: 10, y: 10, number: 1 }]);
      const result = spawnSync(
        'node',
        [
          CLI,
          inputPng,
          outputWebp,
          '--annotations',
          annotations,
          '--output-format',
          'webp',
          '--quality',
          '75',
          '--device-pixel-ratio',
          '2',
          '--theme',
          'documentation'
        ],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Annotated image saved:/);
      expect(result.stdout).toMatch(/Annotations: 1/);
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('exits non-zero when --annotations JSON is malformed', () => {
      const outputPng = path.join(tmpDir, 'out-error.png');
      const result = spawnSync(
        'node',
        [CLI, inputPng, outputPng, '--annotations', 'NOT_VALID_JSON'],
        { encoding: 'utf8' }
      );
      expect(result.status).not.toBe(0);
    });

    it('prints "Error parsing annotations JSON" to stderr on malformed JSON', () => {
      const outputPng = path.join(tmpDir, 'out-error2.png');
      const result = spawnSync(
        'node',
        [CLI, inputPng, outputPng, '--annotations', 'NOT_VALID_JSON'],
        { encoding: 'utf8' }
      );
      expect(result.stderr).toMatch(/Error parsing annotations JSON/);
    });

    it('exits non-zero when input and output paths are missing', () => {
      const result = spawnSync('node', [CLI, '--annotations', '[]'], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
    });

    it('exits non-zero when --annotations is missing', () => {
      const outputPng = path.join(tmpDir, 'out-no-ann.png');
      const result = spawnSync('node', [CLI, inputPng, outputPng], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
    });
  });

  // ─── --redact-patterns flag ────────────────────────────────────────────────

  describe('--redact-patterns flag', () => {
    it('exits 0 when --redact-patterns is a valid JSON array string', () => {
      const outputPng = path.join(tmpDir, 'out-redact.png');
      const annotations = JSON.stringify([
        { type: 'label', x: 10, y: 10, text: 'secret info' }
      ]);
      const result = spawnSync(
        'node',
        [
          CLI,
          inputPng,
          outputPng,
          '--annotations',
          annotations,
          '--redact-patterns',
          '["secret"]'
        ],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
    });
  });
});
