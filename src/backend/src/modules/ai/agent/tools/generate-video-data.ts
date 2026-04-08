import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from '../../llm/llm-client';

type AgeGroup = '3-4' | '5-6';

type GenerateVideoDataArgs = {
  topic: string;
  ageGroup?: AgeGroup;
  slideCount?: number;
};

export type SlideItem = {
  emoji: string;
  label: string;
};

export type TeachingSlide = {
  title: string;
  emoji?: string;
  subtitle?: string;
  bgColor: string;
  accentColor: string;
  layout: 'hero' | 'grid' | 'list';
  items?: SlideItem[];
  narration: string;
};

export type TeachingVideoData = {
  title: string;
  subtitle: string;
  introBg: string;
  outroBg: string;
  slides: TeachingSlide[];
};

const MAX_ATTEMPTS = 3;

const BG_PALETTE = [
  '#FFF5F5', '#FFFBEB', '#EBF5FF', '#E8F8FF', '#F8F0FF',
  '#F0FFF4', '#FFF0F6', '#FFF8F0', '#F0F0FF', '#FFF0E8',
];

const ACCENT_PALETTE = [
  '#FF6B6B', '#FFD93D', '#4D96FF', '#00B4D8', '#9B59B6',
  '#6BCB77', '#FF6B9D', '#E67E22', '#667EEA', '#FF9A76',
];

const LAYOUTS: Array<'hero' | 'grid' | 'list'> = ['hero', 'grid', 'list'];

@Injectable()
export class GenerateVideoDataTool {
  private readonly logger = new Logger(GenerateVideoDataTool.name);

  constructor(private readonly llmClient: LlmClient) {}

