const { buildSvg, setIdGenerator, resetIdGenerator } = require('../../src/annotate/render');
const { validateAnnotations, scaleAnnotationCoords, offsetAnnotationCoords, getBoundingBox } = require('../../src/annotate/runtime');

beforeEach(() => {
  let counter = 0;
  setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
});
afterEach(() => resetIdGenerator());

describe('polyline / polygon / freehand', () => {
  const pts = [[10, 10], [100, 40], [60, 120]];

  test('polyline renders an open shape', () => {
    const svg = buildSvg(400, 300, [{ type: 'polyline', points: pts, color: 'blue' }]);
    expect(svg).toContain('<polyline points="10,10 100,40 60,120"');
    expect(svg).toContain('stroke="#1E88E5"');
  });

  test('polygon renders closed with optional fill', () => {
    const svg = buildSvg(400, 300, [{ type: 'polygon', points: pts, fill: 'yellow' }]);
    expect(svg).toContain('<polygon points="10,10 100,40 60,120"');
    expect(svg).toContain('fill="#FDD835"');
  });

  test('freehand renders a rounded stroke, sketch mode uses rough curve', () => {
    const clean = buildSvg(400, 300, [{ type: 'freehand', points: pts }]);
    expect(clean).toContain('<polyline');
    expect(clean).toContain('stroke-linejoin="round"');
    const sketch = buildSvg(400, 300, [{ type: 'freehand', points: pts, sketch: true, seed: 2 }]);
    expect(sketch).not.toContain('<polyline');
    expect(sketch).toContain('<path');
  });

  test('sketch polygon uses rough paths', () => {
    const svg = buildSvg(400, 300, [{ type: 'polygon', points: pts, sketch: true, seed: 4, fill: 'red' }]);
    expect(svg).not.toContain('<polygon');
    expect(svg).toContain('<path');
  });

  test('validation enforces the minimum point counts', () => {
    expect(() => validateAnnotations([{ type: 'polyline', points: [[1, 1]] }])).toThrow(/at least 2/);
    expect(() => validateAnnotations([{ type: 'polygon', points: [[1, 1], [2, 2]] }])).toThrow(/at least 3/);
    expect(validateAnnotations([{ type: 'freehand', points: [[1, 1], [2, 2]] }])).toBe(true);
  });

  test('points participate in DPR scaling, offsets, and bounding boxes', () => {
    const scaled = scaleAnnotationCoords({ type: 'polyline', points: [[10, 20], [30, 40]] }, 2);
    expect(scaled.points).toEqual([[20, 40], [60, 80]]);
    const shifted = offsetAnnotationCoords({ type: 'polyline', points: [[10, 20], [30, 40]] }, 5, 7);
    expect(shifted.points).toEqual([[15, 27], [35, 47]]);
    const box = getBoundingBox({ type: 'polygon', points: [[10, 10], [100, 40], [60, 120]], strokeWidth: 2 }, 'm');
    expect(box.x).toBeCloseTo(8);
    expect(box.y).toBeCloseTo(8);
    expect(box.w).toBeCloseTo(94);
    expect(box.h).toBeCloseTo(114);
  });
});

