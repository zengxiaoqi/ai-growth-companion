import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import type { SafetyCategory, SafetyFlag } from './safety.types';

/**
 * The second-layer risk classifier.
 *
 * The rule layer catches explicit cries for help in under a millisecond;
 * this layer is for the signals that never contain a keyword —
 * 「我不想去上学了」「我是多余的」. It runs *after* the words exist and
 * never in the reply path, so a slow model cannot delay an answer.
 *
 * Output is three probabilities with deliberately asymmetric thresholds:
 * recall over precision at the watch line. The watch band never touches
 * the child and never touches the secrecy level; the high band is the
 * only place a parent notification comes from.
 *
 * The model never decides alone: its score is thresholded in code, and a
 * failed call returns no flags — the rule layer, the parent window and
 * the human in the loop are the rest of the safety net.
 *
 * Ported from 碎碎念 `agent/safety/classifier.py`.
 */
@Injectable()
export class SafetyClassifier {
  private readonly logger = new Logger(SafetyClassifier.name);
  private readonly highThreshold: number;
  private readonly watchThreshold: number;
  private readonly enabled: boolean;

  constructor(
    private readonly llmClient: LlmClientService,
    private readonly configService: ConfigService,
  ) {
    this.highThreshold = clamp01(
      Number(this.configService.get<string>('SAFETY_HIGH_THRESHOLD', '0.6')),
      0.6,
    );
    this.watchThreshold = clamp01(
      Number(this.configService.get<string>('SAFETY_WATCH_THRESHOLD', '0.35')),
      0.35,
    );
    const raw = this.configService.get<string>('SAFETY_CLASSIFIER_ENABLED', 'true');
    this.enabled = !['false', '0', 'no', 'off'].includes(String(raw).trim().toLowerCase());
  }

  /**
   * Flags for one passage; empty when nothing crosses a line.
   *
   * A model failure returns no flags by design: this layer widens
   * coverage, it does not gate the reply, and the rule layer plus the
   * parent remain the guaranteed paths.
   */
  async classify(text: string): Promise<SafetyFlag[]> {
    if (!this.enabled || !text?.trim()) return [];
    if (!this.llmClient.isConfigured) return [];

    let raw: string;
    try {
      raw = await this.llmClient.generate(buildPrompt(text), CLASSIFIER_SYSTEM_PROMPT);
    } catch (err) {
      this.logger.warn(`safety classifier call failed: ${(err as Error).message}`);
      return [];
    }

    const scores = parseScores(raw);
    if (!scores) {
      this.logger.warn('safety classifier returned unparseable output');
      return [];
    }

    const flags: SafetyFlag[] = [];
    for (const [field, category] of SCORE_FIELDS) {
      const score = scores[field];
      if (score == null) continue;
      if (score >= this.highThreshold) {
        flags.push({
          category,
          level: 'critical',
          source: 'classifier',
          snippet: `${field}=${score.toFixed(2)}`,
        });
      } else if (score >= this.watchThreshold) {
        flags.push({
          category,
          level: 'watch',
          source: 'classifier',
          snippet: `${field}=${score.toFixed(2)}`,
        });
      }
    }
    return flags;
  }
}

/** Score field → the category it reports. */
const SCORE_FIELDS: Array<[string, SafetyCategory]> = [
  ['self_harm', 'self_harm'],
  // The model's word for what the flag vocabulary calls violence
  // (被伤害 / 被霸凌).
  ['bullied', 'violence'],
  ['danger', 'danger'],
];

const CLASSIFIER_SYSTEM_PROMPT =
  '你是儿童安全信号分类器，只输出 JSON，不要解释。';

function buildPrompt(text: string): string {
  return `阅读这段孩子说的话，输出三类风险的概率（0 到 1 的小数）：
- self_harm：自伤、自杀、放弃自己的信号
- bullied：被霸凌、被欺负、被伤害的信号
- danger：处于紧急危险环境（火灾、走失、陌生人等）

只输出 JSON：{"self_harm": 0.0, "bullied": 0.0, "danger": 0.0}
注意：普通的心情低落或抱怨不是自伤；同学间的小摩擦不是霸凌。
不确定就给低分——漏报的兜底是家长与规则层，误报会打断孩子。

--- 孩子的话 ---
${text}`;
}

function parseScores(raw: string): Record<string, number> | null {
  const match = /\{[\s\S]*\}/.exec(raw ?? '');
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [field] of SCORE_FIELDS) {
      const value = Number(parsed[field]);
      if (Number.isFinite(value)) out[field] = Math.min(1, Math.max(0, value));
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}
