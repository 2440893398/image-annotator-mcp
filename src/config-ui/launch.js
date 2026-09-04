#!/usr/bin/env node

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_PORT = 3456;

/**
 * Launch the config UI server as a child process.
 *
 * @param {string|undefined} workingDir - Absolute path to use as cwd for the server.
 *   If omitted or not absolute, defaults to process.cwd().
 * @param {number|undefined} port - Port for the server. Defaults to 3456.
 * @returns {Promise<string>} Resolves with the URL when the server is ready.
 */
function launchConfigUI(workingDir, port) {
  const cwd = workingDir && path.isAbsolute(workingDir) ? workingDir : process.cwd();
  const serverScript = path.join(__dirname, 'server.js');
  const requestedPort = Number.isInteger(port) && port >= 0 && port <= 65535 ? String(port) : null;

  const child = spawn('node', [serverScript], {
    cwd,
    stdio: 'pipe',
    env: requestedPort ? { ...process.env, PORT: requestedPort } : process.env
  });

  return new Promise((resolve, reject) => {
    let resolved = false;

    child.stdout.on('data', (data) => {
      const output = data.toString();
      const urlMatch = output.match(/http:\/\/localhost:(\d+)/);
      if (urlMatch && !resolved) {
        resolved = true;
        resolve({ url: urlMatch[0], process: child });
      }
    });

    child.stderr.on('data', (data) => {
      process.stderr.write('Config server error: ' + data.toString());
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Config server exited with code ${code} before becoming ready`));
      }
    });

    // Fallback after 3 seconds
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ url: `http://localhost:${requestedPort || DEFAULT_PORT}`, process: child });
      }
    }, 3000);
    // Do not keep the event loop alive just for the fallback.
    if (typeof fallbackTimer.unref === 'function') fallbackTimer.unref();
  });
}

async function main() {
  const minimist = require('minimist');
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'h'],
    alias: { h: 'help' }
  });

  if (argv.help) {
    process.stdout.write(
      'Config UI Launcher\n\n' +
      'Usage: node config-ui/launch.js [--working-directory <path>]\n\n' +
      'Options:\n' +
      '  --working-directory  Absolute project/workspace path for .image-annotator.json\n' +
      '  --help, -h           Show this help message\n'
    );
    return;
  }

  const workingDir = argv['working-directory'] || undefined;
  const port = argv.port != null ? Number(argv.port) : undefined;

  try {
    const { url } = await launchConfigUI(workingDir, port);
    process.stdout.write(url + '\n');
  } catch (err) {
    process.stderr.write('Failed to start config UI: ' + err.message + '\n');
    process.exit(1);
  }
}

module.exports = launchConfigUI;
module.exports.main = main;

if (require.main === module) {
  main();
}
