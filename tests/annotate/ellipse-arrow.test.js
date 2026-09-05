const { buildSvg, setIdGenerator, resetIdGenerator } = require('../../src/annotate/render');
const { validateAnnotations } = require('../../src/annotate/runtime');

beforeEach(() => {
  let counter = 0;
  setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
});
afterEach(() => resetIdGenerator());

describe('ellipse annotation', () => {
  test('renders an ellipse from rx/ry around a center', () => {
    const svg = buildSvg(400, 300, [{ type: 'ellipse', x: 200, y: 150, rx: 80, ry: 40 }]);
    expect(svg).toContain('<ellipse cx="200" cy="150" rx="80" ry="40"');
  });

  test('accepts width/height as full box dimensions', () => {
    const svg = buildSvg(400, 300, [{ type: 'ellipse', x: 200, y: 150, width: 160, height: 80 }]);
    expect(svg).toContain('rx="80" ry="40"');
  });

  test('rx/ry win over width/height', () => {
    const svg = buildSvg(400, 300, [{ type: 'ellipse', x: 200, y: 150, rx: 10, ry: 5, width: 160, height: 80 }]);
    expect(svg).toContain('rx="10" ry="5"');
  });

  test('supports dashed style and fill', () => {
    const svg = buildSvg(400, 300, [{ type: 'ellipse', x: 200, y: 150, rx: 50, ry: 30, style: 'dashed', fill: 'yellow', color: 'blue' }]);
    expect(svg).toContain('stroke-dasharray="8,4"');
    expect(svg).toContain('fill="#FDD835"');
    expect(svg).toContain('stroke="#1E88E5"');
  });

  test('sketch mode renders rough paths instead of an <ellipse>', () => {
    const svg = buildSvg(400, 300, [{ type: 'ellipse', x: 200, y: 150, rx: 50, ry: 30, sketch: true, seed: 3 }]);
    expect(svg).not.toContain('<ellipse');
    expect(svg).toContain('<path');
  });

  test('validation requires center plus radii or box', () => {
    expect(() => validateAnnotations([{ type: 'ellipse', x: 10, y: 10 }])).toThrow(/rx\/ry/);
    expect(() => validateAnnotations([{ type: 'ellipse', rx: 10, ry: 10 }])).toThrow(/center/);
    expect(validateAnnotations([{ type: 'ellipse', x: 10, y: 10, rx: 5 }])).toBe(true);
  });
});

describe('arrow heads and elbow routing', () => {
  const base = { type: 'arrow', from: [50, 50], to: [250, 120] };

  test('default arrow has only an end head (regression guard)', () => {
    const svg = buildSvg(400, 300, [base]);
    expect(svg).toContain('marker-end');
    expect(svg).not.toContain('marker-start');
  });

  test('heads: both renders start and end markers', () => {
    const svg = buildSvg(400, 300, [{ ...base, heads: 'both' }]);
    expect(svg).toContain('marker-end');
    expect(svg).toContain('marker-start');
    expect(svg).toContain('-tail"');
  });

  test('heads: none renders a bare shaft', () => {
    const svg = buildSvg(400, 300, [{ ...base, heads: 'none' }]);
    expect(svg).not.toContain('marker-end');
    expect(svg).not.toContain('marker-start');
    expect(svg).toContain('<line');
  });

  test('heads: start only', () => {
    const svg = buildSvg(400, 300, [{ ...base, heads: 'start' }]);
    expect(svg).toContain('marker-start');
    expect(svg).not.toContain('marker-end');
  });

  test('open headStyle with both heads uses polyline markers', () => {
    const svg = buildSvg(400, 300, [{ ...base, heads: 'both', headStyle: 'open' }]);
    expect((svg.match(/<polyline/g) || []).length).toBe(2);
  });

  test('elbow lineStyle renders a multi-segment path', () => {
    const svg = buildSvg(400, 300, [{ ...base, lineStyle: 'elbow' }]);
    expect(svg).not.toContain('<line');
    const d = svg.match(/<path d="(M[^"]+)"/)[1];
    // 45-degree elbow: three points -> two L commands
    expect((d.match(/L/g) || []).length).toBe(2);
    expect(svg).toContain('marker-end');
  });

  test('elbow with vertical dominance routes via the vertical axis', () => {
    const svg = buildSvg(400, 300, [{ type: 'arrow', from: [50, 20], to: [120, 280], lineStyle: 'elbow' }]);
    expect(svg).toContain('<path');
  });

  test('sketch elbow with both heads renders rough paths', () => {
    const svg = buildSvg(400, 300, [{ ...base, lineStyle: 'elbow', heads: 'both', sketch: true, seed: 5 }]);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('marker-end');
  });
});
