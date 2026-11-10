/**
 * 一次通过率统计脚本的契约测试（纯离线，不调用 LLM）。
 * 脚本为 CommonJS 模块，导出 parseLine / aggregate / renderReport 供测试复用。
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const tool = require('../../scripts/measure-activity-pass-rate.js');

function line(ts: string, level: string, event: string, data: object): string {
  return `${ts} [${level}] [GenerateActivityTool] [generateActivity] ${event} ${JSON.stringify(data)}`;
}

const TS = '2026-11-11 09:00:00';

function sampleLog(): string[] {
  return [
    // run A：一次通过（quiz）
    line(TS, 'info', 'start', { runId: 'A', type: 'quiz', topic: '水果' }),
    line(TS, 'info', 'llm_request', { runId: 'A', attempt: 1, type: 'quiz' }),
    line(TS, 'info', 'success', { runId: 'A', attempt: 1, type: 'quiz', topic: '水果' }),
    // run B：第 2 次通过（tap_target）
    line(TS, 'info', 'start', { runId: 'B', type: 'tap_target', topic: '动物' }),
    line(TS, 'warn', 'attempt_failed', { runId: 'B', attempt: 1, reason: 'prompt must mention the correct target label' }),
    line(TS, 'info', 'llm_request', { runId: 'B', attempt: 2, type: 'tap_target' }),
    line(TS, 'info', 'success', { runId: 'B', attempt: 2, type: 'tap_target', topic: '动物' }),
    // run C：重试后失败（color_fill）
    line(TS, 'info', 'start', { runId: 'C', type: 'color_fill', topic: '形状' }),
    line(TS, 'warn', 'attempt_exception', { runId: 'C', attempt: 1, reason: 'missing: white' }),
    line(TS, 'warn', 'attempt_exception', { runId: 'C', attempt: 2, reason: 'missing: white' }),
    line(TS, 'error', 'failed_after_retries', {
      runId: 'C',
      type: 'color_fill',
      topic: '形状',
      failures: ['attempt 1: missing: white', 'attempt 2: missing: white'],
    }),
    // run D：无终结事件（进程中断）
    line(TS, 'info', 'start', { runId: 'D', type: 'trace_path', topic: '常用字' }),
    // 无关日志 + 旧工具的 llm_response 事件（应被忽略）
    '2026-11-11 09:00:01 [info] [NestFactory] Starting Nest application...',
    line(TS, 'info', 'llm_response', { runId: 'A', attempt: 1, preview: '{"type":' }),
  ];
}

describe('measure-activity-pass-rate', () => {
  it('parses winston text lines, ignores unrelated lines and tolerates meta suffix', () => {
    expect(tool.parseLine(line(TS, 'info', 'success', { runId: 'A', attempt: 1 }))).toEqual({
      timestamp: TS,
      level: 'info',
      event: 'success',
      data: { runId: 'A', attempt: 1 },
    });
    // 无 context 段
    expect(
      tool.parseLine(`${TS} [warn] [generateActivity] attempt_failed {"runId":"B","reason":"x"}`),
    ).toMatchObject({ event: 'attempt_failed', data: { runId: 'B' } });
    // winston 追加的 meta JSON
    expect(
      tool.parseLine(`${line(TS, 'info', 'start', { runId: 'A', type: 'quiz' })} {"trace":"t"}`),
    ).toMatchObject({ event: 'start', data: { runId: 'A' } });
    expect(tool.parseLine('random log line')).toBeNull();
  });

  it('aggregates first-pass rate, failure rate and per-type breakdown', () => {
    const events = sampleLog().map((l: string) => tool.parseLine(l)).filter(Boolean);
    const stats = tool.aggregate(events);

    expect(stats.runs).toBe(4);
    expect(stats.success).toBe(2);
    expect(stats.firstPass).toBe(1);
    expect(stats.firstPassRate).toBe(0.5); // 成功 run 为分母
    expect(stats.overallFirstPassRate).toBeCloseTo(1 / 3, 3); // 含失败
    expect(stats.failed).toBe(1);
    expect(stats.incomplete).toBe(1);
    expect(stats.avgSuccessAttempts).toBe(1.5);
    expect(stats.byType.quiz.firstPassRate).toBe(1);
    expect(stats.byType.tap_target.firstPassRate).toBe(0);
    expect(stats.byType.color_fill.failed).toBe(1);
    expect(stats.topFailureReasons[0]).toEqual({ reason: 'missing: white', count: 4 });
  });

  it('filters by activity type and since date', () => {
    const events = sampleLog().map((l: string) => tool.parseLine(l)).filter(Boolean);
    const byType = tool.aggregate(events, { type: 'tap_target' });
    expect(byType.runs).toBe(1);
    expect(byType.firstPassRate).toBe(0);
    expect(byType.skippedByType).toBe(3);

    const future = tool.aggregate(events, { since: '2026-11-12' });
    expect(future.runs).toBe(0);
    expect(future.firstPassRate).toBeNull();
  });

  it('renders a markdown report with a no-data hint when there are no runs', () => {
    const empty = tool.aggregate([]);
    const report = tool.renderReport(empty, { logPath: 'logs/app.log' });
    expect(report).toContain('参数化活动 LLM 一次通过率报告');
    expect(report).toContain('尚无生产基线');
    expect(report).toContain('| （无数据） |');
  });
});