  async execute(args: GenerateVideoDataArgs): Promise<TeachingVideoData> {
    const topic = this.toText(args?.topic);
    if (!topic) throw new Error('topic is required');

    const ageGroup: AgeGroup = args?.ageGroup === '3-4' ? '3-4' : '5-6';
    const slideCount = Math.max(3, Math.min(8, this.toSafeInt(args?.slideCount, 5)));

    const failures: string[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const prompt = this.buildPrompt(topic, ageGroup, slideCount, attempt, failures);
        const llmResponse = await this.llmClient.generate(prompt);
        const parsed = this.extractJsonObject(llmResponse);
        if (!parsed) {
          failures.push(`attempt ${attempt}: invalid JSON`);
          continue;
        }

        const videoData = this.sanitizeVideoData(parsed, topic, slideCount);
        this.logger.log(`Generated video data for "${topic}": ${videoData.slides.length} slides`);
        return videoData;
      } catch (error: unknown) {
        failures.push(`attempt ${attempt}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }

    this.logger.warn(`LLM video data generation failed for "${topic}", using fallback. ${failures.join(' | ')}`);
    return this.buildFallbackData(topic, ageGroup, slideCount);
  }

  private buildPrompt(
    topic: string,
    ageGroup: AgeGroup,
    slideCount: number,
    attempt: number,
    failures: string[],
  ): string {
    const retryNote = failures.length
      ? `Previous issues:\n${failures.slice(-2).map((f) => `- ${f}`).join('\n')}`
      : '';

    const schema = `{
  "title": "string (video title in Chinese, e.g. "认识动物")",
  "subtitle": "string (short description, e.g. "3-6岁启蒙课程")",
  "introBg": "string (hex color for intro background, e.g. "#667EEA")",
  "outroBg": "string (hex color for outro background, e.g. "#F093FB")",
  "slides": [
    {
      "title": "string (concept name, 2-4 Chinese characters)",
      "emoji": "string (single emoji representing the concept)",
      "subtitle": "string (short description in Chinese)",
      "bgColor": "string (light pastel hex color, e.g. "#FFF5F5")",
      "accentColor": "string (vibrant hex color, e.g. "#FF6B6B")",
      "layout": "hero | grid | list",
      "items": [
        {"emoji": "string (emoji)", "label": "string (1-4 Chinese characters)"}
      ],
      "narration": "string (TTS narration in Chinese, 1-2 sentences, simple and clear for children)"
    }
  ]
}`;

    return [
      'You are a children\'s educational content designer.',
      `Generate structured data for an animated teaching video about: ${topic}`,
      `Target age group: ${ageGroup} years old`,
      `Generate exactly ${slideCount} slides, each teaching one key concept related to the topic.`,
      '',
      'Rules:',
      '- All text must be in Chinese (Simplified).',
      '- Each slide should focus on ONE clear concept.',
      '- Use emoji instead of images — pick the most recognizable emoji for each concept.',
      '- Colors should be bright, child-friendly pastels.',
      '- bgColor should be very light (almost white with a tint).',
      '- accentColor should be vibrant and saturated.',
      '- narration should be 1-2 short, simple sentences suitable for TTS.',
      '- Use "hero" layout for single concept showcase (1-2 items).',
      '- Use "grid" layout for showing multiple related items (3+ items).',
      '- Use "list" layout for step-by-step knowledge points.',
      '- Each slide should have 1-4 items with emoji + short label.',
      '- No markdown, no explanation. Return strict JSON only.',
      attempt > 1 ? retryNote : '',
      'JSON schema:',
      schema,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private sanitizeVideoData(
    raw: Record<string, any>,
    topic: string,
    expectedSlideCount: number,
  ): TeachingVideoData {
    const rawSlides = Array.isArray(raw?.slides) ? raw.slides : [];

    const slides = rawSlides
      .slice(0, expectedSlideCount)
      .map((s: any, i: number) => this.sanitizeSlide(s, i));

    if (slides.length < 3) {
      throw new Error('Too few valid slides');
    }

    return {
      title: this.toText(raw?.title, `认识${topic}`),
      subtitle: this.toText(raw?.subtitle, `${expectedSlideCount}个知识点动画课`),
      introBg: this.toHexColor(raw?.introBg, '#667EEA'),
      outroBg: this.toHexColor(raw?.outroBg, '#F093FB'),
      slides,
    };
  }

  private sanitizeSlide(raw: Record<string, any>, index: number): TeachingSlide {
    const items = Array.isArray(raw?.items)
      ? raw.items
          .slice(0, 4)
          .map((item: any) => ({
            emoji: this.toText(item?.emoji, '📌').slice(0, 2),
            label: this.toText(item?.label, '知识点').slice(0, 8),
          }))
      : undefined;

    const rawLayout = this.toText(raw?.layout, 'hero');
    const layout = LAYOUTS.includes(rawLayout as any) ? rawLayout as TeachingSlide['layout'] : 'hero';

    return {
      title: this.toText(raw?.title, `知识点${index + 1}`).slice(0, 12),
      emoji: this.toText(raw?.emoji).slice(0, 2) || undefined,
      subtitle: this.toText(raw?.subtitle).slice(0, 20) || undefined,
      bgColor: this.toHexColor(raw?.bgColor, BG_PALETTE[index % BG_PALETTE.length]),
      accentColor: this.toHexColor(raw?.accentColor, ACCENT_PALETTE[index % ACCENT_PALETTE.length]),
      layout,
      items: items && items.length > 0 ? items : undefined,
      narration: this.toText(raw?.narration, '请和老师一起学习。').slice(0, 100),
    };
  }

  private buildFallbackData(topic: string, ageGroup: AgeGroup, slideCount: number): TeachingVideoData {
    const slides: TeachingSlide[] = [];

    for (let i = 0; i < slideCount; i += 1) {
      slides.push({
        title: `${topic} ${i + 1}`,
        emoji: '📖',
        subtitle: `第${i + 1}课`,
        bgColor: BG_PALETTE[i % BG_PALETTE.length],
        accentColor: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
        layout: 'hero',
        items: [{ emoji: '⭐', label: '重点' }],
        narration: `我们来学习${topic}的第${i + 1}个知识点。`,
      });
    }

    return {
      title: `认识${topic}`,
      subtitle: `${ageGroup}岁启蒙课程`,
      introBg: '#667EEA',
      outroBg: '#F093FB',
      slides,
    };
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

    const codeBlock = source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i);
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
