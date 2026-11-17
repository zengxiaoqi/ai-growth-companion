/**
 * ReviewCoursePackTool — LLM-based course pack quality review (P2-3).
 *
 * Scores five dimensions (0-20 each): outcome alignment, age appropriateness,
 * factual accuracy (against the knowledge card), content specificity, and
 * structural completeness. temp 0; degrades to a rule-based review when the
 * LLM is unavailable so the generation loop always gets a score.
 */

import { Injectable, Logger } from '@nestjs/common';
import { LlmClientService } from '../../llm/llm-client.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';
import {
  findKnowledgeCard,
  knowledgeCardFactLines,
} from '../../../common/learning/knowledge-card-registry';
import { getDomainStepPlan } from '../../../modules/learning/domain-step-plan';

export type ReviewCoursePackArgs = {
  topic: string;
  ageGroup?: string;
  domain?: string;
  outcomes?: string[];
  coursePack: Record<string, any>;
};

export type CourseQualityBreakdown = {
  outcomeAlignment: number;
  ageAppropriateness: number;
  factualAccuracy: number;
  contentSpecificity: number;
  structuralCompleteness: number;
};

export type CourseQualityResult = {
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  breakdown: CourseQualityBreakdown;
};

export const COURSE_QUALITY_PASS_SCORE = 70;

const GENERIC_PATTERNS = [
  /请和老师一起学习/,
  /我们来看看/,
  /请跟着老师/,
  /我们一起来学习/,
  /今天我们一起学习.*请大声读一读/,
];

function toText(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value).trim() || fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => toText(v)).filter(Boolean) : [];
}

/** Gather all learner-facing teaching text from a course pack. */
export function collectTeachingText(coursePack: Record<string, any>): string[] {
  const modules = coursePack?.modules ?? {};
  const texts: string[] = [];
  const push = (v: unknown) => {
    const t = toText(v);
    if (t) texts.push(t);
  };
  push(modules?.reading?.text);
  toStringArray(modules?.reading?.questions).forEach(push);
  toStringArray(modules?.writing?.practiceTasks).forEach(push);
  toStringArray(modules?.writing?.tracingItems).forEach(push);
  toStringArray(modules?.listening?.questions).forEach(push);
  toStringArray(modules?.speaking?.prompts?.map?.((p: any) => p?.prompt ?? p)).forEach(push);
  push(modules?.drawing?.prompt);
  push(modules?.drawing?.reference);
  toStringArray(modules?.drawing?.checklist).forEach(push);
  push(modules?.roleplay?.scenario);
  (Array.isArray(modules?.roleplay?.turns) ? modules.roleplay.turns : []).forEach((t: any) => {
    push(t?.text);
    push(t?.childLine);
  });
  push(modules?.experiment?.question);
  (Array.isArray(modules?.experiment?.steps) ? modules.experiment.steps : []).forEach((s: any) => {
    push(s?.instruction);
    push(s?.reveal);
    push(s?.observe?.question);
  });
  push(modules?.experiment?.conclusion);
  const scenes = Array.isArray(coursePack?.visualStory?.scenes) ? coursePack.visualStory.scenes : [];
  scenes.forEach((s: any) => push(s?.narration));
  return texts;
}

/** Extract candidate keywords from an outcome statement (Chinese segments / latin words). */
export function outcomeKeywords(outcome: string): string[] {
  const clean = toText(outcome).replace(/[，。！？、；：""''（）()【】\s]+/g, ' ');
  const segments = clean.split(' ').filter(Boolean);
  const keywords: string[] = [];
  for (const seg of segments) {
    if (/[\u4e00-\u9fa5]/.test(seg)) {
      // Drop generic verbs so alignment measures content words, not scaffolding.
      const stripped = seg.replace(/^(理解|了解|认识|学会|掌握|能够|说出|完成|练习|知道|感受)/, '');
      if (stripped.length >= 2) keywords.push(stripped);
      else if (seg.length >= 2) keywords.push(seg);
    } else if (seg.length >= 2) {
      keywords.push(seg.toLowerCase());
    }
  }
  return Array.from(new Set(keywords)).slice(0, 4);
}

