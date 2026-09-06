/**
 * Cover for the marker redesign: numbering a dense page used to bury it.
 *
 * Three things changed together and each is load-bearing, so they are tested
 * together here: the disc shrank and lost its chrome (a 1280px screenshot used
 * to get 80px circles), it can attach beside its target instead of on top of
 * it, and a run of markers can be resolved and de-emphasised as a sequence.
 */
const {
  buildSvg,
  SIZE_PRESETS,
  resolveMarkerPlacement,
  setIdGenerator,
  resetIdGenerator
} = require('../../src/annotate/render');
const {
  getBoundingBox,
  resolveCollisions,
  detectCollisions,
  scaleAnnotationCoords,
  offsetAnnotationCoords,
  remapAnnotation,
  validateAnnotation,
  getAnnotationAriaLabel,
  generateAltText
} = require('../../src/annotate/runtime');

beforeEach(() => {
  let counter = 0;
  setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
});
afterEach(() => resetIdGenerator());

const circles = (svg) => [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.]+)"/g)]
  .map((m) => ({ cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) }));

describe('tier 1: the disc shrank and lost its chrome', () => {
  test('every preset draws a 20-40px disc, not a 40-96px one', () => {
    const diameters = Object.values(SIZE_PRESETS).map((preset) => preset.markerSize * 2);
    expect(Math.min(...diameters)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...diameters)).toBeLessThanOrEqual(40);
  });

  test('a filled marker is a flat disc: no gradient, no inner ring, no shadow', () => {
    const svg = buildSvg(200, 200, [{ type: 'marker', x: 100, y: 100 }]);
    expect(svg).not.toContain('linearGradient');
    expect(svg).not.toContain('stroke="rgba(255,255,255,0.3)"');
    expect(svg).not.toContain('<filter');
    expect(svg).toContain('r="14" fill="#E53935"');
  });

  test('shadow is opt-in rather than always on', () => {
    expect(buildSvg(200, 200, [{ type: 'marker', x: 100, y: 100, shadow: true }]))
      .toContain('<filter id="marker-test-0-shadow"');
  });

  test('the casing ring sits outside the disc and scales with it', () => {
    const [casing, disc] = circles(buildSvg(200, 200, [{ type: 'marker', x: 100, y: 100, size: 20 }]));
    expect(disc.r).toBe(20);
    expect(casing.r).toBeCloseTo(20 + 20 * 0.18);
    // Casing first, so the disc paints over it rather than under.
    expect(casing.r).toBeGreaterThan(disc.r);
  });

  test('a two-digit numeral shrinks so it stays inside the disc', () => {
    const one = buildSvg(200, 200, [{ type: 'marker', x: 100, y: 100, number: 1, size: 20 }]);
    const twelve = buildSvg(200, 200, [{ type: 'marker', x: 100, y: 100, number: 12, size: 20 }]);
    const fontSize = (svg) => Number(svg.match(/font-size="([\d.]+)"/)[1]);
    expect(fontSize(one)).toBeCloseTo(22);
    expect(fontSize(twelve)).toBeCloseTo(19);
    expect(fontSize(twelve)).toBeLessThan(fontSize(one));
  });

  test('themes pick colours and leave the size to the preset', () => {
    // The themes used to pin size: 32/36, which beat the size preset outright
    // and put a 64px circle on every themed screenshot.
    const svg = buildSvg(200, 200, [{ type: 'marker', x: 100, y: 100 }],
      { theme: 'documentation', defaultSizes: SIZE_PRESETS.xs });
    expect(circles(svg).some((c) => c.r === SIZE_PRESETS.xs.markerSize)).toBe(true);
  });
});

