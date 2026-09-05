const { buildSvg, setIdGenerator, resetIdGenerator, createMeasure, createLeadout, createBracketLabel, createSpotlight, createMagnifier } = require('../../src/annotate/render');

beforeEach(() => {
  let counter = 0;
  setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
});
afterEach(() => resetIdGenerator());

describe('measure annotation', () => {
  test('renders horizontal measurement with text', () => {
    const svg = buildSvg(400, 300, [{
      type: 'measure',
      from: [50, 100],
      to: [200, 100],
      text: '150px'
    }]);
    expect(svg).toContain('150px');
    expect(svg).toContain('<line');
  });

  test('renders with custom color', () => {
    const svg = buildSvg(400, 300, [{
      type: 'measure',
      from: [50, 100],
      to: [200, 100],
      text: '76CM',
      color: 'orange'
    }]);
    expect(svg).toContain('#FB8C00');
  });

  test('renders diagonal measurement', () => {
    const svg = buildSvg(400, 300, [{
      type: 'measure',
      from: [50, 50],
      to: [200, 200],
      text: '212px'
    }]);
    expect(svg).toContain('212px');
    expect(svg).toContain('rotate(');
  });
});

describe('leadout annotation', () => {
  test('renders leadout with target dot, leader path and label chip', () => {
    const svg = buildSvg(400, 300, [{
      type: 'leadout',
      target: [50, 50],
      anchor: [200, 100],
      text: 'Steel material'
    }]);
    expect(svg).toContain('Steel material');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<path');
    expect(svg).toContain('<rect');
  });

  test('renders with custom color', () => {
    const svg = buildSvg(400, 300, [{
      type: 'leadout',
      target: [50, 50],
      anchor: [200, 100],
      text: 'Test',
      color: 'blue'
    }]);
    expect(svg).toContain('#1E88E5');
  });

  test('routes the leader as a 45° elbow into the chip edge by default', () => {
    // Mostly-horizontal layout: diagonal absorbs the 30px vertical run, then a
    // horizontal segment enters the chip's left edge at its vertical centre.
    const { element } = createLeadout({ target: [50, 50], anchor: [300, 80], text: 'Test' });
    const match = /<path d="M50,50 L(-?[\d.]+),80 L(-?[\d.]+),80"/.exec(element);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(80); // bend at 45°: 30px across for 30px down
  });

  test('lineStyle straight keeps a single segment', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [300, 80], text: 'Test', lineStyle: 'straight' });
    expect(element).toMatch(/<path d="M50,50 L[\d.]+,80"/);
  });

  test('draws a white halo casing under the leader and dot by default', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [200, 100], text: 'Test' });
    expect(element).toContain('rgba(255,255,255,0.9)');
  });

  test('halo false removes the casing', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [200, 100], text: 'Test', halo: false });
    expect(element).not.toContain('rgba(255,255,255,0.9)');
  });

  test('default soft variant renders a light accent tint with dark text', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [200, 100], text: 'Test', color: 'blue' });
    const tint = require('../../src/annotate/render').tintColor('#1E88E5');
    expect(element).toContain(`fill="${tint}" stroke="#1E88E5"`);
    expect(element).toMatch(/<text[^>]*fill="#1F2328"/);
  });

  test('filled variant uses the accent as chip fill with contrast-picked text', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [200, 100], text: 'Test', color: 'blue', variant: 'filled' });
    expect(element).toMatch(/<rect[^>]*fill="#1E88E5"/);
    expect(element).toMatch(/<text[^>]*fill="#FFFFFF"/);
  });

  test('filled variant flips to dark text on light chips', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [200, 100], text: 'Test', color: 'yellow', variant: 'filled' });
    expect(element).toMatch(/<text[^>]*fill="#1F2328"/);
  });

  test('outline variant renders white chip with accent border', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [200, 100], text: 'Test', color: 'blue', variant: 'outline' });
    expect(element).toMatch(/<rect[^>]*fill="#FFFFFF" stroke="#1E88E5"/);
    expect(element).toMatch(/<text[^>]*fill="#1F2328"/);
  });

  test('supports multi-line text', () => {
    const { element } = createLeadout({ target: [50, 50], anchor: [200, 100], text: 'Line one\nLine two' });
    expect(element).toContain('Line one');
    expect(element).toContain('Line two');
    expect((element.match(/<tspan/g) || []).length).toBe(2);
  });
});

