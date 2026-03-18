#!/usr/bin/env node

'use strict';

const launchConfigUI = require('../src/config-ui/launch');

if (require.main === module) {
  launchConfigUI.main().catch((err) => {
    process.stderr.write('Failed to start config UI: ' + err.message + '\n');
    process.exit(1);
  });
}

module.exports = launchConfigUI;
