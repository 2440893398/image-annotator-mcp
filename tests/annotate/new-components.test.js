const { buildSvg, setIdGenerator, resetIdGenerator, createMeasure, createLeadout, createBracketLabel, createSpotlight } = require('../../src/annotate/render');

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
  test('renders leadout with target dot and text label', () => {
    const svg = buildSvg(400, 300, [{
      type: 'leadout',
      target: [50, 50],
      anchor: [200, 100],
      text: 'Steel material'
    }]);
    expect(svg).toContain('Steel material');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<line');
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
