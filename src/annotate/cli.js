'use strict';

const fs = require('fs');
const minimist = require('minimist');
const { annotateImage, getImageDimensions } = require('./runtime');

async function main() {
  const args = minimist(process.argv.slice(2), {
    string: ['annotations', 'theme', 'output-format', 'redact-patterns'],
    boolean: ['help', 'h'],
    alias: { h: 'help', a: 'annotations', t: 'theme' }
  });

  if (args.help) {
    console.log(`
Image Annotator CLI

Usage: node annotate.js <input> <output> [options]
       node annotate.js dimensions <image>
       node annotate.js reannotate --new-screenshot <image> --previous-annotations <json> --previous-width <n> --previous-height <n>
       node annotate.js step-guide <input> <output> --steps <json>

Options:
  --annotations, -a       JSON array of annotations (required for annotate mode)
  --theme, -t             Theme: documentation|tutorial|bugReport|highlight
  --output-format         Output format: png, jpeg, webp, avif, svg (default: png)
  --quality               JPEG/WebP quality 1-100
  --device-pixel-ratio    Scale factor for Retina/HiDPI coordinates (e.g. 2)
  --canvas-padding        Extra canvas padding in pixels
  --redact-patterns       JSON array of regex strings to redact annotation text
  --help, -h              Show this help message
`);
    process.exit(0);
  }

  const subcommand = args._[0];
  if (subcommand === 'dimensions') {
    return runDimensionsCommand(args);
  }
  if (subcommand === 'reannotate') {
    return runReannotateCommand(args);
  }
  if (subcommand === 'step-guide') {
    return runStepGuideCommand(args);
  }
  return runAnnotateCommand(args);
}

