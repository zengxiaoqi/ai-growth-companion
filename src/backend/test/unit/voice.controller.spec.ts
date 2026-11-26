import { VoiceController } from '../../src/modules/voice/voice.controller';
import { VoiceService } from '../../src/modules/voice/voice.service';
import { ReadAloudService } from '../../src/modules/voice/read-aloud.service';

describe('VoiceController', () => {
  let controller: VoiceController;
  let voiceService: jest.Mocked<Partial<VoiceService>>;
  let readAloudService: jest.Mocked<Partial<ReadAloudService>>;

  beforeEach(() => {
    voiceService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.from('mock-mp3')),
      voiceChat: jest.fn(),
      generateStory: jest.fn(),
      getNurseryRhyme: jest.fn(),
      voiceQuiz: jest.fn(),
    };
    readAloudService = {
      evaluate: jest.fn().mockReturnValue({ accuracy: 0, stars: 0, chars: [], missedWords: [] }),
    };
    controller = new VoiceController(
      voiceService as unknown as VoiceService,
      readAloudService as unknown as ReadAloudService,
    );
  });

  describe('textToSpeech', () => {
    it('should return 400 when text parameter is missing', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.textToSpeech('', undefined, undefined, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'text parameter is required' });
    });

    it('should return audio/mpeg with correct headers', async () => {
      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.textToSpeech('你好', undefined, undefined, res);

      expect(voiceService.textToSpeech).toHaveBeenCalledWith(
        '你好',
        'zh-CN-XiaoyiNeural',
        undefined,
      );
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

      await controller.textToSpeech('hello', 'en-US-GuyNeural', '1.5', res);

      expect(voiceService.textToSpeech).toHaveBeenCalledWith('hello', 'en-US-GuyNeural', '1.5');
    });
  });

  describe('evaluateReadAloud', () => {
    it('should throw BadRequestException when targetText is missing', async () => {
      await expect(controller.evaluateReadAloud({} as any)).rejects.toThrow(
        'targetText is required',
      );
    });

    it('should call readAloudService.evaluate with correct body', async () => {
      const body = { targetText: '你好世界', recognizedText: '你好世街', ageGroup: '3-4' };
      const result = await controller.evaluateReadAloud(body);
      expect(readAloudService.evaluate).toHaveBeenCalledWith(body);
      expect(result).toEqual({ accuracy: 0, stars: 0, chars: [], missedWords: [] });
    });
  });

  describe('voiceChat', () => {
    it('should call voiceService.voiceChat with userId and audioUrl', async () => {
      const body = { userId: 1, audioUrl: 'https://example.com/audio.mp3' };
      await controller.voiceChat(body);
      expect(voiceService.voiceChat).toHaveBeenCalledWith(1, 'https://example.com/audio.mp3');
    });
  });

  describe('generateStory', () => {
    it('should call voiceService.generateStory with default values', async () => {
      await controller.generateStory('1', '动物', '3-4');
      expect(voiceService.generateStory).toHaveBeenCalledWith(1, '动物', '3-4');
    });

    it('should use default theme and ageRange when not provided', async () => {
      await controller.generateStory('1');
      expect(voiceService.generateStory).toHaveBeenCalledWith(1, '动物', '3-4');
    });
  });

  describe('getNurseryRhyme', () => {
    it('should call voiceService.getNurseryRhyme with id when provided', async () => {
      await controller.getNurseryRhyme('123');
      expect(voiceService.getNurseryRhyme).toHaveBeenCalledWith('123');
    });

    it('should call voiceService.getNurseryRhyme without args when id not provided', async () => {
      await controller.getNurseryRhyme();
      expect(voiceService.getNurseryRhyme).toHaveBeenCalledWith(undefined);
    });
  });

  describe('voiceQuiz', () => {
    it('should call voiceService.voiceQuiz with userId and question', async () => {
      await controller.voiceQuiz('1', 'What is 2+2?');
      expect(voiceService.voiceQuiz).toHaveBeenCalledWith(1, 'What is 2+2?');
    });
  });
});
