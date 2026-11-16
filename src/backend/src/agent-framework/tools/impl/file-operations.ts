/**
 * FileOperationsTool — safe file read/write for the video generator agent.
 *
 * Provides readFile and writeFile operations within sandboxed directories.
 * Prevents path traversal and enforces file size limits.
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type ReadFileArgs = {
  path: string;
  encoding?: string;
};

type WriteFileArgs = {
  path: string;
  content: string;
  createDirs?: boolean;
};

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_READ_SIZE = 5 * 1024 * 1024; // 5MB
// LLM 网关把 tool 角色消息截断到 ~4096 字符（user/system 不限）。readFile 返回
// 全文时，大文件的结果会被截掉尾部，agent 只看到开头、误以为文件没读完，于是
// 反复 readFile 同一文件陷入死循环（agent-remotion task 8 实测连读 8 次耗尽预算）。
// 这里主动把结果压到网关限额内，并明确告诉 agent 重读无益、改用 writeFile 修改。
const MAX_TOOL_CONTENT = 2800;

@Injectable()
@RegisterTool()
export class ReadFileTool extends BaseTool<ReadFileArgs> {
  private readonly logger = new Logger(ReadFileTool.name);

  readonly metadata: ToolMetadata = {
    name: 'readFile',
    description: '读取指定路径的文件内容，路径必须在允许的工作目录内',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        encoding: {
          type: 'string',
          description: '文件编码，默认 utf-8',
        },
      },
      required: ['path'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  async execute(args: ReadFileArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = this.toText(args?.path);
    if (!filePath) return this.fail('path is required');

    const safety = this.validatePath(filePath);
    if (!safety.safe) return this.fail(`Path rejected: ${safety.reason}`);

    try {
      const resolved = path.resolve(filePath);
      const stat = await fs.stat(resolved);

      if (stat.size > MAX_READ_SIZE) {
        return this.fail(`File too large: ${stat.size} bytes (max ${MAX_READ_SIZE})`);
      }

      const encoding = (args?.encoding || 'utf-8') as BufferEncoding;
      const content = await fs.readFile(resolved, encoding);
      if (content.length > MAX_TOOL_CONTENT) {
        return this.ok({
          path: resolved,
          content: content.slice(0, MAX_TOOL_CONTENT),
          size: stat.size,
          exists: true,
          truncated: true,
          note: `文件共 ${content.length} 字符，网关把工具结果截断到 ~4096，重复 readFile 只会反复看到开头并陷入循环。若此文件是你用 writeFile 写的，完整内容已在你的上下文里——不要重读，直接 writeFile 完整新内容来修改。`,
        });
      }
      return this.ok({
        path: resolved,
        content,
        size: stat.size,
        exists: true,
      });
    } catch (error: unknown) {
      if ((error as any)?.code === 'ENOENT') {
        return this.ok({ path: filePath, content: '', size: 0, exists: false });
      }
      return this.fail(`Read failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private validatePath(filePath: string): { safe: boolean; reason?: string } {
    // Path traversal check
    const normalized = path.normalize(filePath);
    if (normalized.includes('..')) {
      return { safe: false, reason: 'Path traversal detected' };
    }

    // Must be under project root or temp dir
    const resolved = path.resolve(normalized);
    const projectRoot = process.cwd();
    const tmpDir = os.tmpdir();
    // 渲染任务沙箱（remotion 项目在 backend cwd 之外）：与 writeFile 同口径
    if (resolved.includes(`${path.sep}.generated${path.sep}`)) {
      return { safe: true };
    }
    if (!resolved.startsWith(projectRoot) && !resolved.startsWith(tmpDir)) {
      return {
        safe: false,
        reason: 'Path must be within project directory or temp directory',
      };
    }

    return { safe: true };
  }

  private toText(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    return String(value).trim() || fallback;
  }
}

@Injectable()
@RegisterTool()
export class WriteFileTool extends BaseTool<WriteFileArgs> {
  private readonly logger = new Logger(WriteFileTool.name);

  readonly metadata: ToolMetadata = {
    name: 'writeFile',
    description: '将内容写入指定路径的文件，路径必须在允许的工作目录内，文件大小限制 2MB',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' },
        createDirs: {
          type: 'boolean',
          description: '是否自动创建父目录，默认 true',
        },
      },
      required: ['path', 'content'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  async execute(args: WriteFileArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = this.toText(args?.path);
    if (!filePath) return this.fail('path is required');

    const content = args?.content ?? '';
    if (typeof content !== 'string') {
      return this.fail('content must be a string');
    }

    if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE) {
      return this.fail(
        `Content too large: ${Buffer.byteLength(content)} bytes (max ${MAX_FILE_SIZE})`,
      );
    }

    const safety = this.validatePath(filePath);
    if (!safety.safe) return this.fail(`Path rejected: ${safety.reason}`);

    try {
      const resolved = path.resolve(filePath);

      if (args?.createDirs !== false) {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
      }

      await fs.writeFile(resolved, content, 'utf-8');
      const size = Buffer.byteLength(content, 'utf-8');

      this.logger.log(`Wrote ${size} bytes to ${resolved}`);
      return this.ok({ path: resolved, size });
    } catch (error: unknown) {
      return this.fail(`Write failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private validatePath(filePath: string): { safe: boolean; reason?: string } {
    const normalized = path.normalize(filePath);
    if (normalized.includes('..')) {
      return { safe: false, reason: 'Path traversal detected' };
    }

    const resolved = path.resolve(normalized);
    const projectRoot = process.cwd();
    const tmpDir = os.tmpdir();

    if (resolved.startsWith(tmpDir)) {
      return { safe: true };
    }

    if (resolved.includes(`${path.sep}.generated${path.sep}`)) {
      return { safe: true };
    }

    const srcPattern = `${path.sep}src${path.sep}`;
    if (resolved.includes(srcPattern) && /\.(ts|tsx|js|jsx)$/.test(resolved)) {
      return {
        safe: false,
        reason:
          'Writing source code files under src/ is not allowed — file content is passed through memory to the render pipeline',
      };
    }

    if (!resolved.startsWith(projectRoot)) {
      return {
        safe: false,
        reason: 'Path must be within project directory or temp directory',
      };
    }

    return { safe: true };
  }

  private toText(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    return String(value).trim() || fallback;
  }
}
