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
  measureTextBlock,
  assignMarkerNumbers,
  resolveMarkerPlacement,
  getColor,
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
  checkImageSize(metadata);

  const devicePixelRatio = options.devicePixelRatio || 1;
  // Crop runs before everything else: the output canvas is the cropped region,
  // and every later stage (padding, clamping, redaction, magnifier sampling)
  // works in cropped-image coordinates. Annotation coordinates stay relative
  // to the ORIGINAL image - the pipeline shifts them - so callers can reuse
  // Playwright/DOM coordinates without doing their own subtraction.
  const crop = normalizeCrop(options.crop, metadata.width, metadata.height, devicePixelRatio);
  let baseSource = inputPath;
  let width = metadata.width;
  let height = metadata.height;
  if (crop) {
    try {
      baseSource = await sharp(inputPath)
        .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
        .png()
        .toBuffer();
    } catch (err) {
      throw new ImageProcessingError(`Failed to crop input image: ${err.message}`, err);
    }
    width = crop.width;
    height = crop.height;
  }

  const inputDir = path.dirname(inputPath);
  const config = options.config || loadConfig(inputDir);

  let sizePreset = config.sizePreset;
  if (sizePreset === 'auto' || !sizePreset) {
    sizePreset = getSizePreset(width, height);
  }

  const redactPatterns = options.redactPatterns;
  const dprScaledAnnotations = devicePixelRatio !== 1
    ? annotations.map((annotation) => scaleAnnotationCoords(annotation, devicePixelRatio))
    : annotations;
  const scaledAnnotations = crop && (crop.left || crop.top)
    ? dprScaledAnnotations.map((annotation) => offsetAnnotationCoords(annotation, -crop.left, -crop.top))
    : dprScaledAnnotations;
  // measure annotations with no text get the measured distance, expressed in
  // the caller's (CSS logical pixel) coordinate space - hence the DPR divide.
  const measuredAnnotations = scaledAnnotations.map((annotation) => {
    if (annotation.type !== 'measure' || !Array.isArray(annotation.from) || !Array.isArray(annotation.to)) return annotation;
    if (annotation.text !== undefined && annotation.text !== null && annotation.text !== '') return annotation;
    const distance = Math.hypot(annotation.to[0] - annotation.from[0], annotation.to[1] - annotation.from[1]) / devicePixelRatio;
    return { ...annotation, text: `${Math.round(distance)} px` };
  });
  // Background padding stacks on top of canvas_padding: the annotation
  // coordinate pipeline only ever sees one combined padding, so background
  // needs no coordinate handling of its own.
  const backgroundOpts = normalizeBackground(options.background);
  let padding = normalizeCanvasPadding(options.canvasPadding);
  if (backgroundOpts) {
    padding = {
      top: padding.top + backgroundOpts.padding,
      right: padding.right + backgroundOpts.padding,
      bottom: padding.bottom + backgroundOpts.padding,
      left: padding.left + backgroundOpts.padding
    };
  }
  const extendedWidth = width + padding.left + padding.right;
  const extendedHeight = height + padding.top + padding.bottom;
  const offsetAnnotations = padding.left || padding.top
    ? measuredAnnotations.map((annotation) => offsetAnnotationCoords(annotation, padding.left, padding.top))
    : measuredAnnotations;

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

  if (outputFormat === 'svg' && backgroundOpts) {
    throw new InvalidParameterError(
      'background is a pixel-compositing feature (padding, rounded corners, shadow) and is not available with svg output. Use png, jpeg, webp, or avif.',
      'background'
    );
  }
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

  // Assign auto-incremented marker numbers here (buildSvg would do it again,
  // idempotently) so alt text, aria labels, and collision boxes all see the
  // numbers that actually get drawn.
  validAnnotations = assignMarkerNumbers(validAnnotations);

  let autoLayoutWarnings = [];
  if (options.autoLayout === true) {
    const resolvedLayout = resolveCollisions(validAnnotations, sizePreset, extendedWidth, extendedHeight);
    validAnnotations = resolvedLayout.annotations;
    autoLayoutWarnings = resolvedLayout.warnings;
  }

  const collisionWarnings = detectCollisions(validAnnotations, sizePreset);
  const layoutHint = collisionWarnings.length > 0 && options.autoLayout !== true
    ? [{ type: 'hint', message: `${collisionWarnings.length} overlap(s) detected. Set auto_layout: true to let leadout/callout labels move to a free position automatically.` }]
    : [];
  const warnings = [...clampWarnings, ...autoLayoutWarnings, ...collisionWarnings, ...layoutHint, ...redactionWarnings];
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
      crop: crop || undefined,
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
      ? await buildSoftRedactionLayers(softRedactions, baseSource, { padding, sourceWidth: width, sourceHeight: height })
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
      let intermediate = sharp(baseSource);
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
      magnifierLayers = await buildMagnifierLayers(magnifierAnnotations, baseSource, {
        offsetLeft: padding.left,
        offsetTop: padding.top,
        boundsWidth: width,
        boundsHeight: height
      });
      pipeline = sharp(baseSource);
      if (hasPadding) pipeline = pipeline.extend(extendOptions);
      baseLayers = softLayers;
    }

    // sharp's composite() replaces the layer list rather than appending to it,
    // so every layer has to be collected up front and passed in a single call.
    // De-emphasis patches go under the magnifier patches, which go under the
    // SVG (it draws their border ring and connector line on top of them).
    if (backgroundOpts) {
      // Bake the soft layers into the padded canvas, round the image-area
      // corners (dest-in mask), then rebuild the stack bottom-up: background
      // canvas, drop shadow, rounded screenshot card, magnifier patches,
      // annotation SVG. Magnifiers sampled from the pre-rounded pixels above.
      let padded = pipeline;
      if (baseLayers.length > 0) padded = padded.composite(baseLayers);
      const paddedBuffer = await padded.png().toBuffer();
      const roundedBuffer = await sharp(paddedBuffer)
        .composite([{ input: Buffer.from(buildRoundedCornerMaskSvg(backgroundOpts, padding, width, height, extendedWidth, extendedHeight)), blend: 'dest-in' }])
        .png().toBuffer();
      const backgroundBuffer = await buildBackgroundLayer(backgroundOpts, extendedWidth, extendedHeight);
      const cardLayers = [];
      if (backgroundOpts.shadow) {
        cardLayers.push({ input: Buffer.from(buildBackgroundShadowSvg(backgroundOpts, padding, width, height, extendedWidth, extendedHeight)), top: 0, left: 0 });
      }
      cardLayers.push({ input: roundedBuffer, top: 0, left: 0 });
      pipeline = sharp(backgroundBuffer).composite([
        ...cardLayers,
        ...magnifierLayers,
        { input: Buffer.from(optimizedSvg), top: 0, left: 0 }
      ]);
    } else {
      pipeline = pipeline.composite([
        ...baseLayers,
        ...magnifierLayers,
        { input: Buffer.from(optimizedSvg), top: 0, left: 0 }
      ]);
    }

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
    crop: crop || undefined,
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
  if (scaled.rx !== undefined) scaled.rx = scaleValue(scaled.rx);
  if (scaled.ry !== undefined) scaled.ry = scaleValue(scaled.ry);
  if (Array.isArray(scaled.from)) scaled.from = scaled.from.map(scaleValue);
  if (Array.isArray(scaled.to)) scaled.to = scaled.to.map(scaleValue);
  if (Array.isArray(scaled.target)) scaled.target = scaled.target.map(scaleValue);
  if (Array.isArray(scaled.anchor)) scaled.anchor = scaled.anchor.map(scaleValue);
  if (Array.isArray(scaled.points)) {
    scaled.points = scaled.points.map((point) => Array.isArray(point) ? point.map(scaleValue) : point);
  }

  return scaled;
}

