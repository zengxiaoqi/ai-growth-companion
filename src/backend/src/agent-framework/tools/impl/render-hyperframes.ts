/**
 * RenderHyperframesTool — renders video from HTML+GSAP composition via HyperFrames CLI.
 *
 * Writes the composition HTML to a temp file, executes `npx hyperframes render`,
 * and returns the output video path.
 */

import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type RenderHyperframesArgs = {
  compositionHtml: string;
  outputDir?: string;
  quality?: 'draft' | 'medium' | 'high';
  width?: number;
  height?: number;
};

const DEFAULT_QUALITY = 'draft';
const RENDER_TIMEOUT = 180_000;

@Injectable()
@RegisterTool()
export class RenderHyperframesTool extends BaseTool<RenderHyperframesArgs> {
  private readonly logger = new Logger(RenderHyperframesTool.name);

  readonly metadata: ToolMetadata = {
    name: 'renderHyperframes',
    description: '将 HTML+GSAP 组合内容渲染为视频文件，使用 HyperFrames CLI 执行渲染',
    inputSchema: {
      type: 'object',
      properties: {
        compositionHtml: {
          type: 'string',
          description: '完整的 HTML 组合文件内容（包含 GSAP 动画）',
        },
        outputDir: {
          type: 'string',
          description: '输出目录（可选，默认为临时目录）',
        },
        quality: {
          type: 'string',
          enum: ['draft', 'medium', 'high'],
          description: '渲染质量，默认 draft',
        },
        width: {
          type: 'number',
          description: '视频宽度，默认 1920',
        },
        height: {
          type: 'number',
          description: '视频高度，默认 1080',
        },
      },
      required: ['compositionHtml'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  async execute(args: RenderHyperframesArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const html = args?.compositionHtml;
    if (!html || typeof html !== 'string') {
      return this.fail('compositionHtml is required');
    }

    const quality = args?.quality || DEFAULT_QUALITY;
    const width = Math.max(320, Math.min(3840, args?.width || 1920));
    const height = Math.max(240, Math.min(2160, args?.height || 1080));

    const workDir = path.join(os.tmpdir(), `hyperframes-${Date.now()}`);
    const htmlPath = path.join(workDir, 'composition.html');
    const outputDir = args?.outputDir || path.join(workDir, 'output');

    try {
      // Create workspace
      await fs.mkdir(workDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });

      // Write composition HTML
      await fs.writeFile(htmlPath, html, 'utf-8');

      this.logger.log(
        `Rendering HyperFrames: ${htmlPath} → ${outputDir} (${quality}, ${width}x${height})`,
      );

      // Execute render
      const result = await this.runRender(htmlPath, outputDir, quality, width, height);

      if (result.exitCode !== 0) {
        return this.fail(
          `HyperFrames render failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
        );
      }

      // Find output video file
      const videoPath = await this.findVideoOutput(outputDir);
      if (!videoPath) {
        return this.fail(
          `No video output found in ${outputDir}. stderr: ${result.stderr.slice(0, 300)}`,
        );
      }

      const stat = await fs.stat(videoPath);
      this.logger.log(`Rendered video: ${videoPath} (${stat.size} bytes)`);

      return this.ok({
        videoPath,
        fileSize: stat.size,
        width,
        height,
        quality,
        duration: result.duration,
      });
    } catch (error: unknown) {
      return this.fail(`Render failed: ${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      // Cleanup workspace after a delay
      setTimeout(() => {
        fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }, 5000);
    }
  }

  private runRender(
    htmlPath: string,
    outputDir: string,
    quality: string,
    width: number,
    height: number,
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

      const outputPath = path.join(outputDir, 'video.mp4');

      const proc = spawn(
        'npx',
        [
          'hyperframes',
          'render',
          '--input',
          htmlPath,
          '--output',
          outputPath,
          '--quality',
          quality,
          '--width',
          String(width),
          '--height',
          String(height),
        ],
        {
          shell: true,
          cwd: process.cwd(),
          env: { ...process.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Render timed out after ${RENDER_TIMEOUT}ms`));
      }, RENDER_TIMEOUT);

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

  private async findVideoOutput(dir: string): Promise<string | null> {
    try {
      const files = await fs.readdir(dir);
      const videoFile = files.find((f) => /\.(mp4|webm|mov)$/i.test(f));
      return videoFile ? path.join(dir, videoFile) : null;
    } catch {
      return null;
    }
  }
}
