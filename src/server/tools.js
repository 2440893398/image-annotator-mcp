const tools = [
  {
    name: 'annotate_screenshot',
    description: `Add professional annotations to a screenshot image.

Annotation types available:
• marker - Numbered circles (1, 2, 3...) with gradient and shadow; "number" may be omitted and auto-increments in array order
• arrow - Straight or elbow arrows ("lineStyle") with heads at either or both ends ("heads")
• curved-arrow - Smooth curved arrows
• callout - Text boxes with pointers (speech bubbles); wraps automatically when "width" or "maxWidth" is set
• rect - Rectangle highlights
• circle - Circle highlights
• ellipse - Ellipse outline around a center point (rx/ry radii or width/height box) — use instead of circle for wide/flat UI regions
• label - Text labels with optional backgrounds
• highlight - Semi-transparent overlays
• redact - Cover a region irreversibly (mode "solid", default). Modes "pixelate"/"blur" are REVERSIBLE visual de-emphasis only — never use them for sensitive content
• blur - Deprecated alias for redact with mode "blur" (reversible de-emphasis, not privacy protection)
• connector - Dashed lines between elements
• polyline / polygon - Open or closed multi-point shapes for irregular regions
• freehand - Freehand stroke through a points array (hand-drawn look in sketch mode)
• icon - Icon badges (check, x, warning, info, question, lock, star, cursor, thumbs-up, thumbs-down, plus, minus, eye) or any emoji character passed directly
• measure - Dimension measurement lines with tick marks and centered text; omit "text" to auto-show the measured px distance
• leadout - Leader line callout: ringed dot at target, 45° elbow line, filled label chip at anchor
• bracket-label - Square or curly bracket ("bracketStyle") grouping an area with a label
• spotlight - Dark overlay with cutout to focus on a specific area
• magnifier - Circular zoomed-in patch of the target area placed at the anchor

Quick reference for common tasks:
• Redact sensitive info: {"type":"redact","x":100,"y":100,"width":200,"height":50,"label":"REDACTED"}
• Highlight area: {"type":"highlight","x":50,"y":50,"width":300,"height":100,"color":"yellow","opacity":0.35}
• Speech bubble: {"type":"callout","x":200,"y":200,"text":"Your note here","pointer":"bottom"}
• Circle a wide element: {"type":"ellipse","x":200,"y":150,"rx":90,"ry":30}
• Two-way elbow arrow: {"type":"arrow","from":[100,100],"to":[300,200],"heads":"both","lineStyle":"elbow"}
• Measurement (auto distance): {"type":"measure","from":[100,200],"to":[300,200]}
• Leader line: {"type":"leadout","target":[150,150],"anchor":[300,100],"text":"Steel material"}
• Bracket: {"type":"bracket-label","from":[50,100],"to":[50,300],"direction":"right","text":"Group A"}
• Spotlight: {"type":"spotlight","x":200,"y":200,"radius":80}

Themes: documentation, tutorial, bugReport, highlight, sketch

Sketch style: set top-level "sketch": true (or theme "sketch") to draw every
annotation hand-drawn Excalidraw-style (rough.js): wobbly double strokes,
hachure fills, handwriting fonts. Per-annotation "sketch", "roughness" and
"seed" fine-tune it. Redact regions always stay crisp for safety.

Colors: red, orange, yellow, green, blue, purple, pink, cyan, teal,
        white, black, gray, lightGray, darkGray,
        success, warning, error, info, primary, secondary, accent`,
    inputSchema: {
      type: 'object',
      properties: {
        input_path: {
          type: 'string',
          description: 'Absolute path to the input screenshot'
        },
        output_path: {
          type: 'string',
          description: 'Output path (optional, defaults to input-annotated.png)'
        },
        device_pixel_ratio: {
          type: 'number',
          minimum: 0.1,
          maximum: 10,
          description: 'Scale factor that converts CSS pixel coordinates into image pixel coordinates. Multiply coordinates captured from Playwright or browser DOM APIs by this ratio when the screenshot is captured at a higher device pixel ratio, such as Retina 2x screenshots.'
        },
        output_format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp', 'avif', 'svg'],
          description: 'Output image format. Defaults to inferring from output_path or falling back to png when no file extension is provided. Use svg to produce an annotation-only SVG layer without compositing the source image.'
        },
        canvas_padding: {
          description: 'Optional padding that extends the output canvas before rendering annotations. Use a single number to add the same padding on every side, or provide top/right/bottom/left values to grow each edge independently. Annotation coordinates are automatically offset to stay aligned with the original screenshot.',
          oneOf: [
            {
              type: 'number',
              minimum: 0
            },
            {
              type: 'object',
              properties: {
                top: { type: 'number', minimum: 0, description: 'Padding added above the original image.' },
                right: { type: 'number', minimum: 0, description: 'Padding added to the right side of the original image.' },
                bottom: { type: 'number', minimum: 0, description: 'Padding added below the original image.' },
                left: { type: 'number', minimum: 0, description: 'Padding added to the left side of the original image.' }
              },
              additionalProperties: false
            }
          ]
        },
        quality: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Image quality for jpeg, webp, or avif output. Use 1 for the smallest files and 100 for the highest fidelity.'
        },
        theme: {
          type: 'string',
          enum: ['documentation', 'tutorial', 'bugReport', 'highlight', 'sketch'],
          description: 'Apply a preset theme for consistent styling. "sketch" renders everything hand-drawn (Excalidraw-style) with near-black ink.'
        },
        sketch: {
          type: 'boolean',
          description: 'Render every annotation in a hand-drawn Excalidraw-like style (rough.js): wobbly double strokes, hachure fills, handwriting fonts. Redact/blur regions are exempt and always stay crisp. Individual annotations can opt out with "sketch": false.'
        },
        crop: {
          type: 'object',
          description: 'Crop the screenshot to this region before annotating. Coordinates are CSS logical pixels relative to the ORIGINAL image (same space as annotation coordinates and device_pixel_ratio); annotation coordinates are shifted automatically, so coordinates from Playwright/DOM can be reused unchanged. The region is intersected with the image; no overlap is an error.',
          properties: {
            x: { type: 'number', minimum: 0, description: 'Left edge of the crop region in the original image.' },
            y: { type: 'number', minimum: 0, description: 'Top edge of the crop region in the original image.' },
            width: { type: 'number', exclusiveMinimum: 0 },
            height: { type: 'number', exclusiveMinimum: 0 }
          },
          required: ['x', 'y', 'width', 'height'],
          additionalProperties: false
        },
        background: {
          description: 'CleanShot-style export card: place the (optionally cropped) screenshot on a color or gradient canvas with extra padding, rounded image corners, and a drop shadow. Stacks with canvas_padding. Not available with svg output. Pass a color string as shorthand for {"color": ...}.',
          oneOf: [
            { type: 'string', description: 'Background color (named preset or CSS color).' },
            {
              type: 'object',
              properties: {
                color: { type: 'string', description: 'Solid background color. Mutually exclusive with gradient.' },
                gradient: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    direction: { type: 'string', enum: ['to-bottom', 'to-right', 'to-bottom-right'], description: 'Default: to-bottom-right.' }
                  },
                  required: ['from', 'to'],
                  additionalProperties: false
                },
                padding: { type: 'number', minimum: 0, description: 'Space between the image and the canvas edge (default: 48).' },
                imageCornerRadius: { type: 'number', minimum: 0, description: 'Rounded corner radius applied to the screenshot (default: 12).' },
                shadow: {
                  description: 'Drop shadow under the screenshot card. true (default) for the standard shadow, false to disable, or an object to tune it.',
                  oneOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        blur: { type: 'number', minimum: 0, description: 'Default: 24.' },
                        opacity: { type: 'number', minimum: 0, maximum: 1, description: 'Default: 0.35.' },
                        offsetY: { type: 'number', description: 'Default: 12.' }
                      },
                      additionalProperties: false
                    }
                  ]
                }
              },
              additionalProperties: false
            }
          ]
        },
        auto_layout: {
          type: 'boolean',
          description: 'Opt-in collision avoidance: when a leadout label chip or callout bubble overlaps another annotation, its anchor is mirrored around the target (leadout) or its pointer direction flipped (callout) to the first free position. Off by default because it moves coordinates you supplied explicitly; each move is reported as a warning.'
        },
        redact_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of regex pattern strings. Any label or callout annotation whose text matches at least one pattern is covered with a solid (irreversible) redact rectangle over its bounding box. This covers the annotation\'s own text box, NOT the original content in the underlying screenshot — matching is performed against annotation text only, no OCR or image scanning is performed. Not available with svg output (the matched text would remain readable in the file).'
        },
        annotations: {
          type: 'array',
          description: 'Array of annotation objects',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['marker', 'arrow', 'curved-arrow', 'callout', 'rect', 'circle', 'ellipse', 'polyline', 'polygon', 'freehand', 'label', 'highlight', 'redact', 'blur', 'connector', 'icon', 'measure', 'leadout', 'bracket-label', 'spotlight', 'magnifier'],
                description: 'Annotation type'
              },
              mode: {
                type: 'string',
                enum: ['solid', 'pixelate', 'blur'],
                description: 'Redact mode. "solid" (default, fill #64748B unless color is set) paints an opaque rectangle above all other annotations and is the only irreversible option — always use it for sensitive content. "pixelate" and "blur" alter the underlying image below the annotation layer and are REVERSIBLE visual de-emphasis, not privacy protection.'
              },
              blockSize: { type: 'number', minimum: 1, description: 'Block size in image pixels for redact mode "pixelate" (default: 12).' },
              label: { type: 'string', description: 'Optional text drawn centered on a solid redact rectangle, e.g. "REDACTED".' },
              x: { type: 'number', minimum: 0, description: 'X coordinate of the annotation anchor in image pixels.' },
              y: { type: 'number', minimum: 0, description: 'Y coordinate of the annotation anchor in image pixels.' },
              number: { type: 'number', minimum: 1, description: 'Number for markers. May be omitted: markers auto-increment from 1 in array order, and an explicit number sets the cursor for the ones after it ([auto, auto, 10, auto] renders 1, 2, 10, 11).' },
              text: { type: 'string', description: 'Text for labels/callouts. Use \\n for manual line breaks; set maxWidth (or callout width) for automatic wrapping. For measure, omit to auto-display the measured distance in logical px.' },
              maxWidth: { type: 'number', minimum: 1, description: 'Maximum text width in image pixels for callout/label/leadout; longer text wraps automatically (CJK breaks per character, latin at word boundaries). Unset = no wrapping.' },
              points: {
                type: 'array',
                items: { type: 'array', items: { type: 'number' }, minItems: 2 },
                description: 'Array of [x, y] pairs for polyline/polygon/freehand (polygon needs at least 3).'
              },
              closed: { type: 'boolean', description: 'freehand only: connect the last point back to the first (default: false).' },
              from: { type: 'array', items: { type: 'number' }, description: '[x, y] start point' },
              to: { type: 'array', items: { type: 'number' }, description: '[x, y] end point' },
              target: { type: 'array', items: { type: 'number' }, description: '[x, y] target point for leadout annotations' },
              anchor: { type: 'array', items: { type: 'number' }, description: '[x, y] anchor point for leadout/magnifier text placement' },
              direction: { type: 'string', enum: ['top', 'bottom', 'left', 'right'], description: 'Direction for bracket-label or callout pointer' },
              zoom: { type: 'number', minimum: 1, maximum: 10, description: 'Zoom factor for magnifier (default: 2)' },
              width: { type: 'number', minimum: 0, description: 'Width of the annotation in image pixels. Use for rectangles, highlights, redact regions, and other box-based shapes. Required for redact/blur. For callout it fixes the bubble width and wraps the text to fit.' },
              height: { type: 'number', minimum: 0, description: 'Height of the annotation in image pixels. Use for rectangles, highlights, redact regions, and other box-based shapes. Required for redact/blur.' },
              intensity: { type: 'number', minimum: 0.3, description: 'Gaussian sigma for redact mode "blur" (default: 12). Blur is reversible; do not use it for sensitive content.' },
              radius: { type: 'number', minimum: 0, description: 'Radius in image pixels for circular annotations.' },
              rx: { type: 'number', minimum: 1, description: 'Horizontal radius for ellipse (x/y is the CENTER). Preferred over width/height.' },
              ry: { type: 'number', minimum: 1, description: 'Vertical radius for ellipse (x/y is the CENTER). Preferred over width/height.' },
              color: { type: 'string' },
              background: { type: 'string' },
              fill: { type: 'string', description: 'Fill color for rect/circle/ellipse/polygon shapes, or "none" (default) for outline only.' },
              fillStyle: { type: 'string', enum: ['hachure', 'solid', 'zigzag', 'cross-hatch', 'dots', 'dashed', 'zigzag-line'], description: 'Sketch-mode fill texture for filled shapes (default: hachure, like Excalidraw).' },
              size: { type: 'number', minimum: 0, description: 'Overall size for markers or icons in image pixels.' },
              fontSize: { type: 'number', minimum: 0, description: 'Text size in image pixels for labels and callouts.' },
              strokeWidth: { type: 'number', minimum: 0, description: 'Line thickness in image pixels for arrows, outlines, and connectors.' },
              style: { type: 'string', enum: ['filled', 'outline', 'badge', 'solid', 'dashed'], description: 'marker: filled/outline/badge. Shapes and lines: solid/dashed.' },
              headStyle: { type: 'string', enum: ['filled', 'open'], description: 'Arrowhead shape for arrow/curved-arrow: "filled" (default) solid triangle, "open" V-shaped outline.' },
              heads: { type: 'string', enum: ['end', 'start', 'both', 'none'], description: 'Which ends of an arrow get a head (default: "end"). "both" makes a double-headed arrow for ranges/relationships; "none" is a plain shaft.' },
              variant: { type: 'string', enum: ['soft', 'filled', 'outline'], description: 'Leadout label chip style. "soft" (default): light tint of the accent with accent border and dark text — calm and readable. "filled": solid accent chip with auto-contrast text for maximum emphasis. "outline": white chip with accent border.' },
              lineStyle: { type: 'string', enum: ['elbow', 'straight'], description: 'Leader/shaft routing for leadout and arrow. "elbow" (leadout default) leaves the start at 45° then runs axis-aligned; "straight" (arrow default) connects directly. Use elbow arrows to route around content.' },
              halo: { type: 'boolean', description: 'Draw a white casing under the graphic so it stays legible over busy content. Default true for leadout, false elsewhere. Supported by leadout, arrow/curved-arrow/connector (clean rendering, shaft only), marker (outer white ring), and background-less labels.' },
              bracketStyle: { type: 'string', enum: ['square', 'curly'], description: 'bracket-label shape: right-angled square bracket (default) or typographic curly brace.' },
              pointer: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
              icon: { type: 'string', description: 'Built-in icon name (check, x, warning, info, question, lock, star, cursor, thumbs-up, thumbs-down, plus, minus, eye) or any emoji character, which is rendered directly without the badge circle (opt back in with "badge": true). Emoji rendering depends on the host OS emoji font.' },
              badge: { type: 'boolean', description: 'Emoji icons only: draw the colored badge circle behind the emoji (default: false; named icons always have it).' },
              shadow: { type: 'boolean' },
              sketch: { type: 'boolean', description: 'Hand-drawn rendering for this annotation (overrides the top-level sketch flag; ignored by redact/blur).' },
              roughness: { type: 'number', minimum: 0, maximum: 5, description: 'Sketch wobble amount (default 1, Excalidraw "artist"). 0.5 is subtle, 2+ is cartoonish.' },
              seed: { type: 'number', minimum: 1, description: 'Random seed for sketch strokes. Defaults to the annotation index so re-renders are reproducible.' },
              font: { type: 'string', description: 'Font family override for text-bearing annotations (label, callout, leadout).' },
              handwriting: { type: 'boolean', description: 'Use the handwriting font stack for text (implied by sketch mode).' },
              curve: { type: 'number', minimum: -500, maximum: 500, description: 'Curve strength for curved arrows. Negative values bend one direction and positive values bend the other.' },
              cornerRadius: { type: 'number', minimum: 0, description: 'Corner radius in image pixels for rounded rectangles or labels.' },
              opacity: { type: 'number', minimum: 0, maximum: 1, description: 'Transparency from 0 for fully transparent to 1 for fully opaque.' },
              padding: { type: 'number', minimum: 0, description: 'Inner padding in image pixels between label text and its background box (default: 10).' },
              fontWeight: { type: 'string', description: 'CSS font-weight for label text (default: "600").' },
              borderColor: { type: 'string', description: 'Ring color for the magnifier lens (default: primary blue).' }
            },
            required: ['type']
          }
        }
      },
      required: ['input_path', 'annotations']
    }
  },
  {
    name: 'get_image_dimensions',
    description: 'Get width, height, and format of an image. Essential for calculating annotation coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: 'Absolute path to the image'
        }
      },
      required: ['image_path']
    }
  },
  {
    name: 'create_step_guide',
    description: `Create a numbered step-by-step guide on a screenshot.

Automatically places numbered markers with labels and connecting arrows.
Perfect for tutorials and documentation.

device_pixel_ratio scales both the source step coordinates and the built-in label spacing so guides stay visually proportional on high-DPR screenshots. For full layout control, use annotate_screenshot directly.`,
    inputSchema: {
      type: 'object',
      properties: {
        input_path: {
          type: 'string',
          description: 'Path to input screenshot'
        },
        output_path: {
          type: 'string',
          description: 'Output path (optional)'
        },
        device_pixel_ratio: {
          type: 'number',
          minimum: 0.1,
          maximum: 10,
          description: 'Scale factor that converts CSS pixel coordinates into image pixel coordinates. Multiply coordinates collected from Playwright or browser APIs by this ratio when the screenshot resolution is higher than CSS pixels.'
        },
        output_format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp', 'avif', 'svg'],
          description: 'Output image format. Defaults to inferring from output_path or falling back to png when no file extension is provided. Use svg to produce an annotation-only SVG layer without compositing the source image.'
        },
        canvas_padding: {
          description: 'Optional padding that extends the output canvas before placing the generated guide. Use a single number for uniform padding on all sides, or provide top/right/bottom/left values to expand each edge separately. Step and label coordinates are automatically offset so they still point to the intended UI elements.',
          oneOf: [
            {
              type: 'number',
              minimum: 0
            },
            {
              type: 'object',
              properties: {
                top: { type: 'number', minimum: 0, description: 'Padding added above the original image.' },
                right: { type: 'number', minimum: 0, description: 'Padding added to the right side of the original image.' },
                bottom: { type: 'number', minimum: 0, description: 'Padding added below the original image.' },
                left: { type: 'number', minimum: 0, description: 'Padding added to the left side of the original image.' }
              },
              additionalProperties: false
            }
          ]
        },
        quality: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Image quality for jpeg, webp, or avif output. Use 1 for the smallest files and 100 for the highest fidelity.'
        },
        steps: {
          type: 'array',
          description: 'Array of steps',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number', minimum: 0, description: 'X coordinate for the step marker in image pixels.' },
              y: { type: 'number', minimum: 0, description: 'Y coordinate for the step marker in image pixels.' },
              label: { type: 'string', description: 'Step description' },
              color: { type: 'string', description: 'Color (optional)' }
            },
            required: ['x', 'y', 'label']
          }
        },
        connect_steps: {
          type: 'boolean',
          description: 'Draw dashed lines connecting steps (default: true)'
        },
        theme: {
          type: 'string',
          enum: ['documentation', 'tutorial', 'bugReport', 'highlight', 'sketch'],
          description: 'Preset theme. "sketch" renders the whole guide hand-drawn (Excalidraw-style).'
        },
        sketch: {
          type: 'boolean',
          description: 'Render the guide in a hand-drawn Excalidraw-like style (same as theme "sketch").'
        }
      },
      required: ['input_path', 'steps']
    }
  },
  {
    name: 'reannotate_screenshot',
    description: `Proportionally remap annotation coordinates from a previous screenshot onto a new screenshot of a different size.

This is a coordinate estimation helper only — it does NOT perform visual feature matching, OCR, or browser automation. Coordinates are scaled by the ratio of new dimensions to previous dimensions.

Use this when:
• A UI was resized or the viewport changed and you want to reuse existing annotations
• You need a starting point for re-annotating a resized screenshot

Always verify the suggested annotations visually before publishing, as layout changes may have moved UI elements.`,
    inputSchema: {
      type: 'object',
      properties: {
        new_screenshot_path: {
          type: 'string',
          description: 'Absolute path to the new screenshot whose dimensions will be used for remapping'
        },
        previous_annotations: {
          type: 'array',
          description: 'Annotation objects from the previous screenshot (same format as annotate_screenshot)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' }
            },
            required: ['type']
          }
        },
        previous_image_dimensions: {
          type: 'object',
          description: 'Explicit dimensions of the previous screenshot. Provide this for accurate remapping. If omitted, dimensions are estimated from annotation coordinates.',
          properties: {
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 }
          },
          required: ['width', 'height']
        }
      },
      required: ['new_screenshot_path', 'previous_annotations']
    }
  },
  {
    name: 'open_config_ui',
    description: `Open the annotation config UI in the browser. Call with no arguments to open immediately.

- Optional working_directory (string): Absolute path where .image-annotator.json should be saved (e.g. the user's project/workspace root). If omitted, config is saved in the MCP server directory.
- Optional port (number): Port for the config server (default: 3456).

After the user saves in the UI, subsequent annotate_screenshot calls will use that config when the image path is under the same directory (or when config is found via parent/home lookup).`,
    inputSchema: {
      type: 'object',
      properties: {
        working_directory: {
          type: 'string',
          description: 'Absolute path of the directory where config should be saved (e.g. workspace root). If provided, .image-annotator.json will be written here so annotate_screenshot uses it for that project.'
        },
        port: {
          type: 'number',
          description: 'Port for the config server (default: 3456)'
        }
      }
    }
  }
];

module.exports = {
  tools
};