describe('bracket-label annotation', () => {
  test('renders bracket with direction right', () => {
    const svg = buildSvg(400, 300, [{
      type: 'bracket-label',
      from: [50, 50],
      to: [50, 200],
      direction: 'right',
      text: 'Group A'
    }]);
    expect(svg).toContain('Group A');
    expect(svg).toContain('<path');
  });

  test('renders bracket with direction bottom', () => {
    const svg = buildSvg(400, 300, [{
      type: 'bracket-label',
      from: [50, 50],
      to: [200, 50],
      direction: 'bottom',
      text: 'Width'
    }]);
    expect(svg).toContain('Width');
  });

  test('supports bracketLabel alias', () => {
    const svg = buildSvg(400, 300, [{
      type: 'bracketLabel',
      from: [50, 50],
      to: [50, 200],
      direction: 'left',
      text: 'Alias'
    }]);
    expect(svg).toContain('Alias');
  });
});

describe('spotlight annotation', () => {
  test('renders circular spotlight with mask', () => {
    const svg = buildSvg(400, 300, [{
      type: 'spotlight',
      x: 200,
      y: 150,
      radius: 50
    }]);
    expect(svg).toContain('<mask');
    expect(svg).toContain('rgba(0,0,0,');
    expect(svg).toContain('<circle');
  });

  test('renders rectangular spotlight', () => {
    const svg = buildSvg(400, 300, [{
      type: 'spotlight',
      x: 200,
      y: 150,
      width: 100,
      height: 80
    }]);
    expect(svg).toContain('<mask');
    expect(svg).toContain('<rect');
  });

  test('renders with custom color', () => {
    const svg = buildSvg(400, 300, [{
      type: 'spotlight',
      x: 200,
      y: 150,
      radius: 50,
      color: 'green'
    }]);
    expect(svg).toContain('#43A047');
  });
});

describe('magnifier annotation', () => {
  test('renders magnifier frame with crosshair and circle', () => {
    const svg = buildSvg(400, 300, [{
      type: 'magnifier',
      target: [100, 100],
      anchor: [300, 80],
      radius: 50,
      zoom: 3
    }]);
    expect(svg).toContain('<circle');
    expect(svg).toContain('<line');
    expect(svg).toContain('marker-end');
  });

  test('renders with custom border color', () => {
    const svg = buildSvg(400, 300, [{
      type: 'magnifier',
      target: [100, 100],
      anchor: [300, 80],
      borderColor: 'orange'
    }]);
    expect(svg).toContain('#FB8C00');
  });
});

describe('validation', () => {
  const { validateAnnotation } = require('../../src/annotate/runtime');

  test('measure requires from and to', () => {
    expect(() => validateAnnotation({ type: 'measure' })).toThrow();
    expect(() => validateAnnotation({ type: 'measure', from: [0, 0], to: [1, 1] })).not.toThrow();
  });

  test('leadout requires target and anchor', () => {
    expect(() => validateAnnotation({ type: 'leadout' })).toThrow();
    expect(() => validateAnnotation({ type: 'leadout', target: [0, 0], anchor: [1, 1] })).not.toThrow();
  });

  test('magnifier requires target and anchor', () => {
    expect(() => validateAnnotation({ type: 'magnifier' })).toThrow();
    expect(() => validateAnnotation({ type: 'magnifier', target: [0, 0], anchor: [1, 1] })).not.toThrow();
  });

  test('spotlight requires x and y', () => {
    expect(() => validateAnnotation({ type: 'spotlight' })).toThrow();
    expect(() => validateAnnotation({ type: 'spotlight', x: 100, y: 100 })).not.toThrow();
  });

  test('bracket-label requires from and to', () => {
    expect(() => validateAnnotation({ type: 'bracket-label' })).toThrow();
    expect(() => validateAnnotation({ type: 'bracket-label', from: [0, 0], to: [1, 1] })).not.toThrow();
  });
});
