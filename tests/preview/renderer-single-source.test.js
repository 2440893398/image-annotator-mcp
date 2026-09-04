const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// src/annotate/render.js used to be duplicated by hand into
// src/preview/renderer.js and again inline into examples/preview/index.html.
// Every drift bug this project has had in the preview came from that.
describe('renderer single source of truth', () => {
  const CREATE_FUNCTIONS = [
    'createMarker', 'createArrow', 'createCurvedArrow', 'createCallout',
    'createRect', 'createCircle', 'createLabel', 'createHighlight',
    'createBlur', 'createRedact', 'createConnector', 'createIcon', 'createMeasure',
    'createLeadout', 'createBracketLabel', 'createSpotlight', 'createMagnifier'
  ];

  it('defines every drawing primitive exactly once, in src/annotate/render.js', () => {
    const sources = {
      'src/annotate/render.js': read('src', 'annotate', 'render.js'),
      'src/preview/renderer.js': read('src', 'preview', 'renderer.js'),
      'examples/preview/index.html': read('examples', 'preview', 'index.html')
    };

    for (const fn of CREATE_FUNCTIONS) {
      const definedIn = Object.entries(sources)
        .filter(([, source]) => source.includes('function ' + fn + '('))
        .map(([name]) => name);
      expect(definedIn).toEqual(['src/annotate/render.js']);
    }
  });

  it('exposes the same primitives through the preview adapter', () => {
    const preview = require('../../src/preview/renderer');
    const annotate = require('../../src/annotate/render');
    for (const fn of CREATE_FUNCTIONS) {
      expect(preview[fn]).toBe(annotate[fn]);
    }
  });

  it('keeps src/annotate/render.js loadable in a browser', () => {
    const source = read('src', 'annotate', 'render.js');
    // Bare top-level require/process would throw the moment a <script> tag runs it.
    const unguarded = source
      .split('\n')
      .filter((line) => /^(const|let|var) +[A-Za-z_$][\w$]* *= *require\(/.test(line.trim()));
    expect(unguarded).toEqual([]);
    expect(source).toContain('globalThis.ImageAnnotatorRender');
  });

  it('has the browser pages load the shared sources instead of inlining them', () => {
    expect(read('config-ui', 'public', 'index.html')).toContain('/annotate/render.js');
    const examples = read('examples', 'preview', 'index.html');
    expect(examples).toContain('src/annotate/render.js');
    expect(examples).toContain('src/preview/renderer.js');
  });

  // pixelate/blur redaction is a pixel operation in the real pipeline, so the
  // export SVG layer must stay empty for it — but the preview has no pixel
  // pipeline and must show an explicit placeholder instead of nothing.
  it('renders de-emphasis placeholders only in the preview adapter', () => {
    const preview = require('../../src/preview/renderer');
    const annotate = require('../../src/annotate/render');
    const annotations = [{ type: 'redact', x: 10, y: 10, width: 80, height: 30, mode: 'pixelate' }];

    const previewSvg = preview.buildSvg(200, 100, annotations);
    expect(previewSvg).toContain('hatch');
    expect(previewSvg).toContain('pixelate');

    const exportSvg = annotate.buildSvg(200, 100, annotations);
    expect(exportSvg).not.toContain('hatch');
    expect(exportSvg).not.toContain('<rect');
  });

  it('renders solid redact identically with and without the preview flag', () => {
    const preview = require('../../src/preview/renderer');
    const annotate = require('../../src/annotate/render');
    const annotations = [{ type: 'redact', x: 10, y: 10, width: 80, height: 30 }];

    const solidRect = '<rect x="10" y="10" width="80" height="30" fill="#64748B" shape-rendering="crispEdges"/>';
    expect(preview.buildSvg(200, 100, annotations)).toContain(solidRect);
    expect(annotate.buildSvg(200, 100, annotations)).toContain(solidRect);
  });
});
