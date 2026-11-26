import { QuickVideoService } from '../../src/modules/learning/quick-video.service';

function lessonPayload(domain = 'language') {
  const scene = {
    title: '认识蜗牛',
    narration: '小蜗牛背着一个圆圆的硬壳，慢慢向前爬。',
    visualDescription: 'A cute cartoon snail crawling on a leaf',
    onScreenText: '小蜗牛',
    durationSec: 8,
    animationTemplate: { id: 'dynamic.story-scene' },
  };
  return {
    title: '小蜗牛',
    summary: '一起认识小蜗牛',
    domain,
    videoLesson: { shots: [scene] },
    visualStory: { scenes: [scene] },
  };
}

describe('QuickVideoService', () => {
  let service: QuickVideoService;
  let mockContentRepo: any;
  let mockLlmClient: any;
  let mockLessonVideoQueue: any;

  beforeEach(() => {
    mockContentRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ ...value, id: 10 })),
    };
    mockLlmClient = {
      chatCompletion: jest.fn().mockImplementation(async (messages: any[]) => {
        const prompt = messages[0]?.content || '';
        return {
          content: JSON.stringify(
            prompt.includes('事实复核编辑') ? { revisions: [] } : lessonPayload(),
          ),
        };
      }),
    };
    mockLessonVideoQueue = {
      enqueue: jest.fn().mockResolvedValue({ id: 20, status: 'pending' }),
    };

    service = new QuickVideoService(mockContentRepo, mockLlmClient, mockLessonVideoQueue);
  });

  describe('generateLessonContent', () => {
    it('calls chatCompletion with topic, ageGroup and a safe output budget', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify(lessonPayload()),
      });

      const result = await service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' });

      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(2);
      const [messages, tools, maxTokens] = mockLlmClient.chatCompletion.mock.calls[0];
      const prompt = messages.find((message: any) => message.role === 'user')?.content || '';
      expect(prompt).toContain('蜗牛');
      expect(prompt).toContain('5-6');
      expect(prompt).toContain('科学事实必须准确');
      expect(tools).toBeUndefined();
      expect(maxTokens).toBe(32_768);
      expect(result.videoLesson.shots).toHaveLength(1);
      expect(result.visualStory.scenes).toHaveLength(1);
    });

    it('uses seven scenes for the default 60 second lesson', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify(lessonPayload()),
      });

      await service.generateLessonContent({ topic: 'test', ageGroup: '3-4' });

      const prompt = mockLlmClient.chatCompletion.mock.calls[0][0][0].content;
      expect(prompt).toContain('生成 7 个场景');
    });

    it('clamps the requested scene count to eight', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify(lessonPayload()),
      });

      await service.generateLessonContent({ topic: 'test', ageGroup: '3-4', durationSec: 90 });

      const prompt = mockLlmClient.chatCompletion.mock.calls[0][0][0].content;
      expect(prompt).toContain('生成 8 个场景');
    });

    it('respects an explicitly selected science style', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify(lessonPayload('language')),
      });

      const result = await service.generateLessonContent({
        topic: '海洋动物',
        ageGroup: '5-6',
        style: 'science',
      });

      const prompt = mockLlmClient.chatCompletion.mock.calls[0][0][0].content;
      expect(prompt).toContain('科学探索');
      expect(prompt).toContain('"domain": "science"');
      expect(result.domain).toBe('science');
    });

    it('parses a markdown fenced JSON response', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: `\`\`\`json\n${JSON.stringify(lessonPayload())}\n\`\`\``,
      });

      const result = await service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' });

      expect(result.title).toBe('小蜗牛');
      expect(result.summary).toBe('一起认识小蜗牛');
    });

    it('rejects an empty response truncated by the token limit', async () => {
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({
          content: null,
          finishReason: 'length',
          usage: { completionTokens: 4096 },
        })
        .mockResolvedValueOnce({ content: null, finishReason: 'length' });

      await expect(
        service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' }),
      ).rejects.toThrow('truncated');
      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(2);
    });

    it('retries truncated output with a compact contract before giving up', async () => {
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({ content: null, finishReason: 'length' })
        .mockResolvedValueOnce({ content: JSON.stringify(lessonPayload()) });

      const result = await service.generateLessonContent({ topic: 'test', ageGroup: '5-6' });

      expect(result.title).toBe('小蜗牛');
      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(2);
      const retryPrompt = mockLlmClient.chatCompletion.mock.calls[1][0][0].content;
      expect(retryPrompt).toContain('上一次回答因输出上限被截断');
      expect(retryPrompt).toContain('压缩为 3-5 个场景');
    });

    it('rejects a response wrapper instead of storing it as course content', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify({ content: null, finishReason: 'length' }),
      });

      await expect(
        service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' }),
      ).rejects.toThrow('no shots or scenes');
    });

    it('rejects invalid JSON instead of creating a generic fallback lesson', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({ content: 'not json' });

      await expect(
        service.generateLessonContent({ topic: '数学', ageGroup: '5-6' }),
      ).rejects.toThrow('not valid JSON');
    });

    it('derives missing visualStory scenes from videoLesson shots', async () => {
      const payload = lessonPayload('language');
      delete (payload as any).visualStory;
      mockLlmClient.chatCompletion.mockResolvedValueOnce({ content: JSON.stringify(payload) });

      const result = await service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' });

      expect(result.domain).toBe('science');
      expect(result.visualStory.scenes).toHaveLength(1);
      expect(result.visualStory.scenes[0].animationTemplate).toEqual({
        id: 'dynamic.story-scene',
      });
    });

    it('rejects a scene without narration', async () => {
      const payload = lessonPayload();
      payload.videoLesson.shots[0].narration = '';
      payload.visualStory.scenes[0].narration = '';
      mockLlmClient.chatCompletion.mockResolvedValueOnce({ content: JSON.stringify(payload) });

      await expect(
        service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' }),
      ).rejects.toThrow('no narration');
    });

    it('applies science fact-review text patches without replacing visual structure', async () => {
      const payload = lessonPayload('science');
      (payload.videoLesson.shots[0] as any).performance = { actors: [{ id: 'snail' }] };
      (payload.visualStory.scenes[0] as any).performance = { actors: [{ id: 'snail' }] };
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({ content: JSON.stringify(payload) })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            revisions: [
              {
                sceneIndex: 1,
                narration: '蜗牛长大后，新的壳会从壳口边缘一圈圈长出来。',
                visualDescription: 'A snail shell growing at its opening edge',
              },
            ],
          }),
        });

      const result = await service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' });

      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(2);
      const auditPrompt = mockLlmClient.chatCompletion.mock.calls[1][0][0].content;
      expect(auditPrompt).toContain('不要把花纹数量、颜色或体型当作动物年龄');
      expect(auditPrompt).toContain('不要用斑马、瓢虫冒充蜗牛壳');
      expect(result.videoLesson.shots[0].narration).toContain('壳口边缘');
      expect(result.visualStory.scenes[0].narration).toBe(result.videoLesson.shots[0].narration);
      expect(result.visualStory.scenes[0].visualDescription).toContain('opening edge');
      expect(result.visualStory.scenes[0].performance).toEqual({
        actors: [{ id: 'snail' }],
      });
      expect(result.scienceFactCheck).toEqual({ reviewed: true, revisionCount: 1 });
    });

    it('retries fact review with focused corrections when risky claims survive', async () => {
      const payload = lessonPayload('science');
      payload.videoLesson.shots[0].narration =
        '就像小树的年轮，长一岁多一圈。所以壳上的圈圈越多，说明这只蜗牛越大越老。';
      payload.visualStory.scenes[0].narration = payload.videoLesson.shots[0].narration;
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({ content: JSON.stringify(payload) })
        .mockResolvedValueOnce({ content: JSON.stringify({ revisions: [] }) })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            revisions: [
              {
                sceneIndex: 1,
                title: '壳口边长新壳',
                narration: '蜗牛长大后，新的壳会在壳口边缘逐渐形成。',
                visualDescription:
                  'A snail shell with new shell material forming at its opening edge',
                onScreenText: '壳口边缘长新壳',
              },
            ],
          }),
        });

      const result = await service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' });

      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(3);
      const focusedPrompt = mockLlmClient.chatCompletion.mock.calls[2][0][0].content;
      expect(focusedPrompt).toContain('上一轮复核仍遗漏');
      expect(focusedPrompt).toContain('用花纹数量推断年龄或大小');
      expect(result.videoLesson.shots[0].narration).toContain('壳口边缘');
      expect(result.videoLesson.shots[0].title).toBe('壳口边长新壳');
      expect(result.visualStory.scenes[0].visualDescription).toContain('opening edge');
      expect(result.scienceFactCheck).toEqual({ reviewed: true, revisionCount: 1 });
    });

    it('does not add a fact-review call for non-science lessons', async () => {
      const result = await service.generateLessonContent({
        topic: '小熊过生日',
        ageGroup: '3-4',
        style: 'story',
      });

      expect(result.domain).toBe('language');
      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('rejects a malformed science review instead of releasing the original claims', async () => {
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({ content: JSON.stringify(lessonPayload('science')) })
        .mockResolvedValueOnce({ content: JSON.stringify({ revisions: {} }) });

      await expect(
        service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' }),
      ).rejects.toThrow('revisions array');
    });

    it('blocks a known unsupported snail claim that survives fact review', async () => {
      const payload = lessonPayload('science');
      payload.videoLesson.shots[0].narration = '花纹越多，说明蜗牛长得越大！';
      payload.visualStory.scenes[0].narration = payload.videoLesson.shots[0].narration;
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({ content: JSON.stringify(payload) })
        .mockResolvedValueOnce({ content: JSON.stringify({ revisions: [] }) });

      await expect(
        service.generateLessonContent({ topic: '蜗牛', ageGroup: '5-6' }),
      ).rejects.toThrow('science fact gate failed');
    });
  });

  describe('createContentAndEnqueue', () => {
    it('queries the quick_generate cache by source and child', async () => {
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify(lessonPayload()),
      });

      await service.createContentAndEnqueue({
        topic: '蜗牛',
        ageGroup: '5-6',
        childId: 2,
      });

      expect(mockContentRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            topic: '蜗牛',
            ageRange: '5-6',
            childId: 2,
            source: 'quick_generate',
          },
        }),
      );
      expect(mockContentRepo.save).toHaveBeenCalledTimes(1);
      expect(mockContentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: '蜗牛',
          ageRange: '5-6',
          childId: 2,
          source: 'quick_generate',
          contentType: 'video_lesson',
        }),
      );
      expect(mockLessonVideoQueue.enqueue).toHaveBeenCalledWith(10, 2, false, 'auto', true);
    });

    it('reuses a valid cached lesson without calling the LLM', async () => {
      mockContentRepo.findOne.mockResolvedValue({ id: 7, content: lessonPayload() });

      const result = await service.createContentAndEnqueue({
        topic: '蜗牛',
        ageGroup: '5-6',
        childId: 2,
      });

      expect(result.contentId).toBe(7);
      expect(mockLlmClient.chatCompletion).not.toHaveBeenCalled();
      expect(mockContentRepo.save).not.toHaveBeenCalled();
    });

    it('regenerates an invalid cached lesson', async () => {
      mockContentRepo.findOne.mockResolvedValue({
        id: 7,
        content: { content: null, finishReason: 'length' },
      });
      mockLlmClient.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify(lessonPayload()),
      });

      const result = await service.createContentAndEnqueue({
        topic: '蜗牛',
        ageGroup: '5-6',
        childId: 2,
      });

      expect(result.contentId).toBe(10);
      expect(mockLlmClient.chatCompletion).toHaveBeenCalledTimes(2);
      expect(mockContentRepo.save).toHaveBeenCalledTimes(1);
    });

    it('does not save or enqueue when generation fails', async () => {
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({ content: null, finishReason: 'length' })
        .mockResolvedValueOnce({ content: null, finishReason: 'length' });

      await expect(
        service.createContentAndEnqueue({ topic: '蜗牛', ageGroup: '5-6', childId: 2 }),
      ).rejects.toThrow('truncated');

      expect(mockContentRepo.save).not.toHaveBeenCalled();
      expect(mockLessonVideoQueue.enqueue).not.toHaveBeenCalled();
    });

    it('does not save or enqueue when science fact review fails', async () => {
      mockLlmClient.chatCompletion
        .mockResolvedValueOnce({ content: JSON.stringify(lessonPayload('science')) })
        .mockResolvedValueOnce({ content: 'not json' });

      await expect(
        service.createContentAndEnqueue({ topic: '蜗牛', ageGroup: '5-6', childId: 2 }),
      ).rejects.toThrow('not valid JSON');

      expect(mockContentRepo.save).not.toHaveBeenCalled();
      expect(mockLessonVideoQueue.enqueue).not.toHaveBeenCalled();
    });
  });
});
