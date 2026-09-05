// This module is loaded both by Node (require) and directly by the config UI and
// examples pages via <script>, so it must not assume either host is present.
const isCommonJs = typeof module !== 'undefined' && typeof module.exports === 'object';
const nodeCrypto = isCommonJs && typeof require === 'function' ? require('crypto') : null;
const annotateErrors = isCommonJs && typeof require === 'function' ? require('../annotate-errors') : null;

function log(level, message) {
  const line = '[image-annotator] ' + String(level).toUpperCase() + ': ' + message;
  if (typeof process !== 'undefined' && process.stderr && typeof process.stderr.write === 'function') {
    process.stderr.write(line + String.fromCharCode(10));
  } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(line);
  }
}

function randomHex(byteLength) {
  if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
    return nodeCrypto.randomBytes(byteLength).toString('hex');
  }
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(byteLength);
    webCrypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let out = '';
  for (let i = 0; i < byteLength; i++) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return out;
}

function invalidParameter(message, param) {
  if (annotateErrors) return new annotateErrors.InvalidParameterError(message, param);
  const error = new Error(message);
  error.code = 'INVALID_PARAMETER';
  error.param = param;
  return error;
}

const THEME_FONTS = {
  documentation: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  tutorial: 'Nunito, Quicksand, sans-serif',
  bugReport: 'JetBrains Mono, Fira Code, monospace',
  highlight: 'Noto Sans, Noto Sans CJK SC, sans-serif'
};

// KaiTi/Kaiti SC give CJK text a brush-style fallback (Windows/macOS ship
// them); latin priority is unchanged. Linux hosts need a handwriting font
// installed — LXGW WenKai (OFL) is a good free choice for Chinese.
const HANDWRITING_FONT = 'Comic Sans MS, Chalkboard SE, Patrick Hand, Segoe Print, KaiTi, Kaiti SC, LXGW WenKai, cursive';
const CLEAN_FONT = 'Segoe UI, Helvetica Neue, Arial, sans-serif';

const COLORS = {
  red: '#E53935',
  orange: '#FB8C00',
  yellow: '#FDD835',
  green: '#43A047',
  blue: '#1E88E5',
  purple: '#8E24AA',
  pink: '#D81B60',
  cyan: '#00ACC1',
  teal: '#00897B',
  white: '#FFFFFF',
  black: '#212121',
  gray: '#757575',
  lightGray: '#E0E0E0',
  darkGray: '#424242',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
  primary: '#1976D2',
  secondary: '#7B1FA2',
  accent: '#FF4081'
};

const THEMES = {
  documentation: {
    marker: { color: 'primary', size: 32 },
    arrow: { color: 'primary', strokeWidth: 5 },
    label: { color: 'primary', fontSize: 20, background: 'white', font: 'Inter' },
    callout: { color: 'primary', background: 'white', font: 'Inter' },
    leadout: { color: 'primary', font: 'Inter' }
  },
  tutorial: {
    marker: { color: 'green', size: 36 },
    arrow: { color: 'green', strokeWidth: 6 },
    label: { color: 'darkGray', fontSize: 22, background: 'lightGray', font: 'Nunito' },
    callout: { color: 'green', background: 'white', font: 'Nunito' },
    leadout: { color: 'green', font: 'Nunito' }
  },
  bugReport: {
    marker: { color: 'error', size: 32 },
    arrow: { color: 'error', strokeWidth: 5 },
    label: { color: 'error', fontSize: 20, background: 'white', font: 'JetBrains Mono' },
    callout: { color: 'error', background: 'white', font: 'JetBrains Mono' },
    leadout: { color: 'error', font: 'JetBrains Mono' }
  },
  highlight: {
    marker: { color: 'warning', size: 32 },
    arrow: { color: 'warning', strokeWidth: 5 },
    label: { color: 'darkGray', fontSize: 20, background: 'yellow', font: 'Noto Sans' },
    callout: { color: 'warning', background: 'yellow', font: 'Noto Sans' },
    leadout: { color: 'warning', font: 'Noto Sans' }
  },
  // Excalidraw-flavoured: buildSvgParts turns the sketch renderer on for every
  // annotation when this theme is active; the entries here only pick the
  // near-black ink Excalidraw uses by default.
  sketch: {
    marker: { color: 'black' },
    arrow: { color: 'black', strokeWidth: 2 },
    label: { color: 'black', background: 'white' },
    callout: { color: 'black', background: 'white' },
    leadout: { color: 'black' }
  }
};

const SIZE_PRESETS = {
  xs: { markerSize: 20, strokeWidth: 3, fontSize: 12 },
  s: { markerSize: 24, strokeWidth: 4, fontSize: 14 },
  m: { markerSize: 32, strokeWidth: 5, fontSize: 18 },
  l: { markerSize: 40, strokeWidth: 6, fontSize: 22 },
  xl: { markerSize: 48, strokeWidth: 8, fontSize: 28 }
};

const OUTPUT_FORMAT_EXTENSIONS = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
  avif: '.avif',
  svg: '.svg'
};

const SVGO_CONFIG = {
  plugins: [{
    name: 'preset-default',
    params: {
      overrides: {
        cleanupIds: false,
        removeXMLProcInst: true
      }
    }
  }]
};

function getSizePreset(imageWidth, imageHeight = imageWidth) {
  const presetNames = ['xs', 's', 'm', 'l', 'xl'];
  let presetIndex;

  if (imageWidth < 400) {
    presetIndex = 0;
  } else if (imageWidth < 800) {
    presetIndex = 1;
  } else if (imageWidth < 1200) {
    presetIndex = 2;
  } else if (imageWidth <= 1920) {
    presetIndex = 3;
  } else {
    presetIndex = 4;
  }

  const aspectRatio = imageWidth / imageHeight;
  if (aspectRatio < 0.5) {
    presetIndex += 1;
  } else if (aspectRatio > 3) {
    presetIndex -= 1;
  }

  const clampedIndex = Math.max(0, Math.min(presetNames.length - 1, presetIndex));
  return presetNames[clampedIndex];
}

const EAST_ASIAN_WIDE_RANGES = [
  [0x3000, 0x303f],
  [0x3040, 0x309f],
  [0x30a0, 0x30ff],
  [0x3100, 0x312f],
  [0x3130, 0x318f],
  [0x3190, 0x31bf],
  [0x31c0, 0x31ef],
  [0x31f0, 0x321f],
  [0x3220, 0x3247],
  [0x3250, 0x32fe],
  [0x3300, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd]
];

function isEastAsianWide(codepoint) {
  if (typeof codepoint !== 'number' || codepoint < 0) return false;
  for (let i = 0; i < EAST_ASIAN_WIDE_RANGES.length; i++) {
    const [lo, hi] = EAST_ASIAN_WIDE_RANGES[i];
    if (codepoint >= lo && codepoint <= hi) return true;
  }
  return false;
}

function getTextContentWidthPx(line, fontSize) {
  if (!line || typeof line !== 'string') return 0;
  let totalEm = 0;
  for (let i = 0; i < line.length; i++) {
    const cp = line.codePointAt(i);
    totalEm += isEastAsianWide(cp) ? 1 : 0.5;
    if (cp > 0xffff) i++;
  }
  return totalEm * fontSize;
}

const DEFAULT_PADDING = 14;
const LINE_HEIGHT_RATIO = 1.5;

function escapeXml(text) {
  if (typeof text !== 'string') return String(text);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Colour values are interpolated straight into SVG attributes, so anything that
// is not a named preset has to be shape-checked before it is let through.
// Accepts #rgb/#rgba/#rrggbb/#rrggbbaa, rgb()/rgba()/hsl()/hsla(), the CSS-wide
// keywords, and bare colour names such as "rebeccapurple" or "none".
const SAFE_COLOR_PATTERN = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([0-9\s.,%/-]+\)|[a-z]+)$/i;

