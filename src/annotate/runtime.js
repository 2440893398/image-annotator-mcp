const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../config-loader');
const {
  FileNotFoundError,
  InvalidParameterError,
  ImageProcessingError,
  ValidationError,
  CoordinateClampWarning
} = require('../annotate-errors');
const {
  COLORS,
  THEMES,
  THEME_FONTS,
  SIZE_PRESETS,
  OUTPUT_FORMAT_EXTENSIONS,
  SVGO_CONFIG,
  DEFAULT_PADDING,
  LINE_HEIGHT_RATIO,
  getSizePreset,
  getTextContentWidthPx,
  escapeXml,
  buildSvg,
  log,
  setIdGenerator,
  resetIdGenerator
} = require('./render');

let optimize = null;
({ optimize } = require('svgo'));

function applyRedactPatterns(annotations, redactPatterns, sizePreset = 'm') {
  if (!redactPatterns || redactPatterns.length === 0) {
    return annotations;
  }

  const regexes = redactPatterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (e) {
      throw new InvalidParameterError(`Invalid regex pattern "${pattern}": ${e.message}`, 'redact_patterns');
    }
  });

  const blurAnnotations = [];
  const redactedIndices = new Set();

  for (let i = 0; i < annotations.length; i++) {
    const annotation = annotations[i];
    if (typeof annotation.text !== 'string') continue;

    const matches = regexes.some((regex) => regex.test(annotation.text));
    if (!matches || redactedIndices.has(i)) continue;

    redactedIndices.add(i);
    const box = getBoundingBox(annotation, sizePreset);
    if (!box) continue;

    blurAnnotations.push({
      type: 'blur',
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h
    });
  }

  if (blurAnnotations.length === 0) {
    return annotations;
  }

  return [...annotations, ...blurAnnotations];
}

