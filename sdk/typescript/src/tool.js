'use strict';

/**
 * tool() — register a JS function as an agent tool.
 *
 * Attaches a ._toolDef property to the wrapper function containing the
 * resolved tool definition. The function retains its original call signature.
 *
 * @example
 * const getWeather = tool(
 *   async function getWeather({ city }) {
 *     return { city, temperature_f: 72, condition: 'Sunny' }
 *   },
 *   {
 *     description: 'Get current weather for a city.',
 *     inputSchema: {
 *       type: 'object',
 *       properties: { city: { type: 'string' } },
 *       required: ['city'],
 *     },
 *   }
 * )
 */

const TOOL_DEF = Symbol('toolDef');

function tool(fn, options) {
  if (typeof fn !== 'function') {
    throw new TypeError('tool(): first argument must be a function');
  }
  if (!options || !options.description || !options.inputSchema) {
    throw new TypeError('tool(): options must include { description, inputSchema }');
  }

  const toolDef = {
    name: options.name || fn.name || 'unnamed_tool',
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema || null,
    func: fn,
    approvalRequired: options.approvalRequired || false,
    timeoutSeconds: options.timeoutSeconds || null,
    toolType: 'worker',
    config: {},
  };

  async function wrapper(input) {
    return fn(input);
  }

  Object.defineProperty(wrapper, 'name', { value: toolDef.name, configurable: true });
  wrapper[TOOL_DEF] = toolDef;
  wrapper._toolDef = toolDef; // convenience alias for plain JS (no Symbol support needed)

  return wrapper;
}

/**
 * Extract a ToolDef from a tool() wrapper or a raw ToolDef object.
 */
function getToolDef(toolObj) {
  if (typeof toolObj === 'function') {
    const td = toolObj[TOOL_DEF] || toolObj._toolDef;
    if (td) return td;
    throw new TypeError(
      `Function "${toolObj.name || 'unknown'}" is not a registered tool. Wrap it with tool() first.`
    );
  }
  if (toolObj && typeof toolObj === 'object' && toolObj.name && toolObj.toolType) {
    return toolObj; // already a ToolDef
  }
  throw new TypeError(`Invalid tool: ${JSON.stringify(toolObj)}`);
}

/**
 * httpTool() — tool backed by an HTTP endpoint (no local worker needed).
 */
function httpTool({ name, description, url, method = 'GET', headers = {}, inputSchema = {}, accept = ['application/json'], contentType = 'application/json' }) {
  return {
    name,
    description,
    inputSchema,
    outputSchema: null,
    func: null,
    approvalRequired: false,
    timeoutSeconds: null,
    toolType: 'http',
    config: {
      url,
      method: method.toUpperCase(),
      headers,
      accept,
      contentType,
    },
  };
}

/**
 * mcpTool() — tool backed by an MCP server (no local worker needed).
 */
function mcpTool({ name, description, serverUrl, headers = {}, inputSchema = {} }) {
  return {
    name,
    description,
    inputSchema,
    outputSchema: null,
    func: null,
    approvalRequired: false,
    timeoutSeconds: null,
    toolType: 'mcp',
    config: {
      serverUrl,
      headers,
    },
  };
}

// ── Media generation tool helpers ──────────────────────────────────────

function _mediaTool(toolType, taskType, { name, description, llmProvider, model, inputSchema = null, ...defaults }) {
  return {
    name,
    description,
    inputSchema: inputSchema || {},
    outputSchema: null,
    func: null,
    approvalRequired: false,
    timeoutSeconds: null,
    toolType,
    config: { taskType, llmProvider, model, ...defaults },
  };
}

/**
 * imageTool() — generate images via an AI provider (Conductor GENERATE_IMAGE task).
 */
function imageTool({ name, description, llmProvider, model, inputSchema, ...defaults }) {
  return _mediaTool('generate_image', 'GENERATE_IMAGE', {
    name, description, llmProvider, model,
    inputSchema: inputSchema || {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the image to generate.' },
        style: { type: 'string', description: "Image style: 'vivid' or 'natural'." },
        width: { type: 'integer', description: 'Image width in pixels.', default: 1024 },
        height: { type: 'integer', description: 'Image height in pixels.', default: 1024 },
        size: { type: 'string', description: "Image size (e.g. '1024x1024'). Alternative to width/height." },
        n: { type: 'integer', description: 'Number of images to generate.', default: 1 },
        outputFormat: { type: 'string', description: "Output format: 'png', 'jpg', or 'webp'.", default: 'png' },
      },
      required: ['prompt'],
    },
    ...defaults,
  });
}

/**
 * audioTool() — generate audio / text-to-speech (Conductor GENERATE_AUDIO task).
 */
function audioTool({ name, description, llmProvider, model, inputSchema, ...defaults }) {
  return _mediaTool('generate_audio', 'GENERATE_AUDIO', {
    name, description, llmProvider, model,
    inputSchema: inputSchema || {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to convert to speech.' },
        voice: {
          type: 'string',
          description: 'Voice to use.',
          enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
          default: 'alloy',
        },
        speed: { type: 'number', description: 'Speech speed multiplier (0.25 to 4.0).', default: 1.0 },
        responseFormat: { type: 'string', description: "Audio format: 'mp3', 'wav', 'opus', 'aac', or 'flac'.", default: 'mp3' },
        n: { type: 'integer', description: 'Number of audio outputs to generate.', default: 1 },
      },
      required: ['text'],
    },
    ...defaults,
  });
}

