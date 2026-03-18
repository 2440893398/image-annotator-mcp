const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadConfig, saveConfig } = require('../config-loader');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'config-ui', 'public')));

app.get('/preview/renderer.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'preview', 'renderer.js'), {
    headers: { 'Content-Type': 'application/javascript' }
  });
});

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json(config);
});

app.post('/api/config', (req, res) => {
  const { config, targetPath } = req.body;

  if (!targetPath) {
    return res.status(400).json({ error: 'targetPath is required' });
  }

  const resolved = path.resolve(targetPath);
  const cwd = process.cwd();
  const resolvedNorm = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const cwdNorm = process.platform === 'win32' ? cwd.toLowerCase() : cwd;
  if (!resolvedNorm.startsWith(cwdNorm) || path.basename(resolved) !== '.image-annotator.json') {
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
const server = app.listen(PORT, () => {
  console.log(`Config UI server running at http://localhost:${PORT}`);
});

module.exports = { app, server };