async function annotateImage(inputPath, outputPath, annotations, options = {}) {
  if (!fs.existsSync(inputPath)) {
    throw new FileNotFoundError(inputPath);
  }

  validateAnnotations(annotations);

  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;
  checkImageSize(metadata);

  const inputDir = path.dirname(inputPath);
  const config = options.config || loadConfig(inputDir) || loadConfig();

  let sizePreset = config.sizePreset;
  if (sizePreset === 'auto' || !sizePreset) {
    sizePreset = getSizePreset(width, height);
  }

  const redactPatterns = options.redactPatterns;
  const redactedAnnotations = redactPatterns && redactPatterns.length > 0
    ? applyRedactPatterns(annotations, redactPatterns, sizePreset)
    : annotations;

  const devicePixelRatio = options.devicePixelRatio || 1;
  const scaledAnnotations = devicePixelRatio !== 1
    ? redactedAnnotations.map((annotation) => scaleAnnotationCoords(annotation, devicePixelRatio))
    : redactedAnnotations;
  const padding = normalizeCanvasPadding(options.canvasPadding);
  const extendedWidth = width + padding.left + padding.right;
  const extendedHeight = height + padding.top + padding.bottom;
  const offsetAnnotations = padding.left || padding.top
    ? scaledAnnotations.map((annotation) => offsetAnnotationCoords(annotation, padding.left, padding.top))
    : scaledAnnotations;

  const { annotations: validAnnotations, warnings: clampWarnings } = clampAnnotations(offsetAnnotations, extendedWidth, extendedHeight);
  const baseSizes = SIZE_PRESETS[sizePreset] || SIZE_PRESETS.m;
  const sizes = config.defaultSizes && typeof config.defaultSizes === 'object'
    ? { ...baseSizes, ...config.defaultSizes }
    : baseSizes;
  const outputFormat = normalizeOutputFormat(outputPath, options.outputFormat);
  const finalOutputPath = resolveOutputPathForFormat(outputPath, outputFormat);
  const quality = options.quality ?? getDefaultQuality(outputFormat);

  const enhancedOptions = {
    ...options,
    defaultSizes: sizes,
    theme: options.theme || config.theme,
    customThemes: config.themes,
    outputFormat
  };

  const collisionWarnings = detectCollisions(validAnnotations, sizePreset);
  const warnings = [...clampWarnings, ...collisionWarnings];
  const svg = buildSvg(extendedWidth, extendedHeight, validAnnotations, enhancedOptions);
  const optimizedSvg = optimizeSvg(svg);
  const altText = generateAltText(validAnnotations, extendedWidth, extendedHeight, enhancedOptions);

  if (outputFormat === 'svg') {
    try {
      const a11ySvg = injectA11y(optimizedSvg, altText, validAnnotations);
      fs.writeFileSync(finalOutputPath, a11ySvg);
    } catch (err) {
      throw new ImageProcessingError(`Failed to write SVG output: ${err.message}`, err);
    }

    return {
      outputPath: finalOutputPath,
      width: extendedWidth,
      height: extendedHeight,
      annotationCount: validAnnotations.length,
      warnings,
      sizePreset,
      theme: enhancedOptions.theme,
      devicePixelRatio,
      canvasPadding: padding,
      format: outputFormat,
      outputFormat,
      quality: undefined,
      altText,
      size: optimizedSvg.length
    };
  }

  try {
    let pipeline = sharp(inputPath);

    if (padding.top || padding.right || padding.bottom || padding.left) {
      pipeline = pipeline.extend({
        top: padding.top,
        right: padding.right,
        bottom: padding.bottom,
        left: padding.left,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      });
    }

    pipeline = pipeline.composite([{
      input: Buffer.from(optimizedSvg),
      top: 0,
      left: 0
    }]);

    if (outputFormat === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else if (outputFormat === 'avif') {
      pipeline = pipeline.avif({ quality, effort: 1 });
    } else if (outputFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality });
    }

    await pipeline.toFile(finalOutputPath);
  } catch (err) {
    throw new ImageProcessingError(`Failed to composite annotations: ${err.message}`, err);
  }

  return {
    outputPath: finalOutputPath,
    width: extendedWidth,
    height: extendedHeight,
    annotationCount: validAnnotations.length,
    warnings,
    sizePreset,
    theme: enhancedOptions.theme,
    devicePixelRatio,
    canvasPadding: padding,
    format: outputFormat,
    outputFormat,
    quality,
    altText
  };
}

async function getImageDimensions(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format
  };
}

function checkImageSize(metadata) {
  const pixels = metadata.width * metadata.height;
  const fourKPixels = 3840 * 2160;

  if (pixels > fourKPixels) {
    log('WARN', `Large image detected (${metadata.width}x${metadata.height}, ${(pixels / 1000000).toFixed(1)}MP). Processing may be slow.`);
  }

  return pixels > fourKPixels;
}

function optimizeSvg(svg) {
  if (typeof svg !== 'string' || svg.length === 0) {
    return svg;
  }

  if (!optimize) {
    log('WARN', 'SVGO is not available, using original SVG output.');
    return svg;
  }

  try {
    return optimize(svg, SVGO_CONFIG).data;
  } catch (error) {
    log('WARN', `SVGO optimization failed, using original SVG: ${error.message}`);
    return svg;
  }
}

function normalizeOutputFormat(outputPath, requestedFormat) {
  if (requestedFormat) {
    return requestedFormat;
  }

  const extension = outputPath ? path.extname(outputPath).toLowerCase() : '';
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg';
  if (extension === '.webp') return 'webp';
  if (extension === '.avif') return 'avif';
  if (extension === '.svg') return 'svg';
  return 'png';
}

function resolveOutputPathForFormat(outputPath, outputFormat) {
  if (!outputPath) return outputPath;

  const currentExt = path.extname(outputPath);
  const desiredExt = OUTPUT_FORMAT_EXTENSIONS[outputFormat];
  if (!desiredExt) return outputPath;

  if (!currentExt) {
    return `${outputPath}${desiredExt}`;
  }

  if (currentExt.toLowerCase() !== desiredExt) {
    return `${outputPath.slice(0, -currentExt.length)}${desiredExt}`;
  }

  return outputPath;
}

