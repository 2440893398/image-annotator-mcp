const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILENAME = '.image-annotator.json';
const MAX_PARENT_SEARCH = 5;

const DEFAULT_CONFIG = {
  version: '1.0',
  sizePreset: 'auto',
  theme: 'documentation',
  themes: null,
  defaultSizes: null
};

function loadConfig(cwd = process.cwd()) {
  let configPath = path.join(cwd, CONFIG_FILENAME);
  if (fs.existsSync(configPath)) {
    return loadConfigFile(configPath);
  }

  let currentDir = path.resolve(cwd);
  for (let i = 1; i <= MAX_PARENT_SEARCH; i++) {
    currentDir = path.dirname(currentDir);
    configPath = path.join(currentDir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return loadConfigFile(configPath);
    }
  }

  const homeConfig = path.join(os.homedir(), CONFIG_FILENAME);
  if (fs.existsSync(homeConfig)) {
    return loadConfigFile(homeConfig);
  }

  return DEFAULT_CONFIG;
}

function loadConfigFile(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (e) {
    process.stderr.write(`[image-annotator] WARN: Failed to load config from ${configPath}: ${e.message}\n`);
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config, targetPath) {
  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(targetPath, content, 'utf-8');
  return targetPath;
}

module.exports = {
  loadConfig,
  saveConfig,
  DEFAULT_CONFIG,
  CONFIG_FILENAME
};