/** Fraction of outcomes whose keywords appear in the teaching text (P2-2 alignment). */
export function outcomeKeywordCoverage(outcomes: string[], teachingText: string[]): number {
  const list = outcomes.map((o) => toText(o)).filter(Boolean);
  if (list.length === 0) return 1;
  const haystack = teachingText.join(' ').toLowerCase();
  if (!haystack.trim()) return 0;
  let covered = 0;
  for (const outcome of list) {
    const keywords = outcomeKeywords(outcome);
    if (keywords.length === 0 || keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      covered += 1;
    }
  }
  return covered / list.length;
}

function countGeneric(texts: string[]): number {
  let count = 0;
  for (const text of texts) {
    if (GENERIC_PATTERNS.some((re) => re.test(text))) count += 1;
  }
  return count;
}

function outputModulePresent(modules: Record<string, any>, domain?: string): boolean {
  const outputType = getDomainStepPlan(domain).step3.moduleType;
  if (outputType === 'drawing') return !!toText(modules?.drawing?.prompt);
  if (outputType === 'roleplay') {
    return Array.isArray(modules?.roleplay?.turns) && modules.roleplay.turns.length > 0;
  }
  if (outputType === 'experiment') {
    return Array.isArray(modules?.experiment?.steps) && modules.experiment.steps.length > 0;
  }
  return toStringArray(modules?.writing?.tracingItems).length > 0;
}

