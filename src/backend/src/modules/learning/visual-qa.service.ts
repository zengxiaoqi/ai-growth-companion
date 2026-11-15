import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { extractJsonObject } from '../../agent-framework/core';

export type QaFixTarget = 'dsl' | 'code' | 'asset';
export type QaSeverity = 'blocker' | 'major' | 'minor';

export type VisualQaIssue = {
  sceneId: string;
  beatIndex?: number;
  issue: string;
  severity: QaSeverity;
  fixTarget: QaFixTarget;
  fixHint: string;
};

export type SceneQaInput = {
  sceneId: string;
  title?: string;
  /** 该场景旁白全文；抽帧对应其中正在讲的句子 */
  narration: string;
  onScreenText?: string;
  /** 帧文件绝对路径，按时间顺序 */
  frames: string[];
};

export type SceneQaResult = {
  sceneId: string;
  score: number;
  summary: string;
  issues: VisualQaIssue[];
};

export type VisualQaVerdict = {
  score: number;
  passed: boolean;
  model: string;
  framesReviewed: number;
  perScene: SceneQaResult[];
  issues: VisualQaIssue[];
};

const VALID_SEVERITY = new Set<QaSeverity>(['blocker', 'major', 'minor']);
const VALID_FIX_TARGET = new Set<QaFixTarget>(['dsl', 'code', 'asset']);

/**
 * 视觉质检：把成片/静帧交给 vision 模型，按"画面↔旁白、焦点、可读性、年龄节奏、
 * domain 一致"五条 rubric 打分并给出可执行修复建议。是生产闭环的"眼睛"。
 */
@Injectable()
export class VisualQaService {
  private readonly logger = new Logger(VisualQaService.name);
  private readonly repoRoot = path.resolve(__dirname, '../../../../..');

  constructor(private readonly llmClient: LlmClientService) {}

  get isConfigured(): boolean {
    return Boolean(this.llmClient.visionModel);
  }

  get passScore(): number {
    const raw = Number(process.env.VIDEO_QA_PASS_SCORE);
    return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : 70;
  }

  /** 从 mp4 按给定秒数抽帧，返回 png 绝对路径（与入参同序）。 */
  async extractFrames(videoPath: string, timesSec: number[], outDir: string): Promise<string[]> {
    const ffmpeg = this.ffmpegPath();
    if (!ffmpeg) throw new Error('ffmpeg not available (ffmpeg-static / FFMPEG_PATH)');
    await fs.mkdir(outDir, { recursive: true });
    const out: string[] = [];
    for (let i = 0; i < timesSec.length; i += 1) {
      const file = path.join(outDir, `frame-${String(i).padStart(2, '0')}.png`);
      await this.runFfmpeg(ffmpeg, [
        '-y',
        '-i',
        videoPath,
        '-ss',
        String(Math.max(0, timesSec[i])),
        '-frames:v',
        '1',
        '-q:v',
        '2',
        file,
      ]);
      out.push(file);
    }
    return out;
  }

