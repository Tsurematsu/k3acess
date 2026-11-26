import { spawn } from 'node:child_process';

export interface KubectlResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class KubectlError extends Error {
  readonly code: 'NOT_INSTALLED' | 'TIMEOUT' | 'EXECUTION_ERROR' | 'PARSE_ERROR';
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly args: string[];

  constructor(params: {
    message: string;
    code: 'NOT_INSTALLED' | 'TIMEOUT' | 'EXECUTION_ERROR' | 'PARSE_ERROR';
    stderr?: string;
    exitCode?: number | null;
    args: string[];
  }) {
    super(params.message);
    this.name = 'KubectlError';
    this.code = params.code;
    this.stderr = params.stderr ?? '';
    this.exitCode = params.exitCode ?? null;
    this.args = params.args;
  }
}

export async function runKubectl(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<KubectlResult> {
  const timeoutMs = options?.timeoutMs ?? 15_000;

  return new Promise<KubectlResult>((resolve, reject) => {
    const child = spawn('kubectl', args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(
        new KubectlError({
          code: 'TIMEOUT',
          message: `Tiempo agotado (${timeoutMs}ms) ejecutando kubectl ${args.join(' ')}`,
          stderr,
          exitCode: null,
          args,
        }),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(
          new KubectlError({
            code: 'NOT_INSTALLED',
            message: 'No se encontró el binario "kubectl" en el PATH del sistema.',
            stderr: err.message,
            exitCode: null,
            args,
          }),
        );
        return;
      }
      reject(
        new KubectlError({
          code: 'EXECUTION_ERROR',
          message: `Error al invocar kubectl: ${err.message}`,
          stderr: err.message,
          exitCode: null,
          args,
        }),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        const cleanErr = stderr.trim() || stdout.trim() || `Código de salida ${exitCode}`;
        reject(
          new KubectlError({
            code: 'EXECUTION_ERROR',
            message: cleanErr,
            stderr: stderr.trim(),
            exitCode,
            args,
          }),
        );
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

export async function runKubectlJson<T>(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<T> {
  const result = await runKubectl(args, options);
  try {
    return JSON.parse(result.stdout) as T;
  } catch (err) {
    throw new KubectlError({
      code: 'PARSE_ERROR',
      message: `No se pudo interpretar la salida JSON de kubectl: ${
        err instanceof Error ? err.message : String(err)
      }`,
      stderr: result.stderr,
      exitCode: result.exitCode,
      args,
    });
  }
}
