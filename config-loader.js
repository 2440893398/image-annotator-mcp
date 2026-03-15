const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILENAME = '.image-annotator.json';
const MAX_PARENT_SEARCH = 5;

const DEFAULT_CONFIG = {
  version: '1.0',
  sizePreset: 'auto',
  theme: 'documentation',
  themes: null,  // null means use built-in THEMES
  defaultSizes: null  // optional overrides: { markerSize, strokeWidth, fontSize }
};

/**
 * Find and load config file with nearest-priority discovery
 * Also returns the path where config was found for reference
 */
function loadConfig(cwd = process.cwd()) {
  // 1. Check current directory
  let configPath = path.join(cwd, CONFIG_FILENAME);
  if (fs.existsSync(configPath)) {
    return loadConfigFile(configPath);
  }

  // 2. Search parent directories (max N levels) - use path.resolve for correct traversal
  let currentDir = path.resolve(cwd);
  for (let i = 1; i <= MAX_PARENT_SEARCH; i++) {
    currentDir = path.dirname(currentDir);
    configPath = path.join(currentDir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return loadConfigFile(configPath);
    }
  }

  // 3. Check home directory
  const homeConfig = path.join(os.homedir(), CONFIG_FILENAME);
  if (fs.existsSync(homeConfig)) {
    return loadConfigFile(homeConfig);
  }

  // 4. Return defaults
  return DEFAULT_CONFIG;
}

/**
 * Load and parse config file
 */
function loadConfigFile(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (e) {
    console.warn(`Warning: Failed to load config from ${configPath}: ${e.message}`);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save config to file
 */
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