// Every coordinate-carrying field an annotation can have. scaleAnnotationCoords
// and offsetAnnotationCoords cover the same set; keeping remapAnnotation in step
// is what stops leadout/magnifier from being silently left behind.
const POINT_FIELDS = ['from', 'to', 'target', 'anchor'];

// Sides a marker can be attached to, plus 'auto' (pick one) and 'none' (draw
// on the target the way markers always did).
const MARKER_ATTACH_SIDES = ['left', 'right', 'top', 'bottom', 'auto', 'none'];

/**
 * Proportionally rescale one annotation's coordinates. Used by reannotate to
 * move annotations from a previous screenshot onto a resized one.
 */
function remapAnnotation(annotation, scaleX, scaleY) {
  const scaled = { ...annotation };
  const scaleNum = (value, scale) => (typeof value === 'number' && isFinite(value)) ? Math.round(value * scale) : value;
  // A marker's target is [x, y, width, height], so entries past the first two
  // are a size and have to be rescaled as well; every other point field is two
  // numbers long and slice(2) leaves nothing to do.
  const scalePoint = (point) => Array.isArray(point) && point.length >= 2
    ? [
      scaleNum(point[0], scaleX),
      scaleNum(point[1], scaleY),
      ...(point.length > 2 ? [scaleNum(point[2], scaleX)] : []),
      ...(point.length > 3 ? [scaleNum(point[3], scaleY)] : []),
      ...point.slice(4)
    ]
    : point;

  if (typeof scaled.x === 'number') scaled.x = scaleNum(scaled.x, scaleX);
  if (typeof scaled.y === 'number') scaled.y = scaleNum(scaled.y, scaleY);
  if (typeof scaled.width === 'number') scaled.width = scaleNum(scaled.width, scaleX);
  if (typeof scaled.height === 'number') scaled.height = scaleNum(scaled.height, scaleY);
  if (typeof scaled.radius === 'number') scaled.radius = scaleNum(scaled.radius, Math.min(scaleX, scaleY));
  if (typeof scaled.rx === 'number') scaled.rx = scaleNum(scaled.rx, scaleX);
  if (typeof scaled.ry === 'number') scaled.ry = scaleNum(scaled.ry, scaleY);
  for (const field of POINT_FIELDS) {
    if (scaled[field]) scaled[field] = scalePoint(scaled[field]);
  }
  if (Array.isArray(scaled.points)) scaled.points = scaled.points.map(scalePoint);

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
      if (!Array.isArray(point) || point.length < 2) continue;
      consider(point[0], point[1]);
      // A marker target is a box, so its far corner is the real extent.
      if (point.length > 2) consider((point[0] || 0) + (point[2] || 0), (point[1] || 0) + (point[3] || 0));
    }

    if (Array.isArray(annotation.points)) {
      for (const point of annotation.points) {
        if (Array.isArray(point) && point.length >= 2) consider(point[0], point[1]);
      }
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
    if (typeof annotation.rx === 'number' && isFinite(annotation.rx)) {
      consider((annotation.x || 0) + annotation.rx, undefined);
    }
    if (typeof annotation.ry === 'number' && isFinite(annotation.ry)) {
      consider(undefined, (annotation.y || 0) + annotation.ry);
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

const BACKGROUND_GRADIENT_DIRECTIONS = {
  'to-bottom': { x1: 0, y1: 0, x2: 0, y2: 1 },
  'to-right': { x1: 0, y1: 0, x2: 1, y2: 0 },
  'to-bottom-right': { x1: 0, y1: 0, x2: 1, y2: 1 }
};

/**
 * Validate the top-level background option (CleanShot-style export card:
 * padding + rounded image corners + drop shadow on a color/gradient canvas).
 * Returns null when not requested.
 */
function normalizeBackground(background) {
  if (background === undefined || background === null || background === false) return null;
  if (typeof background === 'string') background = { color: background };
  if (typeof background !== 'object' || Array.isArray(background)) {
    throw new InvalidParameterError('background must be an object or a color string', 'background');
  }
  const { color, gradient } = background;
  if (!color && !gradient) {
    throw new InvalidParameterError('background requires a "color" or a "gradient"', 'background');
  }
  if (color && gradient) {
    throw new InvalidParameterError('background accepts either "color" or "gradient", not both', 'background');
  }
  let normalizedGradient = null;
  if (gradient) {
    if (typeof gradient !== 'object' || !gradient.from || !gradient.to) {
      throw new InvalidParameterError('background.gradient requires "from" and "to" colors', 'background');
    }
    const direction = gradient.direction || 'to-bottom-right';
    if (!BACKGROUND_GRADIENT_DIRECTIONS[direction]) {
      throw new InvalidParameterError(`background.gradient.direction must be one of ${Object.keys(BACKGROUND_GRADIENT_DIRECTIONS).join(', ')}`, 'background');
    }
    normalizedGradient = { from: getColor(gradient.from), to: getColor(gradient.to), direction };
  }
  const nonNegative = (value, name, fallback) => {
    if (value === undefined || value === null) return fallback;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new InvalidParameterError(`background.${name} must be a non-negative number, received ${JSON.stringify(value)}`, 'background');
    }
    return n;
  };
  let shadow = background.shadow === undefined ? true : background.shadow;
  if (shadow === true) shadow = {};
  const normalizedShadow = shadow
    ? {
      blur: nonNegative(shadow.blur, 'shadow.blur', 24),
      opacity: Math.min(1, nonNegative(shadow.opacity, 'shadow.opacity', 0.35)),
      offsetY: typeof shadow.offsetY === 'number' && Number.isFinite(shadow.offsetY) ? shadow.offsetY : 12
    }
    : null;
  return {
    color: color ? getColor(color) : null,
    gradient: normalizedGradient,
    padding: Math.round(nonNegative(background.padding, 'padding', 48)),
    cornerRadius: Math.round(nonNegative(background.imageCornerRadius, 'imageCornerRadius', 12)),
    shadow: normalizedShadow
  };
}

async function buildBackgroundLayer(backgroundOpts, canvasWidth, canvasHeight) {
  const svgNs = 'http://www.w3.org/2000/svg';
  let fillMarkup;
  let defs = '';
  if (backgroundOpts.gradient) {
    const { from, to, direction } = backgroundOpts.gradient;
    const d = BACKGROUND_GRADIENT_DIRECTIONS[direction];
    defs = `<defs><linearGradient id="bg" x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`;
    fillMarkup = 'url(#bg)';
  } else {
    fillMarkup = backgroundOpts.color;
  }
  const svg = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="${svgNs}">${defs}<rect width="${canvasWidth}" height="${canvasHeight}" fill="${fillMarkup}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function buildBackgroundShadowSvg(backgroundOpts, padding, imageWidth, imageHeight, canvasWidth, canvasHeight) {
  const { blur, opacity, offsetY } = backgroundOpts.shadow;
  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur / 2}"/></filter></defs>
  <rect x="${padding.left}" y="${padding.top + offsetY}" width="${imageWidth}" height="${imageHeight}" rx="${backgroundOpts.cornerRadius}" fill="black" opacity="${opacity}" filter="url(#s)"/>
</svg>`;
}

function buildRoundedCornerMaskSvg(backgroundOpts, padding, imageWidth, imageHeight, canvasWidth, canvasHeight) {
  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="${padding.left}" y="${padding.top}" width="${imageWidth}" height="${imageHeight}" rx="${backgroundOpts.cornerRadius}" fill="#fff"/></svg>`;
}

