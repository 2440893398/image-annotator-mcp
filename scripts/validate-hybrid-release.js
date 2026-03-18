#!/usr/bin/env node
'use strict';

/**
 * Hybrid Release Smoke Validator
 * Validates that all hybrid distribution entry points are present and functional.
 * Run: node scripts/validate-hybrid-release.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed += 1;
  } else {
    console.log(`  FAIL: ${name} - ${detail || 'condition not met'}`);
    failed += 1;
  }
}

function runNodeScript(relativePath, args) {
  const result = spawnSync('node', [path.join(ROOT, relativePath), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    timedOut: result.signal === 'SIGTERM' || result.signal === 'SIGKILL',
  };
}

function gatherPackedFiles() {
  const packResult = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    shell: process.platform === 'win32',
  });

  if (packResult.status !== 0) {
    return { ok: false, files: [], error: (packResult.stderr || '').trim() || 'npm pack failed' };
  }

  const stdout = (packResult.stdout || '').trim();
  if (!stdout) {
    return { ok: false, files: [], error: 'npm pack produced empty output' };
  }

  try {
    const parsed = JSON.parse(stdout);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const fileSet = new Set();

    for (const entry of entries) {
      const files = Array.isArray(entry.files) ? entry.files : [];
      for (const file of files) {
        if (file && typeof file.path === 'string') {
          fileSet.add(file.path.replace(/\\/g, '/'));
        }
      }
    }

    return { ok: true, files: fileSet, error: '' };
  } catch (error) {
    return {
      ok: false,
      files: [],
      error: `Failed to parse npm pack JSON output: ${error.message}`,
    };
  }
}

console.log('\nHybrid Release Validation\n');

// 1. Package.json checks
console.log('Package.json');
const pkg = require(path.join(ROOT, 'package.json'));
check('bin.image-annotator exists', Boolean(pkg.bin && pkg.bin['image-annotator']));
check('bin.annotate exists', Boolean(pkg.bin && pkg.bin.annotate));
check(
  'bin.image-annotator-config-ui exists',
  Boolean(pkg.bin && pkg.bin['image-annotator-config-ui'])
);
check('scripts.start exists', Boolean(pkg.scripts && pkg.scripts.start));
check('scripts.config-ui exists', Boolean(pkg.scripts && pkg.scripts['config-ui']));

// 2. Bin targets exist
console.log('\nBin Targets');
for (const [name, target] of Object.entries(pkg.bin || {})) {
  const resolved = path.resolve(ROOT, target);
  check(`bin.${name} -> ${target} exists`, fs.existsSync(resolved), `file not found: ${resolved}`);
}

// 3. Runtime layout exists
console.log('\nRuntime Layout');
const runtimeFiles = [
  'src/server/index.js',
  'src/server/tools.js',
  'src/server/handlers.js',
  'src/server/config-ui.js',
  'src/annotate/index.js',
  'src/annotate/cli.js',
  'src/annotate/render.js',
  'src/annotate/runtime.js',
  'src/config-ui/launch.js',
  'src/config-ui/server.js',
  'src/preview/renderer.js',
  'src/config-loader.js',
  'src/annotate-errors.js',
];

for (const file of runtimeFiles) {
  check(`${file} exists`, fs.existsSync(path.join(ROOT, file)), `file not found: ${file}`);
}

// 4. Skills package
console.log('\nSkills Package');
const skillsDir = path.join(ROOT, 'skills', 'image-annotator');
check('skills/image-annotator/ exists', fs.existsSync(skillsDir));
check('SKILL.md exists', fs.existsSync(path.join(skillsDir, 'SKILL.md')));
check('references/ exists', fs.existsSync(path.join(skillsDir, 'references')));
check(
  'references/cli-commands.md exists',
  fs.existsSync(path.join(skillsDir, 'references', 'cli-commands.md'))
);
check('references/recipes.md exists', fs.existsSync(path.join(skillsDir, 'references', 'recipes.md')));
check(
  'references/guardrails.md exists',
  fs.existsSync(path.join(skillsDir, 'references', 'guardrails.md'))
);

// 5. CLI smoke tests
console.log('\nCLI Smoke');
const annotateHelp = runNodeScript('annotate.js', ['--help']);
check('annotate.js --help exits 0', annotateHelp.status === 0, annotateHelp.stderr.trim());
check(
  '--help mentions dimensions',
  annotateHelp.stdout.includes('dimensions'),
  'dimensions not found in help output'
);
check(
  '--help mentions reannotate',
  annotateHelp.stdout.includes('reannotate'),
  'reannotate not found in help output'
);
check(
  '--help mentions step-guide',
  annotateHelp.stdout.includes('step-guide'),
  'step-guide not found in help output'
);
check(
  '--help mentions --output-format',
  annotateHelp.stdout.includes('--output-format'),
  '--output-format not found in help output'
);

const annotateDimensionsHelp = runNodeScript('annotate.js', ['dimensions', '--help']);
check(
  'annotate.js dimensions --help exits 0',
  annotateDimensionsHelp.status === 0,
  annotateDimensionsHelp.stderr.trim()
);

const annotateReannotateHelp = runNodeScript('annotate.js', ['reannotate', '--help']);
check(
  'annotate.js reannotate --help exits 0',
  annotateReannotateHelp.status === 0,
  annotateReannotateHelp.stderr.trim()
);

const annotateStepGuideHelp = runNodeScript('annotate.js', ['step-guide', '--help']);
check(
  'annotate.js step-guide --help exits 0',
  annotateStepGuideHelp.status === 0,
  annotateStepGuideHelp.stderr.trim()
);

const configUiHelp = runNodeScript('config-ui/launch.js', ['--help']);
check('config-ui/launch.js --help exits 0', configUiHelp.status === 0, configUiHelp.stderr.trim());

// 6. Core modules import without error
console.log('\nModule Imports');
try {
  require(path.join(ROOT, 'annotate.js'));
  check('annotate.js imports cleanly', true);
} catch (error) {
  check('annotate.js imports cleanly', false, error.message);
}

try {
  require(path.join(ROOT, 'server.js'));
  check('server.js imports cleanly', true);
} catch (error) {
  check('server.js imports cleanly', false, error.message);
}

try {
  require(path.join(ROOT, 'config-ui', 'launch.js'));
  check('config-ui/launch.js imports cleanly', true);
} catch (error) {
  check('config-ui/launch.js imports cleanly', false, error.message);
}

try {
  require(path.join(ROOT, 'src', 'annotate', 'index.js'));
  check('src/annotate/index.js imports cleanly', true);
} catch (error) {
  check('src/annotate/index.js imports cleanly', false, error.message);
}

try {
  require(path.join(ROOT, 'src', 'server', 'index.js'));
  check('src/server/index.js imports cleanly', true);
} catch (error) {
  check('src/server/index.js imports cleanly', false, error.message);
}

// 7. Architecture docs
console.log('\nDocumentation');
check(
  'docs/hybrid-architecture.md exists',
  fs.existsSync(path.join(ROOT, 'docs', 'hybrid-architecture.md'))
);
check('AGENTS.md exists', fs.existsSync(path.join(ROOT, 'AGENTS.md')));
check('README.md exists', fs.existsSync(path.join(ROOT, 'README.md')));

// 8. npm pack includes required files
console.log('\nPackage Contents (npm pack --dry-run)');
const packed = gatherPackedFiles();
check('npm pack --dry-run succeeds', packed.ok, packed.error);

const requiredPackedFiles = [
  'package.json',
  'README.md',
  'server.js',
  'annotate.js',
  'config-ui/launch.js',
  'src/server/index.js',
  'src/server/tools.js',
  'src/server/handlers.js',
  'src/server/config-ui.js',
  'src/annotate/index.js',
  'src/annotate/cli.js',
  'src/annotate/render.js',
  'src/annotate/runtime.js',
  'src/config-ui/launch.js',
  'src/config-ui/server.js',
  'src/preview/renderer.js',
  'src/config-loader.js',
  'src/annotate-errors.js',
  'skills/image-annotator/SKILL.md',
  'skills/image-annotator/references/cli-commands.md',
  'skills/image-annotator/references/recipes.md',
  'skills/image-annotator/references/guardrails.md',
  'docs/hybrid-architecture.md',
  'AGENTS.md',
];

for (const file of requiredPackedFiles) {
  check(`npm pack contains ${file}`, packed.ok && packed.files.has(file), `${file} missing from npm pack`);
}

// Summary
console.log('\n----------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------\n');

if (failed > 0) {
  console.log('VALIDATION FAILED');
  process.exit(1);
} else {
  console.log('ALL CHECKS PASSED - Ready for release');
  process.exit(0);
}
