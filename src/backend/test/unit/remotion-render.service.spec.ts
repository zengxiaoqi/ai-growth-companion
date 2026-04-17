import { RemotionRenderService } from '../../src/modules/learning/remotion-render.service';
import { GenerateVideoDataTool } from '../../src/modules/ai/agent/tools/generate-video-data';
import { VoiceService } from '../../src/modules/voice/voice.service';

describe('RemotionRenderService', () => {
  let service: RemotionRenderService;
  let generateVideoDataTool: { execute: jest.Mock };
  let voiceService: { textToSpeech: jest.Mock };

  beforeEach(() => {
    generateVideoDataTool = {
      execute: jest.fn(),
    };

    voiceService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.alloc(0)),
    };

    service = new RemotionRenderService(
      generateVideoDataTool as unknown as GenerateVideoDataTool,
      voiceService as unknown as VoiceService,
    );
  });

  it('uses lesson watch content as TopicVideo props before generic topic fallback', async () => {
    const payload = {
      topic: '四季变化',
      title: '四季变化六步课',
      summary: '通过观察季节变化认识四季特点',
      ageGroup: '5-6',
      watchScene: {
        version: 1,
        stepType: 'watch',
        mode: 'playback',
        scenes: [
          {
            id: 'watch-scene-1',
            title: '春天来了',
            narration: '春天到了，小树发芽了。',
            onScreenText: '春天来了',
            durationSec: 10,
            visual: {
              caption: '观察春天的变化',
              items: [{ id: 'bud', label: '发芽' }],
              characters: [{ id: 'teacher', label: '老师' }],
            },
          },
        ],
      },
      visualStory: {
        scenes: [
          { scene: '旧视觉故事', narration: '不会被使用' },
        ],
      },
      videoLesson: {
        title: '四季动画课',
        shots: [
          { shot: '旧镜头', narration: '不会被使用' },
        ],
      },
    };

    const result = await service.resolveComposition(payload, payload.ageGroup);

    expect(result.compositionId).toBe('TopicVideo');
    expect(generateVideoDataTool.execute).not.toHaveBeenCalled();
    expect(result.inputProps.title).toBe('四季动画课');
    expect(result.inputProps.subtitle).toBe('通过观察季节变化认识四季特点');
    expect(result.inputProps.slides).toHaveLength(1);
    expect(result.inputProps.slides[0]).toMatchObject({
      title: '春天来了',
      narration: '春天到了，小树发芽了。',
      layout: 'list',
      items: [
        { label: '发芽' },
        { label: '老师' },
      ],
    });
  });

  it('applies template-aware mapping for structured watch scenes', async () => {
    const result = await service.resolveComposition({
      topic: '四季变化',
      title: '四季变化六步课',
      summary: '通过观察季节变化认识四季特点',
      ageGroup: '5-6',
      watchScene: {
        version: 1,
        stepType: 'watch',
        mode: 'playback',
        scenes: [
          {
            id: 'watch-scene-1',
            title: '春天来了',
            narration: '春天到了，小树发芽了。',
            visual: {
              templateId: 'science.seasons-cycle',
              templateParams: {
                focusSeason: 0,
                seasonNames: ['春', '夏', '秋', '冬'],
              },
            },
          },
        ],
      },
      visualStory: {},
      videoLesson: {},
    }, '5-6');

    expect(result.compositionId).toBe('TopicVideo');
    expect(generateVideoDataTool.execute).not.toHaveBeenCalled();
    expect(result.inputProps.slides[0]).toMatchObject({
      title: '春天来了',
      emoji: '🌸',
      subtitle: '四季轮转',
      bgColor: '#F0FFF4',
      accentColor: '#6BCB77',
      layout: 'grid',
      items: [
        { emoji: '🌸', label: '春' },
        { emoji: '☀️', label: '夏' },
        { emoji: '🍂', label: '秋' },
        { emoji: '❄️', label: '冬' },
      ],
    });
  });

  it('builds supplemental slides from lesson modules before generic topic fallback', async () => {
    const result = await service.resolveComposition({
      topic: '认识动物',
      ageGroup: '5-6',
      title: '动物观察课',
      summary: '观察、练习、测一测',
      watchScene: null,
      visualStory: {},
      videoLesson: {},
      modules: {
        listening: {
          goal: '听听动物叫声',
          audioScript: [{ segment: '猫叫', narration: '小猫喵喵叫。' }],
          questions: ['谁在叫？'],
        },
        reading: {
          goal: '读读动物名称',
          text: '小猫和小狗都是动物。',
          keywords: ['小猫', '小狗'],
        },
        writing: {
          goal: '写一写小猫',
          tracingItems: ['猫'],
          practiceTasks: ['描一描”猫”字'],
        },
        game: {
          activityType: 'matching',
          activityData: {
            title: '动物配对',
            pairs: [{ left: '猫', right: '小猫' }, { left: '狗', right: '小狗' }],
          },
        },
        quiz: {
          title: '动物小测验',
          questions: [
            { question: '哪一种会喵喵叫？' },
            { question: '哪一种会汪汪叫？' },
          ],
        },
      },
    }, '5-6');

    expect(result.compositionId).toBe('TopicVideo');
    expect(generateVideoDataTool.execute).not.toHaveBeenCalled();
    expect(result.inputProps.title).toBe('动物观察课');
    // Listening is merged into watch slides (which are empty here), so only supplement slides appear
    expect(result.inputProps.slides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '读读动物名称',
          emoji: '📚',
        }),
        expect.objectContaining({
          title: '写一写小猫',
          emoji: '✍️',
        }),
        expect.objectContaining({
          title: '动物配对',
          emoji: '🎮',
          subtitle: 'matching',
        }),
        expect.objectContaining({
          title: '动物小测验',
          emoji: '✅',
          subtitle: '共2道题',
        }),
      ]),
    );
  });

  it('keeps assess slide when watch and all supplemental modules coexist', async () => {
    const result = await service.resolveComposition({
      topic: '认识动物',
      ageGroup: '5-6',
      title: '动物观察课',
      summary: '观察、练习、测一测',
      watchScene: {
        version: 1,
        stepType: 'watch',
        mode: 'playback',
        scenes: [
          { id: 'watch-1', title: '小猫', narration: '认识小猫。' },
          { id: 'watch-2', title: '小狗', narration: '认识小狗。' },
          { id: 'watch-3', title: '小鸟', narration: '认识小鸟。' },
          { id: 'watch-4', title: '小鱼', narration: '认识小鱼。' },
          { id: 'watch-5', title: '小兔', narration: '认识小兔。' },
        ],
      },
      visualStory: {},
      videoLesson: {},
      modules: {
        listening: {
          goal: '听听动物叫声',
          audioScript: [{ segment: '猫叫', narration: '小猫喵喵叫。' }],
        },
        reading: {
          goal: '读读动物名称',
          text: '小猫和小狗都是动物。',
          keywords: ['小猫', '小狗'],
        },
        writing: {
          goal: '写一写小猫',
          tracingItems: ['猫'],
          practiceTasks: ['描一描“猫”字'],
        },
        game: {
          activityType: 'matching',
          activityData: {
            title: '动物配对',
            pairs: [{ left: '猫', right: '小猫' }],
          },
        },
        quiz: {
          title: '动物小测验',
          questions: [
            { question: '哪一种会喵喵叫？' },
            { question: '哪一种会汪汪叫？' },
          ],
        },
      },
    }, '5-6');

    expect(result.compositionId).toBe('TopicVideo');
    expect(generateVideoDataTool.execute).not.toHaveBeenCalled();
    expect(result.inputProps.slides).toHaveLength(9);
    expect(result.inputProps.slides.map((slide: any) => slide.title)).toEqual([
      '小猫',
      '小狗',
      '小鸟',
      '小鱼',
      '小兔',
      '读读动物名称',
      '写一写小猫',
      '动物配对',
      '动物小测验',
    ]);
    expect(result.inputProps.slides[8]).toMatchObject({
      title: '动物小测验',
      emoji: '✅',
      subtitle: '共2道题',
    });
  });

  it('falls back to generic topic video data when lesson watch content is unavailable', async () => {
    generateVideoDataTool.execute.mockResolvedValue({
      title: '认识动物',
      subtitle: '5-6岁启蒙课程',
      introBg: '#667EEA',
      outroBg: '#F093FB',
      slides: [
        {
          title: '小猫',
          bgColor: '#FFF5F5',
          accentColor: '#FF6B6B',
          layout: 'hero',
          narration: '这是小猫。',
        },
      ],
    });

    const result = await service.resolveComposition({
      topic: '认识动物',
      ageGroup: '5-6',
      title: '',
      summary: '',
      visualStory: {},
      videoLesson: {},
    }, '5-6');

    expect(generateVideoDataTool.execute).toHaveBeenCalledWith({
      topic: '认识动物',
      ageGroup: '5-6',
    });
    expect(result).toEqual({
      compositionId: 'TopicVideo',
      inputProps: {
        title: '认识动物',
        subtitle: '5-6岁启蒙课程',
        introBg: '#667EEA',
        outroBg: '#F093FB',
        slides: [
          {
            title: '小猫',
            bgColor: '#FFF5F5',
            accentColor: '#FF6B6B',
            layout: 'hero',
            narration: '这是小猫。',
          },
        ],
      },
    });
  });
});
