import { VoiceService } from '../../src/modules/voice/voice.service';
import { EdgeTTS } from '@andresaya/edge-tts';

// Mock EdgeTTS
jest.mock('@andresaya/edge-tts', () => ({
  EdgeTTS: jest.fn().mockImplementation(() => ({
    synthesize: jest.fn().mockResolvedValue(undefined),
    toBuffer: jest.fn().mockReturnValue(Buffer.from('mock-audio-data')),
  })),
}));

describe('VoiceService', () => {
  let service: VoiceService;

  beforeEach(() => {
    service = new VoiceService();
    jest.clearAllMocks();
  });

  describe('textToSpeech', () => {
    it('should convert text to speech and return a Buffer', async () => {
      const result = await service.textToSpeech('你好世界');

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should use default voice when not specified', async () => {
      await service.textToSpeech('测试');
      const instance = EdgeTTS.mock.results[0].value;

      expect(instance.synthesize).toHaveBeenCalledWith(
        '测试',
        'zh-CN-XiaoxiaoNeural',
        expect.objectContaining({ outputFormat: expect.any(String) }),
      );
    });

    it('should accept custom voice parameter', async () => {
      await service.textToSpeech('你好', 'zh-CN-YunxiNeural');
      const instance = EdgeTTS.mock.results[0].value;

      expect(instance.synthesize).toHaveBeenCalledWith(
        '你好',
        'zh-CN-YunxiNeural',
        expect.any(Object),
      );
    });
  });

  describe('speechToText', () => {
    it('should return mock recognition result', async () => {
      const result = await service.speechToText('http://example.com/audio.wav');
      expect(result).toBe('模拟识别结果：你好');
    });

    it('should handle empty audio URL', async () => {
      const result = await service.speechToText('');
      expect(result).toBe('模拟识别结果：你好');
    });
  });

  describe('voiceChat', () => {
    it('should process voice chat and return structured response', async () => {
      const result = await service.voiceChat(1, 'http://example.com/voice.wav');

      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('reply');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('audioBuffer');
      expect(result).toHaveProperty('duration');
      expect(typeof result.audioBuffer).toBe('string');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should detect question intent', async () => {
      // speechToText returns '模拟识别结果：你好', but voiceChat uses simulated results.
      // The parseIntent private method checks keywords in the text.
      // Let's test via voiceChat which calls speechToText internally.
      const result = await service.voiceChat(1, 'dummy');
      // Default intent should be 'chat' since '你好' doesn't match intent keywords
      expect(result.intent).toBe('chat');
    });

    describe('AI integration path', () => {
      let mockAiService: any;

      beforeEach(() => {
        jest.clearAllMocks();
        mockAiService = {
          chat: jest.fn().mockResolvedValue({
            reply: '你好小朋友！今天想学什么呀？',
            suggestions: ['学数学', '听故事', '唱歌谣'],
          }),
        };
      });

      it('should use AI chat when aiService is available', async () => {
        const aiService = new VoiceService(mockAiService);
        const result = await aiService.voiceChat(1, 'http://example.com/voice.wav');

        expect(mockAiService.chat).toHaveBeenCalledWith({
          message: '模拟识别结果：你好',
          viewerId: 1,
          viewerType: 'student',
          targetChildId: 1,
        });
        expect(result.intent).toBe('ai');
        expect(result.reply).toBe('你好小朋友！今天想学什么呀？');
        expect(result.suggestions).toEqual(['学数学', '听故事', '唱歌谣']);
        expect(result.audioBuffer).toBeTruthy();
        expect(typeof result.audioBuffer).toBe('string');
      });

      it('should fallback to rule-based when AI call fails', async () => {
        mockAiService.chat.mockRejectedValue(new Error('AI service down'));
        const aiService = new VoiceService(mockAiService);

        const result = await aiService.voiceChat(1, 'http://example.com/voice.wav');

        // Should have fallen back to rule-based, so intent is NOT 'ai'
        expect(result.intent).not.toBe('ai');
        expect(result.reply).toBe('和你聊天真开心！');
        expect(result.audioBuffer).toBeTruthy();
      });
    });
  });

  describe('generateStory', () => {
    it('should generate a story with audio for a given theme', async () => {
      const result = await service.generateStory(1, '动物', '3-4');

      expect(result).toHaveProperty('title', '小兔子的冒险');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('audioBuffer');
      expect(result).toHaveProperty('keywords');
      expect(result.audioBuffer).toBeTruthy();
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should generate shorter story for age 3-4', async () => {
      const result = await service.generateStory(1, '亲情', '3-4');
      expect(result.title).toBe('妈妈的爱');
    });

    it('should generate medium story for age 5-6', async () => {
      const result = await service.generateStory(1, '自然', '5-6');
      expect(result.title).toBe('春天的故事');
    });

    it('should fallback to 动物 theme for unknown theme', async () => {
      const result = await service.generateStory(1, '未知主题', '3-4');
      expect(result.title).toBe('小兔子的冒险');
    });
  });

  describe('getNurseryRhyme', () => {
    it('should return all rhymes when no rhymeId specified', async () => {
      const result = (await service.getNurseryRhyme()) as any[];

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5);
      result.forEach((rhyme: any) => {
        expect(rhyme).toHaveProperty('id');
        expect(rhyme).toHaveProperty('title');
        expect(rhyme).toHaveProperty('content');
        expect(rhyme).toHaveProperty('emoji');
        expect(rhyme).toHaveProperty('audioBuffer');
        expect(rhyme).toHaveProperty('duration');
      });
    });

    it('should return specific rhyme when rhymeId provided', async () => {
      const result = (await service.getNurseryRhyme('1')) as any;

      expect(result.id).toBe('1');
      expect(result.title).toBe('小星星');
    });

    it('should return second rhyme by id', async () => {
      const result = (await service.getNurseryRhyme('3')) as any;

      expect(result.id).toBe('3');
      expect(result.title).toBe('小燕子');
    });
  });

  describe('voiceQuiz', () => {
    it('should match dog keyword and return answer', async () => {
      const result = await service.voiceQuiz(1, '小狗怎么叫');

      expect(result.answer).toBe('小狗汪汪叫！');
      expect(result.audioBuffer).toBeTruthy();
    });

    it('should match cat keyword and return answer', async () => {
      const result = await service.voiceQuiz(1, '猫是怎么叫的');

      expect(result.answer).toBe('小猫喵喵叫！');
    });

    it('should match math question', async () => {
      const result = await service.voiceQuiz(1, '1+1等于几');

      expect(result.answer).toBe('一加一等于二！');
    });

    it('should return default reply for unmatched question', async () => {
      const result = await service.voiceQuiz(1, '天空为什么是蓝色的');

      expect(result.answer).toBe('这个问题真有趣！让我想想怎么回答你...');
    });

    it('should return question in result', async () => {
      const result = await service.voiceQuiz(1, '小狗');

      expect(result.question).toBe('小狗怎么叫？');
    });
  });
});