describe('icon set expansion', () => {
  test.each(['lock', 'star', 'cursor', 'thumbs-up', 'thumbs-down', 'plus', 'minus', 'eye'])('renders built-in icon %s', (name) => {
    const svg = buildSvg(200, 200, [{ type: 'icon', icon: name, x: 100, y: 100 }]);
    expect(svg).toContain('<circle cx="100" cy="100"'); // badge circle
    expect(svg.replace(/<circle cx="100" cy="100" r="28" fill="[^"]*"\/>/, '')).toMatch(/<(path|polygon|line|circle|rect|g)/);
  });

  test('thumbs-down is the rotated thumbs-up glyph', () => {
    const svg = buildSvg(200, 200, [{ type: 'icon', icon: 'thumbs-down', x: 100, y: 100 }]);
    expect(svg).toContain('rotate(180 100 100)');
  });

  test('emoji renders as text without a badge by default', () => {
    const svg = buildSvg(200, 200, [{ type: 'icon', icon: '🎯', x: 100, y: 100 }]);
    expect(svg).toContain('🎯');
    expect(svg).not.toContain('<circle');
  });

  test('emoji with badge: true gets the colored circle back', () => {
    const svg = buildSvg(200, 200, [{ type: 'icon', icon: '🔥', x: 100, y: 100, badge: true, color: 'red' }]);
    expect(svg).toContain('🔥');
    expect(svg).toContain('<circle cx="100" cy="100"');
  });
});

describe('curly bracket-label', () => {
  test.each(['left', 'right', 'top', 'bottom'])('renders a curly brace facing %s', (direction) => {
    const svg = buildSvg(400, 400, [{
      type: 'bracket-label',
      from: direction === 'top' || direction === 'bottom' ? [50, 200] : [200, 50],
      to: direction === 'top' || direction === 'bottom' ? [350, 200] : [200, 350],
      direction,
      bracketStyle: 'curly',
      text: 'Group'
    }]);
    // curly brace path = quadratics with a straight spine
    expect(svg).toMatch(/<path d="M[^"]*Q[^"]*L[^"]*Q[^"]*Q[^"]*L[^"]*Q[^"]*"/);
    expect(svg).toContain('Group');
  });

  test('square remains the default', () => {
    const svg = buildSvg(400, 400, [{ type: 'bracket-label', from: [200, 50], to: [200, 350], text: 'G' }]);
    expect(svg).not.toMatch(/d="M[^"]*Q/);
  });

  test('sketch curly renders rough paths', () => {
    const svg = buildSvg(400, 400, [{ type: 'bracket-label', from: [200, 50], to: [200, 350], bracketStyle: 'curly', text: 'G', sketch: true, seed: 3 }]);
    expect(svg).toContain('<path');
    expect(svg).toContain('G</text>');
  });
});

describe('halo casing', () => {
  const WHITE = 'rgba(255,255,255,0.9)';

  test('arrow halo draws a white casing under the shaft only', () => {
    const on = buildSvg(400, 300, [{ type: 'arrow', from: [10, 10], to: [200, 100], halo: true }]);
    const off = buildSvg(400, 300, [{ type: 'arrow', from: [10, 10], to: [200, 100] }]);
    expect(on).toContain(WHITE);
    expect(off).not.toContain(WHITE);
  });

  test('elbow arrow halo cases the full path', () => {
    const svg = buildSvg(400, 300, [{ type: 'arrow', from: [10, 10], to: [300, 120], lineStyle: 'elbow', halo: true }]);
    expect(svg.match(new RegExp(WHITE.replace(/[()]/g, '\\$&'), 'g')).length).toBe(1);
    expect(svg).toMatch(/<path d="M10,10[^"]*" fill="none" stroke="rgba\(255,255,255,0.9\)"/);
  });

  test('curved-arrow and connector support halo', () => {
    const curved = buildSvg(400, 300, [{ type: 'curved-arrow', from: [10, 10], to: [200, 100], halo: true }]);
    const connector = buildSvg(400, 300, [{ type: 'connector', from: [10, 10], to: [200, 100], halo: true }]);
    expect(curved).toContain(WHITE);
    expect(connector).toContain(WHITE);
  });

  test('marker halo draws an outer white ring', () => {
    const svg = buildSvg(400, 300, [{ type: 'marker', x: 100, y: 100, number: 1, size: 20, halo: true }]);
    expect(svg).toContain(`r="23" fill="${WHITE}"`);
  });

  test('background-less label halo underlays a white-stroked copy', () => {
    const svg = buildSvg(400, 300, [{ type: 'label', x: 50, y: 50, text: 'note', background: null, halo: true }]);
    expect(svg).toContain(`stroke="${WHITE}"`);
    // with a background box, halo is a no-op
    const boxed = buildSvg(400, 300, [{ type: 'label', x: 50, y: 50, text: 'note', halo: true }]);
    expect(boxed).not.toContain(`stroke="${WHITE}"`);
  });
});
