const path = require('path');
const fs = require('fs');
const {
  annotateImage,
  getImageDimensions,
  estimateDimensionsFromAnnotations,
  remapAnnotation
} = require('../annotate');
// Pure layout helper, imported directly so test doubles for the annotate
// barrel do not have to stub it.
const { buildStepGuideAnnotations } = require('../annotate/step-guide');
const { FileNotFoundError, InvalidParameterError } = require('../annotate-errors');

function getOutputPath(inputPath, suffix = '-annotated', outputFormat = null) {
  const dir = path.dirname(inputPath);
  const inputExt = path.extname(inputPath);
  const ext = outputFormat === 'jpeg'
    ? '.jpg'
    : outputFormat
      ? `.${outputFormat}`
      : inputExt;
  const base = path.basename(inputPath, inputExt);
  return path.join(dir, `${base}${suffix}${ext}`);
}

async function handleAnnotate(args) {
  const { input_path, output_path, annotations, theme, sketch, output_format, quality, device_pixel_ratio, canvas_padding, redact_patterns, crop } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const finalPath = output_path || getOutputPath(input_path, '-annotated', output_format || null);
  const result = await annotateImage(input_path, finalPath, annotations, {
    theme,
    sketch: sketch === true,
    outputFormat: output_format,
    quality,
    devicePixelRatio: device_pixel_ratio,
    canvasPadding: canvas_padding,
    redactPatterns: redact_patterns,
    crop
  });

  const warningLines = result.warnings && result.warnings.length
    ? result.warnings.map((warning) => {
      if (warning.type === 'overlap') {
        const [i, j] = warning.annotations;
        const { x, y, w, h } = warning.overlap;
        return `  Warning: Overlap detected between annotations #${i + 1} and #${j + 1} at ${x},${y} (${w}x${h})`;
      }
      if (warning.type === 'redaction') {
        return `  Warning: ${warning.message}`;
      }
      return `  Warning: ${warning.property} clamped from ${warning.original} to ${warning.clamped} (annotation #${warning.annotation + 1})`;
    }).join('\n')
    : '';
  const jpegNote = result.outputFormat === 'jpeg'
    ? '\n  Note: JPEG output does not preserve transparency. Any transparent pixels are flattened during export.'
    : '';

  return {
    content: [{
      type: 'text',
      text: `✓ Annotated screenshot saved: ${result.outputPath}\n  Size: ${result.width}x${result.height}\n  Annotations: ${result.annotationCount}${theme ? `\n  Theme: ${theme}` : ''}${device_pixel_ratio ? `\n  DPR: ${device_pixel_ratio}x (coordinates scaled from CSS to device pixels)` : ''}${jpegNote}\n  Alt-text: ${result.altText}${result.warnings && result.warnings.length ? `\n  Warnings: ${result.warnings.length} issue(s) detected\n${warningLines}` : ''}`
    }],
    alt_text: result.altText
  };
}

async function handleDimensions(args) {
  const { image_path } = args;

  if (!fs.existsSync(image_path)) {
    throw new FileNotFoundError(image_path);
  }

  const dims = await getImageDimensions(image_path);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(dims, null, 2)
    }]
  };
}

async function handleStepGuide(args) {
  const { input_path, output_path, steps, connect_steps = true, theme, sketch, output_format, quality, device_pixel_ratio, canvas_padding } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const annotations = buildStepGuideAnnotations(steps, {
    devicePixelRatio: device_pixel_ratio,
    connectSteps: connect_steps
  });

  const finalPath = output_path || getOutputPath(input_path, '-guide', output_format || null);
  const result = await annotateImage(input_path, finalPath, annotations, {
    theme,
    sketch: sketch === true,
    outputFormat: output_format,
    quality,
    devicePixelRatio: device_pixel_ratio,
    canvasPadding: canvas_padding
  });

  // Documentation best practice caps a sequence at 5-7 steps; beyond that the
  // guide should be split rather than crammed onto one screenshot.
  const stepCountNote = steps.length > 7
    ? `\n  Warning: ${steps.length} steps exceeds the 5-7 step best-practice range for a single guide image. Consider splitting the flow into multiple screenshots.`
    : '';

  return {
    content: [{
      type: 'text',
      text: `✓ Step guide created: ${result.outputPath}\n  Steps: ${steps.length}${stepCountNote}`
    }]
  };
}

async function handleReannotate(args) {
  const { new_screenshot_path, previous_annotations, previous_image_dimensions } = args;

  if (!fs.existsSync(new_screenshot_path)) {
    throw new FileNotFoundError(new_screenshot_path);
  }
  if (!Array.isArray(previous_annotations)) {
    throw new InvalidParameterError('must be an array', 'previous_annotations');
  }

  const newDims = await getImageDimensions(new_screenshot_path);
  const newWidth = newDims.width;
  const newHeight = newDims.height;

  let prevWidth;
  let prevHeight;
  const dimensions = previous_image_dimensions;
  if (dimensions && typeof dimensions.width === 'number' && dimensions.width > 0 && typeof dimensions.height === 'number' && dimensions.height > 0) {
    prevWidth = dimensions.width;
    prevHeight = dimensions.height;
  } else {
    const estimated = estimateDimensionsFromAnnotations(previous_annotations);
    if (!estimated) {
      throw new InvalidParameterError(
        'Could not estimate previous image dimensions from annotations. Please provide previous_image_dimensions explicitly.',
        'previous_image_dimensions'
      );
    }
    prevWidth = estimated.width;
    prevHeight = estimated.height;
  }

  const scaleX = newWidth / prevWidth;
  const scaleY = newHeight / prevHeight;
  const suggested_annotations = previous_annotations.map((annotation) => remapAnnotation(annotation, scaleX, scaleY));

  const result = {
    suggested_annotations,
    dimension_change: {
      from: { w: prevWidth, h: prevHeight },
      to: { w: newWidth, h: newHeight },
      scaleX: Math.round(scaleX * 10000) / 10000,
      scaleY: Math.round(scaleY * 10000) / 10000
    },
    warning: 'These coordinates are proportional estimates only — not visual matches. UI elements may have moved, reflowed, or changed size independently of the viewport. Always verify the suggested annotations visually before publishing.',
    next_step: 'Pass suggested_annotations to annotate_screenshot with new_screenshot_path as input_path to preview the result.'
  };

  return {
    structuredContent: result,
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2)
    }]
  };
}

module.exports = {
  getOutputPath,
  handleAnnotate,
  handleDimensions,
  handleStepGuide,
  estimateDimensionsFromAnnotations,
  remapAnnotation,
  handleReannotate
};
