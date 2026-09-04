/**
 * Preview adapter around the real annotation renderer.
 *
 * This file used to carry a hand-maintained copy of all 26 create* functions
 * from src/annotate/render.js. Keeping them in sync by hand is what let the
 * config UI preview render labels in Comic Sans while the exported image used
 * Segoe UI, so the drawing code now lives in exactly one place and this module
 * only adds what the preview genuinely needs on top:
 *
 *   - a padded viewBox so annotations near the edge are not clipped
 *   - deterministic element ids, so re-rendering does not churn the DOM
 *   - svgToDataUrl for <img>-based previews
 *
 * Loaded either by Node (require) or by the browser, where
 * src/annotate/render.js must be included with a <script> tag first.
 */

const render = (typeof module !== 'undefined' && typeof require === 'function')
  ? require('../annotate/render')
  : (typeof globalThis !== 'undefined' ? globalThis.ImageAnnotatorRender : null);

if (!render) {
  throw new Error('image-annotator: load src/annotate/render.js before src/preview/renderer.js');
}

// Extra room around the artwork so shadows and edge markers stay visible.
const PREVIEW_PADDING = 20;

function svgToDataUrl(svg) {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

/**
 * Build a preview SVG for the given annotations.
 *
 * @param {number} width - Artwork width in pixels.
 * @param {number} height - Artwork height in pixels.
 * @param {Array<object>} annotations - Annotations in the annotate_screenshot format.
 * @param {string|object} [namespaceOrOptions] - An id namespace, or the same
 *   options object render.buildSvg accepts plus a `namespace` key.
 * @returns {string} SVG document
 */
function buildSvg(width, height, annotations, namespaceOrOptions = '') {
  const options = typeof namespaceOrOptions === 'string'
    ? { namespace: namespaceOrOptions }
    : (namespaceOrOptions || {});
  const prefix = options.namespace ? options.namespace + '-' : '';

  let counter = 0;
  render.setIdGenerator((idPrefix) => prefix + idPrefix + '-' + (counter++));

  let parts;
  try {
    // preview:true makes pixelate/blur redact regions render an approximate
    // placeholder. In the real pipeline they are pixel operations on the base
    // image, which the preview has no way to perform.
    parts = render.buildSvgParts(annotations, { ...options, preview: true });
  } finally {
    render.resetIdGenerator();
  }

  const pad = PREVIEW_PADDING;
  const nl = String.fromCharCode(10);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg width="${width}" height="${height}" viewBox="${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}" xmlns="http://www.w3.org/2000/svg">`,
    `  <defs>${parts.defs.join(nl)}</defs>`,
    `  <g transform="translate(${pad}, ${pad})">${parts.elements.join(nl)}</g>`,
    '</svg>'
  ].join(nl);
}

const previewApi = Object.assign({}, render, {
  buildSvg,
  buildSvgDocument: render.buildSvg,
  svgToDataUrl,
  PREVIEW_PADDING
});

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
  module.exports = previewApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ImageAnnotatorPreview = previewApi;
  // config-ui/public/preview.js calls buildSvg/getColor/THEMES as bare globals.
  Object.assign(globalThis, previewApi);
}