function getDefaultQuality(outputFormat) {
  if (outputFormat === 'avif') return 50;
  if (outputFormat === 'jpeg' || outputFormat === 'webp') return 80;
  return undefined;
}

function scaleAnnotationCoords(annotation, dpr) {
  if (!annotation || typeof annotation !== 'object' || !Number.isFinite(dpr) || dpr === 1) {
    return annotation;
  }

  const scaled = { ...annotation };
  const scaleValue = (value) => (typeof value === 'number' ? value * dpr : value);

  if (scaled.x !== undefined) scaled.x = scaleValue(scaled.x);
  if (scaled.y !== undefined) scaled.y = scaleValue(scaled.y);
  if (scaled.width !== undefined) scaled.width = scaleValue(scaled.width);
  if (scaled.height !== undefined) scaled.height = scaleValue(scaled.height);
  if (scaled.radius !== undefined) scaled.radius = scaleValue(scaled.radius);
  if (Array.isArray(scaled.from)) scaled.from = scaled.from.map(scaleValue);
  if (Array.isArray(scaled.to)) scaled.to = scaled.to.map(scaleValue);

  return scaled;
}

function normalizeCanvasPadding(canvasPadding) {
  if (typeof canvasPadding === 'number') {
    return {
      top: canvasPadding,
      right: canvasPadding,
      bottom: canvasPadding,
      left: canvasPadding
    };
  }

  if (canvasPadding && typeof canvasPadding === 'object') {
    return {
      top: canvasPadding.top || 0,
      right: canvasPadding.right || 0,
      bottom: canvasPadding.bottom || 0,
      left: canvasPadding.left || 0
    };
  }

  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function offsetAnnotationCoords(annotation, offsetX, offsetY) {
  if (!annotation || typeof annotation !== 'object' || (!offsetX && !offsetY)) {
    return annotation;
  }

  const shifted = { ...annotation };
  if (shifted.x !== undefined) shifted.x += offsetX;
  if (shifted.y !== undefined) shifted.y += offsetY;
  if (Array.isArray(shifted.from)) shifted.from = [shifted.from[0] + offsetX, shifted.from[1] + offsetY];
  if (Array.isArray(shifted.to)) shifted.to = [shifted.to[0] + offsetX, shifted.to[1] + offsetY];
  return shifted;
}

function generateAltText(annotations, imageWidth, imageHeight, options = {}) {
  if (!annotations || annotations.length === 0) {
    return `Image (${imageWidth}x${imageHeight}) with no annotations`;
  }

  const themeText = options.theme ? `, theme ${options.theme}` : '';
  const counts = new Map();
  const details = [];

  for (const annotation of annotations) {
    const type = annotation.type || 'unknown';
    counts.set(type, (counts.get(type) || 0) + 1);

    if (type === 'callout' && annotation.text) {
      details.push(`callout "${annotation.text}"`);
    } else if (type === 'label' && annotation.text) {
      details.push(`label "${annotation.text}"`);
    } else if (type === 'marker' && annotation.number !== undefined && annotation.x !== undefined && annotation.y !== undefined) {
      details.push(`marker #${annotation.number} at (${annotation.x},${annotation.y})`);
    }
  }

  const summary = Array.from(counts.entries())
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');

  return `Annotated image (${imageWidth}x${imageHeight}${themeText}): ${summary}${details.length ? `; ${details.join('; ')}` : ''}`;
}

function clampAnnotations(annotations, imageWidth, imageHeight) {
  if (!annotations || !Array.isArray(annotations)) {
    return { annotations: [], warnings: [] };
  }

  const clampedAnnotations = [];
  const warnings = [];

  for (let i = 0; i < annotations.length; i++) {
    const annotation = annotations[i];
    const clamped = { ...annotation };

    const clampValue = (property, min, max, original) => {
      if (original === undefined || original === null || isNaN(original)) {
        return min;
      }
      if (!isFinite(original)) {
        return min;
      }
      if (original < min) {
        warnings.push(new CoordinateClampWarning(i, property, original, min));
        return min;
      }
      if (original > max) {
        warnings.push(new CoordinateClampWarning(i, property, original, max));
        return max;
      }
      return original;
    };

    if (clamped.x !== undefined) {
      clamped.x = clampValue('x', 0, imageWidth, clamped.x);
    }
    if (clamped.y !== undefined) {
      clamped.y = clampValue('y', 0, imageHeight, clamped.y);
    }
    if (clamped.width !== undefined) {
      const maxWidth = imageWidth - (clamped.x || 0);
      clamped.width = clampValue('width', 1, maxWidth, clamped.width);
    }
    if (clamped.height !== undefined) {
      const maxHeight = imageHeight - (clamped.y || 0);
      clamped.height = clampValue('height', 1, maxHeight, clamped.height);
    }
    if (clamped.radius !== undefined) {
      const maxRadius = Math.min(imageWidth, imageHeight) / 2;
      clamped.radius = clampValue('radius', 1, maxRadius, clamped.radius);
    }

    if (clamped.from && Array.isArray(clamped.from)) {
      if (clamped.from[0] !== undefined) {
        clamped.from[0] = clampValue('from[0]', 0, imageWidth, clamped.from[0]);
      }
      if (clamped.from[1] !== undefined) {
        clamped.from[1] = clampValue('from[1]', 0, imageHeight, clamped.from[1]);
      }
    }
    if (clamped.to && Array.isArray(clamped.to)) {
      if (clamped.to[0] !== undefined) {
        clamped.to[0] = clampValue('to[0]', 0, imageWidth, clamped.to[0]);
      }
      if (clamped.to[1] !== undefined) {
        clamped.to[1] = clampValue('to[1]', 0, imageHeight, clamped.to[1]);
      }
    }

    if (clamped.size !== undefined) {
      clamped.size = clampValue('size', 1, Infinity, clamped.size);
    }
    if (clamped.fontSize !== undefined) {
      clamped.fontSize = clampValue('fontSize', 1, Infinity, clamped.fontSize);
    }
    if (clamped.strokeWidth !== undefined) {
      clamped.strokeWidth = clampValue('strokeWidth', 1, Infinity, clamped.strokeWidth);
    }
    if (clamped.cornerRadius !== undefined) {
      clamped.cornerRadius = clampValue('cornerRadius', 0, Infinity, clamped.cornerRadius);
    }
    if (clamped.opacity !== undefined) {
      clamped.opacity = clampValue('opacity', 0, 1, clamped.opacity);
    }

    clampedAnnotations.push(clamped);
  }

  return { annotations: clampedAnnotations, warnings };
}

function getBoundingBox(annotation, sizePreset) {
  const preset = SIZE_PRESETS[sizePreset] || SIZE_PRESETS.m;

  switch (annotation.type) {
    case 'marker': {
      const radius = preset.markerSize / 2;
      return { x: annotation.x - radius, y: annotation.y - radius, w: radius * 2, h: radius * 2 };
    }
    case 'arrow':
    case 'curved-arrow': {
      const strokeWidth = annotation.strokeWidth || 5;
      const x1 = annotation.from[0];
      const y1 = annotation.from[1];
      const x2 = annotation.to[0];
      const y2 = annotation.to[1];
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const maxX = Math.max(x1, x2);
      const maxY = Math.max(y1, y2);
      return { x: minX - strokeWidth, y: minY - strokeWidth, w: (maxX - minX) + strokeWidth * 2, h: (maxY - minY) + strokeWidth * 2 };
    }
    case 'callout': {
      const fontSize = annotation.fontSize || preset.fontSize || 18;
      const padding = DEFAULT_PADDING;
      const pointerSize = 12;
      const lineHeight = fontSize * LINE_HEIGHT_RATIO;
      const lines = String(annotation.text || '').split('\n');
      const contentWidth = Math.max(0, ...lines.map((line) => getTextContentWidthPx(line, fontSize)));
      const textWidth = (annotation.width || 0) > 0 ? annotation.width : contentWidth + padding * 2;
      const textHeight = lines.length * lineHeight + padding * 2;
      const pointer = annotation.pointer || 'bottom';
      let boxX;
      let boxY;

      switch (pointer) {
        case 'top':
          boxX = annotation.x - textWidth / 2;
          boxY = annotation.y + pointerSize;
          break;
        case 'bottom':
          boxX = annotation.x - textWidth / 2;
          boxY = annotation.y - textHeight - pointerSize;
          break;
        case 'left':
          boxX = annotation.x + pointerSize;
          boxY = annotation.y - textHeight / 2;
          break;
        case 'right':
          boxX = annotation.x - textWidth - pointerSize;
          boxY = annotation.y - textHeight / 2;
          break;
        default:
          boxX = annotation.x;
          boxY = annotation.y;
      }

      const xs = [boxX, boxX + textWidth, annotation.x - pointerSize, annotation.x + pointerSize];
      const ys = [boxY, boxY + textHeight, annotation.y - pointerSize, annotation.y + pointerSize];
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'rect':
    case 'highlight':
      return { x: annotation.x, y: annotation.y, w: annotation.width || 100, h: annotation.height || 60 };
    case 'circle': {
      const radius = annotation.radius || 30;
      return { x: annotation.x - radius, y: annotation.y - radius, w: radius * 2, h: radius * 2 };
    }
    case 'label': {
      const fontSize = annotation.fontSize || preset.fontSize || 18;
      const padding = annotation.padding || 10;
      const lines = String(annotation.text || '').split('\n');
      const lineHeight = fontSize * 1.3;
      const textWidth = Math.max(0, ...lines.map((line) => getTextContentWidthPx(line, fontSize)));
      const textHeight = lines.length * lineHeight;
      if (annotation.background) {
        return {
          x: annotation.x - padding,
          y: annotation.y - textHeight - padding + 4,
          w: textWidth + padding * 2,
          h: textHeight + padding * 2
        };
      }
      return {
        x: annotation.x,
        y: annotation.y - textHeight,
        w: textWidth,
        h: textHeight + fontSize * 0.2
      };
    }
    case 'blur':
      return { x: annotation.x, y: annotation.y, w: annotation.width || 100, h: annotation.height || 60 };
    case 'connector': {
      const strokeWidth = annotation.strokeWidth || 5;
      const x1 = annotation.from[0];
      const y1 = annotation.from[1];
      const x2 = annotation.to[0];
      const y2 = annotation.to[1];
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const maxX = Math.max(x1, x2);
      const maxY = Math.max(y1, y2);
      return { x: minX - strokeWidth, y: minY - strokeWidth, w: (maxX - minX) + strokeWidth * 2, h: (maxY - minY) + strokeWidth * 2 };
    }
    case 'icon':
      return { x: annotation.x - 16, y: annotation.y - 16, w: 32, h: 32 };
    default:
      return null;
  }
}

function detectCollisions(annotations, sizePreset) {
  const warnings = [];
  for (let i = 0; i < annotations.length; i++) {
    for (let j = i + 1; j < annotations.length; j++) {
      const a = getBoundingBox(annotations[i], sizePreset);
      const b = getBoundingBox(annotations[j], sizePreset);
      if (!a || !b) continue;

      const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

      if (overlapX > 0 && overlapY > 0) {
        warnings.push({
          type: 'overlap',
          annotations: [i, j],
          overlap: {
            x: Math.max(a.x, b.x),
            y: Math.max(a.y, b.y),
            w: overlapX,
            h: overlapY
          }
        });
      }
    }
  }
  return warnings;
}

function getAnnotationAriaLabel(annotation, index) {
  const position = annotation.from && annotation.to
    ? `from ${annotation.from[0]},${annotation.from[1]} to ${annotation.to[0]},${annotation.to[1]}`
    : typeof annotation.x === 'number' && typeof annotation.y === 'number'
      ? `at ${annotation.x},${annotation.y}`
      : 'with no position';

  switch (annotation.type) {
    case 'marker':
      return `Marker ${annotation.number || index + 1} ${position}`;
    case 'callout':
      return `Callout${annotation.text ? ` \"${annotation.text}\"` : ''} ${position}`;
    case 'label':
      return `Label${annotation.text ? ` \"${annotation.text}\"` : ''} ${position}`;
    case 'arrow':
    case 'curved-arrow':
      return `${annotation.type} ${position}`;
    case 'rect':
    case 'highlight':
    case 'blur':
      return `${annotation.type} region ${position}`;
    case 'circle':
      return `Circle ${position}`;
    case 'connector':
      return `Connector ${position}`;
    case 'icon':
      return `Icon ${annotation.icon || 'badge'} ${position}`;
    default:
      return `${annotation.type || 'annotation'} ${position}`;
  }
}

function injectA11y(svgString, altText, annotations = []) {
  if (!svgString || typeof svgString !== 'string') {
    return svgString;
  }

  const titleText = altText.length > 100 ? altText.substring(0, 100) + '...' : altText;
  const descText = altText;

  let result = svgString.replace(/<svg\s/, '<svg role="img" aria-labelledby="svg-title" ');

  if (result.includes('<defs>')) {
    result = result.replace(
      /<defs>/,
      `<defs><title id="svg-title">${escapeXml(titleText)}</title><desc id="svg-desc">${escapeXml(descText)}</desc>`
    );
  } else {
    result = result.replace(
      /(<svg[^>]*>)/,
      `$1<title id="svg-title">${escapeXml(titleText)}</title><desc id="svg-desc">${escapeXml(descText)}</desc>`
    );
  }

  result = result.replace(/<g data-annotation-index="(\d+)">/g, (match, index) => {
    const annotation = annotations[Number(index)];
    if (!annotation) {
      return '<g>';
    }
    return `<g aria-label="${escapeXml(getAnnotationAriaLabel(annotation, Number(index)))}">`;
  });

  return result;
}

function validateAnnotation(annotation) {
  if (!annotation || typeof annotation !== 'object') {
    throw new ValidationError('Annotation must be an object');
  }
  if (typeof annotation.type !== 'string') {
    throw new ValidationError('Annotation must have a type');
  }
  if (annotation.type === 'marker') {
    if (typeof annotation.x !== 'number' || typeof annotation.y !== 'number') {
      throw new ValidationError('Marker annotations require x and y coordinates');
    }
  }
  if (annotation.type === 'arrow' || annotation.type === 'curved-arrow' || annotation.type === 'connector') {
    if (!Array.isArray(annotation.from) || !Array.isArray(annotation.to)) {
      throw new ValidationError(`${annotation.type} annotations require from and to coordinate arrays`);
    }
  }
  return true;
}

function validateAnnotations(annotations) {
  if (!Array.isArray(annotations)) {
    throw new ValidationError('Annotations must be an array');
  }
  annotations.forEach((annotation) => {
    validateAnnotation(annotation);
  });
  return true;
}

function validateImagePath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') {
    throw new ValidationError('Image path must be a string');
  }
  return true;
}

module.exports = {
  annotateImage,
  getImageDimensions,
  COLORS,
  THEMES,
  THEME_FONTS,
  SIZE_PRESETS,
  OUTPUT_FORMAT_EXTENSIONS,
  SVGO_CONFIG,
  getSizePreset,
  clampAnnotations,
  optimizeSvg,
  normalizeOutputFormat,
  resolveOutputPathForFormat,
  getDefaultQuality,
  scaleAnnotationCoords,
  normalizeCanvasPadding,
  offsetAnnotationCoords,
  generateAltText,
  setIdGenerator,
  resetIdGenerator,
  validateAnnotation,
  validateAnnotations,
  validateImagePath,
  ValidationError,
  getBoundingBox,
  detectCollisions,
  getAnnotationAriaLabel,
  injectA11y,
  applyRedactPatterns
};
