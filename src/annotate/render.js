const crypto = require('crypto');

function log(level, message) {
  process.stderr.write(`[image-annotator] ${level.toUpperCase()}: ${message}\n`);
}

const THEME_FONTS = {
  documentation: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  tutorial: 'Nunito, Quicksand, sans-serif',
  bugReport: 'JetBrains Mono, Fira Code, monospace',
  highlight: 'Noto Sans, Noto Sans CJK SC, sans-serif'
};

const HANDWRITING_FONT = 'Comic Sans MS, Chalkboard SE, Patrick Hand, cursive';
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

const TEXT_WIDTH_RATIO = 0.65;
const CJK_REGEX = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
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

function getLabelTextWidthRatio(text) {
  return CJK_REGEX.test(text) ? 1.0 : TEXT_WIDTH_RATIO;
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

function getColor(color) {
  return COLORS[color] || color || COLORS.red;
}

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

function createDropShadow(id, blur = 4, opacity = 0.3) {
  return `
    <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="2" dy="2" stdDeviation="${blur}" flood-opacity="${opacity}"/>
    </filter>
  `;
}

function createMarker({ x, y, number, color = 'red', size = 32, shadow = true, style = 'filled' }) {
  const c = getColor(color);
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
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${number}</text>
    `);
  } else if (style === 'outline') {
    elements.push(`
      <circle cx="${x}" cy="${y}" r="${size}" fill="white" stroke="${c}" stroke-width="3" ${filterAttr}/>
      <text x="${x}" y="${y + size * 0.35}" text-anchor="middle" fill="${c}"
            font-size="${size * 0.9}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${number}</text>
    `);
  } else if (style === 'badge') {
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

function createArrow({ from, to, color = 'red', strokeWidth = 5, style = 'solid', headStyle = 'filled', shadow = true }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;
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

function createCurvedArrow({ from, to, curve = 50, color = 'red', strokeWidth = 5, headStyle = 'filled', shadow = true }) {
  const c = getColor(color);
  const [x1, y1] = from;
  const [x2, y2] = to;
  const id = generateId('curved-arrow');
  const defs = [];

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = midX + nx * curve;
  const cy = midY + ny * curve;

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

function createCallout({ x, y, text, color = 'primary', background = 'white', width = null, pointer = 'bottom', fontSize = 18, shadow = true, handwriting = null, font = null }) {
  const borderColor = getColor(color);
  const bgColor = getColor(background);
  const id = generateId('callout');
  const defs = [];
  let fontFamily;

  if (font) {
    fontFamily = font;
  } else if (handwriting === true) {
    fontFamily = HANDWRITING_FONT;
  } else if (handwriting === false) {
    fontFamily = CLEAN_FONT;
  } else {
    fontFamily = CLEAN_FONT;
  }

  const padding = 14;
  const lineHeight = fontSize * 1.5;
  const lines = text.split('\n');
  const contentWidth = Math.max(0, ...lines.map((line) => getTextContentWidthPx(line, fontSize)));
  const textWidth = width || contentWidth + padding * 2;
  const textHeight = lines.length * lineHeight + padding * 2;

  if (shadow) {
    defs.push(createDropShadow(`${id}-shadow`, 4, 0.15));
  }

  const filterAttr = shadow ? `filter="url(#${id}-shadow)"` : '';
  let boxX;
  let boxY;
  let pointerPath;
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

  const textY = boxY + padding + lineHeight / 2;
  const textElements = lines.map((line, index) =>
    `<tspan x="${boxX + padding}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
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

function createLabel({ x, y, text, color = 'darkGray', fontSize = 18, fontWeight = '600', background = null, padding = 10, cornerRadius = 8, shadow = true, handwriting = null, font = null }) {
  const textColor = getColor(color);
  const id = generateId('label');
  const defs = [];
  const elements = [];
  let fontFamily;

  if (font) {
    fontFamily = font;
  } else if (handwriting === true) {
    fontFamily = HANDWRITING_FONT;
  } else if (handwriting === false) {
    fontFamily = CLEAN_FONT;
  } else {
    fontFamily = CLEAN_FONT;
  }

  const lines = text.split('\n');
  const lineHeight = fontSize * 1.3;
  const textWidth = Math.max(0, ...lines.map((line) => getTextContentWidthPx(line, fontSize)));
  const textHeight = lines.length * lineHeight;

  if (shadow && background) {
    defs.push(createDropShadow(`${id}-shadow`, 4, 0.2));
  }

  const filterAttr = shadow && background ? `filter="url(#${id}-shadow)"` : '';

  if (background) {
    const bgColor = getColor(background);
    elements.push(`
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
          font-weight="${fontWeight}" font-family="${fontFamily}">${textElements}</text>
  `);

  return { defs: defs.join('\n'), element: elements.join('\n') };
}

function createHighlight({ x, y, width, height, color = 'yellow', opacity = 0.35, cornerRadius = 0 }) {
  const c = getColor(color);
  return {
    defs: '',
    element: `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" fill="${c}" opacity="${opacity}"/>`
  };
}

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

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function buildSvg(width, height, annotations, options = {}) {
  if (typeof options === 'string') {
    options = { theme: options };
  }

  const { InvalidParameterError } = require('../annotate-errors');
  const { theme = null, defaultSizes = {}, customThemes = null } = options;

  if (!Array.isArray(annotations)) {
    throw new InvalidParameterError('Annotations must be an array', 'annotations');
  }

  const defs = [];
  const elements = [];
  const themeDefaults = customThemes?.[theme] || (theme ? THEMES[theme] : null);

  for (const [index, annotation] of annotations.entries()) {
    let mergedAnn = themeDefaults && themeDefaults[annotation.type]
      ? { ...themeDefaults[annotation.type], ...annotation }
      : annotation;

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
        log('WARN', `Unknown annotation type: ${annotation.type}`);
        continue;
    }

    if (result) {
      if (result.defs) defs.push(result.defs);
      if (result.element) {
        const element = options.outputFormat === 'svg'
          ? `<g data-annotation-index="${index}">${result.element}</g>`
          : result.element;
        elements.push(element);
      }
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

module.exports = {
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
  getLabelTextWidthRatio,
  escapeXml,
  getColor,
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
  createConnector,
  createIcon,
  adjustColor,
  buildSvg
};
