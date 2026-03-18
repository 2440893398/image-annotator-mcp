'use strict';

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const { handleAnnotate, handleDimensions, handleStepGuide } = require('./server');

const CLI = path.join(__dirname, 'annotate.js');
const README = path.join(__dirname, 'README.md');

async function createTestPng(filePath, width = 220, height = 180) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 }
    }
  }).png().toFile(filePath);
}

function parseJsonOutput(stdoutText) {
  return JSON.parse(stdoutText.trim());
}

async function getRenderedFingerprint(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    hash
  };
}

function parseReadmeDocumentedSubcommands(readmeText) {
  const matches = [...readmeText.matchAll(/node annotate\.js\s+([^\s\\]+)/g)];
  return [...new Set(matches
    .map((match) => match[1])
    .filter((token) => !token.includes('.') && token !== '<input>' && token !== 'input.png'))];
}

describe('Hybrid Integration - Cross-mode Regression', () => {
  let tmpDir;
  let inputPng;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hybrid-integration-'));
    inputPng = path.join(tmpDir, 'input.png');
    await createTestPng(inputPng);
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      if (!error || error.code !== 'EBUSY') {
        throw error;
      }
    }
  });

  describe('Annotate parity', () => {
    it('MCP and CLI route equivalent annotate options into equivalent rendered output', async () => {
      const annotations = [{ type: 'label', x: 40, y: 40, text: 'secret token' }];
      const mcpOutput = path.join(tmpDir, 'mcp-annotate.webp');
      const cliOutput = path.join(tmpDir, 'cli-annotate.webp');

      await handleAnnotate({
        input_path: inputPng,
        output_path: mcpOutput,
        annotations,
        theme: 'documentation',
        output_format: 'webp',
        quality: 60,
        device_pixel_ratio: 2,
        canvas_padding: 12,
        redact_patterns: ['secret']
      });

      const cli = spawnSync('node', [
        CLI,
        inputPng,
        cliOutput,
        '--annotations',
        JSON.stringify(annotations),
        '--theme',
        'documentation',
        '--output-format',
        'webp',
        '--quality',
        '60',
        '--device-pixel-ratio',
        '2',
        '--canvas-padding',
        '12',
        '--redact-patterns',
        '["secret"]'
      ], { encoding: 'utf8' });

      expect(cli.status).toBe(0);
      expect(fs.existsSync(mcpOutput)).toBe(true);
      expect(fs.existsSync(cliOutput)).toBe(true);

      const mcpMeta = await sharp(mcpOutput).metadata();
      const cliMeta = await sharp(cliOutput).metadata();
      expect(mcpMeta.format).toBe('webp');
      expect(cliMeta.format).toBe('webp');

      const mcpFingerprint = await getRenderedFingerprint(mcpOutput);
      const cliFingerprint = await getRenderedFingerprint(cliOutput);
      expect(cliFingerprint.width).toBe(mcpFingerprint.width);
      expect(cliFingerprint.height).toBe(mcpFingerprint.height);
      expect(cliFingerprint.hash).toBe(mcpFingerprint.hash);
    });
  });

  describe('Dimensions parity', () => {
    it('MCP handler and CLI dimensions command return equivalent shape and values', async () => {
      const mcpResult = await handleDimensions({ image_path: inputPng });
      const mcpDims = parseJsonOutput(mcpResult.content[0].text);

      const cliResult = spawnSync('node', [CLI, 'dimensions', inputPng], { encoding: 'utf8' });
      expect(cliResult.status).toBe(0);
      const cliDims = parseJsonOutput(cliResult.stdout);

      expect(cliDims).toEqual({
        width: mcpDims.width,
        height: mcpDims.height,
        format: mcpDims.format
      });
    });
  });

  describe('Step-guide parity', () => {
    it('MCP and CLI produce equivalent DPR-aware step-guide output', async () => {
      const steps = [
        { x: 40, y: 60, label: 'First' },
        { x: 120, y: 100, label: 'Second' }
      ];

      const mcpGuide = path.join(tmpDir, 'mcp-guide.png');
      const cliGuide = path.join(tmpDir, 'cli-guide.png');

      await handleStepGuide({
        input_path: inputPng,
        output_path: mcpGuide,
        steps,
        connect_steps: true,
        theme: 'documentation',
        device_pixel_ratio: 2
      });

      const cli = spawnSync('node', [
        CLI,
        'step-guide',
        inputPng,
        cliGuide,
        '--steps',
        JSON.stringify(steps),
        '--connect-steps',
        'true',
        '--theme',
        'documentation',
        '--device-pixel-ratio',
        '2'
      ], { encoding: 'utf8' });

      expect(cli.status).toBe(0);
      expect(fs.existsSync(mcpGuide)).toBe(true);
      expect(fs.existsSync(cliGuide)).toBe(true);

      const mcpFingerprint = await getRenderedFingerprint(mcpGuide);
      const cliFingerprint = await getRenderedFingerprint(cliGuide);
      expect(cliFingerprint.width).toBe(mcpFingerprint.width);
      expect(cliFingerprint.height).toBe(mcpFingerprint.height);
      expect(cliFingerprint.hash).toBe(mcpFingerprint.hash);
    });
  });

  describe('Config UI launch wiring', () => {
    it('MCP open_config_ui handler forwards working_directory to launchConfigUI', async () => {
      jest.resetModules();
      const launchMock = jest.fn().mockResolvedValue({
        url: 'http://localhost:4567',
        process: { on: jest.fn() }
      });

      jest.doMock('./config-ui/launch', () => launchMock);

      const childProcess = require('child_process');
      const spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => ({
        unref: jest.fn(),
        on: jest.fn()
      }));

      const serverWithMocks = require('./server');
      const workingDir = path.join(tmpDir, 'workspace');
      fs.mkdirSync(workingDir, { recursive: true });
      const result = await serverWithMocks.handleOpenConfigUi({ working_directory: workingDir });

      expect(launchMock).toHaveBeenCalledWith(workingDir);
      expect(result.content[0].text).toContain('http://localhost:4567');
      expect(result.content[0].text).toContain('.image-annotator.json');

      spawnSpy.mockRestore();
      jest.dontMock('./config-ui/launch');
      jest.resetModules();
    });

    it('config-ui launcher CLI wiring passes --working-directory into spawned cwd', async () => {
      jest.resetModules();
      const spawnMock = jest.fn(() => {
        const stdoutHandlers = [];
        const child = {
          stdout: { on: (event, handler) => { if (event === 'data') stdoutHandlers.push(handler); } },
          stderr: { on: () => {} },
          on: () => {}
        };
        process.nextTick(() => {
          stdoutHandlers.forEach((handler) => {
            handler(Buffer.from('http://localhost:3456\n'));
          });
        });
        return child;
      });

      jest.doMock('child_process', () => ({ spawn: spawnMock }));
      const launchConfigUI = require('./config-ui/launch');

      const workingDir = path.join(tmpDir, 'config-cli-workdir');
      fs.mkdirSync(workingDir, { recursive: true });
      const launchResult = await launchConfigUI(workingDir);

      expect(launchResult.url).toBe('http://localhost:3456');
      expect(spawnMock).toHaveBeenCalledWith(
        'node',
        [path.join(__dirname, 'config-ui', 'server.js')],
        expect.objectContaining({ cwd: workingDir, stdio: 'pipe' })
      );

      jest.dontMock('child_process');
      jest.resetModules();
    });
  });

  describe('Docs-vs-help drift', () => {
    it('every documented annotate.js subcommand in README appears in --help output', () => {
      const helpResult = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(helpResult.status).toBe(0);
      const helpText = helpResult.stdout;

      const readmeText = fs.readFileSync(README, 'utf8');
      const documentedSubcommands = parseReadmeDocumentedSubcommands(readmeText);

      expect(documentedSubcommands.length).toBeGreaterThan(0);
      documentedSubcommands.forEach((subcommand) => {
        expect(helpText).toContain(subcommand);
      });

      expect(helpText).toContain('--output-format');
      expect(helpText).toContain('--device-pixel-ratio');
      expect(helpText).toContain('--quality');
    });
  });
});
