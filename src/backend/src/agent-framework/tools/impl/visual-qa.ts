/**
 * VisualQaTool — agent-remotion 闭环的"眼睛"。
 *
 * 把 renderStills 产出的静帧 + 该场景旁白交给 vision 模型按 rubric 评审，
 * 结构化 verdict 回喂创作 agent 修代码。vision 未配置时 loud fail，
 * 引擎层据此决定是否跳过闭环（不静默）。
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { LlmClientService } from '../../llm/llm-client.service';
import { VisualQaService, type SceneQaInput } from '../../../modules/learning/visual-qa.service';

type VisualQaArgs = {
  topic: string;
  domain?: string;
  ageGroup?: string;
  scenes: SceneQaInput[];
  persistDir?: string;
};

@Injectable()
@RegisterTool()
export class VisualQaTool extends BaseTool<VisualQaArgs> {
  private readonly logger = new Logger(VisualQaTool.name);
  private readonly qa: VisualQaService;

  readonly metadata: ToolMetadata = {
    name: 'visualQa',
    description:
      '用视觉模型评审静帧：画面↔旁白对应、焦点、可读性、年龄节奏。返回总分与逐条 issue（含修复建议）。修代码前必看。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '视频主题' },
        domain: { type: 'string', description: '学科领域' },
        ageGroup: { type: 'string', description: '3-4 或 5-6' },
        scenes: {
          type: 'array',
          description: '逐场景评审输入',
          items: {
            type: 'object',
            properties: {
              sceneId: { type: 'string' },
              title: { type: 'string' },
              narration: { type: 'string', description: '该场景旁白全文' },
              onScreenText: { type: 'string' },
              frames: {
                type: 'array',
                items: { type: 'string' },
                description: 'renderStills 返回的帧路径，按时间顺序',
              },
            },
            required: ['sceneId', 'narration', 'frames'],
          },
        },
        persistDir: { type: 'string', description: '完整 verdict 落盘目录（建议传 taskDir/qa）' },
      },
      required: ['topic', 'scenes'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(llmClient: LlmClientService) {
    super();
    // VisualQaService 无状态，只依赖 LlmClientService；直接构造避免
    // AgentFrameworkModule ↔ LearningModule 循环依赖
    this.qa = new VisualQaService(llmClient);
  }

  async execute(args: VisualQaArgs, _context: ToolExecutionContext): Promise<ToolResult> {
    const topic = String(args?.topic || '').trim();
    const scenes = Array.isArray(args?.scenes) ? args.scenes : [];
    if (!topic || !scenes.length) return this.fail('topic and scenes are required');
    for (const s of scenes) {
      if (!s?.sceneId || !Array.isArray(s.frames) || !s.frames.length) {
        return this.fail('each scene needs sceneId and non-empty frames');
      }
    }
    try {
      const verdict = await this.qa.reviewVideo({
        topic,
        domain: args?.domain,
        ageGroup: args?.ageGroup,
        scenes,
        persistDir: args?.persistDir,
      });
      this.logger.log(`[visualQa] topic="${topic}" score=${verdict.score} passed=${verdict.passed}`);
      return this.ok(this.compactVerdict(verdict));
    } catch (error: unknown) {
      return this.fail(`visual QA failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /**
   * 网关对 tool 消息有 ~4096 字符截断（user/system 不限）。完整 verdict 可达
   * 数千字符，直接回喂会被截掉尾部 issue。这里压缩到 ~2k：逐场景只留分数，
   * issue 按严重度排序取前 8 条、文本截断。完整 verdict 经 persistDir 落盘。
   */
  private compactVerdict(verdict: {
    score: number;
    passed: boolean;
    framesReviewed: number;
    perScene: Array<{ sceneId: string; score: number; summary: string }>;
    issues: Array<{
      sceneId: string;
      beatIndex?: number;
      issue: string;
      severity: string;
      fixTarget: string;
      fixHint: string;
    }>;
  }) {
    const rank: Record<string, number> = { blocker: 0, major: 1, minor: 2 };
    const issues = [...verdict.issues]
      .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))
      .slice(0, 8)
      .map((i) => ({
        sceneId: i.sceneId,
        beatIndex: i.beatIndex,
        severity: i.severity,
        fixTarget: i.fixTarget,
        issue: i.issue.slice(0, 120),
        fixHint: i.fixHint.slice(0, 120),
      }));
    return {
      score: verdict.score,
      passed: verdict.passed,
      framesReviewed: verdict.framesReviewed,
      perScene: verdict.perScene.map((s) => ({ sceneId: s.sceneId, score: s.score })),
      issues,
      issuesTotal: verdict.issues.length,
      note:
        verdict.issues.length > issues.length
          ? `仅显示前 ${issues.length} 条（按严重度）；先修 blocker/major`
          : undefined,
    };
  }
}