function getColor(color) {
  if (typeof color === 'string' && Object.prototype.hasOwnProperty.call(COLORS, color)) {
    return COLORS[color];
  }
  if (typeof color === 'string' && SAFE_COLOR_PATTERN.test(color)) {
    return color;
  }
  if (color !== undefined && color !== null && color !== '') {
    log('WARN', `Ignoring unsafe color value ${JSON.stringify(String(color))}, falling back to red.`);
  }
  return COLORS.red;
}

// font-family values are caller-supplied strings that land inside an attribute.
function getFontFamily(font, handwriting) {
  if (typeof font === 'string' && font) return escapeXml(font);
  if (handwriting === true) return HANDWRITING_FONT;
  return CLEAN_FONT;
}

// In sketch mode text defaults to the handwriting font unless the caller
// asked for something else explicitly.
function getSketchAwareFontFamily(font, handwriting, sketch) {
  return getFontFamily(font, handwriting === null || handwriting === undefined ? sketch === true : handwriting);
}

// --- sketch (hand-drawn) rendering -----------------------------------------
// Powered by vendored rough.js (src/vendor/rough.js, MIT) — the same shape
// engine Excalidraw uses. Loaded lazily and per-host like render.js itself:
// require() under Node, the `rough` global under a plain <script>. When the
// library is missing (e.g. a page forgot the script tag) sketch requests
// degrade to the clean renderer with a single warning instead of failing.
let cachedRoughGenerator = null;
let warnedMissingRough = false;

function getRoughGenerator() {
  if (cachedRoughGenerator) return cachedRoughGenerator;
  let lib = null;
  if (isCommonJs && typeof require === 'function') {
    try { lib = require('../vendor/rough'); } catch (_e) { lib = null; }
  } else if (typeof globalThis !== 'undefined') {
    lib = globalThis.rough;
  }
  if (lib && typeof lib.generator === 'function') {
    cachedRoughGenerator = lib.generator();
    return cachedRoughGenerator;
  }
  if (!warnedMissingRough) {
    warnedMissingRough = true;
    log('WARN', 'sketch style requested but rough.js is not available; falling back to clean rendering.');
  }
  return null;
}

// Excalidraw's renderer settings: roughness 1 ("artist"), bowing 1, per-element
// seed, hachure weight/gap derived from the stroke width. rough.js treats a
// falsy seed as "randomize", so seeds are clamped to >= 1 to keep renders
// deterministic (same annotations in, same pixels out).
function sketchOptions({ stroke, strokeWidth = 2, fill = null, fillStyle = 'hachure', roughness = 1, seed = 1, dashed = false }) {
  const opts = {
    roughness,
    bowing: 1,
    stroke,
    strokeWidth,
    seed: Math.max(1, Math.round(seed) || 1),
    disableMultiStroke: dashed === true
  };
  if (dashed) opts.strokeLineDash = [8, 8];
  if (fill && fill !== 'none') {
    opts.fill = fill;
    opts.fillStyle = fillStyle;
    opts.fillWeight = strokeWidth / 2;
    opts.hachureGap = strokeWidth * 4;
  }
  return opts;
}

// rough's toPaths() drops strokeLineDash (its own SVG adapter applies it as an
// attribute), so the dash pattern is re-applied here to stroke paths.
function roughPathsToSvg(paths, strokeLineDash = null) {
  return paths.map((p) => {
    const fill = p.fill && p.fill !== 'none' ? p.fill : 'none';
    const dashAttr = strokeLineDash && fill === 'none'
      ? ` stroke-dasharray="${strokeLineDash.join(',')}"`
      : '';
    return `<path d="${p.d}" fill="${fill}" stroke="${p.stroke || 'none'}" stroke-width="${p.strokeWidth || 0}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`;
  }).join('\n');
}

/**
 * Draw one rough.js primitive as SVG markup, or return null when the library
 * is unavailable (callers then fall through to their clean branch).
 *
 * @param {string} kind - generator method: 'line', 'rectangle', 'circle',
 *   'ellipse', 'linearPath', 'polygon', 'curve', 'path'
 * @param {Array} args - positional arguments for that method
 * @param {object} opts - result of sketchOptions()
 */
function sketchShape(kind, args, opts) {
  const gen = getRoughGenerator();
  if (!gen || typeof gen[kind] !== 'function') return null;
  return roughPathsToSvg(gen.toPaths(gen[kind](...args, opts)), opts.strokeLineDash || null);
}
// ---------------------------------------------------------------------------

let customIdGenerator = null;

function generateId(prefix = 'ann') {
  if (typeof customIdGenerator === 'function') {
    return customIdGenerator(prefix);
  }
  const randomPart = randomHex(4);
  return `${prefix}-${randomPart}`;
}

function setIdGenerator(generator) {
  customIdGenerator = typeof generator === 'function' ? generator : null;
}

function resetIdGenerator() {
  customIdGenerator = null;
}

function createDropShadow(id, blur = 4, opacity = 0.3, dx = 2, dy = 2) {
  return `
    <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur}" flood-opacity="${opacity}"/>
    </filter>
  `;
}

function createMarker({ x, y, number, color = 'red', size = 32, shadow = true, style = 'filled', sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);

  if (sketch === true) {
    const isBadge = style === 'badge';
    const badgeWidth = number > 9 ? size * 2.4 : size * 2;
    const solid = style !== 'outline';
    // Solid markers trade the gradient for a flat fill with a darker outline.
    const opts = sketchOptions({
      stroke: solid ? adjustColor(c, -40) : c,
      strokeWidth: 2.5,
      fill: solid ? c : '#FFFFFF',
      fillStyle: 'solid',
      roughness,
      seed
    });
    const shape = isBadge
      ? sketchShape('rectangle', [x - badgeWidth / 2, y - size, badgeWidth, size * 2], opts)
      : sketchShape('circle', [x, y, size * 2], opts);
    if (shape) {
      const textColor = solid ? getRedactLabelColor(c) : c;
      const numeral = `<text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="${textColor}"
            font-size="${size * 0.9}" font-weight="bold" font-family="${HANDWRITING_FONT}">${escapeXml(number)}</text>`;
      return { defs: '', element: shape + '\n' + numeral };
    }
  }

  const id = generateId('marker');
  const defs = [];
  const elements = [];

  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`));
  }

  const gradientId = `${id}-gradient`;
  defs.push(`
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${c};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${adjustColor(c, -30)};stop-opacity:1" />
    </linearGradient>
  `);

  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';

  if (style === 'filled') {
    elements.push(`
      <circle cx="${x}" cy="${y}" r="${size}" fill="url(#${gradientId})" ${filterAttr}/>
      <circle cx="${x}" cy="${y}" r="${size - 2}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="white"
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${escapeXml(number)}</text>
    `);
  } else if (style === 'outline') {
    elements.push(`
      <circle cx="${x}" cy="${y}" r="${size}" fill="white" stroke="${c}" stroke-width="3" ${filterAttr}/>
      <text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="${c}"
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${escapeXml(number)}</text>
    `);
  } else if (style === 'badge') {
    const isMultiDigit = number > 9;
    const width = isMultiDigit ? size * 2.4 : size * 2;
    const height = size * 2;
    elements.push(`
      <rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}"
            rx="${height / 2}" fill="url(#${gradientId})" ${filterAttr}/>
      <text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="white"
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${escapeXml(number)}</text>
    `);
  }

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

// Two short strokes fanning back from the tip — how rough.js-based tools
// (Excalidraw included) draw arrowheads, since <marker> refs cannot wobble.
function sketchArrowHead(x2, y2, angle, headSize, opts) {
  const wing = 0.45;
  const head1 = sketchShape('line', [x2, y2, x2 - headSize * Math.cos(angle - wing), y2 - headSize * Math.sin(angle - wing)], opts);
  const head2 = sketchShape('line', [x2, y2, x2 - headSize * Math.cos(angle + wing), y2 - headSize * Math.sin(angle + wing)], opts);
  return head1 && head2 ? head1 + '\n' + head2 : null;
}

function createArrow({ from, to, color = 'red', strokeWidth = 2, style = 'solid', headStyle = 'filled', shadow = true, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;

  if (sketch === true) {
    const shaft = sketchShape('line', [x1, y1, x2, y2], sketchOptions({
      stroke: c, strokeWidth, roughness, seed, dashed: style === 'dashed'
    }));
    const headSize = Math.max(12, strokeWidth * 4);
    const head = shaft && sketchArrowHead(x2, y2, Math.atan2(y2 - y1, x2 - x1), headSize,
      sketchOptions({ stroke: c, strokeWidth, roughness, seed: seed + 1 }));
    if (shaft && head) return { defs: '', element: shaft + '\n' + head };
  }

  const id = generateId('arrow');
  const defs = [];

  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`, 2, 0.2));
  }

  const headSize = Math.max(10, strokeWidth * 3);
  if (headStyle === 'filled') {
    defs.push(`
      <marker id="${id}-head" markerWidth="${headSize}" markerHeight="${headSize * 0.7}"
              refX="${headSize - 1}" refY="${headSize * 0.35}" orient="auto" markerUnits="userSpaceOnUse">
        <polygon points="0 0, ${headSize} ${headSize * 0.35}, 0 ${headSize * 0.7}" fill="${c}"/>
      </marker>
    `);
  } else if (headStyle === 'open') {
    defs.push(`
      <marker id="${id}-head" markerWidth="${headSize}" markerHeight="${headSize * 0.7}"
              refX="${headSize - 1}" refY="${headSize * 0.35}" orient="auto" markerUnits="userSpaceOnUse">
        <polyline points="0 0, ${headSize} ${headSize * 0.35}, 0 ${headSize * 0.7}"
                  fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
      </marker>
    `);
  }

  const dashArray = style === 'dashed' ? 'stroke-dasharray="10,5"' : '';
  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';

  const element = `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
          stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"
          marker-end="url(#${id}-head)" ${dashArray} ${filterAttr}/>
  `;

  return { defs: defs.join('\n'), element };
}

