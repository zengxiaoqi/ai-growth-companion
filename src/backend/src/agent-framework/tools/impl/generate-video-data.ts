/**
 * GenerateVideoDataTool — generates structured video slide data via LLM.
 * Migrated from modules/ai/agent/tools/generate-video-data.ts
 * Uses shared extractJsonObject from core utils.
 */

import { Injectable, Logger } from "@nestjs/common";
import { LlmClientService } from "../../llm/llm-client.service";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";
import { extractJsonObject } from "../../core";

type AgeGroup = "3-4" | "5-6";

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
  layout: "hero" | "grid" | "list";
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
  "#FFF5F5",
  "#FFFBEB",
  "#EBF5FF",
  "#E8F8FF",
  "#F8F0FF",
  "#F0FFF4",
  "#FFF0F6",
  "#FFF8F0",
  "#F0F0FF",
  "#FFF0E8",
];

const ACCENT_PALETTE = [
  "#FF6B6B",
  "#FFD93D",
  "#4D96FF",
  "#00B4D8",
  "#9B59B6",
  "#6BCB77",
  "#FF6B9D",
  "#E67E22",
  "#667EEA",
  "#FF9A76",
];

const LAYOUTS: Array<"hero" | "grid" | "list"> = ["hero", "grid", "list"];

@Injectable()
@RegisterTool()
export class GenerateVideoDataTool extends BaseTool<
  GenerateVideoDataArgs,
  TeachingVideoData
