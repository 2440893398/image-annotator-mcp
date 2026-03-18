const path = require('path');
const launchConfigUI = require('../config-ui/launch');

let configServerProcess = null;

function openBrowser(url) {
  const { spawn } = require('child_process');
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
  } catch (error) {
    // Best effort only: failing to open a browser should not fail the tool.
  }
}

async function startConfigServer(workingDir) {
  if (configServerProcess) {
    try {
      configServerProcess.kill();
    } catch (error) {
      // Ignore cleanup errors for already-exited processes.
    }
    configServerProcess = null;
  }

  const { url, process: child } = await launchConfigUI(workingDir);
  configServerProcess = child;
  child.on('exit', () => {
    configServerProcess = null;
  });

  openBrowser(url);
  return url;
}

function cleanupConfigServer() {
  if (configServerProcess) {
    try {
      configServerProcess.kill();
    } catch (error) {
      // Ignore cleanup errors for already-exited processes.
    }
    configServerProcess = null;
  }
}

async function handleOpenConfigUi(args) {
  try {
    const workingDir = args.working_directory || undefined;
    const url = await startConfigServer(workingDir);
    const saveHint = workingDir
      ? `Config will be saved to: ${path.join(workingDir, '.image-annotator.json')}`
      : 'Config will be saved to .image-annotator.json in the MCP server directory (pass working_directory to save to your project instead).';
    return {
      content: [{
        type: 'text',
        text: `Configuration UI opened.\n\nURL: ${url}\n\n${saveHint}\n\nSubsequent annotate_screenshot calls will use this config when the image is under that directory.`
      }]
    };
  } catch (error) {
    throw new Error(`Failed to start config UI: ${error.message}`);
  }
}

module.exports = {
  openBrowser,
  startConfigServer,
  cleanupConfigServer,
  handleOpenConfigUi
};
