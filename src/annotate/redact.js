/**
 * Pixel-level redaction layers.
 *
 * Solid redaction is drawn as an opaque rectangle on top of the SVG annotation
 * layer (render.js createRedact) — after flattening that is just as
 * irreversible as replacing pixels, and it also covers annotations whose text
 * triggered redact_patterns. This module supplies the two things the SVG layer
 * cannot do:
 *
 *   - pixelate/blur de-emphasis, which must sample the base image, and
 *   - solid fill patches for the magnifier sampling intermediate, because a
 *     top-layer rectangle only covers its own region while a magnifier anchored
 *     elsewhere would happily zoom the original pixels underneath it.
 *
 * All regions arrive in padded-canvas coordinates (validAnnotations space).
 */

const sharp = require('sharp');
const { getColor, getRedactMode, log, DEFAULT_REDACT_FILL } = require('./render');

function isRedactAnnotation(annotation) {
  return !!annotation && (annotation.type === 'redact' || annotation.type === 'blur');
}

// Round and clip a region to the canvas. Returns null when nothing remains.
function normalizeRegion(annotation, canvasWidth, canvasHeight) {
  const left = Math.max(0, Math.round(annotation.x || 0));
  const top = Math.max(0, Math.round(annotation.y || 0));
  const right = Math.min(canvasWidth, Math.round((annotation.x || 0) + (annotation.width || 0)));
  const bottom = Math.min(canvasHeight, Math.round((annotation.y || 0) + (annotation.height || 0)));
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}

/**
 * Composite layers that fill each solid redact region with its colour. Used
 * only to bake redactions into the magnifier sampling intermediate; the final
 * image gets the same fill again from the SVG top-layer rectangle (idempotent).
 */
function buildSolidRedactionLayers(annotations, canvasWidth, canvasHeight) {
  const layers = [];
  for (const annotation of annotations) {
    const region = normalizeRegion(annotation, canvasWidth, canvasHeight);
    if (!region) continue;
    layers.push({
      input: {
        create: {
          width: region.width,
          height: region.height,
          channels: 4,
          background: getColor(annotation.color || DEFAULT_REDACT_FILL)
        }
      },
      left: region.left,
      top: region.top
    });
  }
  return layers;
}

/**
 * Composite layers that pixelate or blur the base image under each region.
 * Regions are clipped to the part that overlaps the source image — padding
 * added by extend() is uniform background with nothing to de-emphasise.
 *
 * These are visual de-emphasis only: block averages survive pixelation and
 * Gaussian blur is invertible. Callers are responsible for warning about that.
 *
 * @param {Array<object>} annotations - redact annotations with a pixelate/blur mode
 * @param {string|Buffer} source - the unpadded source image
 * @param {{padding: object, sourceWidth: number, sourceHeight: number}} opts
 */
async function buildSoftRedactionLayers(annotations, source, { padding, sourceWidth, sourceHeight }) {
  const layers = [];

  for (const annotation of annotations) {
    const canvasWidth = sourceWidth + padding.left + padding.right;
    const canvasHeight = sourceHeight + padding.top + padding.bottom;
    const region = normalizeRegion(annotation, canvasWidth, canvasHeight);
    if (!region) continue;

    // Overlap with the actual image, in unpadded source coordinates.
    const srcLeft = Math.max(0, region.left - padding.left);
    const srcTop = Math.max(0, region.top - padding.top);
    const srcRight = Math.min(sourceWidth, region.left + region.width - padding.left);
    const srcBottom = Math.min(sourceHeight, region.top + region.height - padding.top);
    const srcWidth = srcRight - srcLeft;
    const srcHeight = srcBottom - srcTop;
    if (srcWidth < 1 || srcHeight < 1) continue;

    const mode = getRedactMode(annotation);
    let patch = sharp(source).extract({ left: srcLeft, top: srcTop, width: srcWidth, height: srcHeight });

    if (mode === 'pixelate') {
      const blockSize = Math.max(1, Math.round(annotation.blockSize || 12));
      const downWidth = Math.max(1, Math.round(srcWidth / blockSize));
      const downHeight = Math.max(1, Math.round(srcHeight / blockSize));
      const down = await patch.resize(downWidth, downHeight, { fit: 'fill' }).toBuffer();
      patch = sharp(down).resize(srcWidth, srcHeight, { fit: 'fill', kernel: 'nearest' });
    } else if (mode === 'blur') {
      // sharp only accepts sigma in [0.3, 1000]. The blur cannot see past the
      // extracted region, so edges bleed slightly less than a full-image blur
      // would — acceptable for de-emphasis.
      const sigma = Math.min(1000, Math.max(0.3, annotation.intensity || 12));
      patch = patch.blur(sigma);
    } else {
      log('WARN', `buildSoftRedactionLayers received unexpected mode "${mode}"; skipping.`);
      continue;
    }

    layers.push({
      input: await patch.toBuffer(),
      left: srcLeft + padding.left,
      top: srcTop + padding.top
    });
  }

  return layers;
}

module.exports = {
  isRedactAnnotation,
  normalizeRegion,
  buildSolidRedactionLayers,
  buildSoftRedactionLayers
};
