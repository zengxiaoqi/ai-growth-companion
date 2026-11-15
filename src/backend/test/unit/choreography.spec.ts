import {
  splitSentences,
  deriveBeats,
  sanitizeBeats,
  beatWindows,
  enforceAgeProfile,
  describeChoreographyGrammar,
  ageMotionProfile,
} from '../../src/modules/learning/video/choreography';
import type { SceneGraph } from '../../src/modules/learning/video/scene-graph';
import { GenerateVideoContentTool } from '../../src/agent-framework/tools/impl/generate-video-content';

/**
 * 编排层是确定性路径"去呆板"的表达力来源，也是 QA 参数修复的修改面。
 * 这里锁住三件事：句级对齐不越界、年龄差异落在代码层而不是 prompt 自觉、
 * 非法输入永远收敛成可解释的 beats（渲染层不需要再防御）。
 */

const CYCLE: SceneGraph = {
  relation: 'cycle',
  nodes: [
    { id: 'n1', label: '水', subject: '小水滴', role: 'object' },
    { id: 'n2', label: '水蒸气', subject: '水蒸气', role: 'abstract', sign: 'rise', swell: 'grow' },
    { id: 'n3', label: '云', subject: '云朵', role: 'object', swell: 'grow' },
  ],
};

describe('splitSentences', () => {
  it('按中文句读切句且保留标点', () => {
    expect(splitSentences('太阳出来了。水变成水蒸气！云呢？')).toEqual([
      '太阳出来了。',
      '水变成水蒸气！',
      '云呢？',
    ]);
  });

  it('空旁白给空数组，不产生幽灵句子', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('deriveBeats', () => {
  const narration = '小水滴被太阳晒热了。它变成水蒸气往上跑。水蒸气聚成云。云又变回小水滴落下来。';

  it('焦点落在句中最先提到的节点，循环关系默认 orbit', () => {
    const beats = deriveBeats({ narration, graph: CYCLE }, '5-6');
    expect(beats.length).toBeGreaterThan(0);
    expect(beats[0].focus).toBe('n1');
    expect(beats.some((b) => b.motion === 'orbit')).toBe(true);
  });

  it('带 swell 的节点被讲到时用 swell 而不是 orbit', () => {
    const beats = deriveBeats({ narration, graph: CYCLE }, '5-6');
    const vapor = beats.find((b) => b.focus === 'n2');
    expect(vapor?.motion).toBe('swell');
  });

  it('3-4 岁合并短句子更激进（每拍字数门槛更高）', () => {
    const short = '看云。云变大。下雨啦。水滴落。云散了。';
    const young = deriveBeats({ narration: short, graph: CYCLE }, '3-4');
    const older = deriveBeats({ narration: short, graph: CYCLE }, '5-6');
    expect(young.length).toBeLessThan(older.length);
  });

  it('3-4 岁每拍最多揭示一个元素，5-6 岁允许叠置', () => {
    const text = '小水滴和水蒸气和云都来了。';
    const young = deriveBeats({ narration: text, graph: CYCLE }, '3-4');
    const older = deriveBeats({ narration: text, graph: CYCLE }, '5-6');
    for (const b of young) expect((b.reveal || []).length).toBeLessThanOrEqual(1);
    expect((older[0].reveal || []).length).toBeGreaterThan(1);
  });

  it('无图无标签时兜底 fade-rise，不装懂', () => {
    const beats = deriveBeats({ narration: '我们来学习。' }, '5-6');
    expect(beats[0].motion).toBe('fade-rise');
  });
});

describe('sanitizeBeats', () => {
  const narration = '第一句在这里。第二句在这里。第三句在这里。';

  it('缺失/非法输入回退推导，永远返回非空 beats', () => {
    for (const raw of [undefined, null, [], 'beats', {}]) {
      const beats = sanitizeBeats(raw, { narration, graph: CYCLE }, '5-6');
      expect(beats.length).toBeGreaterThan(0);
    }
  });

  it('sentenceIndex 越界被夹回，span 不超过剩余句数', () => {
    const beats = sanitizeBeats(
      [{ sentenceIndex: 99, span: 50, motion: 'orbit' }],
      { narration, graph: CYCLE },
      '5-6',
    );
    expect(beats[0].sentenceIndex).toBe(2);
    expect(beats[0].span).toBe(1);
  });

  it('未知 motion 收敛到默认预设而不是原样放行', () => {
    const beats = sanitizeBeats(
      [{ sentenceIndex: 0, motion: 'explode' }],
      { narration, graph: CYCLE },
      '5-6',
    );
    expect(beats[0].motion).toBe('focus-ring');
  });

  it('同一句的重复 beats 去重且按句序排列', () => {
    const beats = sanitizeBeats(
      [
        { sentenceIndex: 2, motion: 'orbit' },
        { sentenceIndex: 0, motion: 'orbit' },
        { sentenceIndex: 0, motion: 'swell' },
      ],
      { narration, graph: CYCLE },
      '5-6',
    );
    expect(beats.map((b) => b.sentenceIndex)).toEqual([0, 2]);
  });

  it('3-4 岁把 LLM 给的叠置 reveal 削成单元素', () => {
    const beats = sanitizeBeats(
      [{ sentenceIndex: 0, motion: 'stagger', reveal: ['n1', 'n2', 'n3'] }],
      { narration, graph: CYCLE },
      '3-4',
    );
    expect(beats[0].reveal).toEqual(['n1']);
  });
});

describe('beatWindows', () => {
  const narration = '短句。这是一个明显更长的句子用来占字数。收尾。';
  const beats = sanitizeBeats(undefined, { narration }, '5-6');

  it('时间窗按句字数比例分配，覆盖整个场景时长', () => {
    const windows = beatWindows(beats, narration, 12);
    expect(windows.length).toBe(beats.length);
    expect(windows[0].startSec).toBe(0);
    expect(windows[windows.length - 1].endSec).toBeCloseTo(12, 5);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i].startSec).toBeGreaterThanOrEqual(windows[i - 1].startSec);
    }
    for (const w of windows) expect(w.endSec).toBeGreaterThan(w.startSec);
  });

  it('长句拿到更长的时间窗', () => {
    const sentences = splitSentences(narration);
    const windows = beatWindows(
      sentences.map((_, i) => ({ sentenceIndex: i, motion: 'focus-ring' as const })),
      narration,
      12,
    );
    const long = windows[1].endSec - windows[1].startSec;
    const short = windows[0].endSec - windows[0].startSec;
    expect(long).toBeGreaterThan(short);
  });
});

