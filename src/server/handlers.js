const path = require('path');
const fs = require('fs');
const { annotateImage, getImageDimensions } = require('../annotate');
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
  const { input_path, output_path, annotations, theme, output_format, quality, device_pixel_ratio, canvas_padding, redact_patterns } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const finalPath = output_path || getOutputPath(input_path, '-annotated', output_format || null);
  const result = await annotateImage(input_path, finalPath, annotations, {
    theme,
    outputFormat: output_format,
    quality,
    devicePixelRatio: device_pixel_ratio,
    canvasPadding: canvas_padding,
    redactPatterns: redact_patterns
  });

  const warningLines = result.warnings && result.warnings.length
    ? result.warnings.map((warning) => {
      if (warning.type === 'overlap') {
        const [i, j] = warning.annotations;
        const { x, y, w, h } = warning.overlap;
        return `  Warning: Overlap detected between annotations #${i + 1} and #${j + 1} at ${x},${y} (${w}x${h})`;
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
  const { input_path, output_path, steps, connect_steps = true, theme, output_format, quality, device_pixel_ratio, canvas_padding } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const dpr = device_pixel_ratio || 1;
  const colors = ['primary', 'green', 'orange', 'purple', 'cyan'];
  const annotations = [];

  steps.forEach((step, index) => {
    const color = step.color || colors[index % colors.length];

    annotations.push({
      type: 'marker',
      x: step.x,
      y: step.y,
      number: index + 1,
      color,
      size: 24
    });

    const labelX = step.x + Math.round(50 * dpr);
    const labelY = step.y;

    annotations.push({
      type: 'arrow',
      from: [step.x + Math.round(28 * dpr), step.y],
      to: [labelX - Math.round(5 * dpr), labelY],
      color,
      strokeWidth: 2
    });

    annotations.push({
      type: 'label',
      x: labelX,
      y: labelY + Math.round(6 * dpr),
      text: step.label,
      color: 'darkGray',
      fontSize: 16,
      background: 'white',
      shadow: true
    });

    if (connect_steps && index < steps.length - 1) {
      const next = steps[index + 1];
      annotations.push({
        type: 'connector',
        from: [step.x, step.y + Math.round(30 * dpr)],
        to: [next.x, next.y - Math.round(30 * dpr)],
        color: 'gray'
      });
    }
  });

  const finalPath = output_path || getOutputPath(input_path, '-guide', output_format || null);
  const result = await annotateImage(input_path, finalPath, annotations, {
    theme,
    outputFormat: output_format,
    quality,
    devicePixelRatio: device_pixel_ratio,
    canvasPadding: canvas_padding
  });

  return {
    content: [{
      type: 'text',
      text: `✓ Step guide created: ${result.outputPath}\n  Steps: ${steps.length}`
    }]
  };
}

function estimateDimensionsFromAnnotations(annotations) {
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (const annotation of annotations) {
    const consider = (x, y) => {
      if (typeof x === 'number' && isFinite(x) && x > maxX) { maxX = x; found = true; }
      if (typeof y === 'number' && isFinite(y) && y > maxY) { maxY = y; found = true; }
    };

    consider(annotation.x, annotation.y);

    if (Array.isArray(annotation.from) && annotation.from.length >= 2) consider(annotation.from[0], annotation.from[1]);
    if (Array.isArray(annotation.to) && annotation.to.length >= 2) consider(annotation.to[0], annotation.to[1]);

    if (typeof annotation.width === 'number' && isFinite(annotation.width)) {
      const right = (annotation.x || 0) + annotation.width;
      if (right > maxX) { maxX = right; found = true; }
    }
    if (typeof annotation.height === 'number' && isFinite(annotation.height)) {
      const bottom = (annotation.y || 0) + annotation.height;
      if (bottom > maxY) { maxY = bottom; found = true; }
    }
    if (typeof annotation.radius === 'number' && isFinite(annotation.radius)) {
      const rx = (annotation.x || 0) + annotation.radius;
      const ry = (annotation.y || 0) + annotation.radius;
      if (rx > maxX) { maxX = rx; found = true; }
      if (ry > maxY) { maxY = ry; found = true; }
    }
  }

  if (!found || maxX === 0 || maxY === 0) return null;
  return { width: maxX, height: maxY };
}

function remapAnnotation(annotation, sx, sy) {
  const scaled = Object.assign({}, annotation);
  const scaleNum = (value, scale) => (typeof value === 'number' && isFinite(value)) ? Math.round(value * scale) : value;
  const scalePoint = (point, scaleX, scaleY) => Array.isArray(point) && point.length >= 2
    ? [Math.round(point[0] * scaleX), Math.round(point[1] * scaleY)]
    : point;

  if (typeof scaled.x === 'number') scaled.x = scaleNum(scaled.x, sx);
  if (typeof scaled.y === 'number') scaled.y = scaleNum(scaled.y, sy);
  if (typeof scaled.width === 'number') scaled.width = scaleNum(scaled.width, sx);
  if (typeof scaled.height === 'number') scaled.height = scaleNum(scaled.height, sy);
  if (typeof scaled.radius === 'number') scaled.radius = scaleNum(scaled.radius, Math.min(sx, sy));
  if (scaled.from) scaled.from = scalePoint(scaled.from, sx, sy);
  if (scaled.to) scaled.to = scalePoint(scaled.to, sx, sy);

  return scaled;
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
