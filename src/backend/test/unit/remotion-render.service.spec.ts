import { RemotionRenderService } from '../../src/modules/learning/remotion-render.service';
import { GenerateVideoDataTool } from '../../src/modules/ai/agent/tools/generate-video-data';

describe('RemotionRenderService', () => {
  let service: RemotionRenderService;
  let generateVideoDataTool: { execute: jest.Mock };

  beforeEach(() => {
    generateVideoDataTool = {
      execute: jest.fn(),
    };

    service = new RemotionRenderService(generateVideoDataTool as unknown as GenerateVideoDataTool);
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
    expect(result.inputProps.title).toBe('四季变化六步课');
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
