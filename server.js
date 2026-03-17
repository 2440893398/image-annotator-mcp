#!/usr/bin/env node

/**
 * Image Annotator MCP Server
 *
 * Professional screenshot annotation tool for creating documentation,
 * tutorials, and bug reports. Works alongside Playwright MCP.
 *
 * @author Varun Dubey
 * @license MIT
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const path = require('path');
const fs = require('fs');

const {
  AnnotationError,
  FileNotFoundError,
  InvalidParameterError,
  ImageProcessingError,
  AnnotationTypeError,
  ValidationError
} = require('./annotate-errors');

// Import annotation functions
const { annotateImage, getImageDimensions, COLORS, THEMES } = require('./annotate.js');

// Tool definitions
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
          enum: ['png', 'jpeg', 'webp', 'avif'],
          description: 'Output image format. Defaults to inferring from output_path or falling back to png when no file extension is provided.'
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

Known limitation: device_pixel_ratio scales the source step coordinates, but the built-in label offsets in this helper still use fixed pixel distances. For full DPR-aware layout control, use annotate_screenshot directly.`,
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
          enum: ['png', 'jpeg', 'webp', 'avif'],
          description: 'Output image format. Defaults to inferring from output_path or falling back to png when no file extension is provided.'
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
    name: 'open_config_ui',
    description: `Open the annotation config UI in the browser. Call with no arguments to open immediately.

- Optional working_directory (string): Absolute path where .image-annotator.json should be saved (e.g. the user's project/workspace root). If omitted, config is saved in the MCP server's directory.
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

// Create server
const server = new Server(
  {
    name: 'image-annotator',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'annotate_screenshot':
        return await handleAnnotate(args);
      case 'get_image_dimensions':
        return await handleDimensions(args);
      case 'create_step_guide':
        return await handleStepGuide(args);
      case 'open_config_ui':
        return await handleOpenConfigUi(args);
      default:
        return {
          content: [{ type: 'text', text: `Tool '${name}' is not available. If you were using highlight_area, add_callout, or blur_area, use annotate_screenshot with equivalent annotation types instead.\n\nExamples:\n• Blur: {"type":"blur","x":100,"y":100,"width":200,"height":50}\n• Highlight: {"type":"highlight","x":50,"y":50,"width":300,"height":100,"color":"yellow","opacity":0.35}\n• Callout: {"type":"callout","x":200,"y":200,"text":"Your note here","pointer":"bottom"}` }],
          isError: true
        };
    }
  } catch (error) {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = error.message;

    if (error instanceof FileNotFoundError) {
      errorCode = error.code;
      errorMessage = `File not found: ${error.filePath}`;
    } else if (error instanceof InvalidParameterError) {
      errorCode = error.code;
      errorMessage = `Invalid parameter: ${error.param} - ${error.message}`;
    } else if (error instanceof ImageProcessingError) {
      errorCode = error.code;
      errorMessage = `Image processing failed: ${error.message}`;
    } else if (error instanceof AnnotationTypeError) {
      errorCode = error.code;
      errorMessage = `Annotation error: ${error.message}`;
    } else if (error instanceof ValidationError) {
      errorCode = error.code;
      errorMessage = `Validation failed: ${error.message}`;
    } else if (error instanceof AnnotationError) {
      errorCode = error.code;
    }

    return {
      content: [{ type: 'text', text: `Error (${errorCode}): ${errorMessage}` }],
      isError: true,
      errorCode
    };
  }
});

// Generate output path
function getOutputPath(inputPath, suffix = '-annotated', outputFormat = null) {
  const dir = path.dirname(inputPath);
  const inputExt = path.extname(inputPath);
  const ext = outputFormat === 'jpeg'
    ? '.jpg'
    : outputFormat
      ? `.${outputFormat}`
      : inputExt;
  const base = path.basename(inputPath, inputExt);
  return path.join(dir, `${base}${suffix}${ext}`);
}

// Handlers
async function handleAnnotate(args) {
  const { input_path, output_path, annotations, theme, output_format, quality, device_pixel_ratio, canvas_padding } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const finalPath = output_path || getOutputPath(input_path, '-annotated', output_format || null);
  const result = await annotateImage(input_path, finalPath, annotations, {
    theme,
    outputFormat: output_format,
    quality,
    devicePixelRatio: device_pixel_ratio,
    canvasPadding: canvas_padding
  });
  const warningLines = result.warnings && result.warnings.length
    ? result.warnings.map((warning) =>
      `  Warning: ${warning.property} clamped from ${warning.original} to ${warning.clamped} (annotation #${warning.annotation + 1})`
    ).join('\n')
    : '';
  const jpegNote = result.outputFormat === 'jpeg'
    ? '\n  Note: JPEG output does not preserve transparency. Any transparent pixels are flattened during export.'
    : '';

  return {
    content: [{
      type: 'text',
      text: `✓ Annotated screenshot saved: ${result.outputPath}\n  Size: ${result.width}x${result.height}\n  Annotations: ${result.annotationCount}${theme ? `\n  Theme: ${theme}` : ''}${device_pixel_ratio ? `\n  DPR: ${device_pixel_ratio}x (coordinates scaled from CSS to device pixels)` : ''}${jpegNote}\n  Alt-text: ${result.altText}${result.warnings && result.warnings.length ? `\n  Warnings: ${result.warnings.length} coordinate(s) clamped to image boundaries\n${warningLines}` : ''}`
    }],
    alt_text: result.altText
  };
}

async function handleDimensions(args) {
  const { image_path } = args;

  if (!fs.existsSync(image_path)) {
    throw new FileNotFoundError(image_path);
  }

  const dims = await getImageDimensions(image_path);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(dims, null, 2)
    }]
  };
}

async function handleStepGuide(args) {
  const { input_path, output_path, steps, connect_steps = true, theme, output_format, quality, device_pixel_ratio, canvas_padding } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const dpr = device_pixel_ratio || 1;
  const colors = ['primary', 'green', 'orange', 'purple', 'cyan'];
  const annotations = [];

  // Add step markers and labels
  steps.forEach((step, i) => {
    const color = step.color || colors[i % colors.length];

    // Marker
    annotations.push({
      type: 'marker',
      x: step.x,
      y: step.y,
      number: i + 1,
      color,
      size: 24
    });

    // Label with arrow
    const labelX = step.x + Math.round(50 * dpr);
    const labelY = step.y;

    annotations.push({
      type: 'arrow',
      from: [step.x + Math.round(28 * dpr), step.y],
      to: [labelX - Math.round(5 * dpr), labelY],
      color,
      strokeWidth: 2
    });

    annotations.push({
      type: 'label',
      x: labelX,
      y: labelY + Math.round(6 * dpr),
      text: step.label,
      color: 'darkGray',
      fontSize: 16,
      background: 'white',
      shadow: true
    });

    // Connect to next step
    if (connect_steps && i < steps.length - 1) {
      const next = steps[i + 1];
      annotations.push({
        type: 'connector',
        from: [step.x, step.y + Math.round(30 * dpr)],
        to: [next.x, next.y - Math.round(30 * dpr)],
        color: 'gray'
      });
    }
  });

  const finalPath = output_path || getOutputPath(input_path, '-guide', output_format || null);
  const result = await annotateImage(input_path, finalPath, annotations, {
    theme,
    outputFormat: output_format,
    quality,
    devicePixelRatio: device_pixel_ratio,
    canvasPadding: canvas_padding
  });

  return {
    content: [{
      type: 'text',
      text: `✓ Step guide created: ${result.outputPath}\n  Steps: ${steps.length}`
    }]
  };
}

// Track config server child process for cleanup
let configServerProcess = null;

/**
 * Open URL in the default browser (cross-platform)
 */
