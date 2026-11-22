/**
 * GenerateVideoContentTool — generates structured video storyboard data via LLM.
 *
 * Takes a topic, domain, and age group, and produces a complete video storyboard
 * with scenes, narrations, visual descriptions, and rendering hints.
 * Includes 16 animation template definitions in the LLM prompt for intelligent
 * template selection instead of regex-based matching.
 */

import { Injectable, Logger } from '@nestjs/common';
import { LlmClientService } from '../../llm/llm-client.service';
import {
  buildTemplatePromptContext,
  KNOWN_TEMPLATE_IDS,
} from '../../../animations/animation-templates';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import { LEARNING_DOMAINS } from '../../../common/domain/learning-domains';
import {
  describeGraphGrammar,
  normalizeSceneGraph,
  auditGraphNarration,
  auditGraphDensity,
  formatCoverageFeedback,
  formatDensityFeedback,
} from '../../../modules/learning/video/scene-graph';
import { describeFigureGrammar, normalizeFigureSpec } from '../../../modules/learning/video/figure-spec';
import { repairFigures, type FigureReject } from '../../../modules/learning/video/figure-repair';
import {
  describeChoreographyGrammar,
  sanitizeBeats,
  type Beat,
} from '../../../modules/learning/video/choreography';

type AgeGroup = '3-4' | '5-6';

type GenerateVideoContentArgs = {
  topic: string;
  domain?: string;
  ageGroup?: AgeGroup;
  sceneCount?: number;
  style?: string;
  narration?: string;
};

export type StoryboardScene = {
  id: string;
  sequence: number;
  title: string;
  concept: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  durationSec: number;
  transitionToNext: 'fade' | 'slide' | 'wipe' | 'zoom';
  emphasis: 'intro' | 'core-concept' | 'example' | 'practice' | 'summary';
  animationTemplate?: {
    id: string;
    params: Record<string, any>;
  };
  /** 未校验的视觉关系图，由 learning 层的 normalizeSceneGraph 收敛后使用 */
  sceneGraph?: Record<string, unknown>;
  figure?: Record<string, unknown>;
  /** 句级编排：讲到哪句、强调谁、揭示什么、用什么动效。缺失时渲染层自行推导 */
  beats?: Beat[];
  /**
   * 角色交互关系：谁对谁做什么（递/一起抬/说话/指/手持）。
   * 缺失时渲染层会从 visualDescription 确定性提取，但 LLM 直接写出来最准。
   */
  interaction?: Record<string, unknown>;
};

export type VideoStoryboard = {
  title: string;
  topic: string;
  domain: string;
  totalDurationSec: number;
  sceneCount: number;
  scenes: StoryboardScene[];
  visualTheme: {
    primaryPalette: string;
    accentColor: string;
    mood: 'playful' | 'calm' | 'exciting' | 'mysterious' | 'warm';
  };
  narrativeArc: string;
};

const MAX_ATTEMPTS = 3;

/**
 * 分镜 prompt 的输出上限。
 *
 * 为什么需要单独给预算：思考型模型（MiniMax-M3 这类）会在 <think> 里写一两万字，
 * 实测同一句「介绍彩虹」要 17k~28k completion tokens 才吐出正文，
 * 而 LLM 客户端默认的升级上限是 16384 —— 于是 finish_reason=length、正文为空、
 * generate() 返回空串，三个 attempt 全部失败后工具走 buildFallbackStoryboard，
 * 整节课退回"通用卡片"，figure / sceneGraph 一个都到不了渲染层。
 *
 * 所以这里显式给足预算，并且允许用环境变量调（换模型时不必改代码）。
 */
function storyboardMaxTokens(): number {
  const raw = Number(process.env.LLM_STORYBOARD_MAX_TOKENS);
  return Number.isFinite(raw) && raw >= 4096 ? raw : 32768;
}

const VALID_EMPHASIS = new Set(['intro', 'core-concept', 'example', 'practice', 'summary']);

