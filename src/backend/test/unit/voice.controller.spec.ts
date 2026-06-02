import { VoiceController } from '../../src/modules/voice/voice.controller';
import { VoiceService } from '../../src/modules/voice/voice.service';

describe('VoiceController', () => {
  let controller: VoiceController;
  let voiceService: jest.Mocked<Partial<VoiceService>>;

  beforeEach(() => {
    voiceService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.from('mock-mp3')),
      voiceChat: jest.fn(),
      generateStory: jest.fn(),
      getNurseryRhyme: jest.fn(),
      voiceQuiz: jest.fn(),
    };
    controller = new VoiceController(voiceService as unknown as VoiceService);
  });

  describe('textToSpeech', () => {
    it('should return 400 when text parameter is missing', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.textToSpeech('', undefined, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'text parameter is required' });
    });

    it('should return audio/mpeg with correct headers', async () => {
      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.textToSpeech('你好', undefined, res);

      expect(voiceService.textToSpeech).toHaveBeenCalledWith('你好', 'zh-CN-XiaoxiaoNeural');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', expect.any(Number));
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
      expect(res.send).toHaveBeenCalled();
    });

    it('should use custom voice when provided', async () => {
      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.textToSpeech('你好', 'zh-CN-YunxiNeural', res);

      expect(voiceService.textToSpeech).toHaveBeenCalledWith('你好', 'zh-CN-YunxiNeural');
    });
  });

  describe('voiceChat', () => {
    it('should call voiceService.voiceChat with correct params', async () => {
      const mockResponse = {
        query: '你好',
        intent: 'chat',
        reply: '和你聊天真开心！',
        suggestions: ['讲故事', '唱儿歌'],
        audioBuffer: 'base64...',
        duration: 3,
      };
      voiceService.voiceChat.mockResolvedValue(mockResponse);

      const result = await controller.voiceChat({
        userId: 1,
        audioUrl: 'http://example.com/audio',
      });

      expect(voiceService.voiceChat).toHaveBeenCalledWith(1, 'http://example.com/audio');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('generateStory', () => {
    it('should call voiceService.generateStory with correct params', async () => {
      const mockStory = {
        title: '测试故事',
        content: '...',
        duration: 5,
        audioBuffer: 'base64',
        keywords: ['故事'],
      };
      voiceService.generateStory.mockResolvedValue(mockStory);

      const result = await controller.generateStory('1', '动物', '3-4');

      expect(voiceService.generateStory).toHaveBeenCalledWith(1, '动物', '3-4');
      expect(result).toEqual(mockStory);
    });

    it('should use default params when not provided', async () => {
      voiceService.generateStory.mockResolvedValue({
        title: '默认故事',
        content: '...',
        duration: 5,
        audioBuffer: 'base64',
        keywords: ['故事'],
      });

      await controller.generateStory('2', undefined as any, undefined as any);

      expect(voiceService.generateStory).toHaveBeenCalledWith(2, '动物', '3-4');
    });
  });

  describe('getNurseryRhyme', () => {
    it('should call voiceService.getNurseryRhyme without id', async () => {
      const mockRhymes = [
        { id: '1', title: '小星星', content: '...', emoji: '⭐', audioBuffer: 'abc', duration: 3 },
      ] as any;
      voiceService.getNurseryRhyme.mockResolvedValue(mockRhymes);

      const result = await controller.getNurseryRhyme();

      expect(voiceService.getNurseryRhyme).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockRhymes);
    });

    it('should call voiceService.getNurseryRhyme with specific id', async () => {
      const mockRhyme = {
        id: '2',
        title: '小白船',
        content: '...',
        emoji: '🌙',
        audioBuffer: 'abc',
        duration: 3,
      } as any;
      voiceService.getNurseryRhyme.mockResolvedValue(mockRhyme);

      const result = await controller.getNurseryRhyme('2');

      expect(voiceService.getNurseryRhyme).toHaveBeenCalledWith('2');
      expect(result).toEqual(mockRhyme);
    });
  });

  describe('voiceQuiz', () => {
    it('should call voiceService.voiceQuiz with correct params', async () => {
      const mockAnswer = {
        question: '小狗怎么叫？',
        answer: '汪汪',
        audioBuffer: 'base64',
        duration: 2,
      };
      voiceService.voiceQuiz.mockResolvedValue(mockAnswer);

      const result = await controller.voiceQuiz('1', '小狗怎么叫');

      expect(voiceService.voiceQuiz).toHaveBeenCalledWith(1, '小狗怎么叫');
      expect(result).toEqual(mockAnswer);
    });
  });
});
