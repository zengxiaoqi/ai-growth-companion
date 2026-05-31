import { QuickVideoService } from '../../src/modules/learning/quick-video.service';

describe('QuickVideoService', () => {
  let service: QuickVideoService;
  let mockContentRepo: any;
  let mockLlmClient: any;
  let mockLessonVideoQueue: any;

  beforeEach(() => {
    mockContentRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockLlmClient = {
      chatCompletion: jest.fn(),
    };
    mockLessonVideoQueue = {
      enqueue: jest.fn(),
    };

    service = new QuickVideoService(mockContentRepo, mockLlmClient, mockLessonVideoQueue);
  });

  describe('generateLessonContent', () => {
    it('should call chatCompletion with a prompt containing topic and ageGroup', async () => {
      mockLlmClient.chatCompletion.mockResolvedValue({
        content: JSON.stringify({
          title: '海洋动物探秘',
          summary: '一起认识大海里的神奇动物',
          domain: 'science',
          videoLesson: {
            shots: [
              {
                title: '大海里的朋友',
                narration: '海洋里住着许多可爱的动物朋友们。',
                visualDescription: 'Colorful ocean scene with cartoon sea animals',
                onScreenText: '海洋动物',
                durationSec: 8,
              },
            ],
          },
          visualStory: {
            scenes: [
              {
                title: '大海里的朋友',
                narration: '海洋里住着许多可爱的动物朋友们。',
                visualDescription: 'Colorful ocean scene with cartoon sea animals',
                onScreenText: '海洋动物',
                durationSec: 8,
                animationTemplate: { id: 'dynamic.story-scene' },
              },
            ],
          },
        }),
      });

      const result = await service.generateLessonContent({
        topic: '海洋动物',
        ageGroup: '4-5',
      });

      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(1);
      const messages = mockLlmClient.chatCompletion.mock.calls[0][0];
      const promptArg = messages.find((m: any) => m.role === 'user')?.content || '';
      expect(promptArg).toContain('海洋动物');
      expect(promptArg).toContain('4-5');
      expect(result).toEqual({
        title: '海洋动物探秘',
        summary: '一起认识大海里的神奇动物',
        domain: 'science',
        videoLesson: expect.objectContaining({ shots: expect.any(Array) }),
        visualStory: expect.objectContaining({ scenes: expect.any(Array) }),
      });
    });

    it('should use default 60s duration when not specified', async () => {
      mockLlmClient.chatCompletion.mockResolvedValue({
        content: JSON.stringify({
          title: 'Test',
          summary: 'test',
          domain: 'language',
          videoLesson: { shots: [] },
          visualStory: { scenes: [] },
        }),
      });

      await service.generateLessonContent({ topic: 'test', ageGroup: '3-4' });

      const messages = mockLlmClient.chatCompletion.mock.calls[0][0];
      const promptArg = messages.find((m: any) => m.role === 'user')?.content || '';
      // Default 60s / 8s per scene = 7 to 8 scenes
      expect(promptArg).toContain('7'); // floor(60/8) = 7
    });

    it('should calculate target scenes from durationSec', async () => {
      mockLlmClient.chatCompletion.mockResolvedValue({
        content: JSON.stringify({
          title: 'Test',
          summary: 'test',
          domain: 'language',
          videoLesson: { shots: [] },
          visualStory: { scenes: [] },
        }),
      });

      await service.generateLessonContent({
        topic: 'test',
        ageGroup: '3-4',
        durationSec: 90,
      });

      const messages = mockLlmClient.chatCompletion.mock.calls[0][0];
      const promptArg = messages.find((m: any) => m.role === 'user')?.content || '';
      // 90 / 8 = 11 -> clamped to max 8
      expect(promptArg).toContain('8');
    });

    it('should respect style parameter in prompt', async () => {
      mockLlmClient.chatCompletion.mockResolvedValue({
        content: JSON.stringify({
          title: 'Test',
          summary: 'test',
          domain: 'science',
          videoLesson: { shots: [] },
          visualStory: { scenes: [] },
        }),
      });

      await service.generateLessonContent({
        topic: 'test',
        ageGroup: '3-4',
        style: 'science',
      });

      const messages = mockLlmClient.chatCompletion.mock.calls[0][0];
      const promptArg = messages.find((m: any) => m.role === 'user')?.content || '';
      expect(promptArg).toContain('科学探索');
    });

    it('should parse AI response wrapped in markdown code block', async () => {
      mockLlmClient.chatCompletion.mockResolvedValue({
        content:
          '```json\n{"title":"解析测试","summary":"测试摘要","domain":"language","videoLesson":{"shots":[]},"visualStory":{"scenes":[]}}\n```',
      });

      const result = await service.generateLessonContent({
        topic: 'test',
        ageGroup: '3-4',
      });

      expect(result.title).toBe('解析测试');
      expect(result.summary).toBe('测试摘要');
    });

    it('should return fallback payload when JSON parsing fails', async () => {
      mockLlmClient.chatCompletion.mockResolvedValue({
        content: '这是一段纯文本回复，不是JSON格式。让我们来学习有趣的课程吧！',
      });

      const result = await service.generateLessonContent({
        topic: '数学',
        ageGroup: '5-6',
      });

      // Should still return a valid payload structure
      expect(result.videoLesson).toBeDefined();
      expect(result.videoLesson.shots).toBeInstanceOf(Array);
      expect(result.videoLesson.shots.length).toBeGreaterThan(0);
      expect(result.visualStory).toBeDefined();
    });
  });
});