> {
  private readonly logger = new Logger(GenerateVideoDataTool.name);

  readonly metadata: ToolMetadata = {
    name: "generateVideoData",
    description: "生成教学视频的结构化数据，包含幻灯片、配色和旁白",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "视频主题" },
        ageGroup: { type: "string", description: "年龄段 (3-4 或 5-6)" },
        slideCount: { type: "number", description: "幻灯片数量(3-8, 默认5)" },
      },
      required: ["topic"],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: true,
  };

  constructor(private readonly llmClient: LlmClientService) {
    super();
  }

  async execute(
    args: GenerateVideoDataArgs,
    _context: ToolExecutionContext,
  ): Promise<ToolResult<TeachingVideoData>> {
    const topic = this.toText(args?.topic);
    if (!topic) return this.fail("topic is required");

    const ageGroup: AgeGroup = args?.ageGroup === "3-4" ? "3-4" : "5-6";
    const slideCount = Math.max(
      3,
      Math.min(8, this.toSafeInt(args?.slideCount, 5)),
    );
    const failures: string[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const prompt = this.buildPrompt(
          topic,
          ageGroup,
          slideCount,
          attempt,
          failures,
        );
        const llmResponse = await this.llmClient.generate(prompt);
        const parsed = extractJsonObject(llmResponse);
        if (!parsed) {
          failures.push(`attempt ${attempt}: invalid JSON`);
          continue;
        }

        const videoData = this.sanitizeVideoData(parsed, topic, slideCount);
        this.logger.log(
          `Generated video data for "${topic}": ${videoData.slides.length} slides`,
        );
        return this.ok(videoData, videoData);
      } catch (error: unknown) {
        failures.push(
          `attempt ${attempt}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    this.logger.warn(
      `LLM video data generation failed for "${topic}", using fallback. ${failures.join(" | ")}`,
    );
    const fallback = this.buildFallbackData(topic, ageGroup, slideCount);
    return this.ok(fallback, fallback);
  }

  private buildPrompt(
    topic: string,
    ageGroup: AgeGroup,
    slideCount: number,
    attempt: number,
    failures: string[],
  ): string {
    const retryNote = failures.length
      ? `Previous issues:\n${failures
          .slice(-2)
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "";

    const schema = `{
  "title": "string (video title in Chinese)",
  "subtitle": "string (short description)",
  "introBg": "string (hex color)",
  "outroBg": "string (hex color)",
  "slides": [
    {
      "title": "string (2-4 Chinese characters)",
      "emoji": "string (single emoji)",
      "subtitle": "string (short description in Chinese)",
      "bgColor": "string (light pastel hex)",
      "accentColor": "string (vibrant hex)",
      "layout": "hero | grid | list",
      "items": [{"emoji": "string", "label": "string"}],
      "narration": "string (1-2 sentences for TTS)"
    }
  ]
}`;

    return [
      "You are a children's educational content designer.",
      `Generate structured data for an animated teaching video about: ${topic}`,
      `Target age group: ${ageGroup} years old`,
      `Generate exactly ${slideCount} slides, each teaching one key concept related to the topic.`,
      "",
      "Rules:",
      "- All text must be in Chinese (Simplified).",
      "- Each slide should focus on ONE clear concept.",
      "- Use emoji instead of images.",
      "- Colors should be bright, child-friendly pastels.",
      "- bgColor should be very light (almost white with a tint).",
      "- accentColor should be vibrant and saturated.",
      "- narration should be 1-2 short, simple sentences suitable for TTS.",
      "- No markdown, no explanation. Return strict JSON only.",
      attempt > 1 ? retryNote : "",
      "JSON schema:",
      schema,
    ]
      .filter(Boolean)
      .join("\n");
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
      throw new Error("Too few valid slides");
    }
    return {
      title: this.toText(raw?.title, `认识${topic}`),
      subtitle: this.toText(
        raw?.subtitle,
        `${expectedSlideCount}个知识点动画课`,
      ),
      introBg: this.toHexColor(raw?.introBg, "#667EEA"),
      outroBg: this.toHexColor(raw?.outroBg, "#F093FB"),
      slides,
    };
  }

  private sanitizeSlide(
    raw: Record<string, any>,
    index: number,
  ): TeachingSlide {
    const items = Array.isArray(raw?.items)
      ? raw.items.slice(0, 4).map((item: any) => ({
          emoji: this.toText(item?.emoji, "📌").slice(0, 2),
          label: this.toText(item?.label, "知识点").slice(0, 8),
        }))
      : undefined;

    const rawLayout = this.toText(raw?.layout, "hero");
    const layout = LAYOUTS.includes(rawLayout as any)
      ? (rawLayout as TeachingSlide["layout"])
      : "hero";

    return {
      title: this.toText(raw?.title, `知识点${index + 1}`).slice(0, 12),
      emoji: this.toText(raw?.emoji).slice(0, 2) || undefined,
      subtitle: this.toText(raw?.subtitle).slice(0, 20) || undefined,
      bgColor: this.toHexColor(
        raw?.bgColor,
        BG_PALETTE[index % BG_PALETTE.length],
      ),
      accentColor: this.toHexColor(
        raw?.accentColor,
        ACCENT_PALETTE[index % ACCENT_PALETTE.length],
      ),
      layout,
      items: items && items.length > 0 ? items : undefined,
      narration: this.toText(raw?.narration, "请和老师一起学习。").slice(
        0,
        100,
      ),
    };
  }

  private buildFallbackData(
    topic: string,
    ageGroup: AgeGroup,
    slideCount: number,
  ): TeachingVideoData {
    const slides: TeachingSlide[] = [];
    for (let i = 0; i < slideCount; i += 1) {
      slides.push({
        title: `${topic} ${i + 1}`,
        emoji: "📖",
        subtitle: `第${i + 1}课`,
        bgColor: BG_PALETTE[i % BG_PALETTE.length],
        accentColor: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
        layout: "hero",
        items: [{ emoji: "⭐", label: "重点" }],
        narration: `我们来学习${topic}的第${i + 1}个知识点。`,
      });
    }
    return {
      title: `认识${topic}`,
      subtitle: `${ageGroup}岁启蒙课程`,
      introBg: "#667EEA",
      outroBg: "#F093FB",
      slides,
    };
  }

  private toText(value: unknown, fallback = ""): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, " ").trim();
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
