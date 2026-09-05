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
  getLeadoutChipSize,
  escapeXml,
  buildSvg,
  getRedactMode,
  log,
  setIdGenerator,
  resetIdGenerator
} = require('./render');
const {
  isRedactAnnotation,
  buildSolidRedactionLayers,
  buildSoftRedactionLayers
} = require('./redact');

const { optimize } = require('svgo');

// Runs on post-DPR/post-clamp annotations so the generated box matches exactly
// what will be rendered (DPR does not scale fontSize, so a box computed from
// raw coordinates and then scaled would not fit the drawn text box).
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

  const redactAnnotations = [];

  for (const [index, annotation] of annotations.entries()) {
    if (typeof annotation.text !== 'string') continue;
    if (!regexes.some((regex) => regex.test(annotation.text))) continue;

    const box = getBoundingBox(annotation, sizePreset);
    if (!box) continue;

    // The bounding box estimates text at 0.5em per non-CJK character, but real
    // glyphs are often wider (digits ~0.55em, 'W' ~0.95em), so rendered text
    // can spill past the box - and a redaction that leaves glyph edges exposed
    // leaks content. Inflate by a proportional safety margin. Known limit:
    // pathological all-wide-glyph strings can exceed even this; guardrails.md
    // tells callers to visually verify redacted output.
    const inflateX = Math.round(box.w * 0.35) + 12;
    const inflateY = 12;

    redactAnnotations.push({
      type: 'redact',
      mode: 'solid',
      x: box.x - inflateX,
      y: box.y - inflateY,
      width: box.w + inflateX * 2,
      height: box.h + inflateY * 2,
      label: 'REDACTED',
      // Internal marker (never serialised into the SVG): lets detectCollisions
      // skip the intentional overlap with the annotation this box covers.
      _generatedFor: index
    });
  }

  if (redactAnnotations.length === 0) {
    return annotations;
  }

  return [...annotations, ...redactAnnotations];
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
  const config = options.config || loadConfig(inputDir);

  let sizePreset = config.sizePreset;
  if (sizePreset === 'auto' || !sizePreset) {
    sizePreset = getSizePreset(width, height);
  }

  const redactPatterns = options.redactPatterns;
  const devicePixelRatio = options.devicePixelRatio || 1;
  const scaledAnnotations = devicePixelRatio !== 1
    ? annotations.map((annotation) => scaleAnnotationCoords(annotation, devicePixelRatio))
    : annotations;
  const padding = normalizeCanvasPadding(options.canvasPadding);
  const extendedWidth = width + padding.left + padding.right;
  const extendedHeight = height + padding.top + padding.bottom;
  const offsetAnnotations = padding.left || padding.top
    ? scaledAnnotations.map((annotation) => offsetAnnotationCoords(annotation, padding.left, padding.top))
    : scaledAnnotations;

  const { annotations: clampedAnnotations, warnings: clampWarnings } = clampAnnotations(offsetAnnotations, extendedWidth, extendedHeight);

  // redact_patterns runs after DPR scaling and clamping so each generated box
  // is computed from the coordinates the matched annotation will actually be
  // drawn at (DPR does not scale fontSize, and clamping can move annotations).
  // The generated boxes then get their own clamping pass against the canvas.
  let validAnnotations = clampedAnnotations;
  let generatedRedactionCount = 0;
  if (redactPatterns && redactPatterns.length > 0) {
    const withRedactions = applyRedactPatterns(clampedAnnotations, redactPatterns, sizePreset);
    if (withRedactions.length > clampedAnnotations.length) {
      const generated = withRedactions.slice(clampedAnnotations.length);
      const { annotations: clampedGenerated, warnings: generatedWarnings } = clampAnnotations(generated, extendedWidth, extendedHeight);
      for (const warning of generatedWarnings) {
        warning.annotation += clampedAnnotations.length;
      }
      clampWarnings.push(...generatedWarnings);
      validAnnotations = [...clampedAnnotations, ...clampedGenerated];
      generatedRedactionCount = clampedGenerated.length;
    }
  }

  // Redaction is a security feature: a region that silently ends up covering
  // nothing must be an error, never a warning. clampAnnotations may have
  // dropped an invalid width/height or clamped it to zero at the canvas edge.
  const redactAnnotations = [];
  const redactionWarnings = [];
  for (const [index, annotation] of validAnnotations.entries()) {
    if (!isRedactAnnotation(annotation)) continue;
    if (!(annotation.width >= 1) || !(annotation.height >= 1)) {
      throw new InvalidParameterError(
        `redact region (annotation #${index + 1}) has no coverable area inside the canvas after clamping; width and height must be at least 1px`,
        'annotations'
      );
    }
    redactAnnotations.push(annotation);
    const mode = getRedactMode(annotation);
    if (mode !== 'solid') {
      redactionWarnings.push({
        type: 'redaction',
        message: `annotation #${index + 1} uses reversible "${mode}" de-emphasis - it does not protect sensitive content. Use mode "solid" (the default for type "redact") to actually redact.`
      });
    }
  }
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

  if (outputFormat === 'svg' && generatedRedactionCount > 0) {
    // The whole point of redact_patterns is keeping matched text out of the
    // output, but an svg layer contains that text verbatim as <text> - no
    // rectangle can conceal the file's own contents. Fail instead of warning.
    throw new InvalidParameterError(
      'redact_patterns matched annotation text, but svg output is an annotation-only layer that contains the matched text verbatim. Use png, jpeg, or webp output instead.',
      'redact_patterns'
    );
  }
  if (outputFormat === 'svg' && redactAnnotations.length > 0) {
    redactionWarnings.push({
      type: 'redaction',
      message: 'svg output contains no image pixels: redact/blur regions do not conceal the underlying screenshot, and the SVG can be edited to remove them. Use png, jpeg, or webp for actual redaction.'
    });
  }

  const collisionWarnings = detectCollisions(validAnnotations, sizePreset);
  const warnings = [...clampWarnings, ...collisionWarnings, ...redactionWarnings];
  const svg = buildSvg(extendedWidth, extendedHeight, validAnnotations, enhancedOptions);
  const optimizedSvg = optimizeSvg(svg);
  const altText = generateAltText(validAnnotations, extendedWidth, extendedHeight, enhancedOptions);

  // Extract magnifier annotations for Sharp compositing
  const magnifierAnnotations = validAnnotations.filter(a => a.type === 'magnifier');

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
    // Solid redaction reaches the final image via the top SVG layer; the base
    // image only needs pixel work for pixelate/blur de-emphasis, plus a fully
    // redacted intermediate when a magnifier could otherwise sample original
    // pixels out of a redacted region.
    const solidRedactions = redactAnnotations.filter((a) => getRedactMode(a) === 'solid');
    const softRedactions = redactAnnotations.filter((a) => getRedactMode(a) !== 'solid');
    const softLayers = softRedactions.length > 0
      ? await buildSoftRedactionLayers(softRedactions, inputPath, { padding, sourceWidth: width, sourceHeight: height })
      : [];

    const hasPadding = !!(padding.top || padding.right || padding.bottom || padding.left);
    const extendOptions = {
      top: padding.top,
      right: padding.right,
      bottom: padding.bottom,
      left: padding.left,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    };

    let pipeline;
    let magnifierLayers;
    let baseLayers = [];

    if (redactAnnotations.length > 0 && magnifierAnnotations.length > 0) {
      // Bake every redaction into the sampling source - including solid fills,
      // because the SVG rectangle only covers its own region while a magnifier
      // anchored elsewhere would zoom the original pixels underneath it. The
      // final composite draws the solid rectangles again on top; same colour,
      // so the double application is idempotent.
      let intermediate = sharp(inputPath);
      if (hasPadding) intermediate = intermediate.extend(extendOptions);
      const solidLayers = buildSolidRedactionLayers(solidRedactions, extendedWidth, extendedHeight);
      if (softLayers.length > 0 || solidLayers.length > 0) {
        intermediate = intermediate.composite([...softLayers, ...solidLayers]);
      }
      const redactedBase = await intermediate.png().toBuffer();

      // The intermediate is the padded canvas, so extraction runs in
      // padded-canvas coordinates: zero offsets, extended bounds.
      magnifierLayers = await buildMagnifierLayers(magnifierAnnotations, redactedBase, {
        offsetLeft: 0,
        offsetTop: 0,
        boundsWidth: extendedWidth,
        boundsHeight: extendedHeight
      });
      pipeline = sharp(redactedBase);
    } else {
      // Sampling from the unpadded source: the offsets convert padded-canvas
      // coordinates back into source space.
      magnifierLayers = await buildMagnifierLayers(magnifierAnnotations, inputPath, {
        offsetLeft: padding.left,
        offsetTop: padding.top,
        boundsWidth: width,
        boundsHeight: height
      });
      pipeline = sharp(inputPath);
      if (hasPadding) pipeline = pipeline.extend(extendOptions);
      baseLayers = softLayers;
    }

    // sharp's composite() replaces the layer list rather than appending to it,
    // so every layer has to be collected up front and passed in a single call.
    // De-emphasis patches go under the magnifier patches, which go under the
    // SVG (it draws their border ring and connector line on top of them).
    pipeline = pipeline.composite([
      ...baseLayers,
      ...magnifierLayers,
      { input: Buffer.from(optimizedSvg), top: 0, left: 0 }
    ]);

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

