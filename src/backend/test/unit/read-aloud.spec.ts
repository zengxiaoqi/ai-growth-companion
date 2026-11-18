import {
  normalizeForAlignment,
  scoreReadAloud,
  ReadAloudService,
} from '../../src/modules/voice/read-aloud.service';

describe('normalizeForAlignment', () => {
  it('strips punctuation, spaces and emoji, keeps CJK/letters/digits', () => {
    expect(normalizeForAlignment('小猫，去 钓鱼！🐱')).toBe('小猫去钓鱼');
    expect(normalizeForAlignment('ABC def 123')).toBe('abcdef123');
    expect(normalizeForAlignment('')).toBe('');
  });
});

describe('scoreReadAloud', () => {
  it('gives 3 stars and all-read chars for a perfect read', () => {
    const score = scoreReadAloud('小猫去钓鱼。', '小猫去钓鱼');
    expect(score.accuracy).toBe(1);
    expect(score.stars).toBe(3);
    expect(score.chars.every((c) => c.status === 'read')).toBe(true);
    expect(score.missedWords).toEqual([]);
  });

  it('marks skipped chars as missed and groups them into words', () => {
    const score = scoreReadAloud('小猫去钓鱼', '小猫钓鱼');
    expect(score.stars).toBe(2); // 4/5 = 0.8 < 0.85
    expect(score.chars.map((c) => c.status)).toEqual([
      'read', 'read', 'missed', 'read', 'read',
    ]);
    expect(score.missedWords).toEqual(['去']);
  });

  it('tolerates extra recognized chars via LCS alignment', () => {
    const score = scoreReadAloud('太阳出来了', '嗯太阳出来了呀');
    expect(score.accuracy).toBe(1);
    expect(score.stars).toBe(3);
  });

  it('scores partial reads with 2 stars at >= 0.6 accuracy', () => {
    const target = '一二三四五六七八九十';
    const score = scoreReadAloud(target, '一二三四五六');
    expect(score.accuracy).toBeCloseTo(0.6);
    expect(score.stars).toBe(2);
    expect(score.missedWords).toEqual(['七八九十']);
  });

  it('gives 1 star for low accuracy and 0 stars for silence', () => {
    expect(scoreReadAloud('一二三四五六七八九十', '一二三').stars).toBe(1);
    const silent = scoreReadAloud('小猫去钓鱼', '');
    expect(silent.stars).toBe(0);
    expect(silent.accuracy).toBe(0);
  });

  it('caps missedWords at 3 runs', () => {
    const score = scoreReadAloud('甲乙丙丁戊己庚辛', '乙丁己辛');
    expect(score.missedWords.length).toBeLessThanOrEqual(3);
  });
});

describe('ReadAloudService.evaluate', () => {
  let voiceService: { textToSpeech: jest.Mock };
  let service: ReadAloudService;

  beforeEach(() => {
    voiceService = { textToSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-mp3')) };
    service = new ReadAloudService(voiceService as any);
  });

  it('returns score, encouragement feedback and base64 audio', async () => {
    const result = await service.evaluate({
      targetText: '小猫去钓鱼',
      recognizedText: '小猫钓鱼',
    });
    expect(result.stars).toBe(2);
    expect(result.feedback).toContain('去');
    expect(result.feedbackAudio).toBe(Buffer.from('fake-mp3').toString('base64'));
    expect(result.recognizedText).toBe('小猫钓鱼');
  });

  it('adds a fluency note when reading too fast or too slow', async () => {
    const fast = await service.evaluate({
      targetText: '小猫去钓鱼',
      recognizedText: '小猫去钓鱼',
      durationMs: 100,
      ageGroup: '5-6',
    });
    expect(fast.fluencyNote).toContain('快');

    const slow = await service.evaluate({
      targetText: '小猫去钓鱼',
      recognizedText: '小猫去钓鱼',
      durationMs: 8000,
      ageGroup: '5-6',
    });
    expect(slow.fluencyNote).toContain('不着急');

    const normal = await service.evaluate({
      targetText: '小猫去钓鱼',
      recognizedText: '小猫去钓鱼',
      durationMs: 1800,
      ageGroup: '5-6',
    });
    expect(normal.fluencyNote).toBeUndefined();
  });

  it('keeps evaluation alive when feedback TTS fails', async () => {
    voiceService.textToSpeech.mockRejectedValueOnce(new Error('tts down'));
    const result = await service.evaluate({
      targetText: '小猫去钓鱼',
      recognizedText: '小猫去钓鱼',
    });
    expect(result.stars).toBe(3);
    expect(result.feedbackAudio).toBeUndefined();
  });
});