describe('tier 2: attaching a marker beside its target', () => {
  const target = [200, 100, 80, 24];

  test('a target with no attach still centres, the way markers always did', () => {
    const placement = resolveMarkerPlacement({ target, attach: 'none' }, 14);
    expect(placement).toMatchObject({ x: 240, y: 112, side: null, leader: null });
  });

  test('each side puts the marker clear of the box', () => {
    const at = (attach) => resolveMarkerPlacement({ target, attach }, 14);
    expect(at('left')).toMatchObject({ x: 200 - 20, y: 112 });
    expect(at('right')).toMatchObject({ x: 280 + 20, y: 112 });
    expect(at('top')).toMatchObject({ x: 240, y: 100 - 20 });
    expect(at('bottom')).toMatchObject({ x: 240, y: 124 + 20 });
  });

  test('auto prefers a left rail and flips right only near the left edge', () => {
    expect(resolveMarkerPlacement({ target, attach: 'auto' }, 14).side).toBe('left');
    expect(resolveMarkerPlacement({ target: [8, 100, 80, 24], attach: 'auto' }, 14).side).toBe('right');
  });

  test('passing a target turns attachment on without asking for it', () => {
    expect(resolveMarkerPlacement({ target }, 14).side).toBe('left');
  });

  test('the leader runs from the marker back to the target edge, cased in white', () => {
    const svg = buildSvg(400, 300, [{ type: 'marker', target, attach: 'left', color: 'blue' }]);
    expect(svg).toContain('<line x1="180" y1="112" x2="198" y2="112" stroke="rgba(255,255,255,0.9)"');
    expect(svg).toContain('<line x1="180" y1="112" x2="198" y2="112" stroke="#1E88E5"');
    expect(buildSvg(400, 300, [{ type: 'marker', target, attach: 'left', leader: false }]))
      .not.toContain('<line');
  });

  test('a marker needs either a point or a target, and attach needs the target', () => {
    expect(() => validateAnnotation({ type: 'marker' })).toThrow(/x and y coordinates, or a target/);
    expect(() => validateAnnotation({ type: 'marker', target })).not.toThrow();
    expect(() => validateAnnotation({ type: 'marker', x: 1, y: 2 })).not.toThrow();
    expect(() => validateAnnotation({ type: 'marker', target, attach: 'sideways' })).toThrow(/attach must be one of/);
    expect(() => validateAnnotation({ type: 'marker', x: 1, y: 2, attach: 'left' })).toThrow(/needs a target/);
  });

  test('the target box survives DPR scaling and reannotate remapping', () => {
    // The box carries a size as well as a position, so all four numbers move.
    expect(scaleAnnotationCoords({ type: 'marker', target }, 2).target).toEqual([400, 200, 160, 48]);
    expect(remapAnnotation({ type: 'marker', target }, 0.5, 2).target).toEqual([100, 200, 40, 48]);
  });

  test('the target box survives canvas padding and cropping', () => {
    // Shifting used to rebuild target as a bare [x, y] pair, which collapsed
    // the box to a point and quietly un-attached every marker on any padded or
    // cropped image.
    expect(offsetAnnotationCoords({ type: 'marker', target }, 10, 44).target)
      .toEqual([210, 144, 80, 24]);
  });

  test('an attached marker is still located in the alt text and aria label', () => {
    // It has no x/y of its own, and "with no position" would throw away the
    // only thing a screen reader could say about where it points.
    expect(getAnnotationAriaLabel({ type: 'marker', target, number: 1 }, 0))
      .toBe('Marker 1 on the element at 200,100');
    expect(generateAltText([{ type: 'marker', target, number: 1 }], 400, 300))
      .toContain('marker #1 on the element at (200,100)');
  });

  test('the bounding box follows where the marker was drawn, not where it was asked for', () => {
    const box = getBoundingBox({ type: 'marker', target, attach: 'left', size: 14 }, 'm');
    const casing = 14 * 0.18;
    expect(box.x).toBeCloseTo(180 - 14 - casing);
    expect(box.y).toBeCloseTo(112 - 14 - casing);
  });
});

describe('tier 3: a run of markers reads as a sequence', () => {
  test('auto-layout moves an overlapping marker instead of skipping it', () => {
    // Two markers on the same spot: before, resolveCollisions ignored markers
    // entirely and left them stacked.
    const annotations = [
      { type: 'marker', x: 100, y: 100, number: 1, size: 14 },
      { type: 'marker', x: 100, y: 100, number: 2, size: 14 }
    ];
    expect(detectCollisions(annotations, 'm')).toHaveLength(1);

    const { annotations: resolved, warnings } = resolveCollisions(annotations, 'm', 400, 400);
    expect(detectCollisions(resolved, 'm')).toHaveLength(0);
    expect(warnings.some((w) => w.type === 'auto-layout')).toBe(true);
  });

  test('an attached marker is moved to another side of its own target', () => {
    const annotations = [
      { type: 'marker', target: [200, 100, 80, 24], attach: 'left', number: 1, size: 14 },
      { type: 'marker', x: 180, y: 112, number: 2, size: 14 }
    ];
    const { annotations: resolved } = resolveCollisions(annotations, 'm', 400, 400);
    expect(['right', 'top', 'bottom']).toContain(resolved[0].attach);
  });

  test('active greys out every step but the current one', () => {
    const markers = [1, 2, 3].map((number) => ({ type: 'marker', x: number * 50, y: 50, number, color: 'red' }));
    const svg = buildSvg(300, 100, markers, { active: 2 });
    expect(svg.match(/fill="#475569"/g)).toHaveLength(2);
    expect(svg.match(/fill="#E53935"/g)).toHaveLength(1);
    // Without it, all three keep their colour.
    expect(buildSvg(300, 100, markers).match(/fill="#E53935"/g)).toHaveLength(3);
  });

  test('active follows auto-assigned numbers, not array order', () => {
    const svg = buildSvg(300, 100, [
      { type: 'marker', x: 50, y: 50, color: 'red' },
      { type: 'marker', x: 100, y: 50, number: 10, color: 'red' },
      { type: 'marker', x: 150, y: 50, color: 'red' }
    ], { active: 11 });
    // Numbers render 1, 10, 11 - so only the last one stays red.
    expect(svg.match(/fill="#E53935"/g)).toHaveLength(1);
  });

  test('ghost style keeps the accent as a ring and numeral, not a fill', () => {
    const svg = buildSvg(200, 200, [{ type: 'marker', x: 100, y: 100, style: 'ghost', color: 'blue' }]);
    expect(svg).toContain('fill="#1E88E5" fill-opacity="0.16" stroke="#1E88E5"');
    expect(svg).toContain('fill="#1E88E5"\n            font-size');
  });
});
