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
              x: { type: 'number', description: 'X coordinate' },
              y: { type: 'number', description: 'Y coordinate' },
              number: { type: 'number', description: 'Number for markers' },
              text: { type: 'string', description: 'Text for labels/callouts' },
              from: { type: 'array', items: { type: 'number' }, description: '[x, y] start point' },
              to: { type: 'array', items: { type: 'number' }, description: '[x, y] end point' },
              width: { type: 'number' },
              height: { type: 'number' },
              radius: { type: 'number' },
              color: { type: 'string' },
              background: { type: 'string' },
              size: { type: 'number' },
              fontSize: { type: 'number' },
              strokeWidth: { type: 'number' },
              style: { type: 'string', enum: ['filled', 'outline', 'badge', 'solid', 'dashed'] },
              pointer: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
              icon: { type: 'string', enum: ['check', 'x', 'warning', 'info', 'question'] },
              shadow: { type: 'boolean' },
              curve: { type: 'number' },
              cornerRadius: { type: 'number' },
              opacity: { type: 'number' }
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
Perfect for tutorials and documentation.`,
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
        steps: {
          type: 'array',
          description: 'Array of steps',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'X coordinate for marker' },
              y: { type: 'number', description: 'Y coordinate for marker' },
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
    name: 'highlight_area',
    description: 'Quickly highlight a specific area with a shape and optional label.',
    inputSchema: {
      type: 'object',
      properties: {
        input_path: { type: 'string' },
        output_path: { type: 'string' },
        shape: {
          type: 'string',
          enum: ['circle', 'rect', 'highlight'],
          description: 'Shape type'
        },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number', description: 'Width (or diameter for circle)' },
        height: { type: 'number', description: 'Height (for rect only)' },
        color: { type: 'string', description: 'Color (default: red)' },
        label: { type: 'string', description: 'Optional label' },
        label_position: {
          type: 'string',
          enum: ['top', 'bottom', 'left', 'right'],
          description: 'Label position relative to shape'
        }
      },
      required: ['input_path', 'shape', 'x', 'y', 'width']
    }
  },
  {
    name: 'add_callout',
    description: 'Add a callout (speech bubble) pointing to a specific location.',
    inputSchema: {
      type: 'object',
      properties: {
        input_path: { type: 'string' },
        output_path: { type: 'string' },
        x: { type: 'number', description: 'X coordinate where pointer points' },
        y: { type: 'number', description: 'Y coordinate where pointer points' },
        text: { type: 'string', description: 'Callout text (supports \\n for newlines)' },
        pointer: {
          type: 'string',
          enum: ['top', 'bottom', 'left', 'right'],
          description: 'Direction the pointer comes from'
        },
        color: { type: 'string' },
        background: { type: 'string' }
      },
      required: ['input_path', 'x', 'y', 'text']
    }
  },
  {
    name: 'blur_area',
    description: 'Blur a rectangular area to hide sensitive information.',
    inputSchema: {
      type: 'object',
      properties: {
        input_path: { type: 'string' },
        output_path: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        intensity: { type: 'number', description: 'Blur intensity (default: 8)' }
      },
      required: ['input_path', 'x', 'y', 'width', 'height']
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
      case 'highlight_area':
        return await handleHighlight(args);
      case 'add_callout':
        return await handleCallout(args);
      case 'blur_area':
        return await handleBlur(args);
      case 'open_config_ui':
        return await handleOpenConfigUi(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
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
function getOutputPath(inputPath, suffix = '-annotated') {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  return path.join(dir, `${base}${suffix}${ext}`);
}

// Handlers
async function handleAnnotate(args) {
  const { input_path, output_path, annotations, theme } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const finalPath = output_path || getOutputPath(input_path);
  const result = await annotateImage(input_path, finalPath, annotations, { theme });

  return {
    content: [{
      type: 'text',
      text: `✓ Annotated screenshot saved: ${result.outputPath}\n  Size: ${result.width}x${result.height}\n  Annotations: ${result.annotationCount}${theme ? `\n  Theme: ${theme}` : ''}`
    }]
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
  const { input_path, output_path, steps, connect_steps = true, theme } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

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
    const labelX = step.x + 50;
    const labelY = step.y;

    annotations.push({
      type: 'arrow',
      from: [step.x + 28, step.y],
      to: [labelX - 5, labelY],
      color,
      strokeWidth: 2
    });

    annotations.push({
      type: 'label',
      x: labelX,
      y: labelY + 6,
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
        from: [step.x, step.y + 30],
        to: [next.x, next.y - 30],
        color: 'gray'
      });
    }
  });

  const finalPath = output_path || getOutputPath(input_path, '-guide');
  const result = await annotateImage(input_path, finalPath, annotations, { theme });

  return {
    content: [{
      type: 'text',
      text: `✓ Step guide created: ${result.outputPath}\n  Steps: ${steps.length}`
    }]
  };
}

async function handleHighlight(args) {
  const { input_path, output_path, shape, x, y, width, height, color = 'red', label, label_position = 'right' } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const annotations = [];

  if (shape === 'circle') {
    annotations.push({
      type: 'circle',
      x, y,
      radius: width / 2,
      color,
      strokeWidth: 3
    });
  } else if (shape === 'highlight') {
    annotations.push({
      type: 'highlight',
      x, y,
      width,
      height: height || width,
      color: 'yellow',
      opacity: 0.35
    });
  } else {
    annotations.push({
      type: 'rect',
      x, y,
      width,
      height: height || width,
      color,
      strokeWidth: 3
    });
  }

  if (label) {
    let labelX, labelY;
    const h = height || width;

    switch (label_position) {
      case 'top': labelX = x + width / 2; labelY = y - 10; break;
      case 'bottom': labelX = x + width / 2; labelY = y + h + 20; break;
      case 'left': labelX = x - 10; labelY = y + h / 2; break;
      default: labelX = x + width + 15; labelY = y + h / 2;
    }

    annotations.push({
      type: 'label',
      x: labelX,
      y: labelY,
      text: label,
      color,
      fontSize: 16,
      background: 'white',
      shadow: true
    });
  }

  const finalPath = output_path || getOutputPath(input_path, '-highlighted');
  await annotateImage(input_path, finalPath, annotations);

  return {
    content: [{
      type: 'text',
      text: `✓ Highlighted: ${finalPath}`
    }]
  };
}

async function handleCallout(args) {
  const { input_path, output_path, x, y, text, pointer = 'left', color = 'primary', background = 'white' } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const annotations = [{
    type: 'callout',
    x, y,
    text,
    pointer,
    color,
    background,
    shadow: true
  }];

  const finalPath = output_path || getOutputPath(input_path, '-callout');
  await annotateImage(input_path, finalPath, annotations);

  return {
    content: [{
      type: 'text',
      text: `✓ Callout added: ${finalPath}`
    }]
  };
}

async function handleBlur(args) {
  const { input_path, output_path, x, y, width, height, intensity = 8 } = args;

  if (!fs.existsSync(input_path)) {
    throw new FileNotFoundError(input_path);
  }

  const annotations = [{
    type: 'blur',
    x, y, width, height, intensity
  }];

  const finalPath = output_path || getOutputPath(input_path, '-blurred');
  await annotateImage(input_path, finalPath, annotations);

  return {
    content: [{
      type: 'text',
      text: `✓ Area blurred: ${finalPath}`
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

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
