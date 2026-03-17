/**
 * Image Annotator - Professional screenshot annotation tool
 *
 * Add markers, arrows, callouts, highlights, and more to screenshots
 * for creating documentation, tutorials, and bug reports.
 *
 * @author Varun Developers
 * @license MIT
 */

const sharp = require('sharp');
const { optimize } = require('svgo');
const path = require('path');
const fs = require('fs');
const { loadConfig, saveConfig } = require('./config-loader');

/**
 * Write a structured log message to stderr
 */
function log(level, message) {
  process.stderr.write(`[image-annotator] ${level.toUpperCase()}: ${message}\n`);
}

const {
  FileNotFoundError,
  InvalidParameterError,
  ImageProcessingError,
  ValidationError,
  CoordinateClampWarning
} = require('./annotate-errors');

// Professional font stacks (replacing Comic Sans)
const THEME_FONTS = {
  documentation: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  tutorial: 'Nunito, Quicksand, sans-serif',
  bugReport: 'JetBrains Mono, Fira Code, monospace',
  highlight: 'Noto Sans, Noto Sans CJK SC, sans-serif'
};

// Handwriting-style font stack (more reliable cross-platform)
const HANDWRITING_FONT = "Comic Sans MS, Chalkboard SE, Patrick Hand, cursive";

// Clean sans-serif font stack
const CLEAN_FONT = "Segoe UI, Helvetica Neue, Arial, sans-serif";

// Professional color palette
const COLORS = {
  // Primary colors
  red: '#E53935',
  orange: '#FB8C00',
  yellow: '#FDD835',
  green: '#43A047',
  blue: '#1E88E5',
  purple: '#8E24AA',
  pink: '#D81B60',
  cyan: '#00ACC1',
  teal: '#00897B',

  // Neutrals
  white: '#FFFFFF',
  black: '#212121',
  gray: '#757575',
  lightGray: '#E0E0E0',
  darkGray: '#424242',

  // Semantic colors
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',

  // Documentation colors
  primary: '#1976D2',
  secondary: '#7B1FA2',
  accent: '#FF4081'
};

// Preset themes for different use cases (bolder defaults)
const THEMES = {
  documentation: {
    marker: { color: 'primary', size: 32 },
    arrow: { color: 'primary', strokeWidth: 5 },
    label: { color: 'primary', fontSize: 20, background: 'white', font: 'Inter' },
    callout: { color: 'primary', background: 'white', font: 'Inter' }
  },
  tutorial: {
    marker: { color: 'green', size: 36 },
    arrow: { color: 'green', strokeWidth: 6 },
    label: { color: 'darkGray', fontSize: 22, background: 'lightGray', font: 'Nunito' },
    callout: { color: 'green', background: 'white', font: 'Nunito' }
  },
  bugReport: {
    marker: { color: 'error', size: 32 },
    arrow: { color: 'error', strokeWidth: 5 },
    label: { color: 'error', fontSize: 20, background: 'white', font: 'JetBrains Mono' },
    callout: { color: 'error', background: 'white', font: 'JetBrains Mono' }
  },
  highlight: {
    marker: { color: 'warning', size: 32 },
    arrow: { color: 'warning', strokeWidth: 5 },
    label: { color: 'darkGray', fontSize: 20, background: 'yellow', font: 'Noto Sans' },
    callout: { color: 'warning', background: 'yellow', font: 'Noto Sans' }
  }
};

