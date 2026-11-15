import { repairFigures, type FigureReject } from '../../src/modules/learning/video/figure-repair';
import { normalizeFigureSpec } from '../../src/modules/learning/video/figure-spec';

/**
 * figure 修复轮是创作路径的追加面，必须和参数修复一样保守：
 * 只收校验通过的产物、index 必须对得上原拒绝、任何失败收敛为 null，
 * 且整轮只允许一次 LLM 调用（≤1 轮的预算红线）。
 */

const ACCENT = '#3E63DD';

/** 小圆缩在角落：coverage 拒绝（面积 0.6% < 12%） */
const SMALL_FIGURE = {
  shapes: [{ kind: 'circle', cx: 200, cy: 100, r: 40, fill: '#FFB703' }],
  labels: [{ text: '太阳', x: 200, y: 180 }],
};

/** 居中大圆：通过全部几何校验 */
const BIG_FIGURE = {
  shapes: [{ kind: 'circle', cx: 800, cy: 320, r: 260, fill: '#FFB703' }],
  labels: [{ text: '太阳', x: 200, y: 100 }],
};

function makeReject(sceneIndex: number): FigureReject {
  return {
    sceneIndex,
    title: `场景${sceneIndex + 1}`,
    narration: '这是太阳。',
    accent: ACCENT,
    reason: 'coverage',
    figure: JSON.parse(JSON.stringify(SMALL_FIGURE)),
  };
}

function llmReturning(payload: unknown) {
  return { generateJson: jest.fn().mockResolvedValue(JSON.stringify(payload)) };
}

describe('repairFigures', () => {
  it('空拒绝列表直接返回 null，不烧 token', async () => {
    const llm = llmReturning({ figures: [] });
    await expect(repairFigures(llm, [])).resolves.toBeNull();
    expect(llm.generateJson).not.toHaveBeenCalled();
  });

  it('合法修复被接受且产物已过校验，model 透传', async () => {
    const llm = llmReturning({ figures: [{ index: 2, figure: BIG_FIGURE }] });
    const fixed = await repairFigures(llm, [makeReject(2)], 'author-x');
    expect(fixed?.size).toBe(1);
    const spec = fixed!.get(2)!;
    expect(normalizeFigureSpec(spec, ACCENT).ok).toBe(true);
    expect(llm.generateJson).toHaveBeenCalledWith(
      expect.stringContaining('修复任务'),
      undefined,
      expect.objectContaining({ model: 'author-x' }),
    );
    const prompt = llm.generateJson.mock.calls[0][0] as string;
    expect(prompt).toContain('coverage');
    expect(prompt).toContain('放大主体');
  });

  it('index 对不上原拒绝的产物被丢弃', async () => {
    const llm = llmReturning({ figures: [{ index: 99, figure: BIG_FIGURE }] });
    await expect(repairFigures(llm, [makeReject(2)])).resolves.toBeNull();
  });

  it('重画仍不过校验的产物被丢弃，不静默放行', async () => {
    const llm = llmReturning({ figures: [{ index: 2, figure: SMALL_FIGURE }] });
    await expect(repairFigures(llm, [makeReject(2)])).resolves.toBeNull();
  });

  it('多条拒绝合并为一次 LLM 调用', async () => {
    const llm = llmReturning({
      figures: [
        { index: 0, figure: BIG_FIGURE },
        { index: 1, figure: BIG_FIGURE },
      ],
    });
    const fixed = await repairFigures(llm, [makeReject(0), makeReject(1)]);
    expect(fixed?.size).toBe(2);
    expect(llm.generateJson).toHaveBeenCalledTimes(1);
  });

  it('LLM 抛错收敛为 null（调用方负责记日志）', async () => {
    const llm = { generateJson: jest.fn().mockRejectedValue(new Error('gateway down')) };
    await expect(repairFigures(llm, [makeReject(0)])).resolves.toBeNull();
  });

  it('非 JSON 输出收敛为 null', async () => {
    const llm = { generateJson: jest.fn().mockResolvedValue('抱歉，我无法修复。') };
    await expect(repairFigures(llm, [makeReject(0)])).resolves.toBeNull();
  });

  it('不改动输入的拒绝列表与原 figure', async () => {
    const rejects = [makeReject(2)];
    const snapshot = JSON.stringify(rejects);
    const llm = llmReturning({ figures: [{ index: 2, figure: BIG_FIGURE }] });
    await repairFigures(llm, rejects);
    expect(JSON.stringify(rejects)).toBe(snapshot);
  });
});