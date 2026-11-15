import { VideoParamRepairService } from '../../src/modules/learning/video-param-repair.service';
import type { VisualQaVerdict } from '../../src/modules/learning/visual-qa.service';
import type { SceneGraph } from '../../src/modules/learning/video/scene-graph';

/**
 * 参数修复是 QA gate 的唯一自动修改面，必须比创作路径更保守：
 * 只接 blocker/major 且非 code 的问题；LLM 产物逐项校验；
 * 任何失败都收敛为 null（保留原片），绝不把脏参数带进重渲。
 */

const GRAPH: SceneGraph = {
  relation: 'cycle',
  nodes: [
    { id: 'n1', label: '水', subject: '小水滴', role: 'object' },
    { id: 'n2', label: '水蒸气', subject: '水蒸气', role: 'abstract', sign: 'rise' },
    { id: 'n3', label: '云', subject: '云朵', role: 'object' },
  ],
};

const NARRATION = '小水滴被太阳晒热了。它变成水蒸气往上跑。云又变回小水滴落下来。';

function makeScene(beats?: any[]) {
  return {
    title: '水循环',
    narration: NARRATION,
    durationSec: 9,
    sceneGraph: GRAPH as unknown as Record<string, unknown>,
    beats:
      beats ??
      [
        { sentenceIndex: 0, focus: 'n1', motion: 'focus-ring' },
        { sentenceIndex: 1, focus: 'n2', motion: 'swell' },
        { sentenceIndex: 2, focus: 'n3', motion: 'orbit' },
      ],
  };
}

function verdictWith(issues: VisualQaVerdict['issues']): VisualQaVerdict {
  return {
    score: 55,
    passed: false,
    model: 'test-vision',
    framesReviewed: 6,
    perScene: [],
    issues,
  };
}

const BLOCKER = {
  sceneId: 'scene-1',
  issue: '水蒸气没有成为焦点',
  severity: 'blocker' as const,
  fixTarget: 'dsl' as const,
  fixHint: '给水蒸气加 focus-ring',
};

function makeService(generateJson: jest.Mock) {
  return new VideoParamRepairService({ generateJson } as any);
}

describe('VideoParamRepairService', () => {
  it('只有 minor 或 code 类问题时不调 LLM，直接 null', async () => {
    const generateJson = jest.fn();
    const service = makeService(generateJson);
    const result = await service.repair(
      { scenes: [makeScene()] },
      verdictWith([
        { ...BLOCKER, severity: 'minor' },
        { ...BLOCKER, fixTarget: 'code' },
      ]),
      '5-6',
    );
    expect(result).toBeNull();
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('合法补丁被合并：beats 过 sanitize、accent/background 覆盖生效', async () => {
    const generateJson = jest.fn().mockResolvedValue(
      JSON.stringify({
        scenes: [
          {
            index: 0,
            beats: [
              { sentenceIndex: 0, focus: 'n1', motion: 'focus-ring' },
              { sentenceIndex: 1, focus: 'n2', motion: 'swell' },
              { sentenceIndex: 2, focus: 'n3', motion: 'orbit' },
            ],
            accentColor: '#ff8800',
            backgroundStyle: 'neutral',
          },
        ],
      }),
    );
    const service = makeService(generateJson);
    const result = await service.repair({ scenes: [makeScene()] }, verdictWith([BLOCKER]), '5-6');
    expect(result).not.toBeNull();
    const scene = result!.scenes[0];
    expect(scene.accentColor).toBe('#ff8800');
    expect(scene.backgroundStyle).toBe('neutral');
    expect(scene.beats!.length).toBe(3);
    expect(scene.beats!.every((b) => b.sentenceIndex >= 0 && b.sentenceIndex <= 2)).toBe(true);
  });

  it('越界 index、非法颜色、非法背景一律丢弃', async () => {
    const generateJson = jest.fn().mockResolvedValue(
      JSON.stringify({
        scenes: [
          { index: 5, accentColor: '#123456' },
          { index: 0, accentColor: 'red', backgroundStyle: 'forest' },
        ],
      }),
    );
    const service = makeService(generateJson);
    const result = await service.repair({ scenes: [makeScene()] }, verdictWith([BLOCKER]), '5-6');
    expect(result).toBeNull();
  });

  it('LLM 没听话时兜底网补齐未点名节点的 focus-ring', async () => {
    const generateJson = jest.fn().mockResolvedValue('{}');
    const service = makeService(generateJson);
    const partial = makeScene([{ sentenceIndex: 0, focus: 'n1', motion: 'focus-ring' }]);
    const result = await service.repair({ scenes: [partial] }, verdictWith([BLOCKER]), '5-6');
    expect(result).not.toBeNull();
    const focused = new Set(result!.scenes[0].beats!.map((b) => b.focus));
    expect(focused.has('n2')).toBe(true);
    expect(focused.has('n3')).toBe(true);
  });

  it('LLM 调用失败不抛错：全覆盖场景收敛为 null', async () => {
    const generateJson = jest.fn().mockRejectedValue(new Error('gateway dropped'));
    const service = makeService(generateJson);
    const result = await service.repair({ scenes: [makeScene()] }, verdictWith([BLOCKER]), '5-6');
    expect(result).toBeNull();
  });

  it('不修改原分镜（重渲失败时原片仍可放行）', async () => {
    const generateJson = jest.fn().mockResolvedValue(
      JSON.stringify({ scenes: [{ index: 0, accentColor: '#00ff00' }] }),
    );
    const service = makeService(generateJson);
    const original: any = makeScene();
    const originalBeats = original.beats;
    await service.repair({ scenes: [original] }, verdictWith([BLOCKER]), '5-6');
    expect(original.accentColor).toBeUndefined();
    expect(original.beats).toBe(originalBeats);
  });
});