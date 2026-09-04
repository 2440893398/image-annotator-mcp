#!/usr/bin/env node
/**
 * Regenerates the redaction example images from examples/original.png.
 *
 *   node examples/generate-redaction-example.js
 *
 * Produces:
 *   examples/redaction.png              - practical usage on a real screenshot
 *   examples/redaction-modes.png        - why only mode "solid" is redaction
 *   examples/redaction-styles.png       - solid looks, all equally irreversible
 *   examples/preview/redact-<mode>.png  - cards for the component gallery
 */

const path = require('path');
const sharp = require('sharp');
const { annotateImage } = require('../src/annotate');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'examples', 'original.png');
const OUT_MAIN = path.join(ROOT, 'examples', 'redaction.png');
const OUT_MODES = path.join(ROOT, 'examples', 'redaction-modes.png');

// Regions of examples/original.png holding the account name.
const ADMIN_BAR_USER = { x: 3070, y: 8, width: 285, height: 46 };
const NAV_USER = { x: 2590, y: 96, width: 270, height: 74 };

async function buildMainExample() {
  await annotateImage(SOURCE, OUT_MAIN, [
    // The screenshot's account name, covered irreversibly.
    { type: 'redact', ...ADMIN_BAR_USER, label: 'REDACTED' },
    { type: 'redact', ...NAV_USER },

    // A magnifier aimed straight at a redacted region. It samples the redacted
    // image, not the original, so it shows fill colour instead of the name.
    {
      type: 'magnifier',
      target: [2725, 133],
      anchor: [2200, 480],
      radius: 130,
      zoom: 4,
      borderColor: 'primary'
    },
    {
      type: 'callout',
      x: 2200, y: 640,
      text: 'Magnifier samples the redacted\npixels - no bypass',
      pointer: 'top',
      fontSize: 30,
      color: 'primary'
    },

    {
      type: 'label',
      x: 2330, y: 262,
      text: 'redact (solid): irreversible',
      fontSize: 32,
      color: 'darkGray',
      background: 'white'
    }
  ], {});
  console.log('wrote', path.relative(ROOT, OUT_MAIN));
}

