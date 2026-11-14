/**
 * answer-validation — layered answer correctness checks for question-style
 * activities (quiz / true_false / fill_blank).
 *
 * L1 (validateAnswersL1): deterministic, zero-cost code checks — index bounds,
 * option dedup, arithmetic verification, blank markers. Unfixable questions
 * are dropped; fewer than 3 survivors fails the whole batch so the caller's
 * retry loop regenerates with the issues as feedback.
 *
 * L2 (judgeActivityAnswers): one batched LLM-as-judge call with an independent
 * prompt (no generation context, to avoid self-confirmation bias). Verdicts:
 * correct / incorrect / ambiguous / inappropriate. Judge failure throws —
 * the caller degrades to L1-only instead of blocking generation.
 *
 * Other activity types are covered by their playtest validators and pass
 * through untouched.
 */

import { extractJsonObject } from '../../agent-framework/core';

export interface AnswerCheckContext {
  topic: string;
  ageGroup: string;
  difficulty?: number;
  /** Knowledge-card facts as ground truth for the judge (optional). */
  facts?: string[];
}

export interface AnswerCheckResult {
  ok: boolean;
  /** Activity with fixes applied and bad items dropped. */
  activity: any;
  /** Unfixable problems — feed back into the generation retry prompt. */
  issues: string[];
  /** Applied auto-fixes and dropped items, for logging. */
  fixes: string[];
}

/** Minimal structural type so this module stays decoupled from the LLM service. */
export interface JudgeLlm {
  generateJson(
    prompt: string,
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string>;
}

const MIN_ITEMS = 3;

const JUDGE_TYPES = new Set(['quiz', 'true_false', 'fill_blank']);

export function isJudgeableType(type: string): boolean {
  return JUDGE_TYPES.has(type);
}

// ─── L1: deterministic checks ────────────────────────────────────────────

export function validateAnswersL1(activity: any, _ctx: AnswerCheckContext): AnswerCheckResult {
  const issues: string[] = [];
  const fixes: string[] = [];
  const type = activity?.type;

  if (type === 'quiz') {
    const kept: any[] = [];
    const questions = Array.isArray(activity?.questions) ? activity.questions : [];
    questions.forEach((q: any, i: number) => {
      const verdict = checkQuizQuestion(q, i, fixes);
      if (verdict.issue) issues.push(verdict.issue);
      if (verdict.question) kept.push(verdict.question);
    });
    if (kept.length < MIN_ITEMS) {
      return {
        ok: false,
        activity,
        issues: issues.length ? issues : [`quiz 有效题目不足 ${MIN_ITEMS} 道`],
        fixes,
      };
    }
    return { ok: true, activity: { ...activity, questions: kept }, issues: [], fixes };
  }

  if (type === 'true_false') {
    const kept: any[] = [];
    const statements = Array.isArray(activity?.statements) ? activity.statements : [];
    statements.forEach((s: any, i: number) => {
      if (typeof s?.isCorrect !== 'boolean') {
        issues.push(`第${i + 1}题 isCorrect 不是 boolean`);
        return;
      }
      if (!String(s?.statement ?? '').trim()) {
        issues.push(`第${i + 1}题题干为空`);
        return;
      }
      kept.push(s);
    });
    if (kept.length < MIN_ITEMS) {
      return {
        ok: false,
        activity,
        issues: issues.length ? issues : [`true_false 有效题目不足 ${MIN_ITEMS} 道`],
        fixes,
      };
    }
    return { ok: true, activity: { ...activity, statements: kept }, issues: [], fixes };
  }

  if (type === 'fill_blank') {
    const kept: any[] = [];
    const sentences = Array.isArray(activity?.sentences) ? activity.sentences : [];
    sentences.forEach((s: any, i: number) => {
      const text = String(s?.text ?? '');
      const answer = String(s?.answer ?? '').trim();
      const options: string[] = Array.isArray(s?.options) ? s.options.map(String) : [];
      if (!hasBlankMarker(text)) {
        issues.push(`第${i + 1}题缺少填空标记`);
        return;
      }
      if (!answer || !options.includes(answer)) {
        issues.push(`第${i + 1}题 answer 不在 options 中`);
        return;
      }
      const math = parseArithmetic(text);
      if (math && math.expected >= 0) {
        const answerNum = parseOptionNumber(answer);
        if (answerNum !== null && answerNum !== math.expected) {
          issues.push(`第${i + 1}题填空答案错误：${math.expression} 应等于 ${math.expected}`);
          return;
        }
      }
      if (math && math.expected < 0) {
        issues.push(`第${i + 1}题出现负数结果，超出幼儿认知`);
        return;
      }
      kept.push(s);
    });
    if (kept.length < MIN_ITEMS) {
      return {
        ok: false,
        activity,
        issues: issues.length ? issues : [`fill_blank 有效题目不足 ${MIN_ITEMS} 道`],
        fixes,
      };
    }
    return { ok: true, activity: { ...activity, sentences: kept }, issues: [], fixes };
  }

  return { ok: true, activity, issues: [], fixes };
}

function checkQuizQuestion(
  q: any,
  i: number,
  fixes: string[],
): { question?: any; issue?: string } {
  const question = String(q?.question ?? '').trim();
  if (!question) return { issue: `第${i + 1}题题干为空` };

  const rawOptions: string[] = Array.isArray(q?.options)
    ? q.options.map((o: any) => String(o ?? '').trim()).filter(Boolean)
    : [];
  let correctIndex = Number(q?.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= rawOptions.length) {
    return { issue: `第${i + 1}题 correctIndex 越界（${q?.correctIndex}），必须重新生成` };
  }

  // Dedup options, remapping the answer to its first occurrence
  const seen = new Map<string, number>();
  const options: string[] = [];
  let remapped = correctIndex;
  rawOptions.forEach((opt, idx) => {
    const key = opt.toLowerCase();
    if (seen.has(key)) {
      if (idx === correctIndex) remapped = seen.get(key)!;
      return;
    }
    seen.set(key, options.length);
    if (idx === correctIndex) remapped = options.length;
    options.push(opt);
  });
  if (options.length < MIN_ITEMS) {
    return { issue: `第${i + 1}题去重后选项不足 ${MIN_ITEMS} 个` };
  }
  if (remapped !== correctIndex || options.length !== rawOptions.length) {
    fixes.push(`第${i + 1}题选项去重 ${rawOptions.length}→${options.length}`);
    correctIndex = remapped;
  }

  const math = parseArithmetic(question);
  if (math) {
    if (math.expected < 0) {
      return { issue: `第${i + 1}题减法结果为负数（${math.expression}），超出幼儿认知` };
    }
    const answerNum = parseOptionNumber(options[correctIndex]);
    if (answerNum !== null && answerNum !== math.expected) {
      const matches = options
        .map((opt, idx) => ({ idx, num: parseOptionNumber(opt) }))
        .filter((o) => o.num === math.expected);
      if (matches.length === 1) {
        fixes.push(
          `第${i + 1}题数学答案修正 ${options[correctIndex]}→${options[matches[0].idx]}（${math.expression}=${math.expected}）`,
        );
        correctIndex = matches[0].idx;
      } else {
        return {
          issue: `第${i + 1}题数学答案错误：${math.expression} 应等于 ${math.expected}，标注为 ${options[correctIndex]}`,
        };
      }
    }
  }

  return {
    question: {
      ...q,
      question,
      options,
      correctIndex,
      explanation: String(q?.explanation ?? '').trim() || `正确答案是：${options[correctIndex]}`,
    },
  };
}

// ─── Arithmetic helpers ──────────────────────────────────────────────────

interface Arithmetic {
  expression: string;
  expected: number;
}

const CN_NUMERALS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function normalizeDigits(text: string): string {
  return text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/＝/g, '=');
}

