import { execSync } from 'child_process';
import type { ToolDef } from './types.js';

// ── Execution result ────────────────────────────────────

/**
 * Result of executing code.
 */
export interface ExecutionResult {
  output: string;
  error: string;
  exitCode: number;
  timedOut: boolean;
  readonly success: boolean;
}

/**
 * Create an ExecutionResult with computed `success` getter.
 */
function createExecutionResult(data: {
  output: string;
  error: string;
  exitCode: number;
  timedOut: boolean;
}): ExecutionResult {
  return {
    output: data.output,
    error: data.error,
    exitCode: data.exitCode,
    timedOut: data.timedOut,
    get success(): boolean {
      return data.exitCode === 0 && !data.timedOut;
    },
  };
}

// ── CodeExecutor abstract class ─────────────────────────

/**
 * Abstract base class for code executors.
 */
export abstract class CodeExecutor {
  /**
   * Execute code and return the result.
   */
  abstract execute(code: string, language?: string): ExecutionResult;

  /**
   * Convert this executor into a ToolDef that can be used as an agent tool.
   */
  asTool(name?: string): ToolDef {
    const toolName = name ?? 'code_executor';
    const executor = this;

    return {
      name: toolName,
      description: 'Execute code and return the result',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code to execute' },
          language: { type: 'string', description: 'Programming language' },
        },
        required: ['code'],
      },
      toolType: 'worker',
      func: async (args: Record<string, unknown>) => {
        const code = args.code as string;
        const language = args.language as string | undefined;
        return executor.execute(code, language);
      },
    };
  }
}

// ── LocalCodeExecutor ───────────────────────────────────

/**
 * Execute code locally using child_process.
 */
export class LocalCodeExecutor extends CodeExecutor {
  readonly timeout: number;

  constructor(options?: { timeout?: number }) {
    super();
    this.timeout = (options?.timeout ?? 30) * 1000; // convert to ms
  }