function openBrowser(url) {
  const { spawn } = require('child_process');
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
  } catch (e) {
    // Ignore browser open errors
  }
}

// Start config UI server (optional workingDir = where to save .image-annotator.json)
function startConfigServer(workingDir) {
  const { spawn } = require('child_process');
  
  // Kill previous config server if still running
  if (configServerProcess) {
    try { configServerProcess.kill(); } catch (e) { /* ignore */ }
    configServerProcess = null;
  }
  
  const cwd = workingDir && path.isAbsolute(workingDir) ? workingDir : process.cwd();
  const configServer = spawn('node', [path.join(__dirname, 'config-ui', 'server.js')], {
    cwd,
    stdio: 'pipe'
  });
  configServerProcess = configServer;
  
  return new Promise((resolve, reject) => {
    let resolved = false;
    
    configServer.stdout.on('data', (data) => {
      const output = data.toString();
      const urlMatch = output.match(/http:\/\/localhost:(\d+)/);
      if (urlMatch && !resolved) {
        resolved = true;
        const url = urlMatch[0];
        openBrowser(url);
        resolve(url);
      }
    });
    
    configServer.stderr.on('data', (data) => {
      console.error('Config server error:', data.toString());
    });
    
    configServer.on('exit', () => {
      configServerProcess = null;
    });
    
    // Fallback after 3 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve('http://localhost:3456');
      }
    }, 3000);
  });
}

// Clean up config server on process exit
process.on('exit', () => {
  if (configServerProcess) {
    try { configServerProcess.kill(); } catch (e) { /* ignore */ }
  }
});

async function handleOpenConfigUi(args) {
  try {
    const workingDir = args.working_directory || undefined;
    const url = await startConfigServer(workingDir);
    const saveHint = workingDir
      ? `Config will be saved to: ${path.join(workingDir, '.image-annotator.json')}`
      : 'Config will be saved to .image-annotator.json in the MCP server directory (pass working_directory to save to your project instead).';
    return {
      content: [{
        type: 'text',
        text: `Configuration UI opened.\n\nURL: ${url}\n\n${saveHint}\n\nSubsequent annotate_screenshot calls will use this config when the image is under that directory.`
      }]
    };
  } catch (error) {
    throw new Error(`Failed to start config UI: ${error.message}`);
  }
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Image Annotator MCP Server v1.0.0 running...');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

module.exports = {
  tools,
  getOutputPath,
  handleAnnotate,
  handleDimensions,
  handleStepGuide,
  handleOpenConfigUi,
  main,
  server
};
