const { buildStepGuideAnnotations, STEP_COLORS } = require('../../src/annotate/step-guide');

const STEPS = [
  { x: 100, y: 100, label: 'First' },
  { x: 200, y: 200, label: 'Second' }
];

describe('buildStepGuideAnnotations', () => {
  it('emits marker, arrow, label and connector for each step', () => {
    const annotations = buildStepGuideAnnotations(STEPS);
    expect(annotations.map((a) => a.type)).toEqual([
      'marker', 'arrow', 'label', 'connector',
      'marker', 'arrow', 'label'
    ]);
  });

  it('numbers steps from 1 and cycles the default palette', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: 0, label: `s${i}` }));
    const markers = buildStepGuideAnnotations(many, { connectSteps: false })
      .filter((a) => a.type === 'marker');
    expect(markers.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(markers.map((m) => m.color)).toEqual([...STEP_COLORS, STEP_COLORS[0]]);
  });

  it('lets a step override its colour', () => {
    const [marker] = buildStepGuideAnnotations([{ x: 0, y: 0, label: 'x', color: 'pink' }]);
    expect(marker.color).toBe('pink');
  });

  it('omits connectors when connectSteps is false', () => {
    const annotations = buildStepGuideAnnotations(STEPS, { connectSteps: false });
    expect(annotations.some((a) => a.type === 'connector')).toBe(false);
  });

  it('defaults connectSteps to true', () => {
    expect(buildStepGuideAnnotations(STEPS, {}).some((a) => a.type === 'connector')).toBe(true);
  });

  // The offsets used to be scaled by DPR while the sizes stayed hardcoded, so a
  // 2x guide came out with correctly-spaced but half-sized markers and text.
  it('scales sizes as well as offsets by the device pixel ratio', () => {
    const [marker1x, arrow1x, label1x] = buildStepGuideAnnotations(STEPS, { connectSteps: false });
    const [marker2x, arrow2x, label2x] = buildStepGuideAnnotations(STEPS, {
      devicePixelRatio: 2,
      connectSteps: false
    });

    expect(marker2x.size).toBe(marker1x.size * 2);
    expect(label2x.fontSize).toBe(label1x.fontSize * 2);
    expect(arrow2x.strokeWidth).toBe(arrow1x.strokeWidth * 2);

    // ...and the offsets still scale in step with them.
    expect(arrow2x.from[0] - STEPS[0].x).toBe((arrow1x.from[0] - STEPS[0].x) * 2);
    expect(label2x.x - STEPS[0].x).toBe((label1x.x - STEPS[0].x) * 2);
  });

  it('falls back to 1x for a missing or nonsensical device pixel ratio', () => {
    const baseline = buildStepGuideAnnotations(STEPS);
    for (const dpr of [undefined, 0, -2, NaN, Infinity, 'two']) {
      expect(buildStepGuideAnnotations(STEPS, { devicePixelRatio: dpr })).toEqual(baseline);
    }
  });

  it('returns an empty array for non-array input', () => {
    expect(buildStepGuideAnnotations(undefined)).toEqual([]);
    expect(buildStepGuideAnnotations(null)).toEqual([]);
  });
});

describe('step guide wiring', () => {
  // The CLI and the MCP tool used to carry line-for-line copies of this layout.
  it('is the single implementation shared by the CLI and the MCP handler', () => {
    const cliSource = require('fs').readFileSync(require.resolve('../../src/annotate/cli.js'), 'utf8');
    const handlerSource = require('fs').readFileSync(require.resolve('../../src/server/handlers.js'), 'utf8');
    for (const source of [cliSource, handlerSource]) {
      expect(source).toContain('buildStepGuideAnnotations');
      expect(source).not.toMatch(/annotations\.push\(\{\s*$/m);
    }
  });
});
