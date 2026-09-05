const {
  buildSvg,
  setIdGenerator,
  resetIdGenerator,
  getRoughGenerator,
  createRect,
  createArrow,
  createConnector,
  createLabel,
  createLeadout,
  createCallout,
  createRedact,
  THEMES
} = require('../../src/annotate/render');

beforeEach(() => {
  let counter = 0;
  setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
});
afterEach(() => resetIdGenerator());

describe('sketch rendering (rough.js)', () => {
  test('vendored rough.js loads under Node', () => {
    expect(getRoughGenerator()).not.toBeNull();
  });

  test('sketch rect renders rough paths instead of a rect element', () => {
    const { element } = createRect({ x: 10, y: 10, width: 100, height: 60, sketch: true, seed: 3 });
    expect(element).toContain('<path');
    expect(element).not.toContain('<rect');
  });

  test('same seed produces identical strokes, different seeds differ', () => {
    const a = createRect({ x: 10, y: 10, width: 100, height: 60, sketch: true, seed: 3 }).element;
    const b = createRect({ x: 10, y: 10, width: 100, height: 60, sketch: true, seed: 3 }).element;
    const c = createRect({ x: 10, y: 10, width: 100, height: 60, sketch: true, seed: 4 }).element;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('two full builds of the same sketch annotations are byte-identical', () => {
    const annotations = [
      { type: 'rect', x: 5, y: 5, width: 50, height: 40 },
      { type: 'arrow', from: [10, 90], to: [80, 60] },
      { type: 'leadout', target: [20, 20], anchor: [150, 50], text: 'hi' }
    ];
    const first = buildSvg(200, 100, annotations, { sketch: true });
    resetIdGenerator();
    let counter = 0;
    setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
    const second = buildSvg(200, 100, annotations, { sketch: true });
    expect(first).toBe(second);
  });

  test('options.sketch applies to all annotations; sketch:false opts out', () => {
    const svg = buildSvg(300, 200, [
      { type: 'rect', x: 5, y: 5, width: 50, height: 40 },
      { type: 'rect', x: 100, y: 5, width: 50, height: 40, sketch: false }
    ], { sketch: true });
    expect(svg).toContain('<path');
    expect(svg).toContain('<rect');
  });

  test('the sketch theme implies sketch rendering', () => {
    const svg = buildSvg(300, 200, [
      { type: 'rect', x: 5, y: 5, width: 50, height: 40 }
    ], { theme: 'sketch' });
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<rect x="5"');
  });

  test('THEMES exposes the sketch theme', () => {
    expect(THEMES.sketch).toBeDefined();
  });

  test('redact ignores sketch and stays a crisp pixel-aligned rect', () => {
    const clean = createRedact({ type: 'redact', x: 10, y: 10, width: 80, height: 30 });
    const sketchy = createRedact({ type: 'redact', x: 10, y: 10, width: 80, height: 30, sketch: true, seed: 5 });
    expect(sketchy.element).toBe(clean.element);
    expect(sketchy.element).toContain('crispEdges');

    const svg = buildSvg(200, 100, [
      { type: 'redact', x: 10, y: 10, width: 80, height: 30 }
    ], { sketch: true });
    expect(svg).toContain('crispEdges');
  });

  test('sketch arrow inlines a two-stroke head instead of a marker', () => {
    const { defs, element } = createArrow({ from: [0, 0], to: [100, 50], sketch: true, seed: 2 });
    expect(defs).toBe('');
    expect(element).not.toContain('<marker');
    expect((element.match(/<path/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  test('dashed connector keeps its dash pattern in sketch mode', () => {
    const { element } = createConnector({ from: [0, 0], to: [100, 0], sketch: true, seed: 2 });
    expect(element).toContain('stroke-dasharray="8,8"');
  });

  test('sketch label falls back to the handwriting font stack', () => {
    const { element } = createLabel({ x: 20, y: 20, text: 'hey', sketch: true, seed: 2 });
    expect(element).toContain('Comic Sans MS');
  });

  test('explicit font wins over the sketch handwriting default', () => {
    const { element } = createLabel({ x: 20, y: 20, text: 'hey', sketch: true, seed: 2, font: 'Inter' });
    expect(element).toContain('font-family="Inter"');
    expect(element).not.toContain('Comic Sans MS');
  });

  test('sketch leadout keeps the white halo casing on the wobbled strokes', () => {
    const { element } = createLeadout({ target: [10, 10], anchor: [150, 40], text: 'hi', sketch: true, seed: 2 });
    expect(element).toContain('rgba(255,255,255,0.9)');
    expect(element).toContain('<path');
    expect(element).toContain('hi');
  });

  test('sketch callout renders wobbly bubble with pointer strokes', () => {
    const { defs, element } = createCallout({ x: 100, y: 100, text: 'note', pointer: 'bottom', sketch: true, seed: 2 });
    expect(defs).toBe('');
    expect(element).toContain('<path');
    expect(element).toContain('note');
  });

  test('roughness and seed strings are coerced like other numeric fields', () => {
    const svg = buildSvg(200, 100, [
      { type: 'rect', x: 5, y: 5, width: 50, height: 40, sketch: true, roughness: '2', seed: '9' }
    ]);
    expect(svg).toContain('<path');
  });
});
