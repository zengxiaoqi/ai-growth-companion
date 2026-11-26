import {
  buildSubtitleCues,
  splitSubtitlePages,
  subtitleTokens,
  type WordBoundary,
} from '../../src/modules/learning/subtitle-timing';

const TICKS = 1e7;
const FPS = 30;
const frame = (seconds: number) => Math.round(seconds * FPS);

/** 把每个词平均分到音频里，构造一组"理想"的词边界 */
function makeBoundaries(words: string[], secondsPerWord = 0.5, startSeconds = 0): WordBoundary[] {
  return words.map((text, i) => ({
    text,
    offset: Math.round((startSeconds + i * secondsPerWord) * TICKS),
    duration: Math.round(secondsPerWord * TICKS),
  }));
}

describe('subtitle-timing: 分词与分屏', () => {
  it('标点跟在前一个字后面，不单独占一拍', () => {
    expect(subtitleTokens('太阳，你好。')).toEqual(['太', '阳，', '你', '好。']);
  });

  it('分屏优先切在标点上，且每屏不超过 30 字', () => {
    const narration = '水转了一圈，又变成了云。云飘到山上，下雨又回到河里，这就是水循环。';
    const pages = splitSubtitlePages(narration, 15, 2);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(30);
    expect(pages.join('')).toBe(narration);
  });

  it('不会把最后一个字单独推到下一屏', () => {
    const narration = '用放大镜再看一次！壳上还有深浅不同的彩色条纹，棕色、黄色，还有一点点白。';
    const pages = splitSubtitlePages(narration, 15, 2);
    expect(pages.length).toBe(2);
    expect(Array.from(pages[1]).length).toBeGreaterThanOrEqual(3);
    expect(pages.join('')).toBe(narration);
    for (const page of pages) expect(Array.from(page).length).toBeLessThanOrEqual(30);
  });

  it('emoji 按完整字形分屏，不拆开代理对', () => {
    const narration = '👩‍🏫老师带我们观察蜗牛壳上的花纹，看看螺旋线怎样从中间向外绕。';
    const pages = splitSubtitlePages(narration, 15, 2);
    expect(pages.join('')).toBe(narration);
    const emojiTokens = pages.flatMap(subtitleTokens).filter((token) => /[👩🏫]/u.test(token));
    expect(emojiTokens).toEqual(['👩‍🏫']);
  });
});

describe('subtitle-timing: 词边界 → 逐字时间轴', () => {
  it('两字词把时长摊到两个字上，不会同时亮', () => {
    // "太阳" 0~0.5s → 0 帧、7.5 帧（四舍五入 8）
    const cues = buildSubtitleCues('太阳出来了。', makeBoundaries(['太阳', '出来', '了'], 0.5));
    expect(cues).not.toBeNull();
    const starts = cues!.pages[0].starts;
    expect(cues!.pages[0].tokens).toEqual(['太', '阳', '出', '来', '了。']);
    expect(starts).toEqual([frame(0), frame(0.25), frame(0.5), frame(0.75), frame(1.0)]);
    expect(cues!.coverage).toBe(1);
  });

  it('屏幕上的 emoji 不会把整句对齐带偏（TTS 侧已被清洗掉）', () => {
    const cues = buildSubtitleCues('🌞太阳升起来了。', makeBoundaries(['太阳', '升起来', '了'], 0.5));
    expect(cues).not.toBeNull();
    const tokens = cues!.pages[0].tokens;
    const starts = cues!.pages[0].starts;
    // tokens = [🌞, 太, 阳, 升, 起, 来, 了。]：emoji 不参与发音，继承 0；
    // 其余每个字仍然落在它真正被念到的帧上
    expect(tokens[0]).toBe('🌞');
    expect(starts[0]).toBe(0);
    expect(starts[tokens.indexOf('太')]).toBe(frame(0));
    expect(starts[tokens.indexOf('阳')]).toBe(frame(0.25));
    expect(starts[tokens.indexOf('升')]).toBe(frame(0.5));
    expect(cues!.coverage).toBeGreaterThanOrEqual(0.8);
  });

  it('时间戳单调不减，且不出现负帧', () => {
    const cues = buildSubtitleCues(
      '一颗种子，落在土里。它喝饱了水，慢慢发芽。',
      makeBoundaries(['一颗', '种子', '落在', '土里', '它', '喝饱', '了水', '慢慢', '发芽'], 0.42),
    );
    expect(cues).not.toBeNull();
    for (const page of cues!.pages) {
      for (let i = 1; i < page.starts.length; i += 1) {
        expect(page.starts[i]).toBeGreaterThanOrEqual(page.starts[i - 1]);
      }
      for (const s of page.starts) expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('多屏时第二屏的第一个字仍然按真实发音帧，不被屏长拉平', () => {
    const narration = '太阳照在水面上，水变成了水蒸气飞上天。水蒸气遇冷又变成小水珠，落下来就是雨。';
    const words = narration.replace(/[，。]/g, '').match(/.{1,2}/g) || [];
    const cues = buildSubtitleCues(narration, makeBoundaries(words, 0.4));
    expect(cues).not.toBeNull();
    expect(cues!.pages.length).toBe(2);
    const secondPageFirst = cues!.pages[1].starts[0];
    const firstPageLast = cues!.pages[0].starts[cues!.pages[0].starts.length - 1];
    expect(secondPageFirst).toBeGreaterThan(firstPageLast);
    // 第二屏首字应落在它真正被念到的位置：第一屏"能念的字数 × 每字 0.2s"（每个词 0.4s、两字）
    const spokenChars = cues!.pages[0].tokens
      .join('')
      .replace(/[，。！？；：、,.!?;:]/g, '').length;
    expect(Math.abs(secondPageFirst - frame(spokenChars * 0.2))).toBeLessThanOrEqual(2);
  });

  it('没有词边界时返回 null（调用方回退估算）', () => {
    expect(buildSubtitleCues('太阳出来了。', [], {})).toBeNull();
    expect(buildSubtitleCues('太阳出来了。', undefined, {})).toBeNull();
    expect(buildSubtitleCues('', makeBoundaries(['太阳']), {})).toBeNull();
  });

  it('对齐覆盖率太低时返回 null，而不是硬塞一个错的节奏', () => {
    const cues = buildSubtitleCues('完全不同的另一句话内容在这里。', makeBoundaries(['甲乙', '丙丁'], 0.5));
    expect(cues).toBeNull();
  });

  it('修正量统计：与按屏长均分相比应有明显差异', () => {
    const cues = buildSubtitleCues('太阳出来了，我们一起去草地玩吧。', makeBoundaries(['太阳', '出来了', '我们', '一起', '去草地', '玩吧'], 0.5), {
      sceneFrames: 240,
    });
    expect(cues).not.toBeNull();
    // 语音只用了 ~3s（90 帧），场景却有 240 帧：估算口径被 10 帧/字的上限拖慢，修正量必然 >1s
    expect(cues!.shiftFrames.max).toBeGreaterThan(1);
  });
});
