const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const {
  AnnotationError,
  FileNotFoundError,
  InvalidParameterError,
  ImageProcessingError,
  AnnotationTypeError,
  ValidationError
} = require('../annotate-errors');
const { tools } = require('./tools');
const {
  getOutputPath,
  handleAnnotate,
  handleDimensions,
  handleStepGuide,
  estimateDimensionsFromAnnotations,
  remapAnnotation,
  handleReannotate
} = require('./handlers');
const { cleanupConfigServer, handleOpenConfigUi } = require('./config-ui');

const server = new Server(
  {
    name: 'image-annotator',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
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
      case 'reannotate_screenshot':
        return await handleReannotate(args);
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

process.on('exit', cleanupConfigServer);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Image Annotator MCP Server v1.0.0 running...');
}

module.exports = {
  tools,
  getOutputPath,
  handleAnnotate,
  handleDimensions,
  handleStepGuide,
  handleOpenConfigUi,
  handleReannotate,
  estimateDimensionsFromAnnotations,
  remapAnnotation,
  main,
  server
};
