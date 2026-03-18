const tools = [
  {
    name: 'annotate_screenshot',
    description: `Add professional annotations to a screenshot image.

Annotation types available:
• marker - Numbered circles (1, 2, 3...) with gradient and shadow
• arrow - Straight arrows with customizable heads
• curved-arrow - Smooth curved arrows
• callout - Text boxes with pointers (speech bubbles)
• rect - Rectangle highlights
• circle - Circle highlights
• label - Text labels with optional backgrounds
• highlight - Semi-transparent overlays
• blur - Blur sensitive content
• connector - Dashed lines between elements
• icon - Icon badges (check, x, warning, info, question)

Quick reference for common tasks:
• Blur sensitive info: {"type":"blur","x":100,"y":100,"width":200,"height":50}
• Highlight area: {"type":"highlight","x":50,"y":50,"width":300,"height":100,"color":"yellow","opacity":0.35}
• Speech bubble: {"type":"callout","x":200,"y":200,"text":"Your note here","pointer":"bottom"}

Themes: documentation, tutorial, bugReport, highlight

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
          enum: ['documentation', 'tutorial', 'bugReport', 'highlight'],
          description: 'Apply a preset theme for consistent styling'
        },
        redact_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of regex pattern strings. Any label or callout annotation whose text matches at least one pattern will have a blur annotation automatically appended over its bounding box. Matching is performed against annotation text only — no OCR or image scanning is performed.'
        },
        annotations: {
          type: 'array',
          description: 'Array of annotation objects',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['marker', 'arrow', 'curved-arrow', 'callout', 'rect', 'circle', 'label', 'highlight', 'blur', 'connector', 'icon'],
                description: 'Annotation type'
              },
              x: { type: 'number', minimum: 0, description: 'X coordinate of the annotation anchor in image pixels.' },
              y: { type: 'number', minimum: 0, description: 'Y coordinate of the annotation anchor in image pixels.' },
              number: { type: 'number', minimum: 1, description: 'Number for markers' },
              text: { type: 'string', description: 'Text for labels/callouts' },
              from: { type: 'array', items: { type: 'number' }, description: '[x, y] start point' },
              to: { type: 'array', items: { type: 'number' }, description: '[x, y] end point' },
              width: { type: 'number', minimum: 0, description: 'Width of the annotation in image pixels. Use for rectangles, highlights, blur regions, and other box-based shapes.' },
              height: { type: 'number', minimum: 0, description: 'Height of the annotation in image pixels. Use for rectangles, highlights, blur regions, and other box-based shapes.' },
              radius: { type: 'number', minimum: 0, description: 'Radius in image pixels for circular annotations.' },
              color: { type: 'string' },
              background: { type: 'string' },
              size: { type: 'number', minimum: 0, description: 'Overall size for markers or icons in image pixels.' },
              fontSize: { type: 'number', minimum: 0, description: 'Text size in image pixels for labels and callouts.' },
              strokeWidth: { type: 'number', minimum: 0, description: 'Line thickness in image pixels for arrows, outlines, and connectors.' },
              style: { type: 'string', enum: ['filled', 'outline', 'badge', 'solid', 'dashed'] },
              pointer: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
              icon: { type: 'string', enum: ['check', 'x', 'warning', 'info', 'question'] },
              shadow: { type: 'boolean' },
              curve: { type: 'number', minimum: -500, maximum: 500, description: 'Curve strength for curved arrows. Negative values bend one direction and positive values bend the other.' },
              cornerRadius: { type: 'number', minimum: 0, description: 'Corner radius in image pixels for rounded rectangles or labels.' },
              opacity: { type: 'number', minimum: 0, maximum: 1, description: 'Transparency from 0 for fully transparent to 1 for fully opaque.' }
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
          enum: ['documentation', 'tutorial', 'bugReport', 'highlight']
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