/**
 * Extract-and-zoom patches for magnifier annotations.
 *
 * `source` is either the unpadded input image (offsets = canvas padding,
 * bounds = source dimensions) or the padded, fully-redacted intermediate
 * (offsets = 0, bounds = extended dimensions). Each call site passes exactly
 * one coordinate convention - nothing in here mixes the two.
 */
async function buildMagnifierLayers(magnifierAnnotations, source, { offsetLeft, offsetTop, boundsWidth, boundsHeight }) {
  const magnifierLayers = [];

  for (const mag of magnifierAnnotations) {
    try {
      // target/anchor arrive in padded-canvas space (offsetAnnotationCoords has
      // already shifted them). The composite targets that same space, but the
      // extract reads from `source`, so only it needs converting.
      const [tx, ty] = mag.target;
      const [ax, ay] = mag.anchor;
      const sourceX = tx - offsetLeft;
      const sourceY = ty - offsetTop;
      const r = Math.max(1, Math.round(mag.radius || 60));
      const zoom = mag.zoom || 2;

      // The window we want to magnify, centred on the target. Rounding the
      // whole window rather than its radius keeps the effective zoom within
      // half a source pixel of the requested one.
      const windowSize = Math.max(1, Math.round((r * 2) / zoom));
      const windowLeft = Math.round(sourceX - windowSize / 2);
      const windowTop = Math.round(sourceY - windowSize / 2);

      // Near an edge only part of that window exists. Extract the overlap and
      // place it at its true offset inside the circle, instead of sliding the
      // window inwards (which silently magnified the wrong spot) or stretching
      // a clipped region to fill the circle (which broke the zoom factor).
      const clipLeft = Math.max(0, windowLeft);
      const clipTop = Math.max(0, windowTop);
      const clipWidth = Math.min(boundsWidth, windowLeft + windowSize) - clipLeft;
      const clipHeight = Math.min(boundsHeight, windowTop + windowSize) - clipTop;

      if (clipWidth > 0 && clipHeight > 0) {
        const diameter = r * 2;
        const scale = diameter / windowSize;
        const patchLeft = Math.min(diameter - 1, Math.max(0, Math.round((clipLeft - windowLeft) * scale)));
        const patchTop = Math.min(diameter - 1, Math.max(0, Math.round((clipTop - windowTop) * scale)));
        const patchWidth = Math.max(1, Math.min(diameter - patchLeft, Math.round(clipWidth * scale)));
        const patchHeight = Math.max(1, Math.min(diameter - patchTop, Math.round(clipHeight * scale)));

        const patch = await sharp(source)
          .extract({ left: clipLeft, top: clipTop, width: clipWidth, height: clipHeight })
          .resize(patchWidth, patchHeight, { fit: 'fill' })
          .toBuffer();

        const circleMask = Buffer.from(
          `<svg width="${diameter}" height="${diameter}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`
        );
        // Anything the window covered that lies outside the image stays
        // transparent, so the screenshot underneath shows through.
        const maskedZoomed = await sharp({
          create: {
            width: diameter,
            height: diameter,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
          .composite([
            { input: patch, top: patchTop, left: patchLeft },
            { input: circleMask, blend: 'dest-in' }
          ])
          .png()
          .toBuffer();

        magnifierLayers.push({
          input: maskedZoomed,
          top: Math.round(ay - r),
          left: Math.round(ax - r)
        });
      } else {
        log('WARN', `Magnifier target (${tx},${ty}) lies outside the source image; skipping its zoomed region.`);
      }
    } catch (magErr) {
      log('WARN', `Magnifier compositing failed: ${magErr.message}`);
    }
  }

  return magnifierLayers;
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
  if (Array.isArray(scaled.target)) scaled.target = scaled.target.map(scaleValue);
  if (Array.isArray(scaled.anchor)) scaled.anchor = scaled.anchor.map(scaleValue);

  return scaled;
}

// Every coordinate-carrying field an annotation can have. scaleAnnotationCoords
// and offsetAnnotationCoords cover the same set; keeping remapAnnotation in step
// is what stops leadout/magnifier from being silently left behind.
const POINT_FIELDS = ['from', 'to', 'target', 'anchor'];

/**
 * Proportionally rescale one annotation's coordinates. Used by reannotate to
 * move annotations from a previous screenshot onto a resized one.
 */
function remapAnnotation(annotation, scaleX, scaleY) {
  const scaled = { ...annotation };
  const scaleNum = (value, scale) => (typeof value === 'number' && isFinite(value)) ? Math.round(value * scale) : value;
  const scalePoint = (point) => Array.isArray(point) && point.length >= 2
    ? [scaleNum(point[0], scaleX), scaleNum(point[1], scaleY), ...point.slice(2)]
    : point;

  if (typeof scaled.x === 'number') scaled.x = scaleNum(scaled.x, scaleX);
  if (typeof scaled.y === 'number') scaled.y = scaleNum(scaled.y, scaleY);
  if (typeof scaled.width === 'number') scaled.width = scaleNum(scaled.width, scaleX);
  if (typeof scaled.height === 'number') scaled.height = scaleNum(scaled.height, scaleY);
  if (typeof scaled.radius === 'number') scaled.radius = scaleNum(scaled.radius, Math.min(scaleX, scaleY));
  for (const field of POINT_FIELDS) {
    if (scaled[field]) scaled[field] = scalePoint(scaled[field]);
  }

  return scaled;
}

/**
 * Best-effort guess at the previous screenshot's size from the extents of its
 * annotations, for when the caller cannot supply the real dimensions.
 */
function estimateDimensionsFromAnnotations(annotations) {
  if (!Array.isArray(annotations)) return null;

  let maxX = 0;
  let maxY = 0;
  let found = false;

  const consider = (x, y) => {
    if (typeof x === 'number' && isFinite(x) && x > maxX) { maxX = x; found = true; }
    if (typeof y === 'number' && isFinite(y) && y > maxY) { maxY = y; found = true; }
  };

  for (const annotation of annotations) {
    consider(annotation.x, annotation.y);

    for (const field of POINT_FIELDS) {
      const point = annotation[field];
      if (Array.isArray(point) && point.length >= 2) consider(point[0], point[1]);
    }

    if (typeof annotation.width === 'number' && isFinite(annotation.width)) {
      consider((annotation.x || 0) + annotation.width, undefined);
    }
    if (typeof annotation.height === 'number' && isFinite(annotation.height)) {
      consider(undefined, (annotation.y || 0) + annotation.height);
    }
    if (typeof annotation.radius === 'number' && isFinite(annotation.radius)) {
      consider((annotation.x || 0) + annotation.radius, (annotation.y || 0) + annotation.radius);
    }
  }

  if (!found || maxX === 0 || maxY === 0) return null;
  return { width: maxX, height: maxY };
}

// sharp's extend() only accepts non-negative integers, so reject bad input here
// rather than letting it surface as a low-level "Expected positive integer" error.
function normalizePaddingSide(value, side) {
  if (value === undefined || value === null || value === false) return 0;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new InvalidParameterError(`canvas padding "${side}" must be a number, received ${JSON.stringify(value)}`, 'canvas_padding');
  }
  if (number < 0) {
    throw new InvalidParameterError(`canvas padding "${side}" must not be negative, received ${number}`, 'canvas_padding');
  }
  return Math.round(number);
}

function normalizeCanvasPadding(canvasPadding) {
  if (canvasPadding === undefined || canvasPadding === null) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  if (canvasPadding && typeof canvasPadding === 'object') {
    return {
      top: normalizePaddingSide(canvasPadding.top, 'top'),
      right: normalizePaddingSide(canvasPadding.right, 'right'),
      bottom: normalizePaddingSide(canvasPadding.bottom, 'bottom'),
      left: normalizePaddingSide(canvasPadding.left, 'left')
    };
  }

  const uniform = normalizePaddingSide(canvasPadding, 'padding');
  return { top: uniform, right: uniform, bottom: uniform, left: uniform };
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
  if (Array.isArray(shifted.target)) shifted.target = [shifted.target[0] + offsetX, shifted.target[1] + offsetY];
  if (Array.isArray(shifted.anchor)) shifted.anchor = [shifted.anchor[0] + offsetX, shifted.anchor[1] + offsetY];
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
    } else if (type === 'measure' && annotation.text) {
      details.push(`measure "${annotation.text}"`);
    } else if (type === 'leadout' && annotation.text) {
      details.push(`leadout "${annotation.text}"`);
    } else if ((type === 'bracket-label' || type === 'bracketLabel') && annotation.text) {
      details.push(`bracket "${annotation.text}"`);
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

    // The object spread is shallow, so from/to would still alias the caller's
    // arrays and get mutated in place by the clamping below. Copy them first.
    if (Array.isArray(clamped.from)) clamped.from = [...clamped.from];
    if (Array.isArray(clamped.to)) clamped.to = [...clamped.to];

    // Positional fields must end up with *some* number or the SVG breaks, so an
    // unusable value falls back to the minimum. Style fields instead get dropped
    // so the renderer's own default applies. Either way it is now reported.
    const DROP = Symbol('drop');

    const clampValue = (property, min, max, original, onInvalid = min) => {
      if (original === undefined || original === null || typeof original === 'boolean'
          || isNaN(original) || !isFinite(original)) {
        warnings.push(new CoordinateClampWarning(i, property, original, onInvalid === DROP ? 'default' : onInvalid));
        return onInvalid;
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
      clamped.width = clampValue('width', 1, maxWidth, clamped.width, DROP);
    }
    if (clamped.height !== undefined) {
      const maxHeight = imageHeight - (clamped.y || 0);
      clamped.height = clampValue('height', 1, maxHeight, clamped.height, DROP);
    }
    if (clamped.radius !== undefined) {
      const maxRadius = Math.min(imageWidth, imageHeight) / 2;
      clamped.radius = clampValue('radius', 1, maxRadius, clamped.radius, DROP);
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
      clamped.size = clampValue('size', 1, Infinity, clamped.size, DROP);
    }
    if (clamped.fontSize !== undefined) {
      clamped.fontSize = clampValue('fontSize', 1, Infinity, clamped.fontSize, DROP);
    }
    if (clamped.strokeWidth !== undefined) {
      clamped.strokeWidth = clampValue('strokeWidth', 1, Infinity, clamped.strokeWidth, DROP);
    }
    if (clamped.cornerRadius !== undefined) {
      clamped.cornerRadius = clampValue('cornerRadius', 0, Infinity, clamped.cornerRadius, DROP);
    }
    if (clamped.opacity !== undefined) {
      clamped.opacity = clampValue('opacity', 0, 1, clamped.opacity, DROP);
    }
    if (clamped.blockSize !== undefined) {
      clamped.blockSize = clampValue('blockSize', 1, Infinity, clamped.blockSize, DROP);
    }

    for (const key of Object.keys(clamped)) {
      if (clamped[key] === DROP) delete clamped[key];
    }

    clampedAnnotations.push(clamped);
  }

  return { annotations: clampedAnnotations, warnings };
}

function getBoundingBox(annotation, sizePreset) {
  const preset = SIZE_PRESETS[sizePreset] || SIZE_PRESETS.m;

  switch (annotation.type) {
    case 'marker':
    case 'number': {
      // createMarker draws the circle with r = size (not size / 2), and honours
      // an explicit annotation.size over the preset, so the box must match that.
      const size = typeof annotation.size === 'number' && isFinite(annotation.size)
        ? annotation.size
        : (preset.markerSize || SIZE_PRESETS.m.markerSize);
      // The badge style widens to size * 2.4 once the number reaches two digits.
      const halfWidth = annotation.style === 'badge' && annotation.number > 9 ? size * 1.2 : size;
      return { x: annotation.x - halfWidth, y: annotation.y - size, w: halfWidth * 2, h: size * 2 };
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
    case 'redact':
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
    case 'measure': {
      const sw = annotation.strokeWidth || 2;
      const x1 = annotation.from[0];
      const y1 = annotation.from[1];
      const x2 = annotation.to[0];
      const y2 = annotation.to[1];
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const maxX = Math.max(x1, x2);
      const maxY = Math.max(y1, y2);
      return { x: minX - sw - 10, y: minY - sw - 10, w: (maxX - minX) + sw * 2 + 20, h: (maxY - minY) + sw * 2 + 20 };
    }
    case 'leadout': {
      const [tx, ty] = annotation.target || [0, 0];
      const [ax, ay] = annotation.anchor || [0, 0];
      const fontSize = annotation.fontSize || preset.fontSize || 16;
      const chip = annotation.text !== undefined
        ? getLeadoutChipSize(annotation.text, fontSize)
        : { width: 100, height: fontSize * 1.4 + 10 };
      // 7 ≈ target dot radius plus its white halo ring.
      const dotPad = 7;
      const minX = Math.min(tx - dotPad, ax - chip.width / 2);
      const minY = Math.min(ty - dotPad, ay - chip.height / 2);
      const maxX = Math.max(tx + dotPad, ax + chip.width / 2);
      const maxY = Math.max(ty + dotPad, ay + chip.height / 2);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'bracket-label': {
      const [bx1, by1] = annotation.from || [0, 0];
      const [bx2, by2] = annotation.to || [0, 0];
      const depth = 30;
      const minX = Math.min(bx1, bx2) - depth;
      const minY = Math.min(by1, by2) - depth;
      const maxX = Math.max(bx1, bx2) + depth;
      const maxY = Math.max(by1, by2) + depth;
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'spotlight': {
      if (annotation.width && annotation.height) {
        return { x: annotation.x - annotation.width / 2, y: annotation.y - annotation.height / 2, w: annotation.width, h: annotation.height };
      }
      const r = annotation.radius || 60;
      return { x: annotation.x - r, y: annotation.y - r, w: r * 2, h: r * 2 };
    }
    case 'magnifier': {
      const [mtx, mty] = annotation.target || [0, 0];
      const [max, may] = annotation.anchor || [0, 0];
      const mr = annotation.radius || 60;
      const minX = Math.min(mtx - 10, max - mr);
      const minY = Math.min(mty - 10, may - mr);
      const maxX = Math.max(mtx + 10, max + mr);
      const maxY = Math.max(mty + 10, may + mr);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    default:
      return null;
  }
}

function detectCollisions(annotations, sizePreset) {
  const warnings = [];
  for (let i = 0; i < annotations.length; i++) {
    for (let j = i + 1; j < annotations.length; j++) {
      // A redaction generated by redact_patterns overlaps the annotation it
      // covers by design; warning about it would be pure noise.
      if (annotations[i]._generatedFor === j || annotations[j]._generatedFor === i) continue;

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
    case 'redact':
      return `${annotation.type} region ${position}`;
    case 'circle':
      return `Circle ${position}`;
    case 'connector':
      return `Connector ${position}`;
    case 'icon':
      return `Icon ${annotation.icon || 'badge'} ${position}`;
    case 'measure':
      return `Measurement${annotation.text ? ` "${annotation.text}"` : ''} ${position}`;
    case 'leadout':
      return `Leadout${annotation.text ? ` "${annotation.text}"` : ''} ${position}`;
    case 'bracket-label':
      return `Bracket${annotation.text ? ` "${annotation.text}"` : ''} ${position}`;
    case 'spotlight':
      return `Spotlight ${position}`;
    case 'magnifier':
      return `Magnifier ${annotation.zoom || 2}x ${position}`;
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
  if (annotation.type === 'arrow' || annotation.type === 'curved-arrow' || annotation.type === 'connector' || annotation.type === 'measure' || annotation.type === 'bracket-label') {
    if (!Array.isArray(annotation.from) || !Array.isArray(annotation.to)) {
      throw new ValidationError(`${annotation.type} annotations require from and to coordinate arrays`);
    }
  }
  if (annotation.type === 'leadout') {
    if (!Array.isArray(annotation.target) || !Array.isArray(annotation.anchor)) {
      throw new ValidationError('leadout annotations require target and anchor coordinate arrays');
    }
  }
  if (annotation.type === 'magnifier') {
    if (!Array.isArray(annotation.target) || !Array.isArray(annotation.anchor)) {
      throw new ValidationError('magnifier annotations require target and anchor coordinate arrays');
    }
  }
  if (annotation.type === 'spotlight') {
    if (typeof annotation.x !== 'number' || typeof annotation.y !== 'number') {
      throw new ValidationError('spotlight annotations require x and y coordinates');
    }
  }
  // A redaction region with an implicit position or size is dangerous - it
  // could silently cover the wrong thing. All four fields are mandatory
  // (breaking change for legacy blur calls that relied on 100x60 defaults).
  if (annotation.type === 'redact' || annotation.type === 'blur') {
    if (typeof annotation.x !== 'number' || typeof annotation.y !== 'number'
        || typeof annotation.width !== 'number' || typeof annotation.height !== 'number') {
      throw new ValidationError(`${annotation.type} annotations require numeric x, y, width, and height`);
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
  remapAnnotation,
  estimateDimensionsFromAnnotations,
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
