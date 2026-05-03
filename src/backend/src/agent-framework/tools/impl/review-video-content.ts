/**
 * ReviewVideoQualityTool — LLM-based video content quality review.
 *
 * Validates that generated storyboard content matches the topic,
 * is age-appropriate, uses proper animation templates, and has coherent narration.
 * Returns a score (0-100) with specific issues and fix suggestions.
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

type ReviewVideoQualityArgs = {
  topic: string;
  domain?: string;
  ageGroup?: string;
  scenes: Array<{
    title?: string;
    concept?: string;
    narration?: string;
    onScreenText?: string;
    visualDescription?: string;
    animationTemplate?: { id?: string; params?: Record<string, any> };
  }>;
  narrations?: string[];
};

type QualityReviewResult = {
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  breakdown: {
    topicAlignment: number;
    ageAppropriateness: number;
    templateRelevance: number;
    narrationQuality: number;
    narrativeCoherence: number;
  };
};

@Injectable()
@RegisterTool()
export class ReviewVideoQualityTool extends BaseTool<
  ReviewVideoQualityArgs,
  QualityReviewResult
> {
  private readonly logger = new Logger(ReviewVideoQualityTool.name);

  readonly metadata: ToolMetadata = {
    name: "reviewVideoQuality",
    description:
      "使用 LLM 检查视频内容质量：主题相关性、年龄适配性、模板匹配度、旁白质量、叙事连贯性",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "原始视频主题",
        },
        domain: {
          type: "string",
          description: "学科领域",
        },
        ageGroup: {
          type: "string",
          description: "目标年龄段",
        },
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              concept: { type: "string" },
              narration: { type: "string" },
              onScreenText: { type: "string" },
              visualDescription: { type: "string" },
              animationTemplate: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  params: { type: "object" },
                },
              },
            },
          },
          description: "生成的场景列表",
        },
        narrations: {
          type: "array",
          items: { type: "string" },
          description: "所有旁白文本（可选，如果 scenes 中已包含可不填）",
        },
      },
      required: ["topic", "scenes"],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly llmClient: LlmClientService) {
    super();
  }

  async execute(
    args: ReviewVideoQualityArgs,
    _context: ToolExecutionContext,
  ): Promise<ToolResult<QualityReviewResult>> {
    const topic = this.toText(args?.topic);
    if (!topic) return this.fail("topic is required");

    const scenes = Array.isArray(args?.scenes) ? args.scenes : [];
    if (scenes.length === 0)
      return this.fail("scenes must be a non-empty array");

    // Collect all narrations
    const narrations: string[] = [
      ...(args?.narrations || []),
      ...scenes
        .map((s) => s.narration)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    ];

    try {
      const prompt = this.buildReviewPrompt(
        topic,
        args?.domain || "unknown",
        args?.ageGroup || "5-6",
        scenes,
        narrations,
      );

      const response = await this.llmClient.generate(prompt);
      const parsed = this.extractJsonObject(response);

      if (parsed) {
        const result = this.sanitizeReviewResult(parsed);
        this.logger.log(
          `Quality review for "${topic}": score=${result.score}, passed=${result.passed}`,
        );
        return this.ok(result);
      }

      // LLM didn't return valid JSON — use rule-based fallback
      this.logger.warn(
        `LLM review returned invalid JSON, using rule-based fallback`,
      );
      return this.ok(this.ruleBasedReview(topic, scenes, narrations));
    } catch (error: unknown) {
      this.logger.warn(
        `LLM review failed, using rule-based fallback: ${error instanceof Error ? error.message : "unknown"}`,
      );
      return this.ok(this.ruleBasedReview(topic, scenes, narrations));
    }
  }

  private buildReviewPrompt(
    topic: string,
    domain: string,
    ageGroup: string,
    scenes: Array<Record<string, any>>,
    narrations: string[],
  ): string {
    const scenesJson = JSON.stringify(
      scenes.map((s, i) => ({
        index: i + 1,
        title: s.title || "",
        concept: s.concept || "",
        narration: s.narration || "",
        template: s.animationTemplate?.id || "none",
      })),
      null,
      2,
    );

    return [
      `Review the quality of this educational video storyboard.`,
      `Topic: "${topic}" | Domain: ${domain} | Age: ${ageGroup}`,
      "",
      "## Scenes:",
      scenesJson,
      "",
      "## All Narrations:",
      narrations.map((n, i) => `${i + 1}. ${n}`).join("\n"),
      "",
      "## Review Criteria (score each 0-20):",
      "1. **topicAlignment**: Do narrations and concepts actually teach about the topic? Penalize generic content.",
      "2. **ageAppropriateness**: Is vocabulary and complexity suitable for the age group?",
      "3. **templateRelevance**: Do animation template choices match scene content?",
      "4. **narrationQuality**: Are narrations specific (not generic), 40-80 chars, warm teacher-child tone?",
      "5. **narrativeCoherence**: Do scenes flow logically with a clear intro → exploration → summary arc?",
      "",
      "## FORBIDDEN patterns (deduct 10 points each if found):",
      '- "请和老师一起学习" / "我们来看看" / "请跟着老师"',
      "- Any narration shorter than 30 Chinese characters",
      "- Any narration that doesn't mention the topic or topic-related concepts",
      "",
      "Return strict JSON only:",
      `{
  "score": number (0-100, sum of 5 criteria),
  "passed": boolean (score >= 70),
  "issues": ["string"],
  "suggestions": ["string"],
  "breakdown": {
    "topicAlignment": number (0-20),
    "ageAppropriateness": number (0-20),
    "templateRelevance": number (0-20),
    "narrationQuality": number (0-20),
    "narrativeCoherence": number (0-20)
  }
}`,
    ].join("\n");
  }

  private sanitizeReviewResult(raw: Record<string, any>): QualityReviewResult {
    const score = Math.max(0, Math.min(100, this.toSafeInt(raw?.score, 50)));
    const breakdown = raw?.breakdown || {};

    return {
      passed: score >= 70,
      score,
      issues: Array.isArray(raw?.issues)
        ? raw.issues.filter((i: any) => typeof i === "string").slice(0, 10)
        : [],
      suggestions: Array.isArray(raw?.suggestions)
        ? raw.suggestions.filter((s: any) => typeof s === "string").slice(0, 10)
        : [],
      breakdown: {
        topicAlignment: Math.max(
          0,
          Math.min(20, this.toSafeInt(breakdown.topicAlignment, 10)),
        ),
        ageAppropriateness: Math.max(
          0,
          Math.min(20, this.toSafeInt(breakdown.ageAppropriateness, 10)),
        ),
        templateRelevance: Math.max(
          0,
          Math.min(20, this.toSafeInt(breakdown.templateRelevance, 10)),
        ),
        narrationQuality: Math.max(
          0,
          Math.min(20, this.toSafeInt(breakdown.narrationQuality, 10)),
        ),
        narrativeCoherence: Math.max(
          0,
          Math.min(20, this.toSafeInt(breakdown.narrativeCoherence, 10)),
        ),
      },
    };
  }

  private ruleBasedReview(
    topic: string,
    scenes: Array<Record<string, any>>,
    narrations: string[],
  ): QualityReviewResult {
    let score = 100;
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check narration count
    if (narrations.length === 0) {
      score -= 30;
      issues.push("No narrations found");
      suggestions.push("Add narrations to each scene");
    }

    // Check for forbidden generic patterns
    const genericPatterns = [
      /请和老师一起学习/,
      /我们来看看/,
      /请跟着老师/,
      /我们一起来/,
    ];
    let genericCount = 0;
    for (const n of narrations) {
      for (const pattern of genericPatterns) {
        if (pattern.test(n)) {
          genericCount += 1;
        }
      }
    }
    if (genericCount > 0) {
      score -= genericCount * 10;
      issues.push(
        `Found ${genericCount} generic narration(s) (forbidden patterns)`,
      );
      suggestions.push(
        "Replace generic narrations with topic-specific content",
      );
    }

    // Check narration length
    let shortNarrations = 0;
    for (const n of narrations) {
      const chineseChars = (n.match(/[一-鿿]/g) || []).length;
      if (chineseChars < 30) shortNarrations += 1;
    }
    if (shortNarrations > 0) {
      score -= shortNarrations * 5;
      issues.push(
        `${shortNarrations} narration(s) shorter than 30 Chinese characters`,
      );
      suggestions.push("Extend short narrations to 40-80 characters");
    }

    // Check topic mention in narrations
    const topicMentions = narrations.filter((n) =>
      n.includes(topic.slice(0, 2)),
    ).length;
    if (topicMentions === 0 && narrations.length > 0) {
      score -= 15;
      issues.push("Topic not mentioned in any narration");
      suggestions.push(`Include "${topic}" or related terms in narrations`);
    }

    // Check scene count
    if (scenes.length < 3) {
      score -= 20;
      issues.push(`Only ${scenes.length} scenes (minimum 3)`);
      suggestions.push("Add more scenes to cover the topic adequately");
    }

    const finalScore = Math.max(0, Math.min(100, score));

    return {
      passed: finalScore >= 70,
      score: finalScore,
      issues,
      suggestions,
      breakdown: {
        topicAlignment: Math.min(20, topicMentions > 0 ? 18 : 8),
        ageAppropriateness: 16,
        templateRelevance: 14,
        narrationQuality: Math.min(20, genericCount === 0 ? 18 : 8),
        narrativeCoherence: scenes.length >= 3 ? 16 : 8,
      },
    };
  }

  private extractJsonObject(text: string): Record<string, any> | null {
    const source = this.toText(text);
    if (!source) return null;

    try {
      const parsed = JSON.parse(source);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      // continue
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
    return String(value).trim() || fallback;
  }

  private toSafeInt(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }
}