/** Parse a direct arithmetic expression ("3 + 2 = ?", "5减2等于几", "3+2=___"). Word problems return null. */
export function parseArithmetic(text: string): Arithmetic | null {
  const t = normalizeDigits(String(text ?? ''));
  const symbolic = t.match(/(\d+)\s*([+\-])\s*(\d+)\s*=\s*(?:[?？]|_{2,})/);
  const verbal = t.match(/(\d+)\s*(加|减)\s*(\d+)/);
  const m = symbolic ?? verbal;
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const op = m[2] === '+' || m[2] === '加' ? '+' : '-';
  const expected = op === '+' ? a + b : a - b;
  return { expression: `${a} ${op} ${b}`, expected };
}

/** Leading numeric value of an option ("5", "5个", "五"). Null when not numeric. */
export function parseOptionNumber(option: string): number | null {
  const t = normalizeDigits(String(option ?? '')).trim();
  const digit = t.match(/^-?\d+(?:\.\d+)?/);
  if (digit) return Number(digit[0]);
  const cn = t.match(/^[零一二两三四五六七八九十]/);
  if (cn) return CN_NUMERALS[cn[0]] ?? null;
  return null;
}

function hasBlankMarker(text: string): boolean {
  return /_{2,}|\(\s*\)|\[\s*\]|（\s*）/.test(text);
}

// ─── L2: batched LLM-as-judge ────────────────────────────────────────────

interface JudgeVerdict {
  i: number;
  verdict: 'correct' | 'incorrect' | 'ambiguous' | 'inappropriate';
  correctedIndex?: number;
  correctedIsCorrect?: boolean;
  correctedAnswer?: string;
  reason?: string;
}

/**
 * Judge a whole batch in one call. Throws on LLM/parse failure so the caller
 * can degrade to L1-only. Mutates nothing — returns a new activity.
 */
