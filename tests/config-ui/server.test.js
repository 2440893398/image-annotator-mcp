'use strict';

/**
 * Tests for config-ui/server.js Express endpoints.
 *
 * Uses Node's built-in http module (no supertest dependency).
 * The module starts listening on PORT (3456) when required;
 * we close the server in afterAll to free the port.
 */

const http = require('http');
const path = require('path');

// Use random port to avoid conflicts with other test suites
process.env.PORT = '0';

// Mock config-loader so we don't touch the filesystem
jest.mock('../../src/config-loader', () => ({
  loadConfig: jest.fn(() => ({
    version: '1.0',
    sizePreset: 'auto',
    theme: 'documentation'
  })),
  saveConfig: jest.fn((config, targetPath) => targetPath),
  DEFAULT_CONFIG: {
    version: '1.0',
    sizePreset: 'auto',
    theme: 'documentation',
    themes: null,
    defaultSizes: null
  }
}));

// Require the app AFTER mocking config-loader
const { app, server } = require('../../src/config-ui/server');
const configLoader = require('../../src/config-loader');

/**
 * Make an HTTP request to the running server.
 * @param {object} opts - { method, path, body }
 * @returns {Promise<{status: number, body: any}>}
 */
function request(opts) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = addr ? addr.port : 3456;
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;

    const reqOpts = {
      hostname: '127.0.0.1',
      port,
      path: opts.path,
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

afterAll((done) => {
  server.close(done);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/config', () => {
  it('returns JSON with version, sizePreset, and theme keys', async () => {
    const { status, body } = await request({ method: 'GET', path: '/api/config' });

    expect(status).toBe(200);
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('sizePreset');
    expect(body).toHaveProperty('theme');
  });

  it('calls loadConfig and returns its result', async () => {
    configLoader.loadConfig.mockReturnValueOnce({
      version: '1.0',
      sizePreset: 'l',
      theme: 'tutorial'
    });

    const { status, body } = await request({ method: 'GET', path: '/api/config' });

    expect(status).toBe(200);
    expect(configLoader.loadConfig).toHaveBeenCalled();
    expect(body.sizePreset).toBe('l');
    expect(body.theme).toBe('tutorial');
  });
});

describe('POST /api/config', () => {
  it('saves config when targetPath is allowed (cwd/.image-annotator.json)', async () => {
    const targetPath = path.join(process.cwd(), '.image-annotator.json');
    const { status, body } = await request({
      method: 'POST',
      path: '/api/config',
      body: { config: { theme: 'tutorial' }, targetPath }
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(configLoader.saveConfig).toHaveBeenCalledWith(
      { theme: 'tutorial' },
      targetPath
    );
  });

  it('returns 403 when targetPath is outside cwd', async () => {
    // Use a path that is definitely outside cwd
    const forbiddenPath = path.join(path.parse(process.cwd()).root, 'tmp', '.image-annotator.json');
    const { status, body } = await request({
      method: 'POST',
      path: '/api/config',
      body: { config: {}, targetPath: forbiddenPath }
    });

    expect(status).toBe(403);
    expect(body.error).toContain('Config can only be saved');
  });

  it('returns 403 when filename is not .image-annotator.json', async () => {
    const badFilename = path.join(process.cwd(), 'config.json');
    const { status, body } = await request({
      method: 'POST',
      path: '/api/config',
      body: { config: {}, targetPath: badFilename }
    });

    expect(status).toBe(403);
    expect(body.error).toContain('Config can only be saved');
  });

  it('returns 400 when targetPath is missing', async () => {
    const { status, body } = await request({
      method: 'POST',
      path: '/api/config',
      body: { config: { theme: 'tutorial' } }
    });

    expect(status).toBe(400);
    expect(body.error).toContain('targetPath');
  });
});