async function runDimensionsCommand(args) {
  const imagePath = args._[1];
  if (!imagePath) {
    console.error('Error: image path required');
    console.error('Usage: node annotate.js dimensions <image>');
    process.exit(1);
  }

  try {
    const dims = await getImageDimensions(imagePath);
    console.log(JSON.stringify(dims, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function runReannotateCommand(args) {
  const newScreenshot = args['new-screenshot'];
  const previousAnnotationsStr = args['previous-annotations'];
  const previousWidth = args['previous-width'] != null ? Number(args['previous-width']) : null;
  const previousHeight = args['previous-height'] != null ? Number(args['previous-height']) : null;

  if (!newScreenshot) {
    console.error('Error: --new-screenshot required');
    process.exit(1);
  }
  if (!fs.existsSync(newScreenshot)) {
    console.error(`Error: File not found: ${newScreenshot}`);
    process.exit(1);
  }

  let previousAnnotations;
  try {
    previousAnnotations = typeof previousAnnotationsStr === 'string'
      ? JSON.parse(previousAnnotationsStr)
      : (previousAnnotationsStr || []);
  } catch (e) {
    console.error('Error parsing previous-annotations JSON:', e.message);
    process.exit(1);
  }

  try {
    const dims = await getImageDimensions(newScreenshot);
    const newWidth = dims.width;
    const newHeight = dims.height;
    const srcWidth = previousWidth || newWidth;
    const srcHeight = previousHeight || newHeight;
    const scaleX = newWidth / srcWidth;
    const scaleY = newHeight / srcHeight;
    const remapped = previousAnnotations.map((annotation) => {
      const remappedAnn = { ...annotation };
      if (annotation.x != null) remappedAnn.x = Math.round(annotation.x * scaleX);
      if (annotation.y != null) remappedAnn.y = Math.round(annotation.y * scaleY);
      if (annotation.from) remappedAnn.from = [Math.round(annotation.from[0] * scaleX), Math.round(annotation.from[1] * scaleY)];
      if (annotation.to) remappedAnn.to = [Math.round(annotation.to[0] * scaleX), Math.round(annotation.to[1] * scaleY)];
      if (annotation.width != null) remappedAnn.width = Math.round(annotation.width * scaleX);
      if (annotation.height != null) remappedAnn.height = Math.round(annotation.height * scaleY);
      return remappedAnn;
    });
    console.log(JSON.stringify({ remappedAnnotations: remapped, newWidth, newHeight }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function runStepGuideCommand(args) {
  const inputPath = args._[1];
  const outputPath = args._[2];
  const stepsStr = args.steps;

  if (!inputPath || !outputPath) {
    console.error('Error: input and output paths required');
    console.error('Usage: node annotate.js step-guide <input> <output> --steps <json>');
    process.exit(1);
  }
  if (!stepsStr) {
    console.error('Error: --steps required');
    process.exit(1);
  }

  let steps;
  try {
    steps = typeof stepsStr === 'string' ? JSON.parse(stepsStr) : stepsStr;
  } catch (e) {
    console.error('Error parsing steps JSON:', e.message);
    process.exit(1);
  }

  const dpr = args['device-pixel-ratio'] != null ? Number(args['device-pixel-ratio']) : 1;
  const theme = args.theme || null;
  const outputFormat = args['output-format'] || null;
  const quality = args.quality != null ? Number(args.quality) : undefined;
  const colors = ['primary', 'green', 'orange', 'purple', 'cyan'];
  const annotations = [];
  steps.forEach((step, index) => {
    const color = step.color || colors[index % colors.length];
    annotations.push({ type: 'marker', x: step.x, y: step.y, number: index + 1, color, size: 24 });
    const labelX = step.x + Math.round(50 * dpr);
    const labelY = step.y;
    annotations.push({ type: 'arrow', from: [step.x + Math.round(28 * dpr), step.y], to: [labelX - Math.round(5 * dpr), labelY], color, strokeWidth: 2 });
    annotations.push({ type: 'label', x: labelX, y: labelY + Math.round(6 * dpr), text: step.label, color: 'darkGray', fontSize: 16, background: 'white', shadow: true });
    const connectSteps = args['connect-steps'] !== false;
    if (connectSteps && index < steps.length - 1) {
      const next = steps[index + 1];
      annotations.push({ type: 'connector', from: [step.x, step.y + Math.round(30 * dpr)], to: [next.x, next.y - Math.round(30 * dpr)], color: 'gray' });
    }
  });

  try {
    const result = await annotateImage(inputPath, outputPath, annotations, { theme, outputFormat, quality, devicePixelRatio: dpr });
    console.log(`✓ Step guide created: ${result.outputPath}`);
    console.log(`  Steps: ${steps.length}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function runAnnotateCommand(args) {
  const inputPath = args._[0];
  const outputPath = args._[1];

  if (!inputPath || !outputPath) {
    console.error('Error: input and output paths required');
    console.error('Usage: node annotate.js <input> <output> --annotations JSON');
    process.exit(1);
  }
  if (!args.annotations) {
    console.error('Error: --annotations required');
    process.exit(1);
  }

  let annotations;
  try {
    annotations = typeof args.annotations === 'string'
      ? JSON.parse(args.annotations)
      : args.annotations;
  } catch (e) {
    console.error('Error parsing annotations JSON:', e.message);
    process.exit(1);
  }

  const theme = args.theme || null;
  const outputFormat = args['output-format'] || null;
  const quality = args.quality != null ? Number(args.quality) : undefined;
  const devicePixelRatio = args['device-pixel-ratio'] != null ? Number(args['device-pixel-ratio']) : undefined;
  const canvasPadding = args['canvas-padding'] != null ? Number(args['canvas-padding']) : undefined;

  let redactPatterns;
  if (args['redact-patterns']) {
    try {
      redactPatterns = typeof args['redact-patterns'] === 'string'
        ? JSON.parse(args['redact-patterns'])
        : args['redact-patterns'];
    } catch (e) {
      console.error('Error parsing redact-patterns JSON:', e.message);
      process.exit(1);
    }
  }

  try {
    const result = await annotateImage(inputPath, outputPath, annotations, {
      theme,
      outputFormat,
      quality,
      devicePixelRatio,
      canvasPadding,
      redactPatterns
    });
    console.log(`✓ Annotated image saved: ${result.outputPath}`);
    console.log(`  Dimensions: ${result.width}x${result.height}`);
    console.log(`  Annotations: ${result.annotationCount}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = {
  main
};
