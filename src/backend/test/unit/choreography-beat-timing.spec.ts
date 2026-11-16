import { beatFramesFromSpeech } from '../../src/modules/learning/video/choreography';

const TICKS = 1e7;
const PUNCT = /[。，、！？；：!?,.;:]/;

/**
 * 造词边界：每个字一个"词"，默认每字 0.2 秒；gaps 指定"在这个字之前停多久"。
 * 用来把"哪句读得慢、哪里停顿长"直接写成时间，而不是靠字数去猜。
 */
function speech(
  narration: string,
  options: { perChar?: number; gaps?: Record<number, number>; startSec?: number } = {},
) {
  const perChar = options.perChar ?? 0.2;
  const chars = Array.from(narration).filter((ch) => !PUNCT.test(ch) && !/\s/.test(ch));
  let t = options.startSec ?? 0;
  return chars.map((ch, i) => {
    t += options.gaps?.[i] ?? 0;
    const word = { text: ch, offset: Math.round(t * TICKS), duration: Math.round(perChar * TICKS) };
    t += perChar;
    return word;
  });
}

describe('beatFramesFromSpeech', () => {
  it('按每句真正说出口的起止帧排拍，而不是按字数比例', () => {
    const narration = '甲乙丙。丁。';
    const frames = beatFramesFromSpeech(
      [{ sentenceIndex: 0 }, { sentenceIndex: 1 }],
      narration,
      speech(narration),
      { sceneFrames: 300 },
    );
    // 甲 0s、乙 0.2s、丙 0.4s（说完 0.6s）；丁 0.6s 起
    expect(frames).toEqual([
      { startFrame: 0, endFrame: 18 },
      { startFrame: 18, endFrame: 25 },
    ]);
  });

  it('两句之间真有停顿时，拍界落在停顿之后——字数比例做不到这一点', () => {
    const narration = '甲乙丙。丁。';
    // 丁之前停 0.5 秒（孩子听到的换气/重音），字数比例会认为拍界在 3/4 处
    const frames = beatFramesFromSpeech(
      [{ sentenceIndex: 0 }, { sentenceIndex: 1 }],
      narration,
      speech(narration, { gaps: { 3: 0.5 } }),
      { sceneFrames: 300 },
    );
    expect(frames![0].startFrame).toBe(0);
    // 17 帧处丙说完 → 拍 0 收到第 19 帧；拍 1 从丁的发音帧 33 开始
    expect(frames![0].endFrame).toBe(19);
    expect(frames![1].startFrame).toBe(33);
  });

  it('一拍跨两句时窗口覆盖到最后一句说完', () => {
    const narration = '甲乙丙。丁戊。';
    const frames = beatFramesFromSpeech([{ sentenceIndex: 0, span: 2 }], narration, speech(narration), {
      sceneFrames: 300,
    });
    expect(frames).toHaveLength(1);
    expect(frames![0].startFrame).toBe(0);
    // 戊从 0.8s 说起、1.0s 说完 → 第 31 帧
    expect(frames![0].endFrame).toBe(31);
  });

  it('拍窗按句首对齐、不重叠：后一拍的开场就是前一拍的收尾上限', () => {
    const narration = '甲乙。丙丁。';
    const frames = beatFramesFromSpeech(
      [{ sentenceIndex: 0 }, { sentenceIndex: 1 }],
      narration,
      speech(narration),
      { sceneFrames: 300 },
    );
    expect(frames![0].endFrame).toBeLessThanOrEqual(frames![1].startFrame);
  });

  it('对不上发音序列时整体返回 null，不做部分重排', () => {
    const narration = '甲乙丙。丁。';
    // 发音序列里少了一个字（TTS 漏读/字幕被截）——按顺序对齐就断了
    const broken = speech(narration).filter((w) => w.text !== '乙');
    expect(beatFramesFromSpeech([{ sentenceIndex: 0 }], narration, broken, { sceneFrames: 300 })).toBeNull();
  });

  it('没有词边界就没有锚点，返回 null 让调用方保留字数比例', () => {
    expect(beatFramesFromSpeech([{ sentenceIndex: 0 }], '甲乙。', undefined, { sceneFrames: 300 })).toBeNull();
    expect(beatFramesFromSpeech([{ sentenceIndex: 0 }], '甲乙。', [], { sceneFrames: 300 })).toBeNull();
  });

  it('语音快到拍界挤在同一帧时整体放弃：宁可保留字数比例，也不要零长度拍', () => {
    // 每字 0.01 秒：两句的起帧都四舍五入到 0，拍界不再严格递增
    const narration = '甲。乙。';
    const frames = beatFramesFromSpeech(
      [{ sentenceIndex: 0 }, { sentenceIndex: 1 }],
      narration,
      speech(narration, { perChar: 0.01 }),
      { sceneFrames: 300 },
    );
    expect(frames).toBeNull();
  });

  it('拍数多于句子数（sentenceIndex 越界）时放弃重排', () => {
    const narration = '甲乙。';
    // LLM 常见错法：一句话给三拍，sentenceIndex 写成 0/1/2
    const frames = beatFramesFromSpeech(
      [{ sentenceIndex: 0 }, { sentenceIndex: 1 }, { sentenceIndex: 2 }],
      narration,
      speech(narration),
      { sceneFrames: 300 },
    );
    expect(frames).toBeNull();
  });
});
