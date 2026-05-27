/**
 * ExecuteCommandTool — safe command execution for the video generator agent.
 *
 * Executes whitelisted CLI commands in a sandboxed working directory.
 * Prevents dangerous operations via command allowlist and argument validation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type ExecuteCommandArgs = {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
};

const DEFAULT_TIMEOUT = 120_000;
const MAX_TIMEOUT = 300_000;

/** Base commands that are always allowed */
const ALLOWED_BASE_COMMANDS = new Set([
  'npx',
  'node',
  'npm',
  'ls',
  'cat',
  'mkdir',
  'cp',
  'mv',
  'echo',
  'pwd',
]);

/** npx packages that are allowed */
const ALLOWED_NPX_PACKAGES = new Set(['hyperframes', 'remotion']);

@Injectable()
@RegisterTool()
export class ExecuteCommandTool extends BaseTool<ExecuteCommandArgs> {
  private readonly logger = new Logger(ExecuteCommandTool.name);

  readonly metadata: ToolMetadata = {
    name: 'executeCommand',
    description:
      '执行白名单内的CLI命令（如 npx hyperframes render, npx remotion render, node, npm 等）',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: "要执行的命令（如 'npx', 'node', 'ls'）",
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: '命令参数列表',
        },
        cwd: {
          type: 'string',
          description: '工作目录（可选，默认为临时目录）',
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒），默认 120000，最大 300000',
        },
      },
      required: ['command'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  async execute(args: ExecuteCommandArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const command = this.toText(args?.command);
    if (!command) return this.fail('command is required');

    const safetyCheck = this.validateCommandSafety(command, args?.args);
    if (!safetyCheck.safe) {
      return this.fail(`Command rejected: ${safetyCheck.reason}`);
    }

    const cmdArgs = Array.isArray(args?.args) ? args.args! : [];
    const timeout = Math.max(
      1000,
      Math.min(MAX_TIMEOUT, this.toSafeInt(args?.timeout, DEFAULT_TIMEOUT)),
    );
    const cwd = this.resolveWorkDir(args?.cwd);

    this.logger.log(`Executing: ${command} ${cmdArgs.join(' ')}`);

    try {
      const result = await this.runCommand(command, cmdArgs, cwd, timeout);
      return this.ok({
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 5000),
        stderr: result.stderr.slice(0, 2000),
        duration: result.duration,
      });
    } catch (error: unknown) {
      return this.fail(
        `Command execution failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private validateCommandSafety(
    command: string,
    args?: string[],
  ): { safe: boolean; reason?: string } {
    const baseCmd = path.basename(command).toLowerCase();

    if (!ALLOWED_BASE_COMMANDS.has(baseCmd)) {
      return {
        safe: false,
        reason: `Command '${baseCmd}' is not in the allowlist. Allowed: ${Array.from(ALLOWED_BASE_COMMANDS).join(', ')}`,
      };
    }

    if (baseCmd === 'npx' && args && args.length > 0) {
      const pkg = args[0]?.toLowerCase();
      if (!ALLOWED_NPX_PACKAGES.has(pkg)) {
        return {
          safe: false,
          reason: `npx package '${pkg}' is not allowed. Allowed packages: ${Array.from(ALLOWED_NPX_PACKAGES).join(', ')}`,
        };
      }
    }

    // Check for dangerous patterns in args
    const allArgs = (args || []).join(' ');
    const dangerousPatterns = [
      /sudo/i,
      />\s*\//i,
      /rm\s+-rf\s+\//i,
      /\|\s*sh\b/i,
      /\|\s*bash\b/i,
      /`.*`/,
      /\$\(.*\)/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(allArgs)) {
        return {
          safe: false,
          reason: `Dangerous pattern detected in arguments`,
        };
      }
    }

    return { safe: true };
  }

  private resolveWorkDir(cwd?: string): string {
    if (cwd) {
      const resolved = path.resolve(cwd);
      // Only allow paths under project or temp directories
      const projectRoot = process.cwd();
      const tmpDir = os.tmpdir();
      if (resolved.startsWith(projectRoot) || resolved.startsWith(tmpDir)) {
        return resolved;
      }
    }
    return path.join(os.tmpdir(), 'video-gen-workspace');
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeout: number,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
  }> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let stdout = '';
      let stderr = '';

      const proc = spawn(command, args, {
        cwd,
        shell: true,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          duration: Date.now() - start,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private toText(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    return String(value).trim() || fallback;
  }

  private toSafeInt(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }
}
