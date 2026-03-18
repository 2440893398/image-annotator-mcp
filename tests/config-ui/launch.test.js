'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

describe('config-ui launcher CLI', () => {
  it('prints help and exits 0', () => {
    const launcher = path.join(__dirname, '..', '..', 'config-ui', 'launch.js');
    const result = spawnSync('node', [launcher, '--help'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--working-directory');
  });
});