function createCurvedArrow({ from, to, curve = 50, color = 'red', strokeWidth = 2, headStyle = 'filled', shadow = true, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = midX + nx * curve;
  const cy = midY + ny * curve;

  if (sketch === true) {
    // rough.curve wants sample points, so flatten the quadratic first.
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const mt = 1 - t;
      pts.push([mt * mt * x1 + 2 * mt * t * cx + t * t * x2, mt * mt * y1 + 2 * mt * t * cy + t * t * y2]);
    }
    const shaft = sketchShape('curve', [pts], sketchOptions({ stroke: c, strokeWidth, roughness, seed }));
    const [px, py] = pts[pts.length - 2];
    const head = shaft && sketchArrowHead(x2, y2, Math.atan2(y2 - py, x2 - px), Math.max(12, strokeWidth * 4),
      sketchOptions({ stroke: c, strokeWidth, roughness, seed: seed + 1 }));
    if (shaft && head) return { defs: '', element: shaft + '\n' + head };
  }

  const id = generateId('curved-arrow');
  const defs = [];

  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`, 2, 0.2));
  }

  const headSize = Math.max(10, strokeWidth * 3);
  defs.push(`
    <marker id="${id}-head" markerWidth="${headSize}" markerHeight="${headSize * 0.7}"
            refX="${headSize - 1}" refY="${headSize * 0.35}" orient="auto" markerUnits="userSpaceOnUse">
      <polygon points="0 0, ${headSize} ${headSize * 0.35}, 0 ${headSize * 0.7}" fill="${c}"/>
    </marker>
  `);

  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';

  const element = `
    <path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}"
          fill="none" stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"
          marker-end="url(#${id}-head)" ${filterAttr}/>
  `;

  return { defs: defs.join('\n'), element };
}

function createCallout({ x, y, text, color = 'primary', background = 'white', width = null, pointer = 'bottom', fontSize = 18, shadow = true, handwriting = null, font = null, sketch = false, roughness = 1, seed = 1 }) {
  const borderColor = getColor(color);
  const bgColor = getColor(background);
  const id = generateId('callout');
  const defs = [];
  const sketchOn = sketch === true && getRoughGenerator() !== null;
  const fontFamily = getSketchAwareFontFamily(font, handwriting, sketchOn);

  const padding = 14;
  const lineHeight = fontSize * 1.5;
  const lines = text.split('\n');
  const contentWidth = Math.max(0, ...lines.map((line) => getTextContentWidthPx(line, fontSize)));
  const textWidth = width || contentWidth + padding * 2;
  const textHeight = lines.length * lineHeight + padding * 2;

  if (shadow && !sketchOn) {
    defs.push(createDropShadow(`${id}-shadow`, 4, 0.15));
  }

  const filterAttr = shadow && !sketchOn ? `filter="url(#${id}-shadow)"` : '';
  let boxX;
  let boxY;
  // Pointer triangle as points: base corner, tip, base corner, plus the unit
  // vector that leads from the base back into the bubble.
  let pointerPts = null;
  let inward = null;
  const pointerSize = 12;

  switch (pointer) {
    case 'top':
      boxX = x - textWidth / 2;
      boxY = y + pointerSize;
      pointerPts = [[x - pointerSize, y + pointerSize], [x, y], [x + pointerSize, y + pointerSize]];
      inward = [0, 1];
      break;
    case 'bottom':
      boxX = x - textWidth / 2;
      boxY = y - textHeight - pointerSize;
      pointerPts = [[x - pointerSize, y - pointerSize], [x, y], [x + pointerSize, y - pointerSize]];
      inward = [0, -1];
      break;
    case 'left':
      boxX = x + pointerSize;
      boxY = y - textHeight / 2;
      pointerPts = [[x + pointerSize, y - pointerSize], [x, y], [x + pointerSize, y + pointerSize]];
      inward = [1, 0];
      break;
    case 'right':
      boxX = x - textWidth - pointerSize;
      boxY = y - textHeight / 2;
      pointerPts = [[x - pointerSize, y - pointerSize], [x, y], [x - pointerSize, y + pointerSize]];
      inward = [-1, 0];
      break;
    default:
      boxX = x;
      boxY = y;
  }

  const pointerPath = pointerPts
    ? `M${pointerPts[0][0]},${pointerPts[0][1]} L${pointerPts[1][0]},${pointerPts[1][1]} L${pointerPts[2][0]},${pointerPts[2][1]}`
    : '';

  const textY = boxY + padding + lineHeight / 2;
  const textElements = lines.map((line, index) =>
    `<tspan x="${boxX + padding}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');
  const textMarkup = `<text x="${boxX + padding}" y="${textY}" dominant-baseline="middle"
            fill="${getColor('darkGray')}" font-size="${fontSize}" font-family="${fontFamily}" font-weight="600">
        ${textElements}
      </text>`;

  if (sketchOn) {
    const bubble = sketchShape('rectangle', [boxX, boxY, textWidth, textHeight], sketchOptions({
      stroke: borderColor, strokeWidth: 2.5, fill: bgColor, fillStyle: 'solid', roughness, seed
    }));
    let pointerMarkup = '';
    if (pointerPts) {
      // A clean background-coloured wedge, extended a few pixels into the
      // bubble, hides the wobbly border segment under the pointer before the
      // two sketchy pointer edges are drawn on top.
      const [b1, tip, b2] = pointerPts;
      const inset = 6;
      const mask = `M${b1[0] + inward[0] * inset},${b1[1] + inward[1] * inset} L${b1[0]},${b1[1]} L${tip[0]},${tip[1]} L${b2[0]},${b2[1]} L${b2[0] + inward[0] * inset},${b2[1] + inward[1] * inset} Z`;
      pointerMarkup += `<path d="${mask}" fill="${bgColor}"/>`;
      pointerMarkup += sketchShape('linearPath', [pointerPts], sketchOptions({
        stroke: borderColor, strokeWidth: 2.5, roughness, seed: seed + 1
      })) || '';
    }
    return { defs: '', element: `<g>${bubble}\n${pointerMarkup}\n${textMarkup}</g>` };
  }

  const element = `
    <g ${filterAttr}>
      <rect x="${boxX}" y="${boxY}" width="${textWidth}" height="${textHeight}"
            rx="10" fill="${bgColor}" stroke="${borderColor}" stroke-width="3" stroke-linejoin="round"/>
      ${pointerPath ? `<path d="${pointerPath}" fill="${bgColor}" stroke="${borderColor}" stroke-width="3" stroke-linejoin="round"/>` : ''}
      ${textMarkup}
    </g>
  `;

  return { defs: defs.join('\n'), element };
}

