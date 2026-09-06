jest.mock('../../src/annotate', () => ({
  annotateImage: jest.fn(),
  getImageDimensions: jest.fn(),
  COLORS: {},
  THEMES: {}
}));

const fs = require('fs');
const path = require('path');
const os = require('os');
const annotate = require('../../src/annotate');
const serverModule = require('../../server.js');

describe('server.js', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the root server entrypoint wired to src/server', () => {
    expect(require('../../server')).toBe(require('../../src/server'));
  });

  it('exports exactly 5 tools', () => {
    expect(serverModule.tools).toHaveLength(5);
    expect(serverModule.tools.map((tool) => tool.name)).toEqual([
      'annotate_screenshot',
      'get_image_dimensions',
      'create_step_guide',
      'reannotate_screenshot',
      'open_config_ui'
    ]);
  });

  it('declares every renderer capability in the annotate_screenshot schema', () => {
    const annotateTool = serverModule.tools.find((tool) => tool.name === 'annotate_screenshot');
    const itemProps = annotateTool.inputSchema.properties.annotations.items.properties;
    expect(itemProps.type.enum).toEqual([
      'marker', 'arrow', 'curved-arrow', 'callout', 'rect', 'circle', 'ellipse',
      'polyline', 'polygon', 'freehand', 'label',
      'highlight', 'redact', 'blur', 'connector', 'icon', 'measure', 'leadout',
      'bracket-label', 'spotlight', 'magnifier'
    ]);
    for (const field of ['headStyle', 'heads', 'fill', 'fillStyle', 'padding', 'fontWeight', 'borderColor', 'rx', 'ry', 'maxWidth', 'lineStyle', 'points', 'closed', 'badge', 'bracketStyle', 'halo']) {
      expect(itemProps[field]).toBeDefined();
    }
    expect(annotateTool.inputSchema.properties.crop).toBeDefined();
    expect(annotateTool.inputSchema.properties.crop.required).toEqual(['x', 'y', 'width', 'height']);
  });

  it('offers the sketch theme on create_step_guide', () => {
    const stepTool = serverModule.tools.find((tool) => tool.name === 'create_step_guide');
    expect(stepTool.inputSchema.properties.theme.enum).toContain('sketch');
    expect(stepTool.inputSchema.properties.sketch).toBeDefined();
  });

  it('passes sketch through to step guides and warns past 7 steps', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-step-sketch-'));
    const inputPath = path.join(tempDir, 'input.png');
    fs.writeFileSync(inputPath, 'placeholder');

    annotate.annotateImage.mockResolvedValue({
      outputPath: path.join(tempDir, 'guide.png'),
      width: 200,
      height: 200,
      annotationCount: 8,
      warnings: [],
      altText: 'guide'
    });

    const steps = Array.from({ length: 8 }, (_, i) => ({ x: 10 + i, y: 10, label: `Step ${i + 1}` }));
    const result = await serverModule.handleStepGuide({
      input_path: inputPath,
      steps,
      sketch: true,
      theme: 'sketch'
    });

    const options = annotate.annotateImage.mock.calls[0][3];
    expect(options.sketch).toBe(true);
    expect(options.theme).toBe('sketch');
    expect(result.content[0].text).toContain('exceeds the 5-7 step best-practice range');
  });

  it('builds output paths using requested output format', () => {
    const output = serverModule.getOutputPath('/tmp/example.png', '-annotated', 'webp');
    expect(output).toBe(path.join('/tmp', 'example-annotated.webp'));
  });

  it('passes DPR, quality, output format, padding, and redact patterns to annotateImage', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-handle-annotate-'));
    const inputPath = path.join(tempDir, 'input.png');
    fs.writeFileSync(inputPath, 'placeholder');

    annotate.annotateImage.mockResolvedValue({
      outputPath: path.join(tempDir, 'output.webp'),
      width: 200,
      height: 200,
      annotationCount: 1,
      warnings: [],
      altText: 'Annotated image (200x200): 1 marker'
    });

    const result = await serverModule.handleAnnotate({
      input_path: inputPath,
      annotations: [{ type: 'marker', x: 10, y: 10, number: 1 }],
      output_format: 'webp',
      quality: 75,
      device_pixel_ratio: 2,
      canvas_padding: 50,
      redact_patterns: ['secret'],
      theme: 'documentation'
    });

    expect(annotate.annotateImage).toHaveBeenCalledWith(
      inputPath,
      path.join(tempDir, 'input-annotated.webp'),
      [{ type: 'marker', x: 10, y: 10, number: 1 }],
      {
        theme: 'documentation',
        sketch: false,
        outputFormat: 'webp',
        quality: 75,
        devicePixelRatio: 2,
        canvasPadding: 50,
        redactPatterns: ['secret'],
        autoLayout: false,
        active: null
      }
    );
    expect(result.alt_text).toBe('Annotated image (200x200): 1 marker');
  });

  it('formats overlap warnings in handleAnnotate response text', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-overlap-warning-'));
    const inputPath = path.join(tempDir, 'input.png');
    fs.writeFileSync(inputPath, 'placeholder');

    annotate.annotateImage.mockResolvedValue({
      outputPath: path.join(tempDir, 'output.png'),
      width: 200,
      height: 200,
      annotationCount: 2,
      warnings: [
        { type: 'overlap', annotations: [0, 1], overlap: { x: 10, y: 20, w: 30, h: 40 } }
      ],
      altText: 'Annotated image (200x200): 2 markers'
    });

    const result = await serverModule.handleAnnotate({
      input_path: inputPath,
      annotations: [{ type: 'marker', x: 10, y: 10, number: 1 }, { type: 'marker', x: 20, y: 20, number: 2 }]
    });

    expect(result.content[0].text).toContain('Warnings: 1 issue(s) detected');
    expect(result.content[0].text).toContain('Overlap detected between annotations #1 and #2 at 10,20 (30x40)');
  });

  it('passes output format options through step guide handler', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-step-guide-'));
    const inputPath = path.join(tempDir, 'input.png');
    fs.writeFileSync(inputPath, 'placeholder');

    annotate.annotateImage.mockResolvedValue({
      outputPath: path.join(tempDir, 'guide.avif'),
      width: 320,
      height: 240,
      annotationCount: 3,
      warnings: [],
      altText: 'Annotated image (320x240): 1 marker, 1 arrow, 1 label'
    });

    await serverModule.handleStepGuide({
      input_path: inputPath,
      steps: [{ x: 10, y: 20, label: 'Open settings' }],
      output_format: 'avif',
      quality: 50,
      device_pixel_ratio: 2,
      canvas_padding: { top: 10, right: 5, bottom: 10, left: 5 }
    });

    expect(annotate.annotateImage).toHaveBeenCalled();
    const call = annotate.annotateImage.mock.calls[0];
    expect(call[1]).toMatch(/-guide\.avif$/);
    expect(call[3]).toMatchObject({
      outputFormat: 'avif',
      quality: 50,
      devicePixelRatio: 2,
      canvasPadding: { top: 10, right: 5, bottom: 10, left: 5 }
    });
  });

  it('applies DPR-aware offsets when building step guide annotations', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-step-guide-dpr-'));
    const inputPath = path.join(tempDir, 'input.png');
    fs.writeFileSync(inputPath, 'placeholder');

    annotate.annotateImage.mockResolvedValue({
      outputPath: path.join(tempDir, 'guide.png'),
      width: 320,
      height: 240,
      annotationCount: 4,
      warnings: [],
      altText: 'Annotated image (320x240): step guide'
    });

    await serverModule.handleStepGuide({
      input_path: inputPath,
      steps: [
        { x: 100, y: 100, label: 'First' },
        { x: 200, y: 200, label: 'Second' }
      ],
      device_pixel_ratio: 2
    });

    const annotations = annotate.annotateImage.mock.calls[0][2];
    expect(annotations[1]).toMatchObject({
      type: 'arrow',
      from: [156, 100],
      to: [190, 100]
    });
    expect(annotations[2]).toMatchObject({
      type: 'label',
      x: 200,
      y: 112
    });
    expect(annotations[3]).toMatchObject({
      type: 'connector',
      from: [100, 160],
      to: [200, 140]
    });
  });
});
