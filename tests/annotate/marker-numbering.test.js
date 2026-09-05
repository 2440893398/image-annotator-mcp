const { assignMarkerNumbers, buildSvg, setIdGenerator, resetIdGenerator } = require('../../src/annotate/render');

beforeEach(() => {
  let counter = 0;
  setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
});
afterEach(() => resetIdGenerator());

describe('assignMarkerNumbers', () => {
  test('numbers markers 1..n in array order', () => {
    const out = assignMarkerNumbers([
      { type: 'marker', x: 1, y: 1 },
      { type: 'arrow', from: [0, 0], to: [10, 10] },
      { type: 'marker', x: 2, y: 2 },
      { type: 'number', x: 3, y: 3 }
    ]);
    expect(out.map((a) => a.number)).toEqual([1, undefined, 2, 3]);
  });

  test('explicit numbers set the cursor, like a markdown ordered list', () => {
    const out = assignMarkerNumbers([
      { type: 'marker', x: 1, y: 1 },
      { type: 'marker', x: 2, y: 2 },
      { type: 'marker', x: 3, y: 3, number: 10 },
      { type: 'marker', x: 4, y: 4 }
    ]);
    expect(out.map((a) => a.number)).toEqual([1, 2, 10, 11]);
  });

  test('is idempotent and does not mutate its input', () => {
    const input = [{ type: 'marker', x: 1, y: 1 }];
    const once = assignMarkerNumbers(input);
    expect(input[0].number).toBeUndefined();
    expect(assignMarkerNumbers(once)).toBe(once); // unchanged -> same reference
  });

  test('all-explicit input is returned as-is', () => {
    const input = [{ type: 'marker', x: 1, y: 1, number: 3 }];
    expect(assignMarkerNumbers(input)).toBe(input);
  });
});

describe('marker rendering with auto numbers', () => {
  test('markers without number render digits, not "undefined"', () => {
    const svg = buildSvg(400, 300, [
      { type: 'marker', x: 100, y: 100 },
      { type: 'marker', x: 200, y: 100 }
    ]);
    expect(svg).not.toContain('undefined');
    expect(svg).toContain('>1</text>');
    expect(svg).toContain('>2</text>');
  });
});