/**
 * Validate the top-level crop option and convert it from CSS logical pixels
 * into device pixels intersected with the source image. Returns null when no
 * crop was requested; throws when the region is unusable.
 */
function normalizeCrop(crop, imageWidth, imageHeight, dpr = 1) {
  if (crop === undefined || crop === null) return null;
  if (typeof crop !== 'object' || Array.isArray(crop)) {
    throw new InvalidParameterError('crop must be an object with numeric x, y, width, and height', 'crop');
  }
  const num = (value, name) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
      throw new InvalidParameterError(`crop.${name} must be a finite number, received ${JSON.stringify(value)}`, 'crop');
    }
    return n;
  };
  const x = num(crop.x, 'x') * dpr;
  const y = num(crop.y, 'y') * dpr;
  const w = num(crop.width, 'width') * dpr;
  const h = num(crop.height, 'height') * dpr;
  if (w <= 0 || h <= 0) {
    throw new InvalidParameterError('crop width and height must be positive', 'crop');
  }
  const left = Math.min(Math.max(0, Math.round(x)), imageWidth);
  const top = Math.min(Math.max(0, Math.round(y)), imageHeight);
  const right = Math.min(imageWidth, Math.round(x + w));
  const bottom = Math.min(imageHeight, Math.round(y + h));
  if (right - left < 1 || bottom - top < 1) {
    throw new InvalidParameterError(
      `crop region (x=${crop.x}, y=${crop.y}, ${crop.width}x${crop.height}) has no overlap with the ${imageWidth}x${imageHeight} source image`,
      'crop'
    );
  }
  return { left, top, width: right - left, height: bottom - top };
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
  // slice(2) matters here: a marker target is [x, y, width, height], and
  // rebuilding it as a bare pair silently collapsed the box to a point, so any
  // padded/cropped image lost every attached marker's offset.
  if (Array.isArray(shifted.target)) shifted.target = [shifted.target[0] + offsetX, shifted.target[1] + offsetY, ...shifted.target.slice(2)];
  if (Array.isArray(shifted.anchor)) shifted.anchor = [shifted.anchor[0] + offsetX, shifted.anchor[1] + offsetY];
  if (Array.isArray(shifted.points)) {
    shifted.points = shifted.points.map((point) => Array.isArray(point)
      ? [point[0] + offsetX, point[1] + offsetY, ...point.slice(2)]
      : point);
  }
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
    } else if (type === 'marker' && annotation.number !== undefined && Array.isArray(annotation.target) && annotation.target.length >= 2) {
      // Attached markers have no x/y of their own; the target box locates them.
      details.push(`marker #${annotation.number} on the element at (${annotation.target[0]},${annotation.target[1]})`);
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
    if (clamped.rx !== undefined) {
      clamped.rx = clampValue('rx', 1, imageWidth / 2, clamped.rx, DROP);
    }
    if (clamped.ry !== undefined) {
      clamped.ry = clampValue('ry', 1, imageHeight / 2, clamped.ry, DROP);
    }
    if (clamped.maxWidth !== undefined) {
      clamped.maxWidth = clampValue('maxWidth', 1, Infinity, clamped.maxWidth, DROP);
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

    if (Array.isArray(clamped.points)) {
      clamped.points = clamped.points.map((point) => Array.isArray(point) ? [...point] : point);
      clamped.points.forEach((point, pointIndex) => {
        if (!Array.isArray(point)) return;
        if (point[0] !== undefined) {
          point[0] = clampValue(`points[${pointIndex}][0]`, 0, imageWidth, point[0]);
        }
        if (point[1] !== undefined) {
          point[1] = clampValue(`points[${pointIndex}][1]`, 0, imageHeight, point[1]);
        }
      });
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
      // An attached marker is drawn beside its target, not at the requested
      // x/y, so the box has to follow the same placement the renderer used or
      // auto-layout would shuffle the wrong rectangle around.
      const placement = resolveMarkerPlacement(annotation, size);
      if (typeof placement.x !== 'number' || !isFinite(placement.x)
          || typeof placement.y !== 'number' || !isFinite(placement.y)) return null;
      // The badge style widens to size * 2.4 once the number reaches two digits.
      const halfWidth = annotation.style === 'badge' && annotation.number > 9 ? size * 1.2 : size;
      // The white casing ring adds real ink beyond the disc; count it so two
      // neighbouring markers are not judged clear when their rings touch.
      const casing = Math.max(2, size * 0.18);
      return {
        x: placement.x - halfWidth - casing,
        y: placement.y - size - casing,
        w: (halfWidth + casing) * 2,
        h: (size + casing) * 2
      };
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
      // Mirror createCallout's wrap rule: width fixes the box and the wrap
      // width; maxWidth wraps without fixing the box.
      const wrapWidth = (annotation.width || 0) > 0
        ? annotation.width - padding * 2
        : ((annotation.maxWidth || 0) > 0 ? annotation.maxWidth - padding * 2 : null);
      const { lines, width: contentWidth } = measureTextBlock(String(annotation.text || ''), fontSize, { maxWidth: wrapWidth, lineHeightRatio: LINE_HEIGHT_RATIO });
      const lineHeight = fontSize * LINE_HEIGHT_RATIO;
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
    case 'ellipse': {
      // Mirrors createEllipse's rx/ry-over-width/height precedence and defaults.
      const rx = annotation.rx > 0 ? annotation.rx : (annotation.width > 0 ? annotation.width / 2 : 40);
      const ry = annotation.ry > 0 ? annotation.ry : (annotation.height > 0 ? annotation.height / 2 : 25);
      return { x: annotation.x - rx, y: annotation.y - ry, w: rx * 2, h: ry * 2 };
    }
    case 'label': {
      const fontSize = annotation.fontSize || preset.fontSize || 18;
      const padding = annotation.padding || 10;
      const { lines, width: textWidth, lineHeight } = measureTextBlock(String(annotation.text || ''), fontSize, { maxWidth: annotation.maxWidth || null, lineHeightRatio: 1.3 });
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
        ? getLeadoutChipSize(annotation.text, fontSize, annotation.maxWidth || null)
        : { width: 100, height: fontSize * 1.4 + 10 };
      // 7 ≈ target dot radius plus its white halo ring.
      const dotPad = 7;
      const minX = Math.min(tx - dotPad, ax - chip.width / 2);
      const minY = Math.min(ty - dotPad, ay - chip.height / 2);
      const maxX = Math.max(tx + dotPad, ax + chip.width / 2);
      const maxY = Math.max(ty + dotPad, ay + chip.height / 2);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'polyline':
    case 'polygon':
    case 'freehand': {
      const points = Array.isArray(annotation.points) ? annotation.points.filter((p) => Array.isArray(p) && p.length >= 2) : [];
      if (points.length === 0) return null;
      const sw = annotation.strokeWidth || 4;
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX - sw, y: minY - sw, w: (Math.max(...xs) - minX) + sw * 2, h: (Math.max(...ys) - minY) + sw * 2 };
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

function boxesOverlap(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0
    && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
}

/**
 * Opt-in collision resolution, limited to the two annotations whose label
 * position is a stylistic choice rather than a pointer target: a leadout's
 * anchor can mirror around its target, and a callout's pointer direction can
 * flip. The first candidate that fits inside the canvas without touching any
 * other bounding box wins; unsolvable cases stay where the caller put them.
 */
function resolveCollisions(annotations, sizePreset, canvasWidth, canvasHeight) {
  const resolved = [...annotations];
  const boxes = resolved.map((annotation) => getBoundingBox(annotation, sizePreset));
  const warnings = [];

  const collides = (box, selfIndex) => {
    for (let i = 0; i < boxes.length; i++) {
      if (i === selfIndex || !boxes[i]) continue;
      if (boxesOverlap(box, boxes[i])) return true;
    }
    return false;
  };
  const fits = (box, selfIndex) => !!box && box.x >= 0 && box.y >= 0
    && box.x + box.w <= canvasWidth && box.y + box.h <= canvasHeight
    && !collides(box, selfIndex);

  for (let i = 0; i < resolved.length; i++) {
    const annotation = resolved[i];
    if (!boxes[i] || !collides(boxes[i], i)) continue;

    let candidates;
    if (annotation.type === 'leadout' && Array.isArray(annotation.target) && Array.isArray(annotation.anchor)) {
      const [tx, ty] = annotation.target;
      const [ax, ay] = annotation.anchor;
      candidates = [
        { anchor: [2 * tx - ax, ay] },
        { anchor: [ax, 2 * ty - ay] },
        { anchor: [2 * tx - ax, 2 * ty - ay] }
      ];
    } else if (annotation.type === 'callout') {
      const current = annotation.pointer || 'bottom';
      const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' }[current];
      candidates = [opposite, ...['top', 'bottom', 'left', 'right'].filter((p) => p !== current && p !== opposite)]
        .map((pointer) => ({ pointer }));
    } else if (annotation.type === 'marker' || annotation.type === 'number') {
      // Numbering a dense page is exactly the case that needs auto-layout, and
      // markers used to be skipped here entirely. A marker that knows its
      // target box can be moved to another side of it; one that only has an
      // x/y has nothing to attach to, so it steps out along the compass
      // instead, keeping its leader-free look.
      if (Array.isArray(annotation.target)) {
        const current = annotation.attach && annotation.attach !== 'auto' ? annotation.attach : null;
        candidates = ['left', 'right', 'top', 'bottom']
          .filter((side) => side !== current)
          .map((attach) => ({ attach }));
      } else if (typeof annotation.x === 'number' && typeof annotation.y === 'number') {
        const size = typeof annotation.size === 'number' && isFinite(annotation.size)
          ? annotation.size
          : ((SIZE_PRESETS[sizePreset] || SIZE_PRESETS.m).markerSize);
        const step = size * 2.4;
        candidates = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]
          .map(([dx, dy]) => ({ x: annotation.x + dx * step, y: annotation.y + dy * step }));
      } else {
        continue;
      }
    } else {
      continue;
    }

    for (const change of candidates) {
      const candidate = { ...annotation, ...change };
      const candidateBox = getBoundingBox(candidate, sizePreset);
      if (fits(candidateBox, i)) {
        resolved[i] = candidate;
        boxes[i] = candidateBox;
        warnings.push({
          type: 'auto-layout',
          annotation: i,
          message: `annotation #${i + 1} (${annotation.type}) was repositioned to avoid an overlap (${JSON.stringify(change)})`
        });
        break;
      }
    }
  }

  return { annotations: resolved, warnings };
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
  // A marker can carry its position as a target box instead of x/y, in which
  // case the box is the only thing that locates it - saying "with no position"
  // would drop the one useful fact a screen reader has about it.
  const isMarker = annotation.type === 'marker' || annotation.type === 'number';
  const targetBox = isMarker && Array.isArray(annotation.target) && annotation.target.length >= 2
    ? annotation.target
    : null;
  const position = annotation.from && annotation.to
    ? `from ${annotation.from[0]},${annotation.from[1]} to ${annotation.to[0]},${annotation.to[1]}`
    : typeof annotation.x === 'number' && typeof annotation.y === 'number'
      ? `at ${annotation.x},${annotation.y}`
      : targetBox
        ? `on the element at ${targetBox[0]},${targetBox[1]}`
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
    case 'ellipse':
      return `Ellipse ${position}`;
    case 'polyline':
    case 'polygon':
    case 'freehand':
      return `${annotation.type} with ${Array.isArray(annotation.points) ? annotation.points.length : 0} points`;
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
  if (annotation.type === 'marker' || annotation.type === 'number') {
    const hasPoint = typeof annotation.x === 'number' && typeof annotation.y === 'number';
    const hasTarget = Array.isArray(annotation.target) && annotation.target.length >= 2
      && annotation.target.slice(0, 2).every((value) => typeof value === 'number' && isFinite(value));
    if (!hasPoint && !hasTarget) {
      throw new ValidationError('Marker annotations require x and y coordinates, or a target [x, y, width, height]');
    }
    if (annotation.attach !== undefined && !MARKER_ATTACH_SIDES.includes(annotation.attach)) {
      throw new ValidationError(`Marker attach must be one of ${MARKER_ATTACH_SIDES.join(', ')}`);
    }
    if (annotation.attach !== undefined && annotation.attach !== 'none' && !hasTarget) {
      throw new ValidationError('Marker attach needs a target [x, y, width, height] to attach to');
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
  if (annotation.type === 'polyline' || annotation.type === 'polygon' || annotation.type === 'freehand') {
    const minPoints = annotation.type === 'polygon' ? 3 : 2;
    const valid = Array.isArray(annotation.points)
      ? annotation.points.filter((p) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
      : [];
    if (valid.length < minPoints) {
      throw new ValidationError(`${annotation.type} annotations require a points array with at least ${minPoints} [x, y] pairs`);
    }
  }
  if (annotation.type === 'ellipse') {
    if (typeof annotation.x !== 'number' || typeof annotation.y !== 'number') {
      throw new ValidationError('ellipse annotations require x and y center coordinates');
    }
    const hasRadii = typeof annotation.rx === 'number' || typeof annotation.ry === 'number';
    const hasBox = typeof annotation.width === 'number' || typeof annotation.height === 'number';
    if (!hasRadii && !hasBox) {
      throw new ValidationError('ellipse annotations require rx/ry radii (or width/height)');
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
  normalizeCrop,
  normalizeBackground,
  resolveCollisions,
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