  /** 场景内采样时刻：避开转场重叠区，取每个 beat 的中段。 */
  sceneSampleTimes(startSec: number, durationSec: number, samples = 2): number[] {
    const times: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const frac = (i + 0.5) / samples;
      times.push(startSec + durationSec * frac);
    }
    return times;
  }

  /** 逐场景评审并汇总。vision 未配置或调用失败时抛错，由调用方决定兜底（不静默）。 */
  async reviewVideo(input: {
    topic: string;
    domain?: string;
    ageGroup?: string;
    scenes: SceneQaInput[];
    persistDir?: string;
  }): Promise<VisualQaVerdict> {
    if (!this.isConfigured) {
      throw new Error('vision model not configured (set LLM_VISION_MODEL)');
    }
    const model = this.llmClient.visionModel as string;
    const perScene: SceneQaResult[] = [];
    let framesReviewed = 0;

    for (const scene of input.scenes) {
      const result = await this.reviewScene(scene, input, model);
      perScene.push(result);
      framesReviewed += scene.frames.length;
    }

    const issues = perScene.flatMap((s) => s.issues);
    const score = perScene.length
      ? Math.round(perScene.reduce((sum, s) => sum + s.score, 0) / perScene.length)
      : 0;
    const hasBlocker = issues.some((i) => i.severity === 'blocker');
    const verdict: VisualQaVerdict = {
      score,
      passed: score >= this.passScore && !hasBlocker,
      model,
      framesReviewed,
      perScene,
      issues,
    };

    if (input.persistDir) {
      await fs.mkdir(input.persistDir, { recursive: true });
      await fs.writeFile(
        path.join(input.persistDir, 'verdict.json'),
        JSON.stringify(verdict, null, 2),
        'utf-8',
      );
    }
    this.logger.log(
      `[VisualQa] topic="${input.topic}" score=${score} passed=${verdict.passed} issues=${issues.length} frames=${framesReviewed} model=${model}`,
    );
    return verdict;
  }

  /** 默认落盘目录：storage/qa/<taskId>/ */
  qaDir(taskId: string | number): string {
    return path.join(this.repoRoot, 'storage', 'qa', String(taskId));
  }

  private async reviewScene(
    scene: SceneQaInput,
    ctx: { topic: string; domain?: string; ageGroup?: string },
    model: string,
  ): Promise<SceneQaResult> {
    const images = await Promise.all(
      scene.frames.map(async (f) => ({
        data: (await fs.readFile(f)).toString('base64'),
        mimeType: 'image/png',
      })),
    );

    const prompt = [
      `课程主题：${ctx.topic}${ctx.domain ? `（domain=${ctx.domain}）` : ''}`,
      `目标年龄：${ctx.ageGroup || '5-6'} 岁`,
      `场景：${scene.title || scene.sceneId}`,
      `该场景旁白（画面必须与它对应）：${scene.narration}`,
      scene.onScreenText ? `屏幕文字：${scene.onScreenText}` : '',
      `以上 ${images.length} 张帧按时间顺序来自该场景。`,
      '请按 rubric 评审并只输出 JSON。',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.llmClient.chatCompletion(
      [
        { role: 'system', content: this.rubricPrompt() },
        { role: 'user', content: prompt, images },
      ],
      undefined,
      4096,
      undefined,
      model,
      { temperature: 0.2 },
    );

    const parsed = extractJsonObject<Record<string, any>>(response.content ?? '');
    if (!parsed) {
      throw new Error(`VisualQa scene ${scene.sceneId}: vision returned no JSON`);
    }
    return this.sanitizeSceneResult(parsed, scene.sceneId);
  }

  private rubricPrompt(): string {
    return [
      '你是儿童教学视频的视觉质检员。输入是一个场景的若干连续帧 + 该场景旁白。',
      '按以下五条 rubric 评审（3-6 岁儿童教学视频标准）：',
      '1. 画面↔旁白对应：旁白正在讲的主体必须出现在画面里，且是视觉焦点；图文不符是 blocker。',
      '2. 焦点：被讲解的元素应有强调（放大/高亮/居中/描边圈），其余元素退后；无焦点记 major。',
      '3. 可读性：白底上看不见的白/浅色元素、过细的线、标签压住图形、文字溢出或堆叠，记 major/blocker。',
      '4. 年龄节奏：3-4 岁每帧单焦点、元素稀疏、幅度大；5-6 岁可稍密但仍清晰。过密/过快记 minor/major。',
      '5. domain 一致：科学/数学等场景退化成纯文字卡片（无图形示意）记 blocker。',
      '',
      '只输出严格 JSON，格式：',
      '{"score":0-100,"summary":"一句话总评","issues":[{"issue":"问题描述","severity":"blocker|major|minor","fixTarget":"dsl|code|asset","fixHint":"可执行修复建议"}]}',
      'fixTarget 含义：dsl=改分镜/编排参数可修；code=需改渲染组件；asset=需换/补素材。',
      '没有问题的场景 issues 为空数组，score 给 90+。不要输出 JSON 以外的文字。',
    ].join('\n');
  }

  private sanitizeSceneResult(raw: Record<string, any>, sceneId: string): SceneQaResult {
    const scoreRaw = Number(raw?.score);
    const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
    const issues: VisualQaIssue[] = Array.isArray(raw?.issues)
      ? raw.issues
          .filter((i: any) => i && typeof i === 'object' && typeof i.issue === 'string')
          .map((i: any) => ({
            sceneId,
            beatIndex: Number.isFinite(Number(i.beatIndex)) ? Number(i.beatIndex) : undefined,
            issue: String(i.issue).slice(0, 300),
            severity: VALID_SEVERITY.has(i.severity) ? i.severity : 'major',
            fixTarget: VALID_FIX_TARGET.has(i.fixTarget) ? i.fixTarget : 'dsl',
            fixHint: String(i.fixHint || '').slice(0, 300),
          }))
      : [];
    return {
      sceneId,
      score,
      summary: String(raw?.summary || '').slice(0, 300),
      issues,
    };
  }

  private ffmpegPath(): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const p = require('ffmpeg-static');
      if (typeof p === 'string' && p.trim()) return p;
    } catch {
      // continue
    }
    const fromEnv = String(process.env.FFMPEG_PATH || '').trim();
    return fromEnv || null;
  }

  private runFfmpeg(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      let stderr = '';
      child.stderr?.on('data', (c: Buffer | string) => {
        stderr += String(c);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });
  }
}