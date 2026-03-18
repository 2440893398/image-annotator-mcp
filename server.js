#!/usr/bin/env node

'use strict';

const serverModule = require('./src/server');

if (require.main === module) {
  serverModule.main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

module.exports = serverModule;