  execute(code: string, language?: string): ExecutionResult {
    const lang = language ?? 'javascript';
    let command: string;

    switch (lang) {
      case 'python':
      case 'python3':
        command = `python3 -c ${JSON.stringify(code)}`;
        break;
      case 'javascript':
      case 'js':
      case 'node':
        command = `node -e ${JSON.stringify(code)}`;
        break;
      case 'bash':
      case 'sh':
        command = `bash -c ${JSON.stringify(code)}`;
        break;
      default:
        command = `${lang} -c ${JSON.stringify(code)}`;
        break;
    }

    try {
      const output = execSync(command, {
        timeout: this.timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return createExecutionResult({
        output: output.trim(),
        error: '',
        exitCode: 0,
        timedOut: false,
      });
    } catch (err: unknown) {
      const execErr = err as {
        status?: number | null;
        killed?: boolean;
        stdout?: string;
        stderr?: string;
        signal?: string;
      };

      const timedOut = execErr.killed === true || execErr.signal === 'SIGTERM';

      return createExecutionResult({
        output: typeof execErr.stdout === 'string' ? execErr.stdout.trim() : '',
        error: typeof execErr.stderr === 'string' ? execErr.stderr.trim() : String(err),
        exitCode: execErr.status ?? 1,
        timedOut,
      });
    }
  }
}

// ── DockerCodeExecutor ──────────────────────────────────

/**
 * Execute code in a Docker container.
 */
export class DockerCodeExecutor extends CodeExecutor {
  readonly image: string;
  readonly timeout: number;
  readonly memoryLimit?: string;

  constructor(options: { image: string; timeout?: number; memoryLimit?: string }) {
    super();
    this.image = options.image;
    this.timeout = (options.timeout ?? 30) * 1000;
    this.memoryLimit = options.memoryLimit;
  }

  execute(code: string, language?: string): ExecutionResult {
    const lang = language ?? 'python';
    let runCmd: string;

    switch (lang) {
      case 'python':
      case 'python3':
        runCmd = `python3 -c ${JSON.stringify(code)}`;
        break;
      case 'javascript':
      case 'js':
      case 'node':
        runCmd = `node -e ${JSON.stringify(code)}`;
        break;
      default:
        runCmd = `${lang} -c ${JSON.stringify(code)}`;
        break;
    }

    const memFlag = this.memoryLimit ? ` --memory=${this.memoryLimit}` : '';
    const command = `docker run --rm${memFlag} ${this.image} ${runCmd}`;

    try {
      const output = execSync(command, {
        timeout: this.timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return createExecutionResult({
        output: output.trim(),
        error: '',
        exitCode: 0,
        timedOut: false,
      });
    } catch (err: unknown) {
      const execErr = err as {
        status?: number | null;
        killed?: boolean;
        stdout?: string;
        stderr?: string;
        signal?: string;
      };

      const timedOut = execErr.killed === true || execErr.signal === 'SIGTERM';

      return createExecutionResult({
        output: typeof execErr.stdout === 'string' ? execErr.stdout.trim() : '',
        error: typeof execErr.stderr === 'string' ? execErr.stderr.trim() : String(err),
        exitCode: execErr.status ?? 1,
        timedOut,
      });
    }
  }
}

// ── JupyterCodeExecutor ─────────────────────────────────

/**
 * Execute code via a Jupyter kernel.
 * Stub implementation — requires jupyter runtime.
 */
export class JupyterCodeExecutor extends CodeExecutor {
  readonly kernelName: string;
  readonly timeout: number;

  constructor(options?: { kernelName?: string; timeout?: number }) {
    super();
    this.kernelName = options?.kernelName ?? 'python3';
    this.timeout = options?.timeout ?? 30;
  }

  execute(_code: string, _language?: string): ExecutionResult {
    return createExecutionResult({
      output: '',
      error: 'JupyterCodeExecutor requires a running Jupyter runtime. Not yet implemented.',
      exitCode: 1,
      timedOut: false,
    });
  }
}

// ── ServerlessCodeExecutor ──────────────────────────────

/**
 * Execute code by POSTing to a serverless endpoint.
 */
export class ServerlessCodeExecutor extends CodeExecutor {
  readonly endpoint: string;
  readonly timeout: number;
  readonly headers: Record<string, string>;

  constructor(options: {
    endpoint: string;
    timeout?: number;
    headers?: Record<string, string>;
  }) {
    super();
    this.endpoint = options.endpoint;
    this.timeout = options.timeout ?? 30;
    this.headers = options.headers ?? {};
  }

  execute(code: string, language?: string): ExecutionResult {
    // Build a synchronous HTTP call via child_process for the sync interface
    const payload = JSON.stringify({ code, language: language ?? 'python' });
    const headerArgs = Object.entries(this.headers)
      .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`)
      .join(' ');

    const command = `curl -s -X POST ${headerArgs} -H "Content-Type: application/json" -d ${JSON.stringify(payload)} --max-time ${this.timeout} ${JSON.stringify(this.endpoint)}`;

    try {
      const output = execSync(command, {
        timeout: this.timeout * 1000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Attempt to parse as JSON response
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>;
        return createExecutionResult({
          output: String(parsed.output ?? parsed.result ?? output),
          error: String(parsed.error ?? ''),
          exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : 0,
          timedOut: false,
        });
      } catch {
        // Plain text response
        return createExecutionResult({
          output: output.trim(),
          error: '',
          exitCode: 0,
          timedOut: false,
        });
      }
    } catch (err: unknown) {
      const execErr = err as {
        status?: number | null;
        killed?: boolean;
        stdout?: string;
        stderr?: string;
        signal?: string;
      };

      const timedOut = execErr.killed === true || execErr.signal === 'SIGTERM';

      return createExecutionResult({
        output: typeof execErr.stdout === 'string' ? execErr.stdout.trim() : '',
        error: typeof execErr.stderr === 'string' ? execErr.stderr.trim() : String(err),
        exitCode: execErr.status ?? 1,
        timedOut,
      });
    }
  }
}