async function buildModesExample() {
  // One text-bearing strip, repeated once per mode.
  const STRIP = { left: 600, top: 1090, width: 2000, height: 150 };
  const strip = await sharp(SOURCE).extract(STRIP).toBuffer();
  const rows = 3;

  const stacked = path.join(ROOT, 'examples', '.redaction-modes-source.png');
  await sharp({
    create: {
      width: STRIP.width,
      height: STRIP.height * rows,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite(Array.from({ length: rows }, (_, i) => ({ input: strip, top: i * STRIP.height, left: 0 })))
    .png()
    .toFile(stacked);

  const modes = [
    { mode: 'solid', caption: '1. solid (default)', verdict: 'irreversible', color: 'success' },
    { mode: 'pixelate', caption: '2. pixelate', verdict: 'REVERSIBLE', color: 'error' },
    { mode: 'blur', caption: '3. blur', verdict: 'REVERSIBLE', color: 'error' }
  ];

  const annotations = [
    // Negative x lands in the left canvas padding once the offset is applied.
    { type: 'label', x: -460, y: -34, text: 'Same line, three redact modes', fontSize: 40, color: 'darkGray', background: 'white' }
  ];

  modes.forEach(({ mode, caption, verdict, color }, i) => {
    const rowTop = i * STRIP.height;
    annotations.push({
      type: 'redact',
      mode,
      x: 14,
      y: rowTop + 88,
      width: 1560,
      height: 50,
      ...(mode === 'solid' ? { label: 'REDACTED' } : {}),
      ...(mode === 'pixelate' ? { blockSize: 12 } : {}),
      ...(mode === 'blur' ? { intensity: 12 } : {})
    });
    annotations.push({
      type: 'label',
      x: -460, y: rowTop + 60,
      text: caption,
      fontSize: 32, color: 'darkGray', background: 'white'
    });
    annotations.push({
      type: 'label',
      x: -460, y: rowTop + 110,
      text: verdict,
      fontSize: 30, color, background: 'white'
    });
  });

  const result = await annotateImage(stacked, OUT_MODES, annotations, {
    canvasPadding: { top: 80, right: 20, bottom: 20, left: 480 }
  });

  require('fs').rmSync(stacked, { force: true });
  console.log('wrote', path.relative(ROOT, OUT_MODES));
  for (const warning of result.warnings.filter((w) => w.type === 'redaction')) {
    console.log('  runtime warning:', warning.message);
  }
}



/**
 * Four solid looks over the same content. They differ only in fill colour, so
 * every one of them is equally irreversible - the point is that "redacted" does
 * not have to mean a harsh black censor bar.
 */
async function buildStylesExample() {
  const STRIP = { left: 600, top: 1090, width: 2000, height: 150 };
  const strip = await sharp(SOURCE).extract(STRIP).toBuffer();
  const styles = [
    { color: undefined, label: 'REDACTED', caption: 'A. #64748B', note: 'default' },
    { color: '#475569', label: 'REDACTED', caption: 'B. #475569', note: 'deeper' },
    { color: '#4A6785', label: 'REDACTED', caption: 'C. #4A6785', note: 'blue tint' },
    { color: 'black', label: 'REDACTED', caption: 'D. #212121', note: 'harshest' }
  ];

  const stacked = path.join(ROOT, 'examples', '.redaction-styles-source.png');
  await sharp({
    create: { width: STRIP.width, height: STRIP.height * styles.length, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .composite(styles.map((_, i) => ({ input: strip, top: i * STRIP.height, left: 0 })))
    .png()
    .toFile(stacked);

  const annotations = [
    { type: 'label', x: -460, y: -34, text: 'Solid looks - all equally irreversible', fontSize: 38, color: 'darkGray', background: 'white' }
  ];
  styles.forEach(({ color, label, caption, note }, i) => {
    const top = i * STRIP.height;
    annotations.push({ type: 'redact', x: 14, y: top + 88, width: 1560, height: 50, label, ...(color ? { color } : {}) });
    annotations.push({ type: 'label', x: -460, y: top + 60, text: caption, fontSize: 30, color: 'darkGray', background: 'white' });
    annotations.push({ type: 'label', x: -460, y: top + 108, text: note, fontSize: 28, color: 'gray', background: 'white' });
  });

  const out = path.join(ROOT, 'examples', 'redaction-styles.png');
  await annotateImage(stacked, out, annotations, {
    canvasPadding: { top: 80, right: 20, bottom: 20, left: 480 }
  });
  require('fs').rmSync(stacked, { force: true });
  console.log('wrote', path.relative(ROOT, out));
}

/**
 * Cards for examples/preview/index.html.
 *
 * That gallery renders annotations as SVG in the browser, which is exactly what
 * the real pipeline does for solid - but pixelate and blur are pixel operations
 * on the base image, so the SVG layer draws nothing for them and the preview
 * falls back to a placeholder. These cards run the real pipeline instead, so the
 * gallery can show what the modes actually look like.
 */
async function buildGalleryCards() {
  const W = 440;
  const H = 280;
  const panel = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
    <text x="40" y="86" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="#334155">user  alice@example.com</text>
    <text x="40" y="150" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="#334155">token sk-live-9f2a7c31b4</text>
    <text x="40" y="214" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="#334155">pin   4821</text>
  </svg>`);

  const base = path.join(__dirname, 'preview', '.redact-card-source.png');
  await sharp(panel).png().toFile(base);

  // Same region on every card: the token line.
  const REGION = { x: 36, y: 126, width: 340, height: 34 };
  const cards = [
    { mode: 'solid', extra: { label: 'REDACTED' } },
    { mode: 'pixelate', extra: { blockSize: 8 } },
    { mode: 'blur', extra: { intensity: 8 } }
  ];

  for (const { mode, extra } of cards) {
    const out = path.join(__dirname, 'preview', `redact-${mode}.png`);
    await annotateImage(base, out, [{ type: 'redact', mode, ...REGION, ...extra }], {});
    console.log('wrote', path.relative(ROOT, out));
  }

  require('fs').rmSync(base, { force: true });
}

(async () => {
  await buildMainExample();
  await buildModesExample();
  await buildStylesExample();
  await buildGalleryCards();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
