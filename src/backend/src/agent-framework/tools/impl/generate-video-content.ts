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
          enum: ['language', 'math', 'science', 'art', 'social'],
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
        const llmResponse = await this.llmClient.generate(prompt);
        const parsed = this.extractJsonObject(llmResponse);
        if (!parsed) {
          failures.push(`attempt ${attempt}: invalid JSON`);
          continue;
        }

        const storyboard = this.sanitizeStoryboard(parsed, topic, domain, sceneCount);
        this.logger.log(`Generated storyboard for "${topic}": ${storyboard.scenes.length} scenes`);
        return this.ok(storyboard);
      } catch (error: unknown) {
        failures.push(`attempt ${attempt}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
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
      "durationSec": 6,
      "transitionToNext": "fade | slide | wipe | zoom",
      "emphasis": "intro | core-concept | example | practice | summary",
      "animationTemplate": {
        "id": "string (模板ID，从下方列表选择)",
        "params": { "key": "value" }
      }
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
  ): VideoStoryboard {
    const rawScenes = Array.isArray(raw?.scenes) ? raw.scenes : [];

    const scenes = rawScenes
      .slice(0, expectedSceneCount)
      .map((s: any, i: number) => this.sanitizeScene(s, i));

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

  private sanitizeScene(raw: Record<string, any>, index: number): StoryboardScene {
    const emphasis = this.toText(raw?.emphasis);
    const transition = this.toText(raw?.transitionToNext);

    const animationTemplate = this.sanitizeAnimationTemplate(raw?.animationTemplate);

    return {
      id: this.toText(raw?.id, `scene-${index + 1}`).slice(0, 20),
      sequence: index + 1,
      title: this.toText(raw?.title, `场景${index + 1}`).slice(0, 24),
      concept: this.toText(raw?.concept).slice(0, 60) || `知识点${index + 1}`,
      narration: this.toText(raw?.narration, `我们一起来学习吧。`).slice(0, 200),
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