function createRect({ x, y, width, height, color = 'red', strokeWidth = 4, fill = 'none', cornerRadius = 12, style = 'solid', shadow = false, sketch = false, roughness = 1, seed = 1, fillStyle = 'hachure' }) {
  const c = getColor(color);
  const fillColor = fill === 'none' ? 'none' : getColor(fill);

  if (sketch === true) {
    const element = sketchShape('rectangle', [x, y, width, height], sketchOptions({
      stroke: c, strokeWidth, fill: fillColor, fillStyle, roughness, seed, dashed: style === 'dashed'
    }));
    if (element) return { defs: '', element };
  }

  const id = generateId('rect');
  const defs = [];

  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`));
  }

  const dashArray = style === 'dashed' ? 'stroke-dasharray="12,6"' : '';
  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';

  const element = `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}"
          fill="${fillColor}" stroke="${c}" stroke-width="${strokeWidth}" stroke-linejoin="round" ${dashArray} ${filterAttr}/>
  `;

  return { defs: defs.join('\n'), element };
}

function createCircle({ x, y, radius = 30, color = 'red', strokeWidth = 4, fill = 'none', style = 'solid', shadow = false, sketch = false, roughness = 1, seed = 1, fillStyle = 'hachure' }) {
  const c = getColor(color);
  const fillColor = fill === 'none' ? 'none' : getColor(fill);

  if (sketch === true) {
    const element = sketchShape('circle', [x, y, radius * 2], sketchOptions({
      stroke: c, strokeWidth, fill: fillColor, fillStyle, roughness, seed, dashed: style === 'dashed'
    }));
    if (element) return { defs: '', element };
  }

  const id = generateId('circle');
  const defs = [];

  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`));
  }

  const dashArray = style === 'dashed' ? 'stroke-dasharray="8,4"' : '';
  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';

  const element = `
    <circle cx="${x}" cy="${y}" r="${radius}"
            fill="${fillColor}" stroke="${c}" stroke-width="${strokeWidth}" ${dashArray} ${filterAttr}/>
  `;

  return { defs: defs.join('\n'), element };
}

function createLabel({ x, y, text, color = 'darkGray', fontSize = 18, fontWeight = '600', background = 'white', padding = 10, cornerRadius = 8, shadow = true, handwriting = null, font = null, sketch = false, roughness = 1, seed = 1 }) {
  const textColor = getColor(color);
  const id = generateId('label');
  const defs = [];
  const elements = [];
  const fontFamily = getSketchAwareFontFamily(font, handwriting, sketch);

  const lines = text.split('\n');
  const lineHeight = fontSize * 1.3;
  const textWidth = Math.max(0, ...lines.map((line) => getTextContentWidthPx(line, fontSize)));
  const textHeight = lines.length * lineHeight;

  // Sketch mode drops the drop shadow — Excalidraw-style output is flat.
  if (shadow && background && sketch !== true) {
    defs.push(createDropShadow(`${id}-shadow`, 4, 0.2));
  }

  const filterAttr = shadow && background && sketch !== true ? `filter="url(#${id}-shadow)"` : '';

  if (background) {
    const bgColor = getColor(background);
    const sketchRect = sketch === true
      ? sketchShape('rectangle', [x - padding, y - textHeight - padding + 4, textWidth + padding * 2, textHeight + padding * 2], sketchOptions({
        stroke: textColor, strokeWidth: 2, fill: bgColor, fillStyle: 'solid', roughness, seed
      }))
      : null;
    elements.push(sketchRect || `
      <rect x="${x - padding}" y="${y - textHeight - padding + 4}"
            width="${textWidth + padding * 2}" height="${textHeight + padding * 2}"
            rx="${cornerRadius}" fill="${bgColor}" stroke="${textColor}" stroke-width="2" stroke-linejoin="round" ${filterAttr}/>
    `);
  }

  const textElements = lines.map((line, index) =>
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');
  elements.push(`
    <text x="${x}" y="${y}" fill="${textColor}" font-size="${fontSize}"
          font-weight="${escapeXml(fontWeight)}" font-family="${fontFamily}">${textElements}</text>
  `);

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

function createHighlight({ x, y, width, height, color = 'yellow', opacity = 0.35, cornerRadius = 0, sketch = false, roughness = 1, seed = 1, fillStyle = 'hachure', strokeWidth = 2 }) {
  const c = getColor(color);

  if (sketch === true) {
    // Hachure fill is the sketchy read of "marker over this area"; opacity is
    // applied on the wrapper so fill and outline fade together.
    const shape = sketchShape('rectangle', [x, y, width, height], sketchOptions({
      stroke: c, strokeWidth, fill: c, fillStyle, roughness, seed
    }));
    if (shape) return { defs: '', element: `<g opacity="${opacity}">${shape}</g>` };
  }

  return {
    defs: '',
    element: `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" fill="${c}" opacity="${opacity}"/>`
  };
}

// Legacy renderer for the old 'blur' type. No longer wired into buildSvgParts -
// it blurred the grey rectangle itself, not the image below it, so short boxes
// came out semi-transparent and the "hidden" content stayed readable. Kept only
// as an export for compatibility and the snapshot locking that history.
function createBlur({ x, y, width, height, intensity = 8 }) {
  const id = generateId('blur');
  return {
    defs: `
      <filter id="${id}">
        <feGaussianBlur stdDeviation="${intensity}"/>
      </filter>
    `,
    element: `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#808080" filter="url(#${id})"/>`
  };
}

const REDACT_MODES = ['solid', 'pixelate', 'blur'];

// Mid-tone slate: softer than a black censor bar, but far enough from both
// white page backgrounds and dark app chrome to read as deliberate.
const DEFAULT_REDACT_FILL = '#64748B';

// 'blur' predates 'redact' and now behaves as {type:'redact', mode:'blur'}.
// An unrecognised mode falls back to solid so a typo degrades to the safe
// (irreversible) behaviour instead of a reversible one.
function getRedactMode(annotation) {
  if (!annotation || typeof annotation !== 'object') return 'solid';
  if (annotation.type === 'blur') return 'blur';
  if (annotation.mode === undefined) return 'solid';
  if (REDACT_MODES.includes(annotation.mode)) return annotation.mode;
  log('WARN', `Unknown redact mode ${JSON.stringify(String(annotation.mode))}, falling back to solid.`);
  return 'solid';
}

// Label colour follows the fill's luminance, so a light-coloured redaction
// block does not end up with unreadable white-on-white text. This only affects
// the label glyphs; the fill itself is opaque either way.
function getRedactLabelColor(fill) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fill);
  if (!match) return '#FFFFFF';
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1F2328' : '#FFFFFF';
}

