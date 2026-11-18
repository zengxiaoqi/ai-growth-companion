import { GenerateCoursePackTool } from '../../src/modules/ai/agent/tools/generate-course-pack';
import { Logger } from '@nestjs/common';

jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

describe('GenerateCoursePackTool reading normalization', () => {
  let tool: GenerateCoursePackTool;

  const args = (overrides: Record<string, any> = {}) =>
    ({ topic: '画一只坐着的虎斑猫', ageGroup: '5-6', domain: 'art', ...overrides }) as any;

  const normalize = (raw: any, a = args(), fallbackQuestions = ['你发现了什么？']) =>
    (tool as any).normalizeReadingModule(raw, a, null, ['圆形', '尖耳朵'], fallbackQuestions);

  beforeEach(() => {
    tool = new GenerateCoursePackTool({ generateJson: jest.fn() } as any, {
      execute: jest.fn(),
    } as any);
  });

  it('derives emoji sentence cards from legacy plain text', () => {
    const text = '猫的头是圆形，两侧有尖耳朵。眼睛在中间偏上。尾巴向上弯。';
    const reading = normalize({ goal: '观察猫的形状', text, keywords: ['圆形'] });

    expect(reading.cards).toHaveLength(3);
    expect(reading.cards.map((c: any) => c.sentence).join('')).toBe(text);
    expect(reading.cards[0].emoji).toBe('🐱');
    // 尾巴向上弯 describes a part of the lesson subject → subject emoji, not paw prints
    expect(reading.cards[2].emoji).toBe('🐱');
    for (const card of reading.cards) {
      expect(card.discover).toBeTruthy();
    }
    expect(reading.readAloud.length).toBeGreaterThan(0);
  });

  it('keeps LLM cards when at least two are provided', () => {
    const reading = normalize({
      text: 'ignored',
      cards: [
        { sentence: '猫的头是圆形。', emoji: '🐱', discover: '摸摸圆形的头。' },
        { sentence: '尾巴向上弯。' },
      ],
    });
    expect(reading.cards).toHaveLength(2);
    expect(reading.cards[0].discover).toBe('摸摸圆形的头。');
    expect(reading.cards[1].emoji).toBeTruthy();
    expect(reading.cards[1].discover).toBeTruthy();
  });

  it('falls back to text split when only one LLM card is given', () => {
    const reading = normalize({
      text: '太阳出来了。小鸟在唱歌。',
      cards: [{ sentence: '太阳出来了。' }],
    });
    expect(reading.cards).toHaveLength(2);
    expect(reading.cards[1].sentence).toBe('小鸟在唱歌。');
    expect(reading.cards[1].emoji).toBe('🐦');
  });

  it('upgrades legacy string questions to open question objects', () => {
    const reading = normalize({ text: '猫在睡觉。', questions: ['猫在干什么？'] });
    expect(reading.questions).toEqual([
      { question: '猫在干什么？', options: [], correctIndex: 0, explain: '' },
    ]);
  });

  it('normalizes MCQ objects: filters options, clamps correctIndex', () => {
    const reading = normalize({
      text: '猫在睡觉。',
      questions: [
        {
          question: '猫的耳朵是什么形状？',
          options: ['尖尖的', '圆圆的', '', '方方的', '长长的'],
          correctIndex: 9,
          explain: '三角形就是尖尖的。',
        },
      ],
    });
    const q = reading.questions[0];
    expect(q.options).toEqual(['尖尖的', '圆圆的', '方方的', '长长的']);
    expect(q.correctIndex).toBe(3);
    expect(q.explain).toBe('三角形就是尖尖的。');
  });

  it('uses fallback questions when none are provided', () => {
    const reading = normalize({ text: '猫在睡觉。' }, args(), ['猫可爱吗？']);
    expect(reading.questions[0].question).toBe('猫可爱吗？');
    expect(reading.questions[0].options).toEqual([]);
  });

  it('limits readAloud targets by age and falls back to first card', () => {
    const longSentence = '这是一句非常非常长的句子超过了十六个字的限制很多很多';
    const young = normalize({ text: `${longSentence}。` }, args({ ageGroup: '3-4' }));
    expect(young.readAloud).toEqual([longSentence + '。']);

    const short = normalize({ text: '猫在睡觉。老虎有条纹。' }, args({ ageGroup: '3-4' }));
    expect(short.readAloud).toEqual(['猫在睡觉。', '老虎有条纹。']);
  });

  it('caps cards at six', () => {
    const text = Array.from({ length: 10 }, (_, i) => `第${i}句话。`).join('');
    const reading = normalize({ text });
    expect(reading.cards).toHaveLength(6);
  });

  it('picks emoji by sentence meaning, not incidental characters', () => {
    const reading = normalize({ text: '鼻子在下方。尾巴向上弯。方形积木放在桌上。' });
    expect(reading.cards.map((c: any) => c.emoji)).toEqual(['👃', '🐱', '🟦']);
  });

  it('does not match single-char keywords inside unrelated words', () => {
    const reading = normalize(
      { text: '今天是星期天。地方真大。' },
      args({ topic: '认识时间', domain: 'science' }),
    );
    expect(reading.cards.map((c: any) => c.emoji)).toEqual(['🔭', '🔭']);
  });

  it('overrides mismatched emoji stored by older packs', () => {
    const reading = normalize({
      text: 'ignored',
      cards: [
        { sentence: '鼻子在下方。', emoji: '🟦' },
        { sentence: '尾巴向上弯。', emoji: '🐾' },
      ],
    });
    expect(reading.cards.map((c: any) => c.emoji)).toEqual(['👃', '🐱']);
  });

  it('trusts LLM part-level emoji when nothing competing (relaxed validation)', () => {
    const reading = normalize(
      {
        text: 'ignored',
        cards: [
          { sentence: '能听到远处的声音。', emoji: '👂' },
          { sentence: '用来闻气味。', emoji: '👃' },
        ],
      },
      args({ topic: '认识身体', domain: 'science' }),
    );
    // in-map part emoji, no literal keyword and no competing subject → kept as-is
    expect(reading.cards.map((c: any) => c.emoji)).toEqual(['👂', '👃']);
  });

  it('keeps stored emoji when the curated map has no match', () => {
    const reading = normalize({
      text: 'ignored',
      cards: [
        { sentence: '大家真开心。', emoji: '😄' },
        { sentence: '小猫去钓鱼。', emoji: '🎣' },
      ],
    });
    expect(reading.cards[0].emoji).toBe('😄');
    expect(reading.cards[1].emoji).toBe('🎣');
  });

  it('falls back to topic subject then domain default', () => {
    const withSubject = normalize(
      { text: '今天很开心。' },
      args({ topic: '认识小狗', domain: 'language' }),
    );
    expect(withSubject.cards[0].emoji).toBe('🐶');
    const withoutSubject = normalize(
      { text: '今天很开心。' },
      args({ topic: '10以内加法', domain: 'math' }),
    );
    expect(withoutSubject.cards[0].emoji).toBe('🔢');
  });
});