'use strict';

const fs = require('fs');
const minimist = require('minimist');
const {
  annotateImage,
  getImageDimensions,
  estimateDimensionsFromAnnotations,
  remapAnnotation
} = require('./runtime');
const { buildStepGuideAnnotations } = require('./step-guide');

async function main() {
  const args = minimist(process.argv.slice(2), {
    string: ['annotations', 'theme', 'output-format', 'redact-patterns', 'crop', 'background'],
    boolean: ['help', 'h', 'sketch', 'auto-layout'],
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
  --theme, -t             Theme: documentation|tutorial|bugReport|highlight|sketch
  --sketch                Render every annotation in hand-drawn Excalidraw style
  --output-format         Output format: png, jpeg, webp, avif, svg (default: png)
  --quality               JPEG/WebP quality 1-100
  --device-pixel-ratio    Scale factor for Retina/HiDPI coordinates (e.g. 2)
  --canvas-padding        Extra canvas padding in pixels
  --crop                  JSON {"x":..,"y":..,"width":..,"height":..} region (CSS px,
                          relative to the original image) to crop before annotating;
                          annotation coordinates stay in original-image space
  --background            Color string or JSON {"color"|"gradient":..,"padding":..,
                          "imageCornerRadius":..,"shadow":..} export card (padding,
                          rounded corners, drop shadow on a colored canvas)
  --auto-layout           Move overlapping leadout/callout labels to a free position
  --redact-patterns       JSON array of regex strings; matched label/callout text
                          boxes are covered with solid redact rectangles
                          (annotation boxes only, no OCR; not usable with svg)
  --help, -h              Show this help message

Redaction:
  {"type":"redact","x":100,"y":100,"width":200,"height":24,"label":"REDACTED"}
  Default mode "solid" is irreversible. Modes "pixelate"/"blur" are reversible
  visual de-emphasis only - never use them for sensitive content.
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
    // Fall back to the same estimate the MCP tool uses when the caller did not
    // pass the previous dimensions, instead of assuming a 1:1 scale.
    const estimated = (previousWidth && previousHeight)
      ? null
      : estimateDimensionsFromAnnotations(previousAnnotations);
    const srcWidth = previousWidth || (estimated && estimated.width) || newWidth;
    const srcHeight = previousHeight || (estimated && estimated.height) || newHeight;
    const scaleX = newWidth / srcWidth;
    const scaleY = newHeight / srcHeight;
    const remapped = previousAnnotations.map((annotation) => remapAnnotation(annotation, scaleX, scaleY));
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
  const annotations = buildStepGuideAnnotations(steps, {
    devicePixelRatio: dpr,
    connectSteps: args['connect-steps'] !== false
  });

  try {
    const result = await annotateImage(inputPath, outputPath, annotations, { theme, sketch: args.sketch === true, outputFormat, quality, devicePixelRatio: dpr });
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

  let crop;
  if (args.crop) {
    try {
      crop = typeof args.crop === 'string' ? JSON.parse(args.crop) : args.crop;
    } catch (e) {
      console.error('Error parsing crop JSON:', e.message);
      process.exit(1);
    }
  }

  let background;
  if (args.background) {
    const raw = String(args.background);
    if (raw.trim().startsWith('{')) {
      try {
        background = JSON.parse(raw);
      } catch (e) {
        console.error('Error parsing background JSON:', e.message);
        process.exit(1);
      }
    } else {
      background = raw; // plain color string shorthand
    }
  }

  try {
    const result = await annotateImage(inputPath, outputPath, annotations, {
      theme,
      sketch: args.sketch === true,
      outputFormat,
      quality,
      devicePixelRatio,
      canvasPadding,
      redactPatterns,
      crop,
      background,
      autoLayout: args['auto-layout'] === true
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