// Size presets based on image width
const SIZE_PRESETS = {
  xs: { markerSize: 20, strokeWidth: 3, fontSize: 12 },   // < 400px
  s:  { markerSize: 24, strokeWidth: 4, fontSize: 14 },   // 400-800px
  m:  { markerSize: 32, strokeWidth: 5, fontSize: 18 },   // 800-1200px (default)
  l:  { markerSize: 40, strokeWidth: 6, fontSize: 22 },   // 1200-1920px
  xl: { markerSize: 48, strokeWidth: 8, fontSize: 28 }    // > 1920px
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

/**
 * Get size preset based on image dimensions
 */
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

// Text width estimation coefficient (average character width / font size ratio) for narrow-only text
const TEXT_WIDTH_RATIO = 0.65;

// CJK character ranges: CJK Unified, Hiragana/Katakana, Hangul (kept for backward compatibility)
const CJK_REGEX = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

/**
 * East Asian Width per UAX #11: returns display cell width (1 = narrow, 2 = wide).
 * Used for mixed Latin+CJK text so each character is weighted correctly.
 * Ranges: Wide (W) + Fullwidth (F) = 2; Narrow (Na), Neutral (N), Halfwidth (H), Ambiguous (A as narrow) = 1.
 */
const EAST_ASIAN_WIDE_RANGES = [
  [0x3000, 0x303f],   // CJK symbols and punctuation
  [0x3040, 0x309f],   // Hiragana
  [0x30a0, 0x30ff],   // Katakana
  [0x3100, 0x312f],   // Bopomofo
  [0x3130, 0x318f],   // Hangul compatibility
  [0x3190, 0x31bf],   // Kanbun, Bopomofo extended
  [0x31c0, 0x31ef],   // CJK strokes
  [0x31f0, 0x321f],   // Katakana extension
  [0x3220, 0x3247],   // Enclosed CJK
  [0x3250, 0x32fe],   // Enclosed CJK
  [0x3300, 0x33ff],   // Katakana compat / CJK compat
  [0x3400, 0x4dbf],   // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff],   // CJK Unified Ideographs
  [0xac00, 0xd7af],   // Hangul Syllables
  [0xf900, 0xfaff],   // CJK Compatibility Ideographs
  [0xff00, 0xffef],   // Fullwidth forms
  [0x20000, 0x2fffd], // Supplementary Ideographic (Plane 2)
  [0x30000, 0x3fffd], // Tertiary Ideographic (Plane 3)
];

function isEastAsianWide(codepoint) {
  if (typeof codepoint !== 'number' || codepoint < 0) return false;
  for (let i = 0; i < EAST_ASIAN_WIDE_RANGES.length; i++) {
    const [lo, hi] = EAST_ASIAN_WIDE_RANGES[i];
    if (codepoint >= lo && codepoint <= hi) return true;
  }
  return false;
}

/**
 * Compute content width in px for one line using UAX #11 East Asian Width.
 * Narrow = 0.5 em, Wide = 1 em (per UAX #11); width = totalEm * fontSize.
 */
function getTextContentWidthPx(line, fontSize) {
  if (!line || typeof line !== 'string') return 0;
  let totalEm = 0;
  for (let i = 0; i < line.length; i++) {
    const cp = line.codePointAt(i);
    totalEm += isEastAsianWide(cp) ? 1 : 0.5;
    if (cp > 0xffff) i++; // skip low surrogate
  }
  return totalEm * fontSize;
}

/** Return character-width ratio for text (CJK needs ~1.0, Latin ~0.65) to avoid label overflow.
 * @deprecated Prefer getTextContentWidthPx(line, fontSize) for mixed scripts (UAX #11). */
function getLabelTextWidthRatio(text) {
  return CJK_REGEX.test(text) ? 1.0 : TEXT_WIDTH_RATIO;
}

// Default padding for callouts and labels
const DEFAULT_PADDING = 14;

// Line height coefficient
const LINE_HEIGHT_RATIO = 1.5;

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  if (typeof text !== 'string') return String(text);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Get color value from name or hex
 */
function getColor(color) {
  return COLORS[color] || color || COLORS.red;
}

/**
 * Generate unique ID for SVG elements using crypto UUID
 */
const crypto = require('crypto');
let customIdGenerator = null;

function generateId(prefix = 'ann') {
  if (typeof customIdGenerator === 'function') {
    return customIdGenerator(prefix);
  }
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${randomPart}`;
}

function setIdGenerator(generator) {
  customIdGenerator = typeof generator === 'function' ? generator : null;
}

function resetIdGenerator() {
  customIdGenerator = null;
}

/**
 * Create drop shadow filter definition
 */
function createDropShadow(id, blur = 4, opacity = 0.3) {
  return `
    <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="2" dy="2" stdDeviation="${blur}" flood-opacity="${opacity}"/>
    </filter>
  `;
}

/**
 * Create professional numbered marker with shadow and gradient
 */
function createMarker({ x, y, number, color = 'red', size = 32, shadow = true, style = 'filled' }) {
  const c = getColor(color);
  const id = generateId('marker');
  const defs = [];
  const elements = [];

  // Add drop shadow
  if (shadow) {
    const shadowId = `${id}-shadow`;
    defs.push(createDropShadow(shadowId));
  }

  // Create gradient for 3D effect
  const gradientId = `${id}-gradient`;
  defs.push(`
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${c};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${adjustColor(c, -30)};stop-opacity:1" />
    </linearGradient>
  `);

  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';

  if (style === 'filled') {
    // Filled circle with number
    elements.push(`
      <circle cx="${x}" cy="${y}" r="${size}" fill="url(#${gradientId})" ${filterAttr}/>
      <circle cx="${x}" cy="${y}" r="${size - 2}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="white"
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${number}</text>
    `);
  } else if (style === 'outline') {
    // Outlined circle with number
    elements.push(`
      <circle cx="${x}" cy="${y}" r="${size}" fill="white" stroke="${c}" stroke-width="3" ${filterAttr}/>
      <text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="${c}"
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${number}</text>
    `);
  } else if (style === 'badge') {
    // Badge style (pill shape for multi-digit)
    const isMultiDigit = number > 9;
    const width = isMultiDigit ? size * 2.4 : size * 2;
    const height = size * 2;
    elements.push(`
      <rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}"
            rx="${height / 2}" fill="url(#${gradientId})" ${filterAttr}/>
      <text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="white"
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${number}</text>
    `);
  }

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

/**
 * Create professional arrow with arrowhead (bolder, rounded)
 */
function createArrow({ from, to, color = 'red', strokeWidth = 5, style = 'solid', headStyle = 'filled', shadow = true }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;
  const id = generateId('arrow');
  const defs = [];

  // Add drop shadow
  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`, 2, 0.2));
  }

  // Arrow head marker
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