const VALID_TRANSITIONS = new Set(['fade', 'slide', 'wipe', 'zoom']);

const VALID_MOODS = new Set(['playful', 'calm', 'exciting', 'mysterious', 'warm']);

@Injectable()
@RegisterTool()
export class GenerateVideoContentTool extends BaseTool<GenerateVideoContentArgs, VideoStoryboard> {
  private readonly logger = new Logger(GenerateVideoContentTool.name);

  readonly metadata: ToolMetadata = {
    name: 'generateVideoContent',
    description:
      '根据主题和年龄要求，调用LLM生成教学视频的分镜脚本，包含场景、旁白、视觉描述和动画模板',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: "视频主题（如'认识动物兔子'、'水循环'）",
        },
        domain: {
          type: 'string',
          enum: [...LEARNING_DOMAINS],
          description: '学科领域',
        },
        ageGroup: {
          type: 'string',
          enum: ['3-4', '5-6'],
          description: '目标年龄段，默认 5-6',
        },
        sceneCount: {
          type: 'number',
          description: '场景数量（4-8），默认 5',
        },
        style: {
          type: 'string',
          description: '视觉风格提示（可选）',
        },
        narration: {
          type: 'string',
          description: '额外旁白要求或背景信息（可选）',
        },
      },
      required: ['topic'],
    },
    concurrencySafe: false,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly llmClient: LlmClientService) {
    super();
  }

  async execute(
    args: GenerateVideoContentArgs,
    _context: ToolExecutionContext,
  ): Promise<ToolResult<VideoStoryboard>> {
    const topic = this.toText(args?.topic);
    if (!topic) return this.fail('topic is required');

    const ageGroup: AgeGroup = args?.ageGroup === '3-4' ? '3-4' : '5-6';
    const sceneCount = Math.max(4, Math.min(8, this.toSafeInt(args?.sceneCount, 5)));
    const domain = this.toText(args?.domain) || this.inferDomain(topic);

    const failures: string[] = [];
    // 重试带话术重掷整份分镜，不是定点修补：实测有样本被掷得更差（缺 2 个节点 → 缺 6 个）。
    // 所以每轮留最好的一份，别让更差的覆盖更好的。
    let best: { storyboard: VideoStoryboard; mismatches: string[]; missing: number; score: number } | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const prompt = this.buildPrompt(
          topic,
          domain,
          ageGroup,
          sceneCount,
          args?.style,
          args?.narration,
          attempt,
          failures,
        );
        const llmResponse = await this.llmClient.generate(prompt, undefined, {
          maxTokens: storyboardMaxTokens(),
          temperature: 0.7,
          model: this.llmClient.authorModel,
        });
        const parsed = this.extractJsonObject(llmResponse);
        if (!parsed) {
          failures.push(`attempt ${attempt}: invalid JSON`);
          continue;
        }

        const storyboard = this.sanitizeStoryboard(parsed, topic, domain, sceneCount, ageGroup);
        await this.repairRejectedFigures(storyboard);
        const audit = this.auditNarrationCoverage(storyboard);
        if (audit.missingCount === 0 && audit.crowdedCount === 0) {
          this.logger.log(`Generated storyboard for "${topic}": ${storyboard.scenes.length} scenes`);
          return this.ok(storyboard);
        }
        // 画面节点没被旁白念到 = 孩子看见一个没讲过的概念；一屏塞太多概念 = 旁白只能连报。
        // 带具体话术重试一轮；用尽重试仍不达标就交出问题最少的那份并告警——宁可少讲一个
        // 概念，也不要因为校验把整节课退化成通用卡片（buildFallbackStoryboard 更糟）。
        // 留优按"缺几个节点 + 几个屏过密"合计比，不按"几个场景有问题"：两份都是 2 个场景
        // 有问题时，一份缺 2 个节点、一份缺 6 个，按场景数比不出来，会把更差的留下来。
        const score = audit.missingCount + audit.crowdedCount;
        if (!best || score < best.score) {
          best = { storyboard, mismatches: audit.issues, missing: audit.missingCount, score };
        }
        failures.push(`attempt ${attempt}: ${audit.issues.join(' | ')}`);
      } catch (error: unknown) {
        failures.push(`attempt ${attempt}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }

    if (best) {
      this.logger.warn(
        `narration/graph mismatch accepted after ${MAX_ATTEMPTS} attempts for "${topic}" ` +
          `(best of ${MAX_ATTEMPTS}, ${best.missing} node(s) unspoken, score ${best.score}): ${best.mismatches.join(' | ')}`,
      );
      return this.ok(best.storyboard);
    }

    this.logger.warn(
      `LLM storyboard generation failed for "${topic}", using fallback. ${failures.join(' | ')}`,
    );
    return this.ok(this.buildFallbackStoryboard(topic, domain, ageGroup, sceneCount));
  }

  private buildPrompt(
    topic: string,
    domain: string,
    ageGroup: AgeGroup,
    sceneCount: number,
    style?: string,
    narration?: string,
    attempt?: number,
    failures?: string[],
  ): string {
    const retryNote = failures?.length
      ? `Previous issues:\n${failures
          .slice(-2)
          .map((f) => `- ${f}`)
          .join('\n')}`
      : '';

    const schema = `{
  "title": "string (视频标题，中文，2-10字)",
  "visualTheme": {
    "primaryPalette": "string (hex颜色，浅色背景，如 '#E8F8FF')",
    "accentColor": "string (hex颜色，鲜艳强调色，如 '#00B4D8')",
    "mood": "playful | calm | exciting | mysterious | warm"
  },
  "scenes": [
    {
      "id": "string (如 'scene-1')",
      "sequence": 1,
      "title": "string (场景标题，2-8个中文字符)",
      "concept": "string (该场景教授的具体知识点)",
      "narration": "string (TTS旁白，40-80个中文字符，2-3个完整句子，温暖师生对话风格)",
      "onScreenText": "string (屏幕显示文字，4-12个中文字符)",
      "visualDescription": "string (30-60字的视觉构图描述：角色动作、物品位置、背景风格)",
      "interaction": "object|null (角色之间有动作时才填，否则省略。让画面演出'谁对谁做什么'，不是只把角色摆着)",
      "interaction.verb": "handover | lift-together | speak | point | hold",
      "interaction.actors": "array of 1-3 { id, label, role }. id 用具体名词的英文或拼音小写(如 bear/rabbit/tiger); label 用旁白里的中文叫法(如 小熊/小兔); role 按动词: handover→giver+receiver, lift-together→helper+helper, speak→speaker+target, point/hold→helper",
      "interaction.propId": "string (可选, 道具英文 id: ball | cookie | apple | banana | book | block | table | slide | star | heart)",
      "interaction.speech": "string (可选, verb=speak 时角色说的话, 或递东西时说的'谢谢你'; 不要填提问式教学提示语)",
      "interaction.caption": "string (可选, ≤10字, 画面下方的关系说明, 如'一起抬，更省力')",
      "durationSec": 6,
      "transitionToNext": "fade | slide | wipe | zoom",
      "emphasis": "intro | core-concept | example | practice | summary",
      "animationTemplate": {
        "id": "string (模板ID，从下方列表选择)",
        "params": { "key": "value" }
      },
      "visualMode": "figure | graph（先把概念画成图形，图形本身能说明知识就填 figure）",
      "figure": {
        "shapes": [
          { "kind": "arc | line | curve | circle | rect | polygon", "reveal": "0~1，只表达先后", "...": "其余为该图元的坐标字段，见下方 figure 说明" }
        ],
        "labels": [{ "text": "≤6字", "x": 0, "y": 0 }]
      },
      "sceneGraph": {
        "relation": "cycle | chain | growth | compare | group | split",
        "caption": "string (可选，一句关系说明，≤10字)",
        "nodes": [
          {
            "id": "n1",
            "label": "string (画面标签，≤6字；必须逐字出现在本场景 narration 里)",
            "subject": "string (可检索到图标的具体名词；取旁白里的说法，如旁白说 '小水珠' 就写 '小水珠' 而不是 '雨')",
            "role": "subject | object | place | abstract",
            "sign": "count | rise | level | flow | time | orb（仅 role=abstract 必填）",
            "swell": "grow | shrink（可选，仅当这个概念的体量随讲解变化时）"
          }
        ]
      },
      "beats": [
        {
          "sentenceIndex": 0,
          "span": 1,
          "focus": "string (本句讲到的主体：graph 节点 id/label/subject 或 figure 标签文字)",
          "reveal": ["string (本拍首次揭示的元素 id/标签)"],
          "motion": "focus-ring | spring-pop | trace-on | stagger | swell | orbit | camera-push | fade-rise"
        }
      ]
    }
  ]
}`;

    return [
      "You are a senior children's educational video storyboard designer.",
      `Design a structured storyboard for an animated teaching video about: ${topic}`,
      `Domain: ${domain} | Target age: ${ageGroup} years old`,
      `Generate exactly ${sceneCount} scenes with a clear narrative arc.`,
      '',
      '## CRITICAL Content Requirements:',
      '- ALL text must be in Chinese (Simplified).',
      '- Every scene narration MUST be 40-80 Chinese characters with SPECIFIC knowledge about the topic.',
      "- FORBIDDEN generic narrations: '请和老师一起学习', '我们来看看', '请跟着老师'.",
      "- GOOD narration example: '小朋友，这是小兔子！兔子有长长的耳朵，短短的尾巴，最喜欢吃胡萝卜和青草。它跳起来蹦蹦跳跳的，好可爱呀！'",
      "- Each scene's concept must be a distinct knowledge point related to the topic.",
      '- visualDescription must describe specific characters, actions, items, and background.',
      '',
      '## Character interaction (MANDATORY when the scene shows someone DOING something to someone):',
      '- If two characters interact (pass an object, lift together, talk, point), you MUST fill "interaction".',
      '  The renderer uses it to ACT OUT the relation; without it the picture is just characters standing still.',
      '- handover: one character gives a prop to another (giver + receiver, set propId).',
      '- lift-together: two characters lift/carry one prop together (two helpers, set propId).',
      '- speak: a character speaks a line (speaker + optional target, set speech to the exact words spoken).',
      '- point / hold: one character points at or holds a prop (helper, set propId).',
      '- Crucially: role "giver"/"speaker" must be the character the narration says is ACTING,',
      '  not merely the first one mentioned. Set speech only to words a character actually says—',
      '  never put teaching prompts like "小熊手里有什么？" into speech.',
      '',
      '## Narrative Arc:',
      `- Scene 1: intro (引入主题，激发兴趣)`,
      `- Scenes 2-${sceneCount - 1}: core-concept/example/practice (展开知识点，举例说明)`,
      `- Scene ${sceneCount}: summary (总结回顾，巩固记忆)`,
      '',
      '## Animation Template (MANDATORY per scene):',
      '- Every scene MUST have an animationTemplate with a valid id from the list below.',
      "- Choose the MOST appropriate template for each scene's content.",
      '- Fill in ALL required parameters for the chosen template.',
      '',
      '## Picture grammar (MANDATORY: every scene MUST carry exactly ONE of figure / sceneGraph)',
      '- Ask this question for every scene: "if I draw this knowledge as a shape, does the shape itself',
      '  explain it?"  Yes -> use figure.  No -> use sceneGraph.',
      '- USE figure when the knowledge IS a picture: rainbow (an arc of seven colours), solar system',
      '  (concentric orbits), magnifier (two rays meeting at the image point), earth layers, a lever.',
      '  These can never be expressed as "concept cards with labels plus arrows".',
      '- USE sceneGraph when the knowledge is a RELATIONSHIP between concepts: water cycle, food chain,',
      '  classification, comparison, part-whole. Nodes are concepts, relation is how they connect.',
      '- Exactly one of the two. If both are present the figure wins and sceneGraph is dropped.',
      '- A scene with neither falls back to a single generic card and looks like a slide, which is the',
      '  failure mode we are removing.',
      '',
      describeFigureGrammar(),
      '',
      'Reference sceneGraph grammar (only when visualMode is graph):',
      describeGraphGrammar(),
      '',
      describeChoreographyGrammar(ageGroup),
      '',
      style ? `## Visual Style: ${style}` : '',
      narration ? `## Additional Context: ${narration}` : '',
      '',
      buildTemplatePromptContext(),
      '',
      attempt && attempt > 1 ? retryNote : '',
      'Return strict JSON only, no markdown, no explanation.',
      'JSON schema:',
      schema,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private sanitizeStoryboard(
    raw: Record<string, any>,
    topic: string,
    domain: string,
    expectedSceneCount: number,
    ageGroup: AgeGroup,
  ): VideoStoryboard {
    const rawScenes = Array.isArray(raw?.scenes) ? raw.scenes : [];

    const scenes = rawScenes
      .slice(0, expectedSceneCount)
      .map((s: any, i: number) => this.sanitizeScene(s, i, ageGroup));

    if (scenes.length < 3) {
      throw new Error('Too few valid scenes');
    }

    const visualTheme = raw?.visualTheme || {};
    const mood = this.toText(visualTheme.mood);

    return {
      title: this.toText(raw?.title, `认识${topic}`).slice(0, 24),
      topic,
      domain,
      totalDurationSec: scenes.reduce((sum, s) => sum + s.durationSec, 0),
      sceneCount: scenes.length,
      scenes,
      visualTheme: {
        primaryPalette: this.toHexColor(visualTheme.primaryPalette, '#E8F8FF'),
        accentColor: this.toHexColor(visualTheme.accentColor, '#00B4D8'),
        mood: VALID_MOODS.has(mood) ? (mood as VideoStoryboard['visualTheme']['mood']) : 'playful',
      },
      narrativeArc: 'introduction → exploration → practice → summary',
    };
  }

  /**
   * ≤1 轮 figure 修复：校验拒掉的 figure 把原因喂回创作模型重画一次。
   * 只跑一次（不随 attempt 循环重试），修不好保留原拒绝结果，日志记因。
   */
  private async repairRejectedFigures(storyboard: VideoStoryboard): Promise<void> {
    const accent = storyboard.visualTheme.accentColor;
    const rejects: FigureReject[] = [];
    storyboard.scenes.forEach((scene, i) => {
      if (!scene.figure) return;
      const r = normalizeFigureSpec(scene.figure, accent);
      if (r.ok) return;
      rejects.push({
        sceneIndex: i,
        title: scene.title,
        narration: scene.narration,
        accent,
        // strictNullChecks=false 下判别联合不收窄，显式断言拒绝分支
        reason: (r as { ok: false; reason: string }).reason,
        figure: scene.figure,
      });
    });
    if (!rejects.length) return;

    const fixed = await repairFigures(this.llmClient, rejects, this.llmClient.authorModel);
    if (!fixed) {
      this.logger.warn(
        `Figure repair round produced no fixes for ${rejects.length} rejected figure(s): ` +
          rejects.map((r) => `scene${r.sceneIndex + 1}(${r.reason})`).join(', '),
      );
      return;
    }
    for (const [index, spec] of fixed) {
      storyboard.scenes[index].figure = spec;
    }
    this.logger.log(`Figure repair round fixed ${fixed.size}/${rejects.length} rejected figure(s)`);
  }

  /**
   * 逐场景检查两件事：画面节点是否都被旁白念到、一屏是否塞了太多概念。
   *
   * 旁白和 sceneGraph 是同一次调用产出的，但两边互不校验，于是会出现画面上挂着
   * 「白云」卡、旁白却只说"水汽飞到天上，遇冷变回小水珠"——云这个节点从头到尾没被念到。
   * 这类缺口在实测里占 22%，且集中在最需要画面解释的抽象概念上，靠渲染侧补不回来。
   *
   * 密度那一项是后加的：group 一屏塞 9 个节点（三组颜色 × 三个水果）时，覆盖率可能
   * 100%（每个名字都念到了），但旁白只能连报，孩子抓不住任何一个。覆盖率审计看不见
   * 这一档，所以单列一个计数。
   *
   * 三个返回值口径不同，别混用：
   * - `issues` 是回喂 LLM 的话术，密度最多 1 条 + 覆盖最多 2 条（再多会把 prompt 预算吃光）；
   * - `missingCount` / `crowdedCount` 是**计数**，用于重试留优。
   */
  private auditNarrationCoverage(storyboard: { scenes: StoryboardScene[] }): {
    issues: string[];
    missingCount: number;
    crowdedCount: number;
  } {
    const issues: string[] = [];
    const densityIssues: string[] = [];
    let missingCount = 0;
    let crowdedCount = 0;
    for (const scene of storyboard.scenes) {
      const graph = normalizeSceneGraph(scene.sceneGraph);
      if (!graph) continue;
      const density = auditGraphDensity(graph);
      if (density.crowded) {
        crowdedCount += 1;
        if (densityIssues.length < 1) {
          densityIssues.push(formatDensityFeedback(scene.title, graph.relation, density.nodes));
        }
      }
      const coverage = auditGraphNarration(graph, scene.narration);
      if (coverage.missing.length === 0) continue;
      missingCount += coverage.missing.length;
      if (issues.length < 2) {
        issues.push(formatCoverageFeedback(scene.title, scene.narration, coverage));
      }
    }
    // 密度问题排在前面：它是结构性的（要拆屏），覆盖缺失往往删个节点就能补
    return { issues: [...densityIssues, ...issues], missingCount, crowdedCount };
  }

  private sanitizeScene(raw: Record<string, any>, index: number, ageGroup: AgeGroup): StoryboardScene {
    const emphasis = this.toText(raw?.emphasis);
    const transition = this.toText(raw?.transitionToNext);

    const animationTemplate = this.sanitizeAnimationTemplate(raw?.animationTemplate);
    const narration = this.toText(raw?.narration, `我们一起来学习吧。`).slice(0, 200);

    // beats 的推导/校验需要知道画面里有哪些可聚焦的主体：
    // graph 用生产同一个 normalize（非法图=null，退回无节点推导），figure 只取标签文字
    const graph = normalizeSceneGraph(raw?.sceneGraph);
    const figureLabels = Array.isArray(raw?.figure?.labels)
      ? raw.figure.labels
          .map((l: any) => this.toText(l?.text))
          .filter((t: string) => !!t)
          .slice(0, 12)
      : [];
    const beats = sanitizeBeats(raw?.beats, { narration, graph, figureLabels }, ageGroup);

    return {
      id: this.toText(raw?.id, `scene-${index + 1}`).slice(0, 20),
      sequence: index + 1,
      title: this.toText(raw?.title, `场景${index + 1}`).slice(0, 24),
      concept: this.toText(raw?.concept).slice(0, 60) || `知识点${index + 1}`,
      narration,
      onScreenText: this.toText(raw?.onScreenText).slice(0, 30) || undefined,
      visualDescription: this.toText(raw?.visualDescription).slice(0, 120) || undefined,
      durationSec: Math.max(3, Math.min(30, this.toSafeInt(raw?.durationSec, 6))),
      transitionToNext: VALID_TRANSITIONS.has(transition)
        ? (transition as StoryboardScene['transitionToNext'])
        : 'fade',
      emphasis: VALID_EMPHASIS.has(emphasis)
        ? (emphasis as StoryboardScene['emphasis'])
        : index === 0
          ? 'intro'
          : 'core-concept',
      ...(animationTemplate ? { animationTemplate } : {}),
      ...(raw?.figure && typeof raw.figure === 'object'
        ? { figure: raw.figure as Record<string, unknown> }
        : {}),
      ...(raw?.sceneGraph && typeof raw.sceneGraph === 'object'
        ? { sceneGraph: raw.sceneGraph as Record<string, unknown> }
        : {}),
      ...(raw?.interaction && typeof raw.interaction === 'object'
        ? { interaction: raw.interaction as Record<string, unknown> }
        : {}),
      beats,
    };
  }

  private sanitizeAnimationTemplate(
    raw: any,
  ): { id: string; params: Record<string, any> } | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const id = this.toText(raw?.id);
    if (!id || !KNOWN_TEMPLATE_IDS.has(id)) return undefined;
    const params =
      raw.params && typeof raw.params === 'object' ? (raw.params as Record<string, any>) : {};
    return { id, params };
  }

  private buildFallbackStoryboard(
    topic: string,
    domain: string,
    ageGroup: AgeGroup,
    sceneCount: number,
  ): VideoStoryboard {
    const scenes: StoryboardScene[] = [];

    for (let i = 0; i < sceneCount; i += 1) {
      const emphasis =
        i === 0
          ? 'intro'
          : i === sceneCount - 1
            ? 'summary'
            : i % 2 === 0
              ? 'core-concept'
              : 'example';

      scenes.push({
        id: `scene-${i + 1}`,
        sequence: i + 1,
        title: `${topic} ${i + 1}`,
        concept: `${topic}的知识点${i + 1}`,
        narration: `我们来学习${topic}的第${i + 1}个知识点。`,
        onScreenText: `${topic} ${i + 1}`,
        visualDescription: `${topic}相关的场景${i + 1}`,
        durationSec: 6,
        transitionToNext: i < sceneCount - 1 ? 'fade' : 'fade',
        emphasis,
        beats: sanitizeBeats(
          undefined,
          { narration: `我们来学习${topic}的第${i + 1}个知识点。` },
          ageGroup,
        ),
      });
    }

    return {
      title: `认识${topic}`,
      topic,
      domain,
      totalDurationSec: sceneCount * 6,
      sceneCount,
      scenes,
      visualTheme: {
        primaryPalette: '#E8F8FF',
        accentColor: '#00B4D8',
        mood: 'playful',
      },
      narrativeArc: 'introduction → exploration → practice → summary',
    };
  }

  private inferDomain(topic: string): string {
    if (/(字|词|故事|阅读|拼音|说话|儿歌|古诗|汉字|朗读|绘本)/.test(topic)) return 'language';
    if (/(数|加|减|形状|算|计数|数学|图形|规律)/.test(topic)) return 'math';
    if (
      /(动物|植物|水|四季|天气|身体|声音|光|地球|月亮|太阳|星星|种子|花|树|鱼|鸟|昆虫|恐龙)/.test(
        topic,
      )
    )
      return 'science';
    if (/(画|颜色|音乐|唱歌|手工|折纸|涂色|艺术)/.test(topic)) return 'art';
    if (/(情绪|朋友|家庭|习惯|安全|礼貌|分享|作息|节日)/.test(topic)) return 'social';
    return 'science';
  }

  private extractJsonObject(text: string): Record<string, any> | null {
    const source = this.toText(text);
    if (!source) return null;

    try {
      const parsed = JSON.parse(source);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      // continue to fallbacks
    }

    const codeBlock =
      source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
      try {
        const parsed = JSON.parse(codeBlock[1].trim());
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        // continue
      }
    }

    const firstBrace = source.indexOf('{');
    const lastBrace = source.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(source.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        // continue
      }
    }

    return null;
  }

  private toText(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  private toSafeInt(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  private toHexColor(value: unknown, fallback: string): string {
    const text = this.toText(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(text)) return text;
    return fallback;
  }
}