function chineseCharCount(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

/**
 * Deterministic rule-based review used as the LLM fallback. Exported for tests
 * and for the generation loop's guaranteed scoring path.
 */
export function ruleBasedCourseReview(args: ReviewCoursePackArgs): CourseQualityResult {
  const topic = toText(args.topic);
  const ageGroup = toText(args.ageGroup, '5-6');
  const coursePack = args.coursePack ?? {};
  const outcomes = toStringArray(args.outcomes ?? coursePack.outcomes);
  const teachingText = collectTeachingText(coursePack);
  const issues: string[] = [];
  const suggestions: string[] = [];

  // 1. Outcome alignment (P2-2): outcome keywords must surface in reading/practice.
  const coverage = outcomeKeywordCoverage(outcomes, teachingText);
  const outcomeAlignment = Math.round(coverage * 20);
  if (coverage < 0.6) {
    issues.push(`学习目标只有 ${Math.round(coverage * 100)}% 在阅读/练习内容中体现`);
    suggestions.push('让阅读文本或练习题目覆盖每条学习目标的关键词');
  }

  // 2. Age appropriateness: reading length cap per age group.
  const readingText = toText(coursePack?.modules?.reading?.text);
  const readingChars = chineseCharCount(readingText);
  const readingCap = ageGroup === '3-4' ? 120 : 320;
  let ageAppropriateness = 18;
  if (readingChars > readingCap) {
    ageAppropriateness = 10;
    issues.push(`阅读文本 ${readingChars} 字，超出 ${ageGroup} 岁建议上限 ${readingCap} 字`);
    suggestions.push('缩短阅读文本，使用更简单的词汇');
  }

  // 3. Factual accuracy: knowledge card fact coverage when a card exists.
  const card = findKnowledgeCard(topic, ageGroup);
  let factualAccuracy = 16;
  if (card && card.facts.length > 0) {
    const haystack = teachingText.join(' ');
    const mentioned = card.facts.filter((f) => haystack.includes(f.unit)).length;
    const factCoverage = mentioned / card.facts.length;
    factualAccuracy = Math.round(8 + factCoverage * 12);
    if (factCoverage < 0.5) {
      issues.push(`知识卡事实覆盖率仅 ${Math.round(factCoverage * 100)}%`);
      suggestions.push('在讲解中覆盖知识卡的核心事实');
    }
  }

  // 4. Content specificity: penalize generic empty talk and thin content.
  const genericCount = countGeneric(teachingText);
  const totalChars = teachingText.reduce((sum, t) => sum + chineseCharCount(t), 0);
  let contentSpecificity = 18;
  if (genericCount > 0) {
    contentSpecificity -= genericCount * 6;
    issues.push(`发现 ${genericCount} 处通用空话表述`);
    suggestions.push('用与主题相关的具体知识替换通用表述');
  }
  if (totalChars < 80) {
    contentSpecificity -= 6;
    issues.push('教学内容总量偏少，可能过于空泛');
    suggestions.push('补充具体的主题知识点');
  }
  contentSpecificity = Math.max(0, contentSpecificity);

  // 5. Structural completeness: modules + scene arc.
  const modules = coursePack?.modules ?? {};
  const hasReading = !!toText(modules?.reading?.text);
  const hasOutput = outputModulePresent(modules, args.domain || coursePack?.domain);
  const scenes = Array.isArray(coursePack?.visualStory?.scenes) ? coursePack.visualStory.scenes : [];
  let structuralCompleteness = 0;
  structuralCompleteness += hasReading ? 6 : 0;
  structuralCompleteness += hasOutput ? 5 : 0;
  structuralCompleteness += scenes.length >= 3 ? 9 : scenes.length > 0 ? 5 : 0;
  if (!hasReading) {
    issues.push('缺少阅读模块文本');
    suggestions.push('补充阅读模块');
  }
  if (!hasOutput) {
    issues.push('缺少领域输出模块（写/画/演/做）');
    suggestions.push('按领域补充输出模块内容');
  }
  if (scenes.length < 3) {
    issues.push(`动画场景仅 ${scenes.length} 个（建议至少 3 个）`);
    suggestions.push('增加场景以形成导入→讲解→总结的完整结构');
  }

  const breakdown: CourseQualityBreakdown = {
    outcomeAlignment: Math.max(0, Math.min(20, outcomeAlignment)),
    ageAppropriateness: Math.max(0, Math.min(20, ageAppropriateness)),
    factualAccuracy: Math.max(0, Math.min(20, factualAccuracy)),
    contentSpecificity: Math.max(0, Math.min(20, contentSpecificity)),
    structuralCompleteness: Math.max(0, Math.min(20, structuralCompleteness)),
  };
  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return {
    passed: score >= COURSE_QUALITY_PASS_SCORE,
    score: Math.max(0, Math.min(100, score)),
    issues: issues.slice(0, 10),
    suggestions: suggestions.slice(0, 10),
    breakdown,
  };
}

@Injectable()
@RegisterTool()
export class ReviewCoursePackTool extends BaseTool<ReviewCoursePackArgs, CourseQualityResult> {
  private readonly logger = new Logger(ReviewCoursePackTool.name);

  readonly metadata: ToolMetadata = {
    name: 'reviewCoursePack',
    description:
      '使用 LLM 评审课程包质量：目标对齐、年龄适配、事实准确、内容具体性、结构完整（各 0-20，总分≥70 通过）',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '课程主题' },
        ageGroup: { type: 'string', description: '目标年龄段' },
        domain: { type: 'string', description: '学科领域' },
        outcomes: { type: 'array', items: { type: 'string' }, description: '学习目标' },
        coursePack: { type: 'object', description: '组装后的课程包' },
      },
      required: ['topic', 'coursePack'],
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
    args: ReviewCoursePackArgs,
    _context: ToolExecutionContext,
  ): Promise<ToolResult<CourseQualityResult>> {
    const topic = toText(args?.topic);
    if (!topic) return this.fail('topic is required');
    if (!args?.coursePack || typeof args.coursePack !== 'object') {
      return this.fail('coursePack is required');
    }

    try {
      const prompt = this.buildReviewPrompt(args);
      const response = await this.llmClient.generateJson(
        prompt,
        'You output strict JSON only. No markdown, no explanations.',
        { temperature: 0, maxTokens: 1500 },
      );
      const parsed = this.extractJsonObject(response);
      if (parsed) {
        const result = this.sanitizeReviewResult(parsed);
        this.logger.log(
          `Course review for "${topic}": score=${result.score}, passed=${result.passed}`,
        );
        return this.ok(result);
      }
      this.logger.warn('Course review returned invalid JSON, using rule-based fallback');
      return this.ok(ruleBasedCourseReview(args));
    } catch (error: unknown) {
      this.logger.warn(
        `Course review LLM failed, using rule-based fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.ok(ruleBasedCourseReview(args));
    }
  }

  private buildReviewPrompt(args: ReviewCoursePackArgs): string {
    const topic = toText(args.topic);
    const ageGroup = toText(args.ageGroup, '5-6');
    const coursePack = args.coursePack ?? {};
    const outcomes = toStringArray(args.outcomes ?? coursePack.outcomes);
    const teachingText = collectTeachingText(coursePack);
    const card = findKnowledgeCard(topic, ageGroup);
    const scenes = Array.isArray(coursePack?.visualStory?.scenes) ? coursePack.visualStory.scenes : [];

    const factsBlock =
      card && card.facts.length > 0
        ? ['## Knowledge card facts (ground truth):', ...knowledgeCardFactLines(card).map((l) => `- ${l}`)]
        : [];

    return [
      'Review the quality of this children course pack.',
      `Topic: "${topic}" | Age: ${ageGroup} | Domain: ${toText(args.domain, 'unknown')}`,
      '',
      '## Learning outcomes:',
      ...outcomes.map((o, i) => `${i + 1}. ${o}`),
      '',
      '## Teaching content:',
      ...teachingText.map((t, i) => `${i + 1}. ${t}`),
      '',
      `## Animation scenes: ${scenes.length}`,
      ...scenes.map((s: any, i: number) => `${i + 1}. ${toText(s?.narration) || toText(s?.title)}`),
      '',
      ...factsBlock,
      '',
      '## Review Criteria (score each 0-20):',
      '1. outcomeAlignment: Do the teaching content and practice actually cover every learning outcome?',
      '2. ageAppropriateness: Is vocabulary and complexity suitable for the age group?',
      '3. factualAccuracy: Is the content factually correct and consistent with the knowledge card facts?',
      '4. contentSpecificity: Is content concrete and topic-specific (penalize generic empty talk)?',
      '5. structuralCompleteness: Does it have a complete intro → explain → demo → practice → summary arc?',
      '',
      'Return strict JSON only:',
      `{
  "score": number (0-100, sum of 5 criteria),
  "passed": boolean (score >= ${COURSE_QUALITY_PASS_SCORE}),
  "issues": ["string"],
  "suggestions": ["string"],
  "breakdown": {
    "outcomeAlignment": number (0-20),
    "ageAppropriateness": number (0-20),
    "factualAccuracy": number (0-20),
    "contentSpecificity": number (0-20),
    "structuralCompleteness": number (0-20)
  }
}`,
    ].join('\n');
  }

  private sanitizeReviewResult(raw: Record<string, any>): CourseQualityResult {
    const breakdown = raw?.breakdown ?? {};
    const clamp = (v: unknown) => Math.max(0, Math.min(20, this.toSafeInt(v, 10)));
    const dims: CourseQualityBreakdown = {
      outcomeAlignment: clamp(breakdown.outcomeAlignment),
      ageAppropriateness: clamp(breakdown.ageAppropriateness),
      factualAccuracy: clamp(breakdown.factualAccuracy),
      contentSpecificity: clamp(breakdown.contentSpecificity),
      structuralCompleteness: clamp(breakdown.structuralCompleteness),
    };
    const summed = Object.values(dims).reduce((sum, v) => sum + v, 0);
    const score = Math.max(0, Math.min(100, this.toSafeInt(raw?.score, summed)));
    return {
      passed: score >= COURSE_QUALITY_PASS_SCORE,
      score,
      issues: toStringArray(raw?.issues).slice(0, 10),
      suggestions: toStringArray(raw?.suggestions).slice(0, 10),
      breakdown: dims,
    };
  }

  private extractJsonObject(text: string): Record<string, any> | null {
    const source = toText(text);
    if (!source) return null;
    try {
      const parsed = JSON.parse(source);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      // continue
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

  private toSafeInt(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }
}