// Redaction deliberately has NO sketch mode: the cover rectangle must stay
// pixel-aligned and fully opaque. A wobbly hand-drawn edge would leak border
// pixels of exactly the content this annotation exists to destroy, so a
// sketch flag (global or per-annotation) is ignored here.
function createRedact(annotation, { preview = false } = {}) {
  const mode = getRedactMode(annotation);
  // Integer coordinates keep the rectangle pixel-aligned: an anti-aliased edge
  // would blend the fill with the original pixels, leaking a one-pixel border
  // of the content this rectangle exists to destroy.
  const x = Math.round(annotation.x || 0);
  const y = Math.round(annotation.y || 0);
  const width = Math.max(1, Math.round(annotation.width || 0));
  const height = Math.max(1, Math.round(annotation.height || 0));

  if (mode === 'solid') {
    const fill = getColor(annotation.color || DEFAULT_REDACT_FILL);
    const elements = [
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" shape-rendering="crispEdges"/>`
    ];
    if (annotation.label) {
      const fontSize = annotation.fontSize || Math.max(8, Math.min(16, Math.round(height * 0.6)));
      elements.push(`
        <text x="${x + width / 2}" y="${y + height / 2 + fontSize * 0.35}" text-anchor="middle" fill="${getRedactLabelColor(fill)}"
              font-size="${fontSize}" font-weight="600" letter-spacing="${(fontSize * 0.1).toFixed(2)}" font-family="${CLEAN_FONT}">${escapeXml(annotation.label)}</text>
      `);
    }
    // 'top' puts the rectangle above every other annotation, so a redaction
    // generated over a matched callout covers that callout's text.
    return { defs: '', element: elements.join('\n'), layer: 'top' };
  }

  // pixelate/blur are pixel operations on the base image (src/annotate/redact.js);
  // the SVG layer draws nothing for them. The preview has no pixel pipeline, so
  // it gets an explicitly approximate placeholder instead of silently showing
  // nothing while the user positions the region.
  if (!preview) {
    return { defs: '', element: '', layer: 'bottom' };
  }

  const id = generateId('redact');
  const defs = `
    <pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="rgba(128,128,128,0.35)"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(80,80,80,0.5)" stroke-width="4"/>
    </pattern>
  `;
  const fontSize = Math.max(8, Math.min(14, Math.round(height * 0.5)));
  const element = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id}-hatch)" stroke="rgba(80,80,80,0.8)" stroke-width="1.5" stroke-dasharray="6,4"/>`,
    `<text x="${x + width / 2}" y="${y + height / 2 + fontSize * 0.35}" text-anchor="middle" fill="rgba(60,60,60,0.9)"
          font-size="${fontSize}" font-family="${CLEAN_FONT}">${escapeXml(mode)}</text>`
  ].join('\n');
  return { defs, element, layer: 'bottom' };
}