describe('年龄规格', () => {
  it('3-4 与 5-6 的节奏/幅度/叠置参数不同，且写进 prompt', () => {
    const young = ageMotionProfile('3-4');
    const older = ageMotionProfile('5-6');
    expect(young.minBeatSec).toBeGreaterThan(older.minBeatSec);
    expect(young.amplitude).toBeGreaterThan(older.amplitude);
    expect(young.allowOverlapReveal).toBe(false);
    expect(older.allowOverlapReveal).toBe(true);
    expect(describeChoreographyGrammar('3-4')).toContain('2.5');
    expect(describeChoreographyGrammar('5-6')).toContain('1.6');
  });
});

describe('分镜工具接线', () => {
  const tool = new GenerateVideoContentTool({} as any);

  it('buildPrompt 注入 beats 语法与年龄规格', () => {
    const prompt = (GenerateVideoContentTool.prototype as any).buildPrompt(
      '水循环',
      'science',
      '3-4',
      5,
    );
    expect(prompt).toContain('Choreography beats');
    expect(prompt).toContain('focus-ring');
    expect(prompt).toContain('"beats"');
    expect(prompt).toContain('2.5');
  });

  it('sanitizeStoryboard 给每个场景都带上可解释的 beats（含 LLM 未给时）', () => {
    const raw = {
      title: '水循环',
      scenes: [
        {
          narration: '小水滴被太阳晒热了。它变成水蒸气往上跑。',
          sceneGraph: CYCLE,
          beats: [{ sentenceIndex: 0, focus: 'n1', motion: 'orbit' }],
        },
        { narration: '水蒸气聚成云。云又变回小水滴落下来。', sceneGraph: CYCLE },
        { narration: '这就是水循环。它一直在转圈圈。' },
      ],
    };
    const storyboard = (tool as any).sanitizeStoryboard(raw, '水循环', 'science', 3, '3-4');
    expect(storyboard.scenes).toHaveLength(3);
    for (const scene of storyboard.scenes) {
      expect(Array.isArray(scene.beats)).toBe(true);
      expect(scene.beats.length).toBeGreaterThan(0);
      for (const b of scene.beats) {
        expect(b.sentenceIndex).toBeGreaterThanOrEqual(0);
        expect(b.motion).toBeTruthy();
      }
    }
    expect(storyboard.scenes[0].beats[0].focus).toBe('n1');
  });
});
describe('enforceAgeProfile', () => {
  const N8 = '太阳出来了。水变热了。水汽上升。飞上天空。遇冷变云。云越积厚。落下雨滴。水又回来。';
  const raw8 = Array.from({ length: 8 }, (_, i) => ({
    sentenceIndex: i,
    focus: 'n' + ((i % 3) + 1),
    motion: 'focus-ring' as const,
  }));

  it('3-4 把相邻快拍合并到 ≥2.5s，拍数少于 5-6', () => {
    const young = enforceAgeProfile(
      beatWindows(sanitizeBeats(raw8, { narration: N8, graph: CYCLE }, '3-4'), N8, 200 / 30),
      ageMotionProfile('3-4'),
    );
    const old = enforceAgeProfile(
      beatWindows(sanitizeBeats(raw8, { narration: N8, graph: CYCLE }, '5-6'), N8, 200 / 30),
      ageMotionProfile('5-6'),
    );
    expect(young.length).toBeLessThan(old.length);
    for (const w of young) expect(w.endSec - w.startSec).toBeGreaterThanOrEqual(2.5 - 1e-9);
    for (const w of old) expect(w.endSec - w.startSec).toBeGreaterThanOrEqual(1.6 - 1e-9);
  });

  it('合并时 reveal 取并集；3-4 仍只留单揭示', () => {
    const raw = raw8.map((b, i) =>
      i === 0 ? { ...b, reveal: ['n1'] } : i === 1 ? { ...b, reveal: ['n2', 'n3'] } : b,
    );
    const young = enforceAgeProfile(
      beatWindows(sanitizeBeats(raw, { narration: N8, graph: CYCLE }, '3-4'), N8, 200 / 30),
      ageMotionProfile('3-4'),
    );
    const old = enforceAgeProfile(
      beatWindows(sanitizeBeats(raw, { narration: N8, graph: CYCLE }, '5-6'), N8, 200 / 30),
      ageMotionProfile('5-6'),
    );
    expect(young[0].beat.reveal).toEqual(['n1']);
    expect(old[0].beat.reveal).toEqual(['n1', 'n2', 'n3']);
  });

  it('合并保留首拍 focus 与 motion，span 累加', () => {
    const windows = enforceAgeProfile(
      beatWindows(sanitizeBeats(raw8, { narration: N8, graph: CYCLE }, '3-4'), N8, 200 / 30),
      ageMotionProfile('3-4'),
    );
    expect(windows[0].beat.focus).toBe('n1');
    expect(windows[0].beat.motion).toBe('focus-ring');
    expect(windows[0].beat.span).toBeGreaterThan(1);
    const totalSpan = windows.reduce((s, w) => s + (w.beat.span || 1), 0);
    expect(totalSpan).toBe(8);
  });

  it('单拍场景不因下限被合并消失', () => {
    const one = [{ sentenceIndex: 0, focus: 'n1', motion: 'focus-ring' as const }];
    const windows = enforceAgeProfile(
      beatWindows(one, '水循环。', 2),
      ageMotionProfile('3-4'),
    );
    expect(windows).toHaveLength(1);
    expect(windows[0].endSec).toBe(2);
  });
});
