import { Injectable, Logger } from "@nestjs/common";
import { LlmClientService } from "../../../../agent-framework/llm/llm-client.service";
import {
  buildTemplatePromptContext,
  KNOWN_TEMPLATE_IDS,
} from "../../../../animations/animation-templates";

type AgeGroup = "3-4" | "5-6";

type GenerateVideoDataArgs = {
  topic: string;
  ageGroup?: AgeGroup;
  slideCount?: number;
};

export type AnimationTemplateData = {
  id: string;
  params: Record<string, any>;
};

export type SlideItem = {
  emoji: string;
  label: string;
};

export type SceneVisual = {
  /** Scene background type: day, night, indoor, spring, summer, autumn, winter */
  bgType?: string;
  /** Scene caption / on-screen text */
  caption?: string;
  /** Named characters in the scene (e.g. ["老师", "小朋友"]) */
  characters?: string[];
  /** Named items/objects in the scene (e.g. ["太阳", "花", "树叶"]) */
  items?: string[];
  /** Visual mood / atmosphere description for rendering hints */
  mood?: "playful" | "calm" | "exciting" | "mysterious" | "warm";
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
  animationTemplate?: AnimationTemplateData;
  /** Rich visual scene description for SVG-based rendering */
  visual?: SceneVisual;
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
export class GenerateVideoDataTool {
  private readonly logger = new Logger(GenerateVideoDataTool.name);

  constructor(private readonly llmClient: LlmClientService) {}

  async execute(args: GenerateVideoDataArgs): Promise<TeachingVideoData> {
    const topic = this.toText(args?.topic);
    if (!topic) throw new Error("topic is required");

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
        const parsed = this.extractJsonObject(llmResponse);
        if (!parsed) {
          failures.push(`attempt ${attempt}: invalid JSON`);
          continue;
        }

        const videoData = this.sanitizeVideoData(parsed, topic, slideCount);
        this.logger.log(
          `Generated video data for "${topic}": ${videoData.slides.length} slides`,
        );
        return videoData;
      } catch (error: unknown) {
        failures.push(
          `attempt ${attempt}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    this.logger.warn(
      `LLM video data generation failed for "${topic}", using fallback. ${failures.join(" | ")}`,
    );
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
      ? `Previous issues:\n${failures
          .slice(-2)
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "";

    const schema = `{
  "title": "string (video title in Chinese, e.g. \\"认识动物\\")",
  "subtitle": "string (short description in Chinese, e.g. \\"3-6岁启蒙课程\\")",
  "introBg": "string (hex color for intro background, e.g. \\"#667EEA\\")",
  "outroBg": "string (hex color for outro background, e.g. \\"#F093FB\\")",
  "slides": [
    {
      "title": "string (concept name, 2-8 Chinese characters)",
      "emoji": "string (single emoji representing the concept)",
      "subtitle": "string (short description in Chinese, up to 20 chars)",
      "bgColor": "string (light pastel hex color, e.g. \\"#FFF5F5\\")",
      "accentColor": "string (vibrant hex color, e.g. \\"#FF6B6B\\")",
      "layout": "hero | grid | list",
      "items": [
        {"emoji": "string (emoji)", "label": "string (2-8 Chinese characters)"}
      ],
      "narration": "string (TTS narration in Chinese, 2-3 sentences, 30-80 characters, engaging and specific)",
      "visual": {
        "bgType": "string (day | night | indoor | spring | summer | autumn | winter)",
        "caption": "string (key phrase shown on screen, 4-12 Chinese characters)",
        "characters": ["string (character names, e.g. \\"老师\\", \\"小猫\\")"],
        "items": ["string (visual objects, e.g. \\"太阳\\", \\"花\\", \\"树叶\\")"],
        "mood": "string (playful | calm | exciting | mysterious | warm)"
      },
      "animationTemplate": {
        "id": "string (template ID from the list below)",
        "params": { "key": "value (template-specific parameters)" }
      }
    }
  ]
}`;

    return [
      "You are a senior children's educational content designer specializing in animated teaching videos.",
      `Generate structured data for an animated teaching video about: ${topic}`,
      `Target age group: ${ageGroup} years old`,
      `Generate exactly ${slideCount} slides, each teaching one key concept related to the topic.`,
      "",
      "## Global Rules:",
      "- All text must be in Chinese (Simplified).",
      "- Each slide should focus on ONE clear concept.",
      "- Colors should be bright, child-friendly pastels.",
      "- bgColor should be very light (almost white with a tint).",
      "- accentColor should be vibrant and saturated.",
      "- No markdown, no explanation. Return strict JSON only.",
      "",
      "## Narration Quality Requirements (CRITICAL):",
      "- Each narration MUST be 30-80 Chinese characters (2-3 complete sentences).",
      "- Use warm, engaging, teacher-child conversational tone.",
      "- Every narration must contain SPECIFIC knowledge about that slide's concept.",
      '- Example GOOD narration: "小朋友，这是小狗！小狗会汪汪叫，它有毛茸茸的尾巴，最喜欢和小朋友一起玩耍。"',
      '- Example BAD narration: "请和老师一起学习。" (too generic, no specific content)',
      "",
      "## FORBIDDEN narration patterns:",
      '- "请和老师一起学习" / "我们一起来" / "我们来看看" — these are too generic',
      '- "请跟着老师" — no teaching substance',
      "- Any narration shorter than 20 Chinese characters",
      "",
      "## Visual Scene Design (REQUIRED for every slide):",
      'Every slide MUST include a "visual" object describing the animated scene:',
      '- bgType: Choose the most fitting background — "day", "night", "indoor", "spring"/"summer"/"autumn"/"winter".',
      "- caption: Key phrase shown on screen (4-12 Chinese characters, NEVER empty).",
      '- characters: Named characters in the scene (e.g. ["老师", "小猫", "小朋友"]). Include at least 1.',
      '- items: Visual objects (e.g. ["鱼", "毛线球", "猫爪印"]). Include 1-6 items.',
      '- mood: "playful" (fun), "calm" (gentle), "exciting" (discovery), "mysterious" (wonder), "warm" (cozy).',
      "",
      "## Animation Template (MANDATORY):",
      "- Every slide MUST have an animationTemplate.",
      "- Choose the MOST appropriate template from the list below.",
      "- Fill in ALL required parameters for the chosen template.",
      "- Default by domain: language→language.word-reveal, math→math.counting-objects, science→science.plant-growth, art→art.drawing-steps, social→social.emotion-faces.",
      "",
      "## Layout Rules:",
      '- "hero": single concept showcase (1-2 items, large visual)',
      '- "grid": multiple related items (3+ items)',
      '- "list": step-by-step knowledge points or sequences',
      "",
      "## Items:",
      "- Each slide should have 2-6 items with emoji + Chinese label (2-8 chars).",
      "- Pick the most recognizable emoji for each concept.",
      "",
      buildTemplatePromptContext(),
      "",
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
      ? raw.items.slice(0, 8).map((item: any) => ({
          emoji: this.toText(item?.emoji, "📌").slice(0, 2),
          label: this.toText(item?.label, "知识点").slice(0, 20),
        }))
      : undefined;

    const rawLayout = this.toText(raw?.layout, "hero");
    const layout = LAYOUTS.includes(rawLayout as any)
      ? (rawLayout as TeachingSlide["layout"])
      : "hero";

    const animationTemplate = this.sanitizeAnimationTemplate(
      raw?.animationTemplate,
    );
    const visual = this.sanitizeVisual(raw?.visual, raw);

    return {
      title: this.toText(raw?.title, `知识点${index + 1}`).slice(0, 24),
      emoji: this.toText(raw?.emoji).slice(0, 2) || undefined,
      subtitle: this.toText(raw?.subtitle).slice(0, 60) || undefined,
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
      narration: this.truncateAtSentenceEnd(
        this.toText(raw?.narration, "请和老师一起学习。"),
        300,
      ),
      ...(animationTemplate ? { animationTemplate } : {}),
      ...(visual ? { visual } : {}),
    };
  }

  private sanitizeVisual(
    raw: any,
    slideRaw: Record<string, any>,
  ): SceneVisual | undefined {
    if (!raw || typeof raw !== "object") {
      // Build a minimal visual from slide data if not provided by LLM
      const title = this.toText(slideRaw?.title);
      const narration = this.toText(slideRaw?.narration);
      if (!title && !narration) return undefined;

      const source = `${title} ${narration}`;
      const bgType = this.inferBgType(source);
      const characters = this.inferCharacters(source);
      const visualItems = this.inferVisualItems(source);

      return {
        bgType,
        caption: title || undefined,
        characters: characters.length > 0 ? characters : ["老师"],
        items: visualItems.length > 0 ? visualItems : undefined,
        mood: "playful",
      };
    }

    const bgType = this.toText(raw?.bgType);
    const validBgTypes = [
      "day",
      "night",
      "indoor",
      "spring",
      "summer",
      "autumn",
      "winter",
    ];
    const characters = Array.isArray(raw?.characters)
      ? raw.characters
          .map((c: any) => this.toText(c))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const visualItems = Array.isArray(raw?.items)
      ? raw.items
          .map((i: any) => this.toText(i))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const mood = this.toText(raw?.mood);
    const validMoods = ["playful", "calm", "exciting", "mysterious", "warm"];

    return {
      bgType: validBgTypes.includes(bgType) ? bgType : undefined,
      caption: this.toText(raw?.caption).slice(0, 60) || undefined,
      characters: characters.length > 0 ? characters : undefined,
      items: visualItems.length > 0 ? visualItems : undefined,
      mood: validMoods.includes(mood)
        ? (mood as SceneVisual["mood"])
        : undefined,
    };
  }

  private inferBgType(source: string): string {
    if (/(夜|晚上|星星|月亮|黑夜|睡觉)/.test(source)) return "night";
    if (/(四季|季节|春)/.test(source)) return "spring";
    if (/(夏|热|太阳大)/.test(source)) return "summer";
    if (/(秋|落叶|丰收)/.test(source)) return "autumn";
    if (/(冬|雪|冷)/.test(source)) return "winter";
    if (/(教室|课堂|室内|家|房间)/.test(source)) return "indoor";
    return "day";
  }

  private inferCharacters(source: string): string[] {
    const found: string[] = [];
    if (/(猫|小猫|猫咪)/.test(source)) found.push("小猫");
    if (/(狗|小狗|狗狗)/.test(source)) found.push("小狗");
    if (/(鸟|小鸟)/.test(source)) found.push("小鸟");
    if (/(鱼|小鱼)/.test(source)) found.push("小鱼");
    if (/(兔|小兔|兔子)/.test(source)) found.push("小兔子");
    if (/(老师|教师)/.test(source)) found.push("老师");
    if (/(小朋友|孩子|宝宝)/.test(source)) found.push("小朋友");
    if (found.length === 0) found.push("老师", "小朋友");
    return found.slice(0, 4);
  }

  private inferVisualItems(source: string): string[] {
    const patterns: [RegExp, string][] = [
      [/(太阳)/, "太阳"],
      [/(月亮)/, "月亮"],
      [/(花|花朵)/, "花"],
      [/(树|树木)/, "树"],
      [/(水|河|海)/, "水"],
      [/(云|白云)/, "云"],
      [/(雨|下雨)/, "雨"],
      [/(雪|下雪)/, "雪"],
      [/(星星)/, "星星"],
      [/(草)/, "草"],
      [/(鱼)/, "鱼"],
      [/(蝴蝶)/, "蝴蝶"],
    ];
    const found: string[] = [];
    for (const [regex, label] of patterns) {
      if (regex.test(source)) found.push(label);
    }
    return found.slice(0, 4);
  }

  private sanitizeAnimationTemplate(
    raw: any,
  ): AnimationTemplateData | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const id = this.toText(raw?.id);
    if (!id || !KNOWN_TEMPLATE_IDS.has(id)) return undefined;
    const params =
      raw.params && typeof raw.params === "object"
        ? (raw.params as Record<string, any>)
        : {};
    return { id, params };
  }

  private buildFallbackData(
    topic: string,
    ageGroup: AgeGroup,
    slideCount: number,
  ): TeachingVideoData {
    const slides: TeachingSlide[] = [];

    const fallbackTemplates: string[] = [
      "language.story-scene",
      "language.word-reveal",
      "science.plant-growth",
      "math.counting-objects",
      "language.story-scene",
      "science.seasons-cycle",
      "art.color-mixing",
      "social.daily-routine",
    ];

    for (let i = 0; i < slideCount; i += 1) {
      const templateId = fallbackTemplates[i % fallbackTemplates.length];
      slides.push({
        title: `${topic} ${i + 1}`,
        emoji: "📖",
        subtitle: `第${i + 1}课`,
        bgColor: BG_PALETTE[i % BG_PALETTE.length],
        accentColor: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
        layout: "hero",
        items: [{ emoji: "⭐", label: "重点" }],
        narration: `我们来学习${topic}的第${i + 1}个知识点。`,
        visual: {
          bgType: "day",
          caption: `${topic} ${i + 1}`,
          characters: ["老师", "小朋友"],
          mood: "playful",
        },
        animationTemplate: { id: templateId, params: {} },
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

  private extractJsonObject(text: string): Record<string, any> | null {
    const source = this.toText(text);
    if (!source) return null;

    try {
      const parsed = JSON.parse(source);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      // continue to fallbacks
    }

    const codeBlock =
      source.match(/```json\s*([\s\S]*?)```/i) ||
      source.match(/```\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
      try {
        const parsed = JSON.parse(codeBlock[1].trim());
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        // continue
      }
    }

    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(source.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        // continue
      }
    }

    return null;
  }

  private toText(value: unknown, fallback = ""): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, " ").trim();
    return text || fallback;
  }

  /** Truncate at the last complete sentence within the limit */
  private truncateAtSentenceEnd(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const sub = text.slice(0, maxLen);
    const lastPunc = Math.max(
      sub.lastIndexOf("。"),
      sub.lastIndexOf("！"),
      sub.lastIndexOf("？"),
      sub.lastIndexOf("，"),
    );
    return lastPunc > maxLen * 0.5 ? sub.slice(0, lastPunc + 1) : sub;
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
