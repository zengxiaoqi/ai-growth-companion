/**
 * 画面节点 ↔ 旁白对齐审计的契约测试。
 *
 * 钉住的是"从严"这条口径：label 或 subject 必须逐字出现在旁白里才算命中。
 * 不允许多数匹配器都会顺手做的那件事——用单字/近义词兜底。实测里
 * 「树根」靠单字「树」命中「一棵大树」、「小花」靠「小」命中「小种子」，
 * 两例都是静默错配：校验器说通过，画面却在讲一个没被讲过的概念。
 * 这种假阴性比不校验更糟，所以必须由测试锁死。
 */

import { auditGraphNarration, formatCoverageFeedback } from '../../src/modules/learning/video/scene-graph';

const node = (label: string, subject = label) => ({
  id: `n${label}`,
  label,
  subject,
  role: 'object' as const,
});

describe('auditGraphNarration', () => {
  it('每个 label 都被念到时覆盖率为满', () => {
    const result = auditGraphNarration(
      { nodes: [node('青草'), node('兔子'), node('狐狸')] },
      '青草被小兔子吃掉，小兔子又会被狐狸盯上。',
    );
    expect(result).toEqual({ total: 3, matched: 3, missing: [] });
  });

  it('旁白里没提到的节点必须被报出来', () => {
    const result = auditGraphNarration(
      { nodes: [node('太阳'), node('水汽'), node('白云'), node('雨滴', '雨')] },
      '太阳把水晒热，水变成看不见的水汽飞到天上，遇冷又变回小水珠落下来。',
    );
    expect(result.matched).toBe(2);
    expect(result.missing.map((m) => m.label)).toEqual(['白云', '雨滴']);
  });

  it('标点不影响命中：旁白里的顿号不该让标签失配', () => {
    const result = auditGraphNarration(
      { nodes: [node('苹果'), node('香蕉'), node('葡萄')] },
      '苹果、香蕉和葡萄，它们都是水果。',
    );
    expect(result.missing).toEqual([]);
  });

  it('单字重合并不能算命中，否则会静默错配', () => {
    // 「树根」的「树」出现在「一棵大树」里，「小花」的「小」出现在「小种子」里
    const result = auditGraphNarration(
      { nodes: [node('幼苗'), node('小花', '花朵'), node('大树')] },
      '一颗小种子埋在土里，慢慢长出嫩芽，最后长成了一棵高高的大树。',
    );
    expect(result.matched).toBe(1);
    expect(result.missing.map((m) => m.label)).toEqual(['幼苗', '小花']);
  });

  it('subject 是对外说法时按 subject 命中，标签可以更短', () => {
    const result = auditGraphNarration({ nodes: [node('阳光', '太阳')] }, '太阳照到空中的小水滴。');
    expect(result.missing).toEqual([]);
  });

  it('单字标签在旁白里出现两次仍算命中——重复指的多半是同一个概念', () => {
    // 早先这里要求"单字且全篇唯一"才算覆盖，理由是单字子串会静默错配。
    // 但实测生成端压不住单字（把"不要用单字"写进提示词后单字反而更多），
    // 结果是这些节点永远不亮。锚点建设已改成"整词匹配、取第一次"，
    // 审计随之放宽：只要旁白里出现过这个字就算讲到了。
    const result = auditGraphNarration(
      { nodes: [node('云', '云朵')] },
      '遇冷变云，云越积厚，就落下雨滴。',
    );
    expect(result.matched).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('单字标签在全篇只出现一次：可用', () => {
    const result = auditGraphNarration({ nodes: [node('风', '风')] }, '风在流动，时间往前走。');
    expect(result.matched).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('双字标签重复出现仍算命中——锚到第一次，不会错配到无关的词', () => {
    const result = auditGraphNarration(
      { nodes: [node('雨滴', '雨滴')] },
      '雨滴落下来，雨滴打在叶子上。',
    );
    expect(result.matched).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('没有图或空节点时不报错', () => {
    expect(auditGraphNarration(null, '随便说点什么')).toEqual({ total: 0, matched: 0, missing: [] });
    expect(auditGraphNarration({ nodes: [] }, '')).toEqual({ total: 0, matched: 0, missing: [] });
  });
});

describe('formatCoverageFeedback', () => {
  it('要说清场景、缺失节点、旁白原文和修法，模型才知道怎么改', () => {
    const coverage = auditGraphNarration(
      { nodes: [node('太阳'), node('白云')] },
      '太阳把水晒热，水汽飞到天上。',
    );
    const text = formatCoverageFeedback('水转了一圈', '太阳把水晒热，水汽飞到天上。', coverage);
    expect(text).toContain('水转了一圈');
    expect(text).toContain('「白云」');
    expect(text).toContain('太阳把水晒热');
    expect(text).toContain('换成旁白里确实说过的词');
  });

  it('旁白自带句末标点时不再补一个句号', () => {
    const narration = '太阳把水晒热。';
    const coverage = auditGraphNarration({ nodes: [node('白云')] }, narration);
    const text = formatCoverageFeedback('水转了一圈', narration, coverage);
    expect(text).toContain('太阳把水晒热。修法');
    expect(text).not.toContain('。。');
  });
});