/**
 * Create curved arrow with smooth bezier curve (bolder, rounded)
 */
function createCurvedArrow({ from, to, curve = 50, color = 'red', strokeWidth = 5, headStyle = 'filled', shadow = true }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;
  const id = generateId('curved-arrow');
  const defs = [];

  // Calculate control point
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = midX + nx * curve;
  const cy = midY + ny * curve;

  // Add drop shadow
  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`, 2, 0.2));
  }

  // Arrow head
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

/**
 * Create professional callout box with pointer (rounded corners, handwriting font)
 */
function createCallout({ x, y, text, color = 'primary', background = 'white', width = null, pointer = 'bottom', fontSize = 18, shadow = true, handwriting = null, font = null }) {
  const borderColor = getColor(color);
  const bgColor = getColor(background);
  const id = generateId('callout');
  const defs = [];
  
  // Determine font family: explicit font > theme font > handwriting flag > default
  let fontFamily;
  if (font) {
    fontFamily = font;
  } else if (handwriting === true) {
    fontFamily = HANDWRITING_FONT;
  } else if (handwriting === false) {
    fontFamily = CLEAN_FONT;
  } else {
    fontFamily = CLEAN_FONT;  // default to clean font
  }

  // Calculate dimensions using UAX #11 East Asian Width (per-char) for mixed Latin+CJK
  const padding = 14;
  const lineHeight = fontSize * 1.5;
  const lines = text.split('\n');
  const contentWidth = Math.max(0, ...lines.map(l => getTextContentWidthPx(l, fontSize)));
  const textWidth = width || contentWidth + padding * 2;
  const textHeight = lines.length * lineHeight + padding * 2;

  // Add drop shadow
  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`, 4, 0.15));
  }

  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';

  // Calculate box position based on pointer
  let boxX, boxY, pointerPath;
  const pointerSize = 12;

  switch (pointer) {
    case 'top':
      boxX = x - textWidth / 2;
      boxY = y + pointerSize;
      pointerPath = `M${x - pointerSize},${y + pointerSize} L${x},${y} L${x + pointerSize},${y + pointerSize}`;
      break;
    case 'bottom':
      boxX = x - textWidth / 2;
      boxY = y - textHeight - pointerSize;
      pointerPath = `M${x - pointerSize},${y - pointerSize} L${x},${y} L${x + pointerSize},${y - pointerSize}`;
      break;
    case 'left':
      boxX = x + pointerSize;
      boxY = y - textHeight / 2;
      pointerPath = `M${x + pointerSize},${y - pointerSize} L${x},${y} L${x + pointerSize},${y + pointerSize}`;
      break;
    case 'right':
      boxX = x - textWidth - pointerSize;
      boxY = y - textHeight / 2;
      pointerPath = `M${x - pointerSize},${y - pointerSize} L${x},${y} L${x - pointerSize},${y + pointerSize}`;
      break;
    default:
      boxX = x;
      boxY = y;
      pointerPath = '';
  }

  // Build text elements: vertical center of first line at padding + lineHeight/2, then dy per line
  const textY = boxY + padding + lineHeight / 2;
  const textElements = lines.map((line, i) =>
    `<tspan x="${boxX + padding}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');

  const element = `
    <g ${filterAttr}>
      <rect x="${boxX}" y="${boxY}" width="${textWidth}" height="${textHeight}"
            rx="10" fill="${bgColor}" stroke="${borderColor}" stroke-width="3" stroke-linejoin="round"/>
      ${pointerPath ? `<path d="${pointerPath}" fill="${bgColor}" stroke="${borderColor}" stroke-width="3" stroke-linejoin="round"/>` : ''}
      <text x="${boxX + padding}" y="${textY}" dominant-baseline="middle"
            fill="${getColor('darkGray')}" font-size="${fontSize}" font-family="${fontFamily}" font-weight="600">
        ${textElements}
      </text>
    </g>
  `;

  return { defs: defs.join('\n'), element };
}

/**
 * Create rectangle/box highlight (rounded corners)
 */
function createRect({ x, y, width, height, color = 'red', strokeWidth = 4, fill = 'none', cornerRadius = 12, style = 'solid', shadow = false }) {
  const c = getColor(color);
  const fillColor = fill === 'none' ? 'none' : getColor(fill);
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

/**
 * Create circle highlight (bolder)
 */
function createCircle({ x, y, radius = 30, color = 'red', strokeWidth = 4, fill = 'none', style = 'solid', shadow = false }) {
  const c = getColor(color);
  const fillColor = fill === 'none' ? 'none' : getColor(fill);
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

/**
 * Create text label with optional background (handwriting font support).
 * Supports multi-line via \n; box width adapts to content (CJK-safe ratio).
 */
function createLabel({ x, y, text, color = 'darkGray', fontSize = 18, fontWeight = '600', background = null, padding = 10, cornerRadius = 8, shadow = true, handwriting = null, font = null }) {
  const textColor = getColor(color);
  const id = generateId('label');
  const defs = [];
  const elements = [];
  
  // Determine font family: explicit font > theme font > handwriting flag > default
  let fontFamily;
  if (font) {
    fontFamily = font;
  } else if (handwriting === true) {
    fontFamily = HANDWRITING_FONT;
  } else if (handwriting === false) {
    fontFamily = CLEAN_FONT;
  } else {
    fontFamily = CLEAN_FONT;  // default to clean font
  }

  const lines = text.split('\n');
  const lineHeight = fontSize * 1.3;
  const textWidth = Math.max(0, ...lines.map(l => getTextContentWidthPx(l, fontSize)));
  const textHeight = lines.length * lineHeight;

  if (shadow && background) {
    defs.push(createDropShadow(`${id}-shadow`, 4, 0.2));
  }

  const filterAttr = (shadow && background) ? `filter="url(#${id}-shadow)"` : '';

  if (background) {
    const bgColor = getColor(background);
    elements.push(`
      <rect x="${x - padding}" y="${y - textHeight - padding + 4}"
            width="${textWidth + padding * 2}" height="${textHeight + padding * 2}"
            rx="${cornerRadius}" fill="${bgColor}" stroke="${textColor}" stroke-width="2" stroke-linejoin="round" ${filterAttr}/>
    `);
  }

  const textElements = lines.map((line, i) =>
    `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');
  elements.push(`
    <text x="${x}" y="${y}" fill="${textColor}" font-size="${fontSize}"
          font-weight="${fontWeight}" font-family="${fontFamily}">${textElements}</text>
  `);

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

/**
 * Create highlight overlay
 */
function createHighlight({ x, y, width, height, color = 'yellow', opacity = 0.35, cornerRadius = 0 }) {
  const c = getColor(color);
  return {
    defs: '',
    element: `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" fill="${c}" opacity="${opacity}"/>`
  };
}

/**
 * Create blur mask for sensitive content
 */
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

/**
 * Create step connector line between two points (bolder, rounded)
 */
function createConnector({ from, to, color = 'gray', strokeWidth = 3, style = 'dashed' }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dashArray = style === 'dashed' ? 'stroke-dasharray="8,5"' : '';

  return {
    defs: '',
    element: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round" ${dashArray}/>`
  };
}

/**
 * Create icon badge (checkmark, x, warning, info) - bolder strokes
 */
function createIcon({ x, y, icon, color = 'green', size = 28, shadow = true }) {
  const c = getColor(color);
  const id = generateId('icon');
  const defs = [];

  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`));
  }

  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';
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

/**
 * Adjust color brightness
 */
function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Build complete SVG from annotations
 */
function buildSvg(width, height, annotations, options = {}) {
  // Handle backward compatibility: options can be a string (theme name)
  if (typeof options === 'string') {
    options = { theme: options };
  }
  
  const { theme = null, defaultSizes = {}, customThemes = null } = options;
  
  // Validate annotations array
  if (!Array.isArray(annotations)) {
    throw new InvalidParameterError('Annotations must be an array', 'annotations');
  }

  const defs = [];
  const elements = [];

  // Apply theme defaults if specified (custom themes take precedence)
  const themeDefaults = customThemes?.[theme] || (theme ? THEMES[theme] : null);

  for (const ann of annotations) {
    // Merge with theme defaults first
    let mergedAnn = themeDefaults && themeDefaults[ann.type]
      ? { ...themeDefaults[ann.type], ...ann }
      : ann;
    
    // Then apply size preset defaults (only if not explicitly set)
    if (defaultSizes.markerSize && !mergedAnn.size && (mergedAnn.type === 'marker' || mergedAnn.type === 'number')) {
      mergedAnn = { ...mergedAnn, size: defaultSizes.markerSize };
    }
    if (defaultSizes.strokeWidth && !mergedAnn.strokeWidth && (mergedAnn.type === 'arrow' || mergedAnn.type === 'curved-arrow' || mergedAnn.type === 'connector')) {
      mergedAnn = { ...mergedAnn, strokeWidth: defaultSizes.strokeWidth };
    }
    if (defaultSizes.fontSize && !mergedAnn.fontSize && (mergedAnn.type === 'label' || mergedAnn.type === 'callout')) {
      mergedAnn = { ...mergedAnn, fontSize: defaultSizes.fontSize };
    }

    let result;

    switch (ann.type) {
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
        result = createBlur(mergedAnn);
        break;
      case 'connector':
      case 'line':
        result = createConnector(mergedAnn);
        break;
      case 'icon':
        result = createIcon(mergedAnn);
        break;
      default:
        log('WARN', `Unknown annotation type: ${ann.type}`);
        continue;
    }

    if (result) {
      if (result.defs) defs.push(result.defs);
      if (result.element) elements.push(result.element);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${defs.join('\n')}
  </defs>
  ${elements.join('\n')}
</svg>`;
}

/**
 * Main annotation function
 */
async function annotateImage(inputPath, outputPath, annotations, options = {}) {
  // Validate input
  if (!fs.existsSync(inputPath)) {
    throw new FileNotFoundError(inputPath);
  }

  // Validate annotations
  validateAnnotations(annotations);

  // Get image metadata
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;

  // Check image size
  checkImageSize(metadata);

  const devicePixelRatio = options.devicePixelRatio || 1;
  const scaledAnnotations = devicePixelRatio !== 1
    ? annotations.map((annotation) => scaleAnnotationCoords(annotation, devicePixelRatio))
    : annotations;
  const padding = normalizeCanvasPadding(options.canvasPadding);
  const extendedWidth = width + padding.left + padding.right;
  const extendedHeight = height + padding.top + padding.bottom;
  const offsetAnnotations = (padding.left || padding.top)
    ? scaledAnnotations.map((annotation) => offsetAnnotationCoords(annotation, padding.left, padding.top))
    : scaledAnnotations;

  // Clamp annotation coordinates to valid bounds
  const { annotations: validAnnotations, warnings } = clampAnnotations(offsetAnnotations, extendedWidth, extendedHeight);

  // Load config if not provided
  // Try to load config from the input file's directory first, then fall back to cwd
  const inputDir = path.dirname(inputPath);
  const config = options.config || loadConfig(inputDir) || loadConfig();
  
  // Get size preset based on image dimensions
  let sizePreset = config.sizePreset;
  if (sizePreset === 'auto' || !sizePreset) {
    sizePreset = getSizePreset(width, height);
  }
  
  const baseSizes = SIZE_PRESETS[sizePreset] || SIZE_PRESETS.m;
  const sizes = config.defaultSizes && typeof config.defaultSizes === 'object'
    ? { ...baseSizes, ...config.defaultSizes }
    : baseSizes;

  // Apply config to options
  const enhancedOptions = {
    ...options,
    defaultSizes: sizes,
    theme: options.theme || config.theme,
    customThemes: config.themes
  };

  // Build SVG overlay
  const svg = buildSvg(extendedWidth, extendedHeight, validAnnotations, enhancedOptions);
  const optimizedSvg = optimizeSvg(svg);
  const outputFormat = normalizeOutputFormat(outputPath, options.outputFormat);
  const finalOutputPath = resolveOutputPathForFormat(outputPath, outputFormat);
  const quality = options.quality ?? getDefaultQuality(outputFormat);
  const altText = generateAltText(validAnnotations, extendedWidth, extendedHeight, enhancedOptions);

  // For SVG output: write annotation-only SVG directly, skip sharp compositing
  if (outputFormat === 'svg') {
    try {
      fs.writeFileSync(finalOutputPath, optimizedSvg);
    } catch (err) {
      throw new ImageProcessingError(`Failed to write SVG output: ${err.message}`, err);
    }

    return {
      outputPath: finalOutputPath,
      width: extendedWidth,
      height: extendedHeight,
      annotationCount: annotations.length,
      warnings,
      sizePreset,
      theme: enhancedOptions.theme,
      devicePixelRatio,
      canvasPadding: padding,
      outputFormat,
      quality: undefined,
      altText,
      size: optimizedSvg.length
    };
  }

  // Composite SVG onto image
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

    pipeline = pipeline
      .composite([{
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
    annotationCount: annotations.length,
    warnings,
    sizePreset,
    theme: enhancedOptions.theme,
    devicePixelRatio,
    canvasPadding: padding,
    outputFormat,
    quality,
    altText
  };
}

/**
 * Get image dimensions
 */
async function getImageDimensions(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format
  };
}

/**
 * Check image size and warn if large
 */
function checkImageSize(metadata) {
  const pixels = metadata.width * metadata.height;
  const FOUR_K_PIXELS = 3840 * 2160; // ~8.3MP

  if (pixels > FOUR_K_PIXELS) {
    log('WARN', `Large image detected (${metadata.width}x${metadata.height}, ${(pixels/1000000).toFixed(1)}MP). Processing may be slow.`);
  }

  return pixels > FOUR_K_PIXELS;
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

/**
 * Clamp annotation coordinates to valid bounds
 * Returns clamped annotations and warnings for any values that were adjusted
 */
function clampAnnotations(annotations, imageWidth, imageHeight) {
  if (!annotations || !Array.isArray(annotations)) {
    return { annotations: [], warnings: [] };
  }

  const clampedAnnotations = [];
  const warnings = [];

  for (let i = 0; i < annotations.length; i++) {
    const ann = annotations[i];
    const clamped = { ...ann };

    // Helper to clamp a value and record warning
    const clampValue = (prop, min, max, original) => {
      if (original === undefined || original === null || isNaN(original)) {
        return min;
      }
      if (!isFinite(original)) {
        return min;
      }
      if (original < min) {
        warnings.push(new CoordinateClampWarning(i, prop, original, min));
        return min;
      }
      if (original > max) {
        warnings.push(new CoordinateClampWarning(i, prop, original, max));
        return max;
      }
      return original;
    };

    // Clamp positional coordinates
    if (clamped.x !== undefined) {
      clamped.x = clampValue('x', 0, imageWidth, clamped.x);
    }
    if (clamped.y !== undefined) {
      clamped.y = clampValue('y', 0, imageHeight, clamped.y);
    }

    // Clamp dimensions (width/height)
    if (clamped.width !== undefined) {
      const maxWidth = imageWidth - (clamped.x || 0);
      clamped.width = clampValue('width', 1, maxWidth, clamped.width);
    }
    if (clamped.height !== undefined) {
      const maxHeight = imageHeight - (clamped.y || 0);
      clamped.height = clampValue('height', 1, maxHeight, clamped.height);
    }

    // Clamp radius
    if (clamped.radius !== undefined) {
      const maxRadius = Math.min(imageWidth, imageHeight) / 2;
      clamped.radius = clampValue('radius', 1, maxRadius, clamped.radius);
    }

    // Clamp arrow from/to coordinates
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

    // Clamp display properties to positive values
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

/**
 * CLI entry point
 */
async function main() {
  // CLI argument parsing with minimist
  const args = require('minimist')(process.argv.slice(2), {
    string: ['annotations', 'theme'],
    boolean: ['help', 'h'],
    alias: { h: 'help' }
  });

  if (args.help) {
    console.log(`
Image Annotator CLI

Usage: node annotate.js <input> <output> [options]

Options:
  --annotations, -a  JSON array of annotations (required)
  --theme, -t        Theme name (documentation|tutorial|bugReport|highlight)
  --help, -h          Show this help message

Examples:
  node annotate.js input.png output.png --annotations='[{"type":"marker","x":100,"y":100,"number":1}]'
  node annotate.js input.png output.png --annotations '[{"type":"arrow","from":[0,0],"to":[100,100]}]' --theme tutorial
`);
    process.exit(0);
  }

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

  try {
    const result = await annotateImage(inputPath, outputPath, annotations, { theme });
    console.log(`✓ Annotated image saved: ${result.outputPath}`);
    console.log(`  Dimensions: ${result.width}x${result.height}`);
    console.log(`  Annotations: ${result.annotationCount}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  annotateImage,
  buildSvg,
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
  // Validation functions
  validateAnnotation,
  validateAnnotations,
  validateImagePath,
  ValidationError
};

// Validation functions
function validateAnnotation(ann) {
  if (!ann || typeof ann !== 'object') {
    throw new ValidationError('Annotation must be an object');
  }
  if (typeof ann.type !== 'string') {
    throw new ValidationError('Annotation must have a type');
  }
  if (ann.type === 'marker') {
    if (typeof ann.x !== 'number' || typeof ann.y !== 'number') {
      throw new ValidationError('Marker annotations require x and y coordinates');
    }
  }
  if (ann.type === 'arrow' || ann.type === 'curved-arrow' || ann.type === 'connector') {
    if (!Array.isArray(ann.from) || !Array.isArray(ann.to)) {
      throw new ValidationError(`${ann.type} annotations require from and to coordinate arrays`);
    }
  }
  return true;
}

function validateAnnotations(annotations) {
  if (!Array.isArray(annotations)) {
    throw new ValidationError('Annotations must be an array');
  }
  annotations.forEach((ann) => {
    validateAnnotation(ann);
  });
  return true;
}

function validateImagePath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') {
    throw new ValidationError('Image path must be a string');
  }
  return true;
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}
