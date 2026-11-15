import { extractJsonObject } from '../../../agent-framework/core';
import { describeFigureGrammar, normalizeFigureSpec } from './figure-spec';

/**
 * figure 几何修复轮（≤1 轮）：normalizeFigureSpec 拒掉的 figure 把拒绝原因喂回
 * 创作模型重画一次。拒绝原因都是空间布局习惯（主体太小/偏居/标签压图），
 * 属于"说清楚就能改对"的面；重画仍不过则保留原拒绝结果，不静默放行。
 * 纯函数 + 注入 generateJson：生产 tool 与 measure 脚本走同一条修复代码路径。
 */

export type FigureReject = {
  sceneIndex: number;
  title?: string;
  narration?: string;
  accent: string;
  reason: string;
  figure: Record<string, unknown>;
};

export type FigureRepairLlm = {
  generateJson(
    prompt: string,
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number; model?: string },
  ): Promise<string>;
};

const REASON_HINTS: Record<string, string> = {
  coverage: '主体占画布面积太小：放大主体、拉开纵向布局，让图形铺满画布中部',
  'off-center': '主体偏居一侧：把整体布局移回画布中心',
  'label-cover': '标签压在图形上：把标签移到图形外的空白处',
  'no-main-shape': '缺主图形：补一个表达知识主体的大图元',
  'tiny-arc': '弧太小：放大弧半径',
};

export async function repairFigures(
  llm: FigureRepairLlm,
  rejects: FigureReject[],
  model?: string,
): Promise<Map<number, Record<string, unknown>> | null> {
  if (!rejects.length) return null;
  const view = rejects.map((r) => ({
    index: r.sceneIndex,
    title: r.title,
    narration: r.narration,
    rejectReason: REASON_HINTS[r.reason] ? `${r.reason}：${REASON_HINTS[r.reason]}` : r.reason,
    figure: r.figure,
  }));
  const prompt = [
    describeFigureGrammar(),
    '## 修复任务（只改布局，不改知识）',
    '下面这些 figure 被几何校验拒了。逐条按 rejectReason 重画：保留原意、主体与标签文字，',
    '只调整尺寸/位置/标签摆放。重画后必须仍满足上方 figure 语法与画布约束。',
    '输出 {"figures":[{"index":<原 index>,"figure":{...}}]}，不要输出其它内容。',
    JSON.stringify(view),
  ].join('\n\n');

  let parsed: any;
  try {
    const raw = await llm.generateJson(prompt, undefined, {
      temperature: 0.2,
      maxTokens: 6000,
      model,
    });
    parsed = extractJsonObject(raw);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed?.figures) ? parsed.figures : [];
  const byIndex = new Map(rejects.map((r) => [r.sceneIndex, r]));
  const fixed = new Map<number, Record<string, unknown>>();
  for (const item of list) {
    const rej = byIndex.get(Math.trunc(Number(item?.index)));
    if (!rej || !item.figure || typeof item.figure !== 'object') continue;
    const normalized = normalizeFigureSpec(item.figure, rej.accent);
    if (normalized.ok) fixed.set(rej.sceneIndex, normalized.spec as Record<string, unknown>);
  }
  return fixed.size ? fixed : null;
}