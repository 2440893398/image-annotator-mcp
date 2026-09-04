'use strict';

const STEP_COLORS = ['primary', 'green', 'orange', 'purple', 'cyan'];

// Layout constants in CSS pixels; every one of them is scaled by the device
// pixel ratio so a guide keeps its proportions on HiDPI screenshots.
const MARKER_SIZE = 24;
const LABEL_FONT_SIZE = 16;
const LABEL_OFFSET_X = 50;
const ARROW_START_OFFSET_X = 28;
const ARROW_END_GAP = 5;
const LABEL_BASELINE_OFFSET_Y = 6;
const CONNECTOR_GAP_Y = 30;
const ARROW_STROKE_WIDTH = 2;

/**
 * Build the marker/arrow/label/connector annotations for a numbered step guide.
 *
 * Shared by the MCP create_step_guide tool and the `annotate step-guide` CLI so
 * the two cannot drift apart.
 *
 * @param {Array<{x: number, y: number, label: string, color?: string}>} steps
 * @param {{devicePixelRatio?: number, connectSteps?: boolean}} [options]
 * @returns {Array<object>} annotations ready for annotateImage
 */
function buildStepGuideAnnotations(steps, options = {}) {
  if (!Array.isArray(steps)) return [];

  const dpr = Number.isFinite(options.devicePixelRatio) && options.devicePixelRatio > 0
    ? options.devicePixelRatio
    : 1;
  const connectSteps = options.connectSteps !== false;
  const scale = (value) => Math.round(value * dpr);

  const annotations = [];

  steps.forEach((step, index) => {
    const color = step.color || STEP_COLORS[index % STEP_COLORS.length];
    const labelX = step.x + scale(LABEL_OFFSET_X);
    const labelY = step.y;

    annotations.push({
      type: 'marker',
      x: step.x,
      y: step.y,
      number: index + 1,
      color,
      size: scale(MARKER_SIZE)
    });

    annotations.push({
      type: 'arrow',
      from: [step.x + scale(ARROW_START_OFFSET_X), step.y],
      to: [labelX - scale(ARROW_END_GAP), labelY],
      color,
      strokeWidth: scale(ARROW_STROKE_WIDTH)
    });

    annotations.push({
      type: 'label',
      x: labelX,
      y: labelY + scale(LABEL_BASELINE_OFFSET_Y),
      text: step.label,
      color: 'darkGray',
      fontSize: scale(LABEL_FONT_SIZE),
      background: 'white',
      shadow: true
    });

    if (connectSteps && index < steps.length - 1) {
      const next = steps[index + 1];
      annotations.push({
        type: 'connector',
        from: [step.x, step.y + scale(CONNECTOR_GAP_Y)],
        to: [next.x, next.y - scale(CONNECTOR_GAP_Y)],
        color: 'gray'
      });
    }
  });

  return annotations;
}

module.exports = {
  buildStepGuideAnnotations,
  STEP_COLORS
};