/**
 * videoTool() — generate video (Conductor GENERATE_VIDEO task).
 */
function videoTool({ name, description, llmProvider, model, inputSchema, ...defaults }) {
  return _mediaTool('generate_video', 'GENERATE_VIDEO', {
    name, description, llmProvider, model,
    inputSchema: inputSchema || {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the video scene.' },
        inputImage: { type: 'string', description: 'Base64-encoded or URL image for image-to-video generation.' },
        duration: { type: 'integer', description: 'Video duration in seconds.', default: 5 },
        width: { type: 'integer', description: 'Video width in pixels.', default: 1280 },
        height: { type: 'integer', description: 'Video height in pixels.', default: 720 },
        fps: { type: 'integer', description: 'Frames per second.', default: 24 },
        outputFormat: { type: 'string', description: "Video format (e.g. 'mp4').", default: 'mp4' },
        style: { type: 'string', description: "Video style (e.g. 'cinematic', 'natural')." },
        aspectRatio: { type: 'string', description: "Aspect ratio (e.g. '16:9', '1:1')." },
        n: { type: 'integer', description: 'Number of videos to generate.', default: 1 },
      },
      required: ['prompt'],
    },
    ...defaults,
  });
}

/**
 * pdfTool() — generate PDFs from markdown (Conductor GENERATE_PDF task).
 * No AI provider needed — Conductor converts markdown directly.
 */
function pdfTool({ name = 'generate_pdf', description = 'Generate a PDF document from markdown text.', inputSchema, ...defaults } = {}) {
  return {
    name,
    description,
    inputSchema: inputSchema || {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown text to convert to PDF.' },
        pageSize: { type: 'string', description: 'Page size: A4, LETTER, LEGAL, A3, or A5.', default: 'A4' },
        theme: { type: 'string', description: "Style preset: 'default' or 'compact'.", default: 'default' },
        baseFontSize: { type: 'number', description: 'Base font size in points.', default: 11 },
      },
      required: ['markdown'],
    },
    outputSchema: null,
    func: null,
    approvalRequired: false,
    timeoutSeconds: null,
    toolType: 'generate_pdf',
    config: { taskType: 'GENERATE_PDF', ...defaults },
  };
}

// ── RAG tool constructors ───────────────────────────────────────────────

/**
 * indexTool() — index documents into a vector database (Conductor LLM_INDEX_TEXT task).
 */
function indexTool({ name, description, vectorDb, index, embeddingModelProvider, embeddingModel, namespace = 'default_ns', chunkSize, chunkOverlap, dimensions, inputSchema } = {}) {
  const config = {
    taskType: 'LLM_INDEX_TEXT',
    vectorDB: vectorDb,
    namespace,
    index,
    embeddingModelProvider,
    embeddingModel,
  };
  if (chunkSize != null) config.chunkSize = chunkSize;
  if (chunkOverlap != null) config.chunkOverlap = chunkOverlap;
  if (dimensions != null) config.dimensions = dimensions;

  return {
    name,
    description,
    inputSchema: inputSchema || {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text content to index.' },
        docId: { type: 'string', description: 'Unique document identifier.' },
        metadata: { type: 'object', description: 'Optional metadata to store with the document.' },
      },
      required: ['text', 'docId'],
    },
    outputSchema: null,
    func: null,
    approvalRequired: false,
    timeoutSeconds: null,
    toolType: 'rag_index',
    config,
  };
}

/**
 * searchTool() — search a vector database (Conductor LLM_SEARCH_INDEX task).
 */
function searchTool({ name, description, vectorDb, index, embeddingModelProvider, embeddingModel, namespace = 'default_ns', maxResults = 5, dimensions, inputSchema } = {}) {
  const config = {
    taskType: 'LLM_SEARCH_INDEX',
    vectorDB: vectorDb,
    namespace,
    index,
    embeddingModelProvider,
    embeddingModel,
    maxResults,
  };
  if (dimensions != null) config.dimensions = dimensions;

  return {
    name,
    description,
    inputSchema: inputSchema || {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query.' },
      },
      required: ['query'],
    },
    outputSchema: null,
    func: null,
    approvalRequired: false,
    timeoutSeconds: null,
    toolType: 'rag_search',
    config,
  };
}

// ── Agent-as-tool ───────────────────────────────────────────────────────

/**
 * agentTool() — wrap an Agent as a callable tool (invoked as a sub-workflow).
 */
function agentTool(agent, { name, description, retryCount, retryDelaySeconds, optional } = {}) {
  const agentName = agent.name;
  const config = { agent };
  if (retryCount != null) config.retryCount = retryCount;
  if (retryDelaySeconds != null) config.retryDelaySeconds = retryDelaySeconds;
  if (optional != null) config.optional = optional;

  return {
    name: name || agentName,
    description: description || `Invoke the ${agentName} agent`,
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'The request or question to send to this agent.' },
      },
      required: ['request'],
    },
    outputSchema: null,
    func: null,
    approvalRequired: false,
    timeoutSeconds: null,
    toolType: 'agent_tool',
    config,
  };
}

module.exports = {
  tool, getToolDef, httpTool, mcpTool,
  imageTool, audioTool, videoTool, pdfTool,
  indexTool, searchTool, agentTool,
  TOOL_DEF,
};
