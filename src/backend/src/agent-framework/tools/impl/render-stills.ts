/**
 * RenderStillsTool — agent-remotion 闭环的"渲染静帧"面。
 *
 * 创作 agent 写完 GeneratedLesson.tsx 后调它渲 beat 边界静帧，再调 visualQa
 * 看帧修代码。契约校验先于渲染（静态禁项 + 真 tsc），违例错误回喂 agent。
 * 每个任务目录最多 3 轮静帧（首渲 + ≤2 轮修复），预算红线在工具层强制执行。
 */

import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { validateAuthorTaskDir } from '../../../modules/learning/video/author-contract';

type RenderStillsArgs = {
  taskDir: string;
  compositionId: string;
  frames: number[];
};

const MAX_STILLS_ROUNDS = 3;
const MAX_FRAMES_PER_ROUND = 6;
const STILL_TIMEOUT = 180_000;

@Injectable()
@RegisterTool()
export class RenderStillsTool extends BaseTool<RenderStillsArgs> {
  private readonly logger = new Logger(RenderStillsTool.name);
  private readonly roundsByDir = new Map<string, number>();

  readonly metadata: ToolMetadata = {
    name: 'renderStills',
    description:
      '渲染当前 GeneratedLesson.tsx 的指定帧静帧（先过契约校验）。用于自检画面：渲帧→visualQa→修代码。每个任务最多 3 轮。',
    inputSchema: {
      type: 'object',
      properties: {
        taskDir: {
          type: 'string',
          description: '任务目录绝对路径（.generated/remotion-tasks/<task>，服务层在任务提示里给出）',
        },
        compositionId: { type: 'string', description: 'composition ID（任务提示里给出）' },
        frames: {
          type: 'array',
          items: { type: 'number' },
          description: '要渲染的帧号（0 起），最多 6 个；选 beat 中段而非转场边界',
        },
      },
      required: ['taskDir', 'compositionId', 'frames'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  async execute(args: RenderStillsArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const taskDir = path.resolve(String(args?.taskDir || ''));
    const compositionId = String(args?.compositionId || '').trim();
    if (!taskDir || !compositionId) return this.fail('taskDir and compositionId are required');
    if (!taskDir.includes(`${path.sep}.generated${path.sep}remotion-tasks${path.sep}`)) {
      return this.fail('taskDir must be a .generated/remotion-tasks/<task> directory');
    }
    const frames = (Array.isArray(args?.frames) ? args.frames : [])
      .map((n) => Math.trunc(Number(n)))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .slice(0, MAX_FRAMES_PER_ROUND);
    if (!frames.length) return this.fail('frames must be a non-empty array of frame numbers');

    const used = this.roundsByDir.get(taskDir) || 0;
    if (used >= MAX_STILLS_ROUNDS) {
      return this.fail(
        `stills budget exhausted (${MAX_STILLS_ROUNDS} rounds). Finalize your answer now; do not render again.`,
      );
    }

    const remotionDir = this.findRemotionRoot();
    if (!remotionDir) return this.fail('Remotion project not found');

    const contract = await validateAuthorTaskDir(taskDir, remotionDir);
    if (!contract.ok) {
      return this.fail(`contract violation, fix GeneratedLesson.tsx:\n${contract.errors.join('\n')}`);
    }

    this.roundsByDir.set(taskDir, used + 1);
    const stillsDir = path.join(taskDir, 'stills');
    await fs.mkdir(stillsDir, { recursive: true });
    const entryPath = path.join(taskDir, 'index.ts');
    const propsPath = path.join(taskDir, 'props.json');

    const out: string[] = [];
    for (const frame of frames) {
      const file = path.join(stillsDir, `round${used + 1}-f${frame}.png`);
      const run = await this.runStill(entryPath, compositionId, file, frame, propsPath, remotionDir);
      if (run.exitCode !== 0 || !existsSync(file)) {
        return this.fail(`remotion still failed at frame ${frame}: ${run.stderr.slice(0, 400)}`);
      }
      out.push(file);
    }

    this.logger.log(`[renderStills] ${taskDir} round ${used + 1}: ${out.length} frames`);
    return this.ok({
      frames: out,
      roundsUsed: used + 1,
      roundsLeft: MAX_STILLS_ROUNDS - used - 1,
    });
  }

  private runStill(
    entryPath: string,
    compositionId: string,
    outPath: string,
    frame: number,
    propsPath: string,
    remotionDir: string,
  ): Promise<{ exitCode: number; stderr: string }> {
    // 与 RemotionRenderService.buildRemotionCliInvocation 同口径：node 直跑
    // remotion-cli.js。npx 在 Windows 上首次解析可挂起 >2min，且 shell:true
    // 对含空格路径有引号问题。
    const cliPath = path.join(remotionDir, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
    if (!existsSync(cliPath)) {
      return Promise.resolve({ exitCode: 1, stderr: `remotion cli not found at ${cliPath}` });
    }
    const chromePath = process.env.CHROME_PATH;
    return new Promise((resolve) => {
      let stderr = '';
      let settled = false;
      const proc = spawn(
        process.execPath,
        [
          cliPath,
          'still',
          entryPath,
          compositionId,
          outPath,
          `--frame=${frame}`,
          `--props=${propsPath}`,
          '--log=error',
          ...(chromePath && existsSync(chromePath) ? [`--browser-executable=${chromePath}`] : []),
        ],
        { cwd: remotionDir, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const done = (exitCode: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode, stderr });
      };
      const timer = setTimeout(() => {
        this.logger.warn(`[renderStills] timeout frame=${frame} pid=${proc.pid}`);
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 2000);
        done(1);
      }, STILL_TIMEOUT);
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('error', (err) => {
        stderr += String(err?.message || err);
        done(1);
      });
      proc.on('close', (code) => done(code ?? 1));
    });
  }

  private findRemotionRoot(): string | null {
    const candidates = [
      path.join(process.cwd(), 'video-remotion'),
      path.join(process.cwd(), 'src', 'video-remotion'),
      path.join(process.cwd(), '..', 'video-remotion'),
    ];
    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    }
    return null;
  }
}