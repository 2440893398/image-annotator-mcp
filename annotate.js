#!/usr/bin/env node

'use strict';

const annotate = require('./src/annotate');

if (require.main === module) {
  annotate.main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = annotate;
