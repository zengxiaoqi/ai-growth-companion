import { RemotionRenderService } from '../../src/modules/learning/remotion-render.service';
import { GenerateVideoDataTool } from '../../src/modules/ai/agent/tools/generate-video-data';
import { VoiceService } from '../../src/modules/voice/voice.service';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/modules/learning/remotion-ts-validator', () => ({
  checkStaticFiles: jest.fn().mockResolvedValue({ passed: true, errors: [], rawOutput: '' }),
  checkGeneratedFiles: jest.fn().mockResolvedValue({ passed: true, errors: [], rawOutput: '' }),
  autoFixErrors: jest.fn().mockResolvedValue({ fixed: 0, unfixed: [] }),
}));

describe('RemotionRenderService', () => {
  let service: RemotionRenderService;
  let generateVideoDataTool: { execute: jest.Mock };
  let voiceService: { textToSpeech: jest.Mock; textToSpeechWithTiming: jest.Mock };

  beforeEach(() => {
    generateVideoDataTool = {
      execute: jest.fn(),
    };

    voiceService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.alloc(0)),
      // 视频链路走带时间戳的版本：词边界缺失/时长 0 时等价于"只有音频"，
      // 与旧行为一致（字幕回退按字数估算）
      textToSpeechWithTiming: jest.fn().mockResolvedValue({
        buffer: Buffer.alloc(0),
        wordBoundaries: [],
        durationMs: 0,
      }),
    };

    service = new RemotionRenderService(
      generateVideoDataTool as unknown as GenerateVideoDataTool,
      voiceService as unknown as VoiceService,
    );
  });

  function createSuccessfulProcess(): any {
    const proc: any = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.pid = 1234;
    proc.killed = false;
    proc.kill = jest.fn();
    setImmediate(() => proc.emit('close', 0, null));
    return proc;
  }

  it('builds shell-free Remotion CLI args that preserve Windows browser paths', () => {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    jest
      .spyOn(service as any, 'resolveRemotionCliPath')
      .mockReturnValue(path.join('node_modules', '@remotion', 'cli', 'dist', 'index.js'));
    const invocation = (service as any).buildRemotionCliInvocation([
      'render',
      'TopicVideo',
      'out.mp4',
      `--browser-executable=${chromePath}`,
    ]);

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args[0]).toContain(
      path.join('node_modules', '@remotion', 'cli', 'dist', 'index.js'),
    );
    expect(invocation.args).toContain(`--browser-executable=${chromePath}`);
    expect(invocation.options).not.toHaveProperty('shell');
  });

  it('uses the safe Remotion CLI helper for fixed renders', async () => {
    const spawnSpy = jest
      .spyOn(service as any, 'spawnRemotionCli')
      .mockImplementation(() => createSuccessfulProcess());
    jest.spyOn(service as any, 'resolveChromePath').mockReturnValue(null);

    await (service as any).runRemotionRender('TopicVideo', 'out.mp4', 'props.json');

    expect(spawnSpy).toHaveBeenCalledWith(
      expect.arrayContaining(['render', 'TopicVideo', 'out.mp4']),
    );
  });

  it('uses the safe Remotion CLI helper for dynamic renders', async () => {
    const spawnSpy = jest
      .spyOn(service as any, 'spawnRemotionCli')
      .mockImplementation(() => createSuccessfulProcess());
    jest.spyOn(service as any, 'resolveChromePath').mockReturnValue(null);

    await (service as any).runGeneratedRemotionRender(
      'entry.ts',
      'GeneratedLesson_tiger',
      'out.mp4',
      'props.json',
    );

    expect(spawnSpy).toHaveBeenCalledWith(
      expect.arrayContaining(['render', 'entry.ts', 'GeneratedLesson_tiger', 'out.mp4']),
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
        scenes: [{ scene: '旧视觉故事', narration: '不会被使用' }],
      },
      videoLesson: {
        title: '四季动画课',
        shots: [{ shot: '旧镜头', narration: '不会被使用' }],
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
      items: [{ label: '发芽' }, { label: '老师' }],
    });
  });

  it('applies template-aware mapping for structured watch scenes', async () => {
    const result = await service.resolveComposition(
      {
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
      },
      '5-6',
    );

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
    const result = await service.resolveComposition(
      {
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
              pairs: [
                { left: '猫', right: '小猫' },
                { left: '狗', right: '小狗' },
              ],
            },
          },
          quiz: {
            title: '动物小测验',
            questions: [{ question: '哪一种会喵喵叫？' }, { question: '哪一种会汪汪叫？' }],
          },
        },
      },
      '5-6',
    );

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
          // 卡片副标题走 ACTIVITY_TYPE_LABELS 的中文文案（matching → 配对练习），
          // 这里断言的是孩子看到的字，不是活动类型的关键字
          subtitle: '配对练习',
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
    const result = await service.resolveComposition(
      {
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
            questions: [{ question: '哪一种会喵喵叫？' }, { question: '哪一种会汪汪叫？' }],
          },
        },
      },
      '5-6',
    );

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

    const result = await service.resolveComposition(
      {
        topic: '认识动物',
        ageGroup: '5-6',
        title: '',
        summary: '',
        visualStory: {},
        videoLesson: {},
      },
      '5-6',
    );

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

  it('does not attach narrationSrc when legacy TTS returns a zero-byte buffer', async () => {
    // The mock already returns Buffer.alloc(0) by default
    const result = await service.resolveComposition(
      {
        topic: '认识动物',
        ageGroup: '5-6',
        title: '动物观察课',
        summary: '',
        watchScene: {
          version: 1,
          stepType: 'watch',
          mode: 'playback',
          scenes: [{ id: 'watch-1', title: '小猫', narration: '认识小猫。' }],
        },
        visualStory: {},
        videoLesson: {},
      },
      '5-6',
    );

    // Zero-byte TTS responses are a persistent failure — the service should
    // fail fast (1 call) instead of retrying pointlessly.
    expect(voiceService.textToSpeech).toHaveBeenCalledTimes(1);
    // narrationSrc should not be set when TTS returns 0 bytes
    expect(result.inputProps.slides[0].narrationSrc).toBeUndefined();
    // duration should fall back to text-length estimate
    expect(result.inputProps.slides[0].durationFrames).toBeGreaterThan(0);
  });

  it('does not attach narrationSrc when dynamic TTS returns a zero-byte buffer', async () => {
    let renderedProps: any = null;
    jest
      .spyOn(service as any, 'runGeneratedRemotionRender')
      .mockImplementation(
        async (
          _entryPath: string,
          _compositionId: string,
          _outputPath: string,
          propsPath: string,
        ) => {
          renderedProps = JSON.parse(await fs.readFile(propsPath, 'utf-8'));
        },
      );

    await service.renderGeneratedComposition(
      { id: 77, cacheKey: 'cache-key' } as any,
      {
        compositionId: 'GeneratedLesson_tiger',
        files: [
          { path: 'index.ts', content: 'export {};' },
          { path: 'Root.tsx', content: 'export {};' },
          { path: 'GeneratedLesson.tsx', content: 'export {};' },
        ],
        props: {
          title: '认识动物老虎',
          durationFrames: 180,
          scenes: [
            {
              id: 'scene-1',
              title: '老虎条纹',
              narration: '老虎身上有黑色条纹。',
              generatedVisual: 'tiger-showFeatures-forest-stripe',
              durationFrames: 180,
            },
          ],
        },
        assets: [],
        durationFrames: 180,
        sceneAssetSummary: [
          {
            title: '老虎条纹',
            generatedVisual: 'tiger-showFeatures-forest-stripe',
          },
        ],
      },
      path.join(os.tmpdir(), 'dynamic-remotion-empty-audio.mp4'),
    );

    // Zero-byte TTS responses are a persistent failure — the service should
    // fail fast (1 call) instead of retrying pointlessly.
    expect(voiceService.textToSpeechWithTiming).toHaveBeenCalledTimes(1);
    expect(renderedProps.scenes[0].audioSrc).toBeUndefined();
  }, 60000);

  it('attaches word-level subtitle cues and lets audio decide scene duration', async () => {
    // 30000 B 走 parseMp3 的 40kbps 兜底 ≈ 6.0s 语音 → 180 帧 + 24 帧垫片 = 204 帧
    // 分镜估算只有 180 帧：拿到时间轴后应以语音为准，而不是把 24 帧空等留在句末
    const narration = '老虎身上有黑色条纹。';
    const words = Array.from(narration).filter((ch) => ch !== '。');
    const boundaries = words.map((ch, i) => ({
      text: ch,
      offset: Math.round(i * 0.15 * 1e7),
      duration: Math.round(0.15 * 1e7),
    }));

    voiceService.textToSpeechWithTiming.mockResolvedValue({
      buffer: Buffer.alloc(30000),
      wordBoundaries: boundaries,
      durationMs: 6000,
    });

    let renderedProps: any = null;
    jest
      .spyOn(service as any, 'runGeneratedRemotionRender')
      .mockImplementation(
        async (
          _entryPath: string,
          _compositionId: string,
          _outputPath: string,
          propsPath: string,
        ) => {
          renderedProps = JSON.parse(await fs.readFile(propsPath, 'utf-8'));
        },
      );

    await service.renderGeneratedComposition(
      { id: 78, cacheKey: 'cache-key-cues' } as any,
      {
        compositionId: 'GeneratedLesson_tiger',
        files: [
          { path: 'index.ts', content: 'export {};' },
          { path: 'Root.tsx', content: 'export {};' },
          { path: 'GeneratedLesson.tsx', content: 'export {};' },
        ],
        props: {
          title: '认识动物老虎',
          durationFrames: 180,
          scenes: [
            {
              id: 'scene-1',
              title: '老虎条纹',
              narration,
              generatedVisual: 'tiger-showFeatures-forest-stripe',
              durationFrames: 180,
            },
          ],
        },
        assets: [],
        durationFrames: 180,
        sceneAssetSummary: [{ title: '老虎条纹', generatedVisual: 'tiger-showFeatures-forest-stripe' }],
      },
      path.join(os.tmpdir(), 'dynamic-remotion-cues.mp4'),
    );

    const scene = renderedProps.scenes[0];
    expect(scene.subtitlePages).toBeDefined();
    expect(scene.subtitlePages[0].tokens.join('')).toBe(narration);
    expect(scene.subtitlePages[0].starts.length).toBe(scene.subtitlePages[0].tokens.length);
    expect(scene.subtitlePages[0].starts[0]).toBeLessThanOrEqual(1);
    for (let i = 1; i < scene.subtitlePages[0].starts.length; i += 1) {
      expect(scene.subtitlePages[0].starts[i]).toBeGreaterThanOrEqual(
        scene.subtitlePages[0].starts[i - 1],
      );
    }
    expect(scene.durationFrames).toBe(204);
  }, 60000);

  it('writes action anchors for graph nodes whose label is spoken, and skips the rest', async () => {
    const narration = '老虎身上有黑色条纹。';
    const words = Array.from(narration).filter((ch) => ch !== '。');
    const boundaries = words.map((ch, i) => ({
      text: ch,
      offset: Math.round(i * 0.15 * 1e7),
      duration: Math.round(0.15 * 1e7),
    }));

    voiceService.textToSpeechWithTiming.mockResolvedValue({
      buffer: Buffer.alloc(30000),
      wordBoundaries: boundaries,
      durationMs: 6000,
    });

    let renderedProps: any = null;
    jest
      .spyOn(service as any, 'runGeneratedRemotionRender')
      .mockImplementation(
        async (
          _entryPath: string,
          _compositionId: string,
          _outputPath: string,
          propsPath: string,
        ) => {
          renderedProps = JSON.parse(await fs.readFile(propsPath, 'utf-8'));
        },
      );

    await service.renderGeneratedComposition(
      { id: 81, cacheKey: 'cache-key-anchors' } as any,
      {
        compositionId: 'GeneratedLesson_tiger_anchor',
        files: [
          { path: 'index.ts', content: 'export {};' },
          { path: 'Root.tsx', content: 'export {};' },
          { path: 'GeneratedLesson.tsx', content: 'export {};' },
        ],
        props: {
          title: '认识动物老虎',
          durationFrames: 180,
          scenes: [
            {
              id: 'scene-1',
              title: '老虎条纹',
              narration,
              durationFrames: 180,
              // 森林是旁白里没有的词：不该拿到锚点，必须回退 storyProgress
              sceneGraph: {
                relation: 'chain',
                nodes: [
                  { id: 'n-tiger', label: '老虎', subject: '老虎' },
                  { id: 'n-forest', label: '森林', subject: '森林' },
                ],
                flows: [],
              },
            },
          ],
        },
        assets: [],
        durationFrames: 180,
        sceneAssetSummary: [{ title: '老虎条纹', generatedVisual: 'tiger-showFeatures-forest-stripe' }],
      },
      path.join(os.tmpdir(), 'dynamic-remotion-anchors.mp4'),
    );

    const scene = renderedProps.scenes[0];
    expect(scene.actionAnchors).toBeDefined();
    expect(Object.keys(scene.actionAnchors)).toEqual(['n-tiger']);
    const window = scene.actionAnchors['n-tiger'];
    expect(window.start).toBeGreaterThanOrEqual(0);
    expect(window.end).toBeLessThanOrEqual(scene.durationFrames);
    expect(window.end).toBeGreaterThan(window.start);
  }, 60000);
});