export async function judgeActivityAnswers(
  llm: JudgeLlm,
  activity: any,
  ctx: AnswerCheckContext,
): Promise<AnswerCheckResult> {
  const type = activity?.type;
  if (!isJudgeableType(type)) {
    return { ok: true, activity, issues: [], fixes: [] };
  }

  const items = buildJudgeItems(activity);
  const factsBlock = ctx.facts?.length
    ? `\n事实依据（知识卡）：\n${ctx.facts.map((f) => `- ${f}`).join('\n')}\n`
    : '';
  const prompt = `你是幼儿内容审核员。请逐题审核下面这批给${ctx.ageGroup}岁孩子的题目，判断标注答案是否正确、干扰项是否成立。

判定标准：
- correct：答案事实正确，且其他选项都明确错误（无歧义）
- incorrect：答案事实错误 → 给出修正（选择题给 correctedIndex，判断题给 correctedIsCorrect，填空题给 correctedAnswer）
- ambiguous：多个选项都可成立（如"什么球是圆的"配足球/篮球）→ 必须拒绝
- inappropriate：超出该年龄段认知（负数、抽象概念、识字量超标）
${factsBlock}
主题：${ctx.topic}
题目（JSON）：
${JSON.stringify(items)}

只返回 JSON，不要任何其他文字：
{"results":[{"i":0,"verdict":"correct","reason":"简短理由"}]}
要求：i 从 0 开始与输入顺序一致，每题都必须给结论；incorrect 时必须带对应修正字段。`;

  const response = await llm.generateJson(
    prompt,
    'You are a strict children content reviewer. You output strict JSON only.',
    { temperature: 0, maxTokens: 4096 },
  );
  const parsed = extractJsonObject<{ results?: JudgeVerdict[] }>(response);
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error('answer judge returned unparseable verdicts');
  }
  const byIndex = new Map<number, JudgeVerdict>();
  for (const v of parsed.results) {
    if (Number.isInteger(v?.i)) byIndex.set(v.i, v);
  }

  return applyVerdicts(activity, byIndex);
}

function buildJudgeItems(activity: any): any[] {
  if (activity.type === 'quiz') {
    return (activity.questions ?? []).map((q: any, i: number) => ({
      i,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
    }));
  }
  if (activity.type === 'true_false') {
    return (activity.statements ?? []).map((s: any, i: number) => ({
      i,
      statement: s.statement,
      isCorrect: s.isCorrect,
      explanation: s.explanation,
    }));
  }
  return (activity.sentences ?? []).map((s: any, i: number) => ({
    i,
    text: s.text,
    answer: s.answer,
    options: s.options,
  }));
}

function applyVerdicts(activity: any, byIndex: Map<number, JudgeVerdict>): AnswerCheckResult {
  const issues: string[] = [];
  const fixes: string[] = [];
  const type = activity.type;
  const listKey = type === 'quiz' ? 'questions' : type === 'true_false' ? 'statements' : 'sentences';
  const items: any[] = Array.isArray(activity?.[listKey]) ? activity[listKey] : [];
  const kept: any[] = [];

  items.forEach((item, i) => {
    const v = byIndex.get(i);
    if (!v || v.verdict === 'correct') {
      kept.push(item);
      return;
    }
    const label = `第${i + 1}题`;
    if (v.verdict === 'ambiguous' || v.verdict === 'inappropriate') {
      fixes.push(`${label}被评审丢弃（${v.verdict}）：${v.reason ?? ''}`);
      return;
    }
    // incorrect — apply the judge's correction, then re-run L1 on the item
    const fixed = applyCorrection(type, item, v);
    if (!fixed) {
      issues.push(`${label}答案错误且评审未给出有效修正：${v.reason ?? ''}`);
      return;
    }
    const recheck = validateAnswersL1(
      { type, [listKey]: [fixed, fixed, fixed] },
      { topic: '', ageGroup: '' },
    );
    const recheckedItem = recheck.activity?.[listKey]?.[0];
    if (!recheck.ok || !recheckedItem) {
      issues.push(`${label}修正后仍不合格：${recheck.issues.join('；')}`);
      return;
    }
    fixes.push(`${label}答案已按评审修正：${v.reason ?? ''}`);
    kept.push(recheckedItem);
  });

  if (issues.length > 0) {
    return { ok: false, activity, issues, fixes };
  }
  if (kept.length < MIN_ITEMS) {
    return {
      ok: false,
      activity,
      issues: [`评审后有效题目不足 ${MIN_ITEMS} 道（丢弃 ${items.length - kept.length} 道）`],
      fixes,
    };
  }
  return { ok: true, activity: { ...activity, [listKey]: kept }, issues: [], fixes };
}

function applyCorrection(type: string, item: any, v: JudgeVerdict): any | null {
  if (type === 'quiz') {
    const idx = Number(v.correctedIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= (item.options?.length ?? 0)) return null;
    return { ...item, correctIndex: idx };
  }
  if (type === 'true_false') {
    if (typeof v.correctedIsCorrect !== 'boolean') return null;
    return { ...item, isCorrect: v.correctedIsCorrect };
  }
  const answer = String(v.correctedAnswer ?? '').trim();
  if (!answer || !Array.isArray(item.options) || !item.options.includes(answer)) return null;
  return { ...item, answer };
}