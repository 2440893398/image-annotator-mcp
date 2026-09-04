const express = require('express');
const path = require('path');
const { loadConfig, saveConfig } = require('../config-loader');

const app = express();

// The UI is served from this same origin, so no cross-origin access is needed.
// Wide-open CORS here would let any page the user has open POST to /api/config
// and rewrite their project's annotation settings.
const allowedOrigins = new Set();

app.use((req, res, next) => {
  const origin = req.get('origin');
  // Non-browser clients (the CLI, tests, curl) send no Origin header. Browsers
  // always send one on cross-origin requests, so only those need checking.
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
  }
  res.set('Vary', 'Origin');
  return next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'config-ui', 'public')));

// The preview adapter builds on the same renderer the CLI/MCP path uses, so
// both files are served and the page loads render.js first.
const BROWSER_MODULES = {
  '/annotate/render.js': path.join(__dirname, '..', 'annotate', 'render.js'),
  '/preview/renderer.js': path.join(__dirname, '..', 'preview', 'renderer.js')
};

for (const [route, filePath] of Object.entries(BROWSER_MODULES)) {
  app.get(route, (req, res) => {
    res.sendFile(filePath, { headers: { 'Content-Type': 'application/javascript' } });
  });
}

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json(config);
});

/**
 * True when `target` sits inside `parent`. A plain startsWith would also accept
 * siblings that merely share a prefix (C:\proj matching C:\proj-evil), so the
 * comparison goes through path.relative to keep the separator boundary.
 */
function isInsideDirectory(parent, target) {
  const relative = path.relative(parent, target);
  if (!relative) return false;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

app.post('/api/config', (req, res) => {
  const { config, targetPath } = req.body;

  if (!targetPath) {
    return res.status(400).json({ error: 'targetPath is required' });
  }

  const resolved = path.resolve(targetPath);
  if (!isInsideDirectory(process.cwd(), resolved) || path.basename(resolved) !== '.image-annotator.json') {
    return res.status(403).json({ error: 'Config can only be saved as .image-annotator.json within the working directory' });
  }

  try {
    const savedPath = saveConfig(config, resolved);
    res.json({ success: true, savedTo: savedPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3456;
// Loopback only: the config UI writes to disk and has no authentication, so it
// must never be reachable from the network.
const server = app.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address();
  for (const host of ['localhost', '127.0.0.1']) {
    allowedOrigins.add(`http://${host}:${port}`);
  }
  console.log(`Config UI server running at http://localhost:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Config UI port ${PORT} is already in use. Set PORT to a free port and retry.`);
  } else {
    console.error(`Config UI server error: ${error.message}`);
  }
});

module.exports = { app, server };
