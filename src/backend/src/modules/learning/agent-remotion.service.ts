/**
 * AgentRemotionService — agent-remotion 质量引擎。
 *
 * 单代码路径：服务层预置 contract.ts / index.ts / Root.tsx / props.json（含 TTS
 * 与素材解析，复用 dynamic-remotion 的场景规范化），创作 agent 只写
 * GeneratedLesson.tsx；stills→visualQa→修代码闭环在工具层限 3 轮；全量渲染走
 * RemotionRenderService.renderPreparedComposition（与确定性引擎同一渲染原语）。
 * 任何失败都 throw 回队列落引擎兜底，不静默。
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { AgentExecutorService } from '../../agent-framework/agents/agent-executor.service';
import { ToolRegistryService } from '../../agent-framework/tools/tool-registry.service';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { extractJsonObject, type AgentContext, type LlmMessage } from '../../agent-framework/core';
import { videoAuthorDefinition } from '../../agent-framework/agents/definitions/video-author.agent';
import type { VideoStoryboard } from '../../agent-framework/tools/impl/generate-video-content';
import type { VideoGenerationTask } from '../../database/entities/video-generation-task.entity';
import { RemotionRenderService } from './remotion-render.service';
import { buildSceneTimeline, type SceneTimelineEntry } from './visual-qa.service';
import { VideoGenerationAgentService } from './video-generation-agent.service';
import {
  AUTHOR_CONTRACT_TS,
  AUTHOR_INDEX_TS,
  buildAuthorRootTsx,
  validateAuthorTaskDir,
  type AuthorLessonProps,
  type AuthorScene,
} from './video/author-contract';

@Injectable()
export class AgentRemotionService {
  private readonly logger = new Logger(AgentRemotionService.name);

  private readonly authorTimeoutMs = this.intEnv(
    'AGENT_REMOTION_TIMEOUT_MS',
    10 * 60 * 1000,
    60_000,
    30 * 60 * 1000,
  );
  private readonly authorMaxTokens = this.intEnv('LLM_AUTHOR_MAX_TOKENS', 32000, 4096, 128000);

  constructor(
    private readonly executor: AgentExecutorService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly llmClient: LlmClientService,
    private readonly remotionRender: RemotionRenderService,
    private readonly videoGenerationAgent: VideoGenerationAgentService,
  ) {}

  get isAvailable(): boolean {
    return process.env.VIDEO_AGENT_REMOTION !== 'off' && this.llmClient.isConfigured;
  }

  /**
   * 创作 + 校验 + 全量渲染，mp4 落在 outputPath（留给队列做终检 QA）。
   * 返回 stillsRounds 供 task 行记录自检轮数。
   */
  async renderToVideo(
    task: VideoGenerationTask,
    payload: Record<string, any>,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<{ stillsRounds: number; sceneTimeline: SceneTimelineEntry[] }> {
    const topic = String(payload?.topic || '');
    const storyboard = payload?.__storyboard as VideoStoryboard | undefined;
    if (!topic || !Array.isArray(storyboard?.scenes) || !storyboard.scenes.length) {
      throw new Error('agent-remotion: missing topic or storyboard');
    }

    const remotionDir = this.remotionRender.remotionProjectDir;
    const taskName = `task-${task.id}-${Date.now()}`;
    const taskDir = path.join(remotionDir, '.generated', 'remotion-tasks', taskName);
    const publicTaskDir = path.join(remotionDir, 'public', '.generated', 'remotion-tasks', taskName);
    const publicTaskRel = `.generated/remotion-tasks/${taskName}`;
    const compositionId = `AgentLesson${task.id}`;
    const preserve = process.env.REMOTION_PRESERVE_FAILED_TASK_DIR === 'true';

    let ownsDirs = false;
    try {
      await fs.mkdir(taskDir, { recursive: true });
      await fs.mkdir(publicTaskDir, { recursive: true });
      ownsDirs = true;

      const props = await this.buildProps(task, payload, storyboard, publicTaskDir, publicTaskRel);
      await fs.writeFile(path.join(taskDir, 'contract.ts'), AUTHOR_CONTRACT_TS, 'utf-8');
      await fs.writeFile(path.join(taskDir, 'index.ts'), AUTHOR_INDEX_TS, 'utf-8');
      await fs.writeFile(
        path.join(taskDir, 'Root.tsx'),
        buildAuthorRootTsx(compositionId, props.durationFrames),
        'utf-8',
      );
      await fs.writeFile(path.join(taskDir, 'props.json'), JSON.stringify(props), 'utf-8');

      const { stillsRounds } = await this.runAuthorLoop(task, props, taskDir, compositionId);

      const contract = await validateAuthorTaskDir(taskDir, remotionDir);
      if (!contract.ok) {
        throw new Error(`author contract failed after loop:\n${contract.errors.join('\n')}`);
      }

      // 目录清理交给 renderPreparedComposition 的 finally（成功/失败都清）
      ownsDirs = false;
      await this.remotionRender.renderPreparedComposition(
        taskDir,
        compositionId,
        outputPath,
        onProgress,
      );
      return { stillsRounds, sceneTimeline: buildSceneTimeline(props.scenes) };
    } catch (err) {
      if (ownsDirs) {
        if (preserve) {
          this.logger.warn(
            `[agent-remotion] taskId=${task.id} REMOTION_PRESERVE_FAILED_TASK_DIR=true — keeping ${taskDir}`,
          );
        } else {
          await fs.rm(taskDir, { recursive: true, force: true }).catch(() => {});
          await fs.rm(publicTaskDir, { recursive: true, force: true }).catch(() => {});
        }
      }
      throw err;
    }
  }

  /** 分镜 → AuthorLessonProps：场景规范化/素材解析/TTS 全部复用既有服务。 */
  private async buildProps(
    task: VideoGenerationTask,
    payload: Record<string, any>,
    storyboard: VideoStoryboard,
    publicTaskDir: string,
    publicTaskRel: string,
  ): Promise<AuthorLessonProps> {
    const ageGroup = payload?.ageGroup === '3-4' ? '3-4' : '5-6';
    const built = await this.videoGenerationAgent.buildDynamicSceneProps(storyboard, payload);
    const theme = (storyboard as any)?.visualTheme || {};
    const rawScenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];

    const scenes: AuthorScene[] = [];
    for (let i = 0; i < built.length; i += 1) {
      const s = built[i];
      const narration = String(s.narration || '');
      let narrationSrc = '';
      let durationFrames = Number(s.durationFrames) || 180;

      if (narration) {
        const audio = await this.remotionRender.tryGenerateNarrationAudio(
          narration,
          s.title || `scene-${i + 1}`,
        );
        if (audio) {
          const hash = createHash('sha1').update(`${i}:${narration}`).digest('hex').slice(0, 12);
          const filename = `narration-${i + 1}-${hash}.mp3`;
          await fs.writeFile(path.join(publicTaskDir, filename), audio.buffer);
          narrationSrc = `${publicTaskRel}/${filename}`;
          // 语音为准 + 1s 收尾，避免画面先于配音切走
          durationFrames = Math.max(durationFrames, audio.durationFrames + 30);
        } else {
          this.logger.warn(
            `[agent-remotion] taskId=${task.id} scene ${i + 1} TTS failed — scene stays silent`,
          );
        }
      }

      scenes.push({
        id: String(s.id || `scene-${i + 1}`),
        title: String(s.title || ''),
        narration,
        narrationSrc,
        onScreenText: String(s.onScreenText || ''),
        visualDescription: s.visualDescription ? String(s.visualDescription) : undefined,
        durationFrames,
        accentColor: String(s.accentColor || '#00B4D8'),
        beats: Array.isArray(rawScenes[i]?.beats) ? rawScenes[i].beats : [],
        figure: s.figure || undefined,
        sceneGraph: s.sceneGraph || undefined,
        characterSrc: s.visualAssets?.characterAssetSrc || undefined,
        backgroundSrc: s.visualAssets?.backgroundAssetSrc || undefined,
        overlaySrcs: Array.isArray(s.visualAssets?.overlayAssetSrc)
          ? s.visualAssets.overlayAssetSrc
          : undefined,
        graphIcons: s.graphIcons && Object.keys(s.graphIcons).length ? s.graphIcons : undefined,
      });
    }

    return {
      title: String((storyboard as any)?.title || payload?.topic || ''),
      topic: String(payload?.topic || (storyboard as any)?.topic || ''),
      domain: String(payload?.domain || (storyboard as any)?.domain || 'science'),
      ageGroup,
      fps: 30,
      durationFrames: scenes.reduce((sum, s) => sum + s.durationFrames, 0),
      accentColor: /^#[0-9a-fA-F]{6}$/.test(theme.accentColor) ? theme.accentColor : '#00B4D8',
      backgroundColor: /^#[0-9a-fA-F]{6}$/.test(theme.backgroundColor)
        ? theme.backgroundColor
        : '#E8F8FF',
      scenes,
    };
  }

  /** 创作 agent 主循环：authoring 模型覆盖 + 硬超时（abort）+ 终态 JSON 校验。 */
  private async runAuthorLoop(
    task: VideoGenerationTask,
    props: AuthorLessonProps,
    taskDir: string,
    compositionId: string,
  ): Promise<{ stillsRounds: number }> {
    const controller = new AbortController();
    const context: AgentContext = {
      ageGroup: props.ageGroup === '3-4' ? '3-4' : '5-6',
      conversationId: `video-task-${task.id}`,
      messages: [],
      depth: 0,
      metadata: { authoring: true },
      abortSignal: controller.signal,
    };
    const timer = setTimeout(() => {
      this.logger.warn(
        `[agent-remotion] taskId=${task.id} authoring timed out after ${this.authorTimeoutMs}ms — aborting`,
      );
      controller.abort();
    }, this.authorTimeoutMs);

    const systemPrompt = videoAuthorDefinition.buildSystemPrompt(context);
    const allowed = videoAuthorDefinition.allowedTools || [];
    const toolDefs = this.toolRegistry.getToolDefinitions((tool: any) =>
      allowed.includes(tool.metadata.name),
    );
    const sceneBrief = props.scenes
      .map(
        (s, i) =>
          `${i + 1}. ${s.title} | ${s.durationFrames}帧 | beats=${s.beats.length} | 旁白: ${s.narration}`,
      )
      .join('\n');
    // 网关对 tool 角色消息有 ~4096 字符截断（user/system 无此限制，已探针验证）。
    // props 全文必须走 user 消息内联，否则 agent 只能看到前 2 个场景，
    // 会陷入"找剩余场景文件"的读循环（task 2/3 实测）。
    const userMessage = [
      '请为以下教学视频创作 GeneratedLesson.tsx。',
      `- taskDir: ${taskDir}`,
      `- compositionId: ${compositionId}`,
      `- 主题: ${props.title}（${props.topic}） 领域: ${props.domain} 年龄: ${props.ageGroup}`,
      `- 总时长: ${props.durationFrames} 帧 @30fps，画布 1920×1080`,
      '场景清单:',
      sceneBrief,
      '完整 props（与 taskDir/props.json 一致，直接用这份数据写代码，不需要再读文件）:',
      '```json',
      JSON.stringify(props),
      '```',
      '按系统提示的工作流程执行：loadSkill motion-design → 写代码 → renderStills → visualQa → 修复。最终只回一行 JSON。',
    ].join('\n');

    const startedAt = Date.now();
    let callSeq = 0;
    // 创作闭环节奏闸：writeFile 之后必须 renderStills 验证才允许再写。
    // task 17 实测模型会连续重写 10 次烧光 18 轮预算来不及 finalize。
    const writeState = { pendingWrite: false };
    const toolGuard = (toolName: string, args: Record<string, any>): string | null => {
      if (toolName === 'writeFile') {
        if (!String(args?.content ?? '').trim()) {
          return 'writeFile 被拒绝：content 为空。必须写出包含全部场景、可独立渲染的完整 GeneratedLesson.tsx。';
        }
        if (writeState.pendingWrite) {
          return 'writeFile 被拒绝：上一份代码还未验证。立即调用 renderStills 检查当前文件（契约错误会随结果返回），拿到结果后再决定如何修改，不要连续重写。';
        }
        writeState.pendingWrite = true;
        return null;
      }
      if (toolName === 'renderStills' || toolName === 'visualQa') {
        writeState.pendingWrite = false;
      }
      return null;
    };
    try {
      const result = await this.executor.runLoop(
        systemPrompt,
        [{ role: 'user', content: userMessage }],
        toolDefs,
        videoAuthorDefinition.maxIterations,
        context,
        (event) => {
          callSeq += 1;
          const argBrief =
            event.toolName === 'writeFile'
              ? `path=${String(event.args?.path || '').split(/[\\/]/).pop()} bytes=${String(event.args?.content ?? '').length}`
              : JSON.stringify(event.args ?? {}).slice(0, 160);
          // 诊断类工具把结果摘要也落日志：契约错误/QA verdict 是修代码的依据，
          // 只记长度会让"为什么失败"无从复盘（task 8 排查时吃过这个亏）。
          const resultBrief =
            event.toolName === 'renderStills' || event.toolName === 'visualQa'
              ? ` result=${event.result.slice(0, 400)}`
              : '';
          this.logger.log(
            `[agent-remotion] taskId=${task.id} tool#${callSeq} ${event.toolName}(${argBrief}) → ${event.result.length} chars in ${Date.now() - startedAt}ms${resultBrief}`,
          );
        },
        this.authorMaxTokens,
        this.buildHistoryTransform(taskDir),
        toolGuard,
      );
      // 只计成功渲帧的轮数：契约失败的 renderStills 调用不消耗静帧预算（工具在
      // 校验失败时提前返回，未递增 roundsByDir），resultSummary 以 "error" 开头。
      const stillsRounds = result.toolCalls.filter(
        (c) => c.tool === 'renderStills' && c.resultSummary.includes('"frames"'),
      ).length;
      this.logger.log(
        `[agent-remotion] taskId=${task.id} author loop finished in ${Date.now() - startedAt}ms: toolCalls=${result.toolCalls.length}, stillsRounds=${stillsRounds}, completionTokens=${result.tokenUsage?.completion ?? 'n/a'}`,
      );
      const parsed = extractJsonObject(result.response || '') as { status?: string } | null;
      if (parsed?.status !== 'ok') {
        throw new Error(
          `author did not finalize ok (response: ${(result.response || '').slice(0, 200)})`,
        );
      }
      return { stillsRounds };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 网关不仅截断 tool 结果，也截断历史中 assistant tool_calls 的大参数
   * （探针 probe-assistant-args.ts：>4096 字符即丢尾）。模型因此只能看到自己
   * 上一轮 writeFile 的开头，修复时照抄截断版（task 15 写出 244 字节 +
   * "... [truncated N chars]" 占位符）。对策：历史里的 writeFile 大参数压缩成
   * 摘要，磁盘上的当前文件全文经 user 消息注入（user 消息不受截断），且只保留
   * 最新一份注入，上下文有界。
   */
  private buildHistoryTransform(taskDir: string): (messages: LlmMessage[]) => Promise<LlmMessage[]> {
    const FILE_TAG = '[author-file-state]';
    const filePath = path.join(taskDir, 'GeneratedLesson.tsx');
    return async (messages) => {
      const out: LlmMessage[] = [];
      for (const m of messages) {
        if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(FILE_TAG)) {
          continue; // 旧注入丢弃，只保留最新文件状态
        }
        if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
          const calls = m.toolCalls.map((tc: any) => {
            const raw = tc?.function?.arguments;
            if (tc?.function?.name !== 'writeFile' || typeof raw !== 'string' || raw.length <= 3000) {
              return tc;
            }
            try {
              const args = JSON.parse(raw);
              const len = String(args?.content ?? '').length;
              return {
                ...tc,
                function: {
                  ...tc.function,
                  arguments: JSON.stringify({
                    path: args?.path,
                    note: `已写入 ${len} 字符（参数超长被压缩）。当前文件全文见 ${FILE_TAG} 消息。`,
                  }),
                },
              };
            } catch {
              return tc;
            }
          });
          out.push({ ...m, toolCalls: calls });
          continue;
        }
        out.push(m);
      }
      let current = '';
      try {
        current = await fs.readFile(filePath, 'utf-8');
      } catch {
        // 文件还没写出来（首轮），不注入
      }
      if (current) {
        out.push({
          role: 'user',
          content: `${FILE_TAG} 当前 GeneratedLesson.tsx 磁盘全文（${current.length} 字符，唯一可信版本；历史中的 writeFile 参数已压缩，修代码必须基于这份全文一次性 writeFile 完整新文件）:\n\`\`\`tsx\n${current}\n\`\`\``,
        });
      }
      return out;
    };
  }

  private intEnv(name: string, fallback: number, min: number, max: number): number {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw <= 0) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(raw)));
  }
}