function createConnector({ from, to, color = 'gray', strokeWidth = 2, style = 'dashed', sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;

  if (sketch === true) {
    const element = sketchShape('line', [x1, y1, x2, y2], sketchOptions({
      stroke: c, strokeWidth, roughness, seed, dashed: style === 'dashed'
    }));
    if (element) return { defs: '', element };
  }

  const dashArray = style === 'dashed' ? 'stroke-dasharray="8,5"' : '';

  return {
    defs: '',
    element: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round" ${dashArray}/>`
  };
}

function createIcon({ x, y, icon, color = 'green', size = 28, shadow = true, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const id = generateId('icon');
  const defs = [];

  if (shadow && sketch !== true) {
    defs.push(createDropShadow(`${id}-shadow`));
  }

  const filterAttr = shadow && sketch !== true ? `filter="url(#${id}-shadow)"` : '';
  let iconPath;

  switch (icon) {
    case 'check':
    case 'checkmark':
      iconPath = `<path d="M${x - size * 0.3},${y} L${x - size * 0.1},${y + size * 0.25} L${x + size * 0.35},${y - size * 0.25}"
                       fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'x':
    case 'cross':
      iconPath = `
        <line x1="${x - size * 0.2}" y1="${y - size * 0.2}" x2="${x + size * 0.2}" y2="${y + size * 0.2}" stroke="white" stroke-width="4" stroke-linecap="round"/>
        <line x1="${x + size * 0.2}" y1="${y - size * 0.2}" x2="${x - size * 0.2}" y2="${y + size * 0.2}" stroke="white" stroke-width="4" stroke-linecap="round"/>
      `;
      break;
    case 'warning':
    case '!':
      iconPath = `
        <line x1="${x}" y1="${y - size * 0.15}" x2="${x}" y2="${y + size * 0.05}" stroke="white" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${x}" cy="${y + size * 0.25}" r="3" fill="white"/>
      `;
      break;
    case 'info':
    case 'i':
      iconPath = `
        <circle cx="${x}" cy="${y - size * 0.2}" r="3" fill="white"/>
        <line x1="${x}" y1="${y - size * 0.05}" x2="${x}" y2="${y + size * 0.25}" stroke="white" stroke-width="4" stroke-linecap="round"/>
      `;
      break;
    case 'question':
    case '?':
      iconPath = `
        <path d="M${x - size * 0.15},${y - size * 0.25} Q${x - size * 0.15},${y - size * 0.4} ${x},${y - size * 0.4}
                Q${x + size * 0.2},${y - size * 0.4} ${x + size * 0.2},${y - size * 0.2}
                Q${x + size * 0.2},${y - size * 0.05} ${x},${y}"
              fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="${x}" cy="${y + size * 0.2}" r="3" fill="white"/>
      `;
      break;
    default:
      iconPath = '';
  }

  if (sketch === true) {
    // Sketchy badge circle; the glyph strokes stay clean for legibility.
    const badge = sketchShape('circle', [x, y, size * 2], sketchOptions({
      stroke: adjustColor(c, -40), strokeWidth: 2, fill: c, fillStyle: 'solid', roughness, seed
    }));
    if (badge) return { defs: '', element: `<g>${badge}\n${iconPath}</g>` };
  }

  return {
    defs: defs.join('\n'),
    element: `
      <g ${filterAttr}>
        <circle cx="${x}" cy="${y}" r="${size}" fill="${c}"/>
        ${iconPath}
      </g>
    `
  };
}

function createMeasure({ from, to, text, color = 'red', fontSize = 16, strokeWidth = 2, shadow = true, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const id = generateId('measure');
  const defs = [];
  const elements = [];
  const [x1, y1] = from;
  const [x2, y2] = to;
  const sketchOn = sketch === true && getRoughGenerator() !== null;

  if (shadow && !sketchOn) {
    defs.push(createDropShadow(`${id}-shadow`, 2, 0.15));
  }
  const filterAttr = shadow && !sketchOn ? `filter="url(#${id}-shadow)"` : '';

  // Calculate line angle and perpendicular
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len; // perpendicular unit vector
  const ny = dx / len;
  const tickLen = 10;

  const lineOpts = () => sketchOptions({ stroke: c, strokeWidth, roughness, seed });

  // Main line
  elements.push(sketchOn ? sketchShape('line', [x1, y1, x2, y2], lineOpts()) : `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
          stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round" ${filterAttr}/>
  `);

  // Tick marks at both ends
  elements.push(sketchOn
    ? sketchShape('line', [x1 + nx * tickLen, y1 + ny * tickLen, x1 - nx * tickLen, y1 - ny * tickLen], sketchOptions({ stroke: c, strokeWidth, roughness, seed: seed + 1 }))
    : `
    <line x1="${x1 + nx * tickLen}" y1="${y1 + ny * tickLen}"
          x2="${x1 - nx * tickLen}" y2="${y1 - ny * tickLen}"
          stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  `);
  elements.push(sketchOn
    ? sketchShape('line', [x2 + nx * tickLen, y2 + ny * tickLen, x2 - nx * tickLen, y2 - ny * tickLen], sketchOptions({ stroke: c, strokeWidth, roughness, seed: seed + 2 }))
    : `
    <line x1="${x2 + nx * tickLen}" y1="${y2 + ny * tickLen}"
          x2="${x2 - nx * tickLen}" y2="${y2 - ny * tickLen}"
          stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  `);

  // Center text with background
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // Flip text if upside down
  const textAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;
  const textW = getTextContentWidthPx(text, fontSize) + 12;
  const textH = fontSize * 1.4;

  // The rough box lives inside the rotated group, so its local coordinates
  // are the same as the clean rect's.
  const box = sketchOn
    ? sketchShape('rectangle', [-textW / 2, -textH / 2, textW, textH], sketchOptions({ stroke: c, strokeWidth: 1.5, fill: '#FFFFFF', fillStyle: 'solid', roughness, seed: seed + 3 }))
    : `<rect x="${-textW / 2}" y="${-textH / 2}" width="${textW}" height="${textH}"
            rx="4" fill="white" stroke="${c}" stroke-width="1.5"/>`;
  const fontFamily = sketchOn ? HANDWRITING_FONT : CLEAN_FONT;

  elements.push(`
    <g transform="translate(${midX}, ${midY}) rotate(${textAngle})">
      ${box}
      <text x="0" y="${fontSize * 0.35}" text-anchor="middle" fill="${c}"
            font-size="${fontSize}" font-weight="700" font-family="${fontFamily}">${escapeXml(text)}</text>
    </g>
  `);

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

// Chip metrics shared with runtime.estimateAnnotationBounds, which mirrors this
// box to know how much canvas a leadout occupies.
const LEADOUT_LINE_HEIGHT = 1.3;

function getLeadoutChipSize(text, fontSize) {
  const lines = String(text).split('\n');
  const padX = Math.round(fontSize * 0.75);
  const padY = Math.round(fontSize * 0.4);
  const lineHeight = fontSize * LEADOUT_LINE_HEIGHT;
  const contentWidth = Math.max(0, ...lines.map((line) => getTextContentWidthPx(line, fontSize)));
  return {
    lines,
    padX,
    padY,
    lineHeight,
    width: contentWidth + padX * 2,
    height: lines.length * lineHeight + padY * 2
  };
}

// Leader line routed the way technical illustrations do it: a 45-degree run
// from the target, then an axis-aligned run that meets the label edge head-on.
// Falls back to a single straight segment when the two points are too close
// for the elbow to fit. Returned as points so both the clean renderer (joined
// into a path) and the sketch renderer (rough.linearPath) share the geometry.
function buildLeadoutPoints(tx, ty, ex, ey, entryAxis) {
  const runX = ex - tx;
  const runY = ey - ty;
  if (entryAxis === 'horizontal') {
    const diag = Math.abs(runY);
    if (diag > 0.5 && Math.abs(runX) > diag) {
      return [[tx, ty], [tx + Math.sign(runX) * diag, ey], [ex, ey]];
    }
  } else {
    const diag = Math.abs(runX);
    if (diag > 0.5 && Math.abs(runY) > diag) {
      return [[tx, ty], [ex, ty + Math.sign(runY) * diag], [ex, ey]];
    }
  }
  return [[tx, ty], [ex, ey]];
}

function leadoutPointsToPath(points) {
  return 'M' + points.map(([px, py]) => `${px},${py}`).join(' L');
}

function createLeadout({ target, anchor, text, color = 'red', fontSize = 16, strokeWidth = null, shadow = true, variant = 'soft', lineStyle = 'elbow', halo = true, font = null, handwriting = null, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const id = generateId('leadout');
  const defs = [];
  const elements = [];
  const [tx, ty] = target;
  const [ax, ay] = anchor;
  const sketchOn = sketch === true && getRoughGenerator() !== null;
  const fontFamily = getSketchAwareFontFamily(font, handwriting, sketchOn);
  // Leader weight follows the label size (~0.15em, never hairline-thin) so a
  // leadout scaled up for a large screenshot keeps its proportions.
  const sw = typeof strokeWidth === 'number' && strokeWidth > 0
    ? strokeWidth
    : Math.max(2, fontSize * 0.15);

  // Label chip centred on the anchor.
  const chip = getLeadoutChipSize(text, fontSize);
  const boxX = ax - chip.width / 2;
  const boxY = ay - chip.height / 2;

  // The leader meets the chip at the middle of whichever edge faces the
  // target, so the visible joint is always perpendicular instead of clipping
  // a corner at a random angle.
  const dx = ax - tx;
  const dy = ay - ty;
  const entryAxis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
  const ex = entryAxis === 'horizontal' ? ax - Math.sign(dx || 1) * (chip.width / 2) : ax;
  const ey = entryAxis === 'horizontal' ? ay : ay - Math.sign(dy || 1) * (chip.height / 2);

  const points = lineStyle === 'straight'
    ? [[tx, ty], [ex, ey]]
    : buildLeadoutPoints(tx, ty, ex, ey, entryAxis);

  // White casing under the line and dot keeps them legible over busy
  // screenshot content (the same trick maps use for leader lines). In sketch
  // mode the casing follows the exact wobbled strokes rather than the ideal
  // path, so halo and ink never drift apart.
  const dotR = 2 + sw;
  if (sketchOn) {
    const gen = getRoughGenerator();
    const linePaths = gen.toPaths(gen.linearPath(points, sketchOptions({ stroke: c, strokeWidth: sw, roughness, seed })));
    if (halo) {
      for (const p of linePaths) {
        elements.push(`<path d="${p.d}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="${sw + 3}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    }
    elements.push(roughPathsToSvg(linePaths));
    if (halo) {
      elements.push(`<circle cx="${tx}" cy="${ty}" r="${dotR + 2}" fill="rgba(255,255,255,0.9)"/>`);
    }
    elements.push(sketchShape('circle', [tx, ty, dotR * 2], sketchOptions({
      stroke: c, strokeWidth: 1.5, fill: c, fillStyle: 'solid', roughness, seed: seed + 1
    })));
  } else {
    const pathD = leadoutPointsToPath(points);
    if (halo) {
      elements.push(`
    <path d="${pathD}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="${sw + 3}" stroke-linecap="round" stroke-linejoin="round"/>
  `);
    }
    elements.push(`
    <path d="${pathD}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
  `);

    // Ring-style anchor dot: colour core with a white surround.
    if (halo) {
      elements.push(`<circle cx="${tx}" cy="${ty}" r="${dotR + 2}" fill="rgba(255,255,255,0.9)"/>`);
    }
    elements.push(`<circle cx="${tx}" cy="${ty}" r="${dotR}" fill="${c}"/>`);
  }

  if (shadow && !sketchOn) {
    defs.push(createDropShadow(`${id}-shadow`, 3, 0.3, 0, 2));
  }
  const filterAttr = shadow && !sketchOn ? `filter="url(#${id}-shadow)"` : '';

  const cornerRadius = Math.min(8, chip.height / 2);
  // Chip faces: 'soft' (default) = light tint of the accent with an accent
  // border and dark text — calm and readable, matching Excalidraw's
  // stroke-plus-light-background palette; 'filled' = solid accent with
  // auto-contrast text for maximum punch; 'outline' = white with an accent
  // border.
  const chipFill = variant === 'filled' ? c : (variant === 'outline' ? '#FFFFFF' : tintColor(c));
  const chipStroke = variant === 'filled' ? null : c;
  const textColor = variant === 'filled' ? getRedactLabelColor(c) : '#1F2328';
  let chipRect;
  if (sketchOn) {
    chipRect = sketchShape('rectangle', [boxX, boxY, chip.width, chip.height], sketchOptions({
      stroke: chipStroke || adjustColor(c, -40), strokeWidth: 1.5, fill: chipFill, fillStyle: 'solid', roughness, seed: seed + 2
    }));
  } else {
    const strokeAttr = chipStroke ? ` stroke="${chipStroke}" stroke-width="1.5" stroke-linejoin="round"` : '';
    chipRect = `<rect x="${boxX}" y="${boxY}" width="${chip.width}" height="${chip.height}"
            rx="${cornerRadius}" fill="${chipFill}"${strokeAttr}/>`;
  }

  const textElements = chip.lines.map((lineText, index) => {
    const baseline = boxY + chip.padY + chip.lineHeight * (index + 0.5) + fontSize * 0.35;
    return `<tspan x="${ax}" y="${baseline}">${escapeXml(lineText)}</tspan>`;
  }).join('');

  elements.push(`
    <g ${filterAttr}>
      ${chipRect}
      <text text-anchor="middle" fill="${textColor}"
            font-size="${fontSize}" font-weight="600" font-family="${fontFamily}">${textElements}</text>
    </g>
  `);

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

function createBracketLabel({ from, to, direction = 'right', text, color = 'red', fontSize = 16, strokeWidth = 2, shadow = true, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const id = generateId('bracket');
  const defs = [];
  const elements = [];
  const [x1, y1] = from;
  const [x2, y2] = to;
  const sketchOn = sketch === true && getRoughGenerator() !== null;

  if (shadow && !sketchOn) {
    defs.push(createDropShadow(`${id}-shadow`, 2, 0.15));
  }
  const filterAttr = shadow && !sketchOn ? `filter="url(#${id}-shadow)"` : '';

  const bracketDepth = 20;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  // The bracket is two polylines (each half ends at the centre tick), shared
  // between the clean path and the sketch renderer.
  let segments;
  let labelX, labelY;

  switch (direction) {
    case 'right':
      segments = [
        [[x1, y1], [x1 + bracketDepth, y1], [x1 + bracketDepth, midY], [x1 + bracketDepth + 10, midY]],
        [[x1 + bracketDepth, midY], [x1 + bracketDepth, y2], [x1, y2]]
      ];
      labelX = x1 + bracketDepth + 16;
      labelY = midY;
      break;
    case 'left':
      segments = [
        [[x1, y1], [x1 - bracketDepth, y1], [x1 - bracketDepth, midY], [x1 - bracketDepth - 10, midY]],
        [[x1 - bracketDepth, midY], [x1 - bracketDepth, y2], [x1, y2]]
      ];
      labelX = x1 - bracketDepth - 16;
      labelY = midY;
      break;
    case 'bottom':
      segments = [
        [[x1, y1], [x1, y1 + bracketDepth], [midX, y1 + bracketDepth], [midX, y1 + bracketDepth + 10]],
        [[midX, y1 + bracketDepth], [x2, y1 + bracketDepth], [x2, y1]]
      ];
      labelX = midX;
      labelY = y1 + bracketDepth + 20;
      break;
    case 'top':
    default:
      segments = [
        [[x1, y1], [x1, y1 - bracketDepth], [midX, y1 - bracketDepth], [midX, y1 - bracketDepth - 10]],
        [[midX, y1 - bracketDepth], [x2, y1 - bracketDepth], [x2, y1]]
      ];
      labelX = midX;
      labelY = y1 - bracketDepth - 20;
      break;
  }

  // Bracket path
  if (sketchOn) {
    segments.forEach((pts, i) => {
      elements.push(sketchShape('linearPath', [pts], sketchOptions({ stroke: c, strokeWidth, roughness, seed: seed + i })));
    });
  } else {
    const bracketPath = segments
      .map((pts) => 'M' + pts.map(([px, py]) => `${px},${py}`).join(' L'))
      .join(' ');
    elements.push(`
    <path d="${bracketPath}" fill="none" stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${filterAttr}/>
  `);
  }

  // Text label
  const padding = 8;
  const textW = getTextContentWidthPx(text, fontSize) + padding * 2;
  const textH = fontSize * 1.4 + padding;
  const textAnchor = direction === 'left' ? 'end' : (direction === 'right' ? 'start' : 'middle');

  const labelFont = sketchOn ? HANDWRITING_FONT : CLEAN_FONT;
  elements.push(`
    <text x="${labelX}" y="${labelY + fontSize * 0.35}" text-anchor="${textAnchor}" fill="${c}"
          font-size="${fontSize}" font-weight="700" font-family="${labelFont}">${escapeXml(text)}</text>
  `);

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

function createSpotlight({ x, y, radius, width: spotWidth, height: spotHeight, color = 'primary', strokeWidth = 2, opacity = 0.5, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(color);
  const id = generateId('spotlight');
  const defs = [];
  const elements = [];

  // We need the image dimensions to cover the full image, but we don't have them here.
  // The mask approach works with a large enough rect (the SVG viewBox covers the image).
  const maskId = `${id}-mask`;
  const useRect = spotWidth && spotHeight;
  const gen = sketch === true ? getRoughGenerator() : null;

  if (gen) {
    // One rough drawable supplies both the mask cutout (its solid fill path)
    // and the visible ring (its stroke paths), so the wobbly hole and the
    // wobbly outline coincide exactly.
    const opts = sketchOptions({ stroke: c, strokeWidth, fill: '#000000', fillStyle: 'solid', roughness, seed });
    const drawable = useRect
      ? gen.rectangle(x - spotWidth / 2, y - spotHeight / 2, spotWidth, spotHeight, opts)
      : gen.circle(x, y, (radius || 60) * 2, opts);
    const paths = gen.toPaths(drawable);
    const fillPaths = paths.filter((p) => p.fill && p.fill !== 'none');
    const strokePaths = paths.filter((p) => !p.fill || p.fill === 'none');
    defs.push(`
      <mask id="${maskId}">
        <rect x="0" y="0" width="100%" height="100%" fill="white"/>
        ${fillPaths.map((p) => `<path d="${p.d}" fill="black"/>`).join('\n')}
      </mask>
    `);
    elements.push(`<rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,${opacity})" mask="url(#${maskId})"/>`);
    elements.push(roughPathsToSvg(strokePaths));
    return { defs: defs.join('\n'), element: elements.join('\n') };
  }

  if (useRect) {
    defs.push(`
      <mask id="${maskId}">
        <rect x="0" y="0" width="100%" height="100%" fill="white"/>
        <rect x="${x - spotWidth / 2}" y="${y - spotHeight / 2}" width="${spotWidth}" height="${spotHeight}" rx="8" fill="black"/>
      </mask>
    `);
    // Dark overlay with cutout
    elements.push(`<rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,${opacity})" mask="url(#${maskId})"/>`);
    // Stroke around cutout
    elements.push(`<rect x="${x - spotWidth / 2}" y="${y - spotHeight / 2}" width="${spotWidth}" height="${spotHeight}" rx="8" fill="none" stroke="${c}" stroke-width="${strokeWidth}"/>`);
  } else {
    const r = radius || 60;
    defs.push(`
      <mask id="${maskId}">
        <rect x="0" y="0" width="100%" height="100%" fill="white"/>
        <circle cx="${x}" cy="${y}" r="${r}" fill="black"/>
      </mask>
    `);
    elements.push(`<rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,${opacity})" mask="url(#${maskId})"/>`);
    elements.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-width="${strokeWidth}"/>`);
  }

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

function createMagnifier({ target, anchor, radius = 60, zoom = 2, borderColor = 'primary', strokeWidth = 2, shadow = true, sketch = false, roughness = 1, seed = 1 }) {
  const c = getColor(borderColor);
  const id = generateId('magnifier');
  const defs = [];
  const elements = [];
  const [tx, ty] = target;
  const [ax, ay] = anchor;
  const sketchOn = sketch === true && getRoughGenerator() !== null;

  if (shadow && !sketchOn) {
    defs.push(createDropShadow(`${id}-shadow`, 4, 0.25));
  }
  const filterAttr = shadow && !sketchOn ? `filter="url(#${id}-shadow)"` : '';

  if (sketchOn) {
    // Sketchy connector with a two-stroke head. The lens ring below stays a
    // clean circle on purpose: Sharp crops the magnified pixels as a perfect
    // circle, and a wobbly ring around a crisp crop would expose the seam.
    const shaft = sketchShape('line', [ax, ay, tx, ty], sketchOptions({ stroke: c, strokeWidth: 2, roughness, seed }));
    const head = sketchArrowHead(tx, ty, Math.atan2(ty - ay, tx - ax), 10,
      sketchOptions({ stroke: c, strokeWidth: 2, roughness, seed: seed + 1 }));
    elements.push(`<g opacity="0.85">${shaft}\n${head || ''}</g>`);
  } else {
    // Arrow head for the connector line
    const headSize = 8;
    defs.push(`
    <marker id="${id}-head" markerWidth="${headSize}" markerHeight="${headSize * 0.7}"
            refX="${headSize - 1}" refY="${headSize * 0.35}" orient="auto" markerUnits="userSpaceOnUse">
      <polygon points="0 0, ${headSize} ${headSize * 0.35}, 0 ${headSize * 0.7}" fill="${c}"/>
    </marker>
  `);

    // Connector line from anchor to target
    elements.push(`
    <line x1="${ax}" y1="${ay}" x2="${tx}" y2="${ty}"
          stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.8" marker-end="url(#${id}-head)"/>
  `);
  }

  // Small cross-hair at target
  const ch = 8;
  elements.push(`
    <line x1="${tx - ch}" y1="${ty}" x2="${tx + ch}" y2="${ty}" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
    <line x1="${tx}" y1="${ty - ch}" x2="${tx}" y2="${ty + ch}" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
    <circle cx="${tx}" cy="${ty}" r="${ch + 2}" fill="none" stroke="${c}" stroke-width="1" opacity="0.5"/>
  `);

  // Magnifier circle border at anchor (content will be composited by Sharp)
  elements.push(`
    <circle cx="${ax}" cy="${ay}" r="${radius}" fill="none" stroke="${c}" stroke-width="${strokeWidth}" ${filterAttr}/>
  `);

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

// Light tint of a colour (mixed towards white). Non-hex inputs fall back to
// plain white rather than guessing.
function tintColor(hex, ratio = 0.85) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#FFFFFF';
  let h = match[1];
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const mix = (v) => Math.round(v + (255 - v) * ratio);
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`;
}

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Fields that end up verbatim inside an SVG attribute and must therefore be
// real numbers. Anything else is dropped so the create* default applies.
const NUMERIC_ANNOTATION_FIELDS = [
  'x', 'y', 'width', 'height', 'radius', 'size', 'fontSize', 'strokeWidth',
  'cornerRadius', 'opacity', 'intensity', 'curve', 'padding', 'zoom', 'blockSize',
  'roughness', 'seed'
];

function sanitizeNumericFields(annotation) {
  let sanitized = annotation;
  for (const field of NUMERIC_ANNOTATION_FIELDS) {
    const value = annotation[field];
    if (value === undefined || (typeof value === 'number' && isFinite(value))) continue;
    if (sanitized === annotation) sanitized = { ...annotation };
    const coerced = Number(value);
    if (isFinite(coerced)) {
      sanitized[field] = coerced;
    } else {
      log('WARN', `Ignoring non-numeric "${field}" value ${JSON.stringify(String(value))}.`);
      delete sanitized[field];
    }
  }
  return sanitized;
}

/**
 * Render every annotation into raw <defs> and element markup.
 *
 * Split out of buildSvg so the config-UI preview can wrap this same output in
 * its own padded viewBox instead of keeping a second copy of the dispatch.
 *
 * @returns {{defs: string[], elements: string[]}}
 */
function buildSvgParts(annotations, options = {}) {
  if (typeof options === 'string') {
    options = { theme: options };
  }

  const { theme = null, defaultSizes = {}, customThemes = null, sketch = false } = options;
  // The 'sketch' theme implies the hand-drawn renderer for every annotation,
  // same as passing options.sketch = true.
  const sketchAll = sketch === true || theme === 'sketch';

  if (!Array.isArray(annotations)) {
    throw invalidParameter('Annotations must be an array', 'annotations');
  }

  const defs = [];
  const elements = [];
  // Redaction layering is structural, not order-dependent: solid redact
  // rectangles always paint above every annotation (so they cover matched
  // callout text), while pixelate/blur preview placeholders paint below
  // everything (mimicking the pixel operations that run under the SVG layer).
  const bottomElements = [];
  const topElements = [];
  const themeDefaults = customThemes?.[theme] || (theme ? THEMES[theme] : null);

  for (const [index, annotation] of annotations.entries()) {
    let mergedAnn = sanitizeNumericFields(themeDefaults && themeDefaults[annotation.type]
      ? { ...themeDefaults[annotation.type], ...annotation }
      : annotation);

    if (defaultSizes.markerSize && !mergedAnn.size && (mergedAnn.type === 'marker' || mergedAnn.type === 'number')) {
      mergedAnn = { ...mergedAnn, size: defaultSizes.markerSize };
    }
    if (defaultSizes.strokeWidth && !mergedAnn.strokeWidth && (mergedAnn.type === 'arrow' || mergedAnn.type === 'curved-arrow' || mergedAnn.type === 'connector')) {
      mergedAnn = { ...mergedAnn, strokeWidth: defaultSizes.strokeWidth };
    }
    if (defaultSizes.fontSize && !mergedAnn.fontSize && (mergedAnn.type === 'label' || mergedAnn.type === 'callout' || mergedAnn.type === 'leadout')) {
      mergedAnn = { ...mergedAnn, fontSize: defaultSizes.fontSize };
    }

    // Redact/blur never sketch (see createRedact); everything else follows the
    // global flag unless the annotation says otherwise. Per-index default
    // seeds keep re-renders identical while neighbouring shapes wobble
    // differently.
    const isRedactType = mergedAnn.type === 'redact' || mergedAnn.type === 'blur';
    if (sketchAll && mergedAnn.sketch === undefined && !isRedactType) {
      mergedAnn = { ...mergedAnn, sketch: true };
    }
    if (mergedAnn.sketch === true && mergedAnn.seed === undefined) {
      mergedAnn = { ...mergedAnn, seed: index + 1 };
    }

    let result;
    switch (annotation.type) {
      case 'marker':
      case 'number':
        result = createMarker(mergedAnn);
        break;
      case 'arrow':
        result = createArrow(mergedAnn);
        break;
      case 'curved-arrow':
      case 'curvedArrow':
        result = createCurvedArrow(mergedAnn);
        break;
      case 'callout':
        result = createCallout(mergedAnn);
        break;
      case 'rect':
      case 'rectangle':
      case 'box':
        result = createRect(mergedAnn);
        break;
      case 'circle':
        result = createCircle(mergedAnn);
        break;
      case 'label':
      case 'text':
        result = createLabel(mergedAnn);
        break;
      case 'highlight':
        result = createHighlight(mergedAnn);
        break;
      case 'blur':
      case 'redact':
        result = createRedact(mergedAnn, { preview: options.preview === true });
        break;
      case 'connector':
      case 'line':
        result = createConnector(mergedAnn);
        break;
      case 'icon':
        result = createIcon(mergedAnn);
        break;
      case 'measure':
        result = createMeasure(mergedAnn);
        break;
      case 'leadout':
        result = createLeadout(mergedAnn);
        break;
      case 'bracket-label':
      case 'bracketLabel':
        result = createBracketLabel(mergedAnn);
        break;
      case 'spotlight':
        result = createSpotlight(mergedAnn);
        break;
      case 'magnifier':
        result = createMagnifier(mergedAnn);
        break;
      default:
        log('WARN', `Unknown annotation type: ${annotation.type}`);
        continue;
    }

    if (result) {
      if (result.defs) defs.push(result.defs);
      if (result.element) {
        const element = options.outputFormat === 'svg'
          ? `<g data-annotation-index="${index}">${result.element}</g>`
          : result.element;
        const bucket = result.layer === 'top' ? topElements
          : result.layer === 'bottom' ? bottomElements
            : elements;
        bucket.push(element);
      }
    }
  }

  return { defs, elements: [...bottomElements, ...elements, ...topElements] };
}

function buildSvg(width, height, annotations, options = {}) {
  const { defs, elements } = buildSvgParts(annotations, options);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    '  <defs>',
    '    ' + defs.join(String.fromCharCode(10)),
    '  </defs>',
    '  ' + elements.join(String.fromCharCode(10)),
    '</svg>'
  ].join(String.fromCharCode(10));
}

const api = {
  log,
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
  getColor,
  getFontFamily,
  getRoughGenerator,
  sketchOptions,
  sketchShape,
  sanitizeNumericFields,
  setIdGenerator,
  resetIdGenerator,
  createDropShadow,
  createMarker,
  createArrow,
  createCurvedArrow,
  createCallout,
  createRect,
  createCircle,
  createLabel,
  createHighlight,
  createBlur,
  DEFAULT_REDACT_FILL,
  createRedact,
  getRedactLabelColor,
  getRedactMode,
  createConnector,
  createIcon,
  createMeasure,
  getLeadoutChipSize,
  createLeadout,
  createBracketLabel,
  createSpotlight,
  createMagnifier,
  adjustColor,
  tintColor,
  buildSvgParts,
  buildSvg
};

if (isCommonJs) {
  module.exports = api;
}
// Entry point for the config UI and examples pages, which load this file with a
// plain <script> tag rather than through a bundler.
if (typeof globalThis !== 'undefined') {
  globalThis.ImageAnnotatorRender = api;
}
