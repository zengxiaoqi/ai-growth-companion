import { VideoGenerationAgentService } from '../../src/modules/learning/video-generation-agent.service';
import { VisualAssetService } from '../../src/modules/learning/visual-asset.service';
import { MOTION_DEFAULTS } from '../../src/modules/learning/video/action3d-registry';
import { readFileSync } from 'fs';
import { join } from 'path';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

describe('VideoGenerationAgentService', () => {
  const originalPropGen = process.env.PROP_GEN;
  afterEach(() => {
    if (originalPropGen === undefined) delete process.env.PROP_GEN;
    else process.env.PROP_GEN = originalPropGen;
  });

  const createService = (visualAssetService?: VisualAssetService) =>
    new VideoGenerationAgentService(
      { getToolDefinitions: jest.fn().mockReturnValue([]) } as any,
      {} as any,
      { runLoop: jest.fn() } as any,
      { getSkillsForAgent: jest.fn().mockReturnValue([]) } as any,
      visualAssetService,
    );

  const loadTemplateHelper = (name: string) => {
    const source = readFileSync(
      join(__dirname, '../../src/modules/learning/video-generation-agent.service.ts'),
      'utf8',
    );
    const start = source.indexOf(`const ${name}`);
    const end = source.indexOf('\n};', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const js = transpileModule(source.slice(start, end + 3), {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 },
    }).outputText;
    return new Function(`${js}\nreturn ${name};`)();
  };

  it('extracts the latest raw generateVideoContent tool result from the agent loop', async () => {
    const firstStoryboard = {
      title: '认识动物老虎初稿',
      topic: '认识动物老虎',
      domain: 'science',
      totalDurationSec: 30,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '森林之王',
          concept: '老虎',
          narration: '老虎身上有黑色条纹。',
          onScreenText: '老虎条纹',
          visualDescription: '森林里的老虎',
          durationSec: 6,
          transitionToNext: 'fade',
          emphasis: 'intro',
        },
      ],
      visualTheme: {
        primaryPalette: '#FFF5E6',
        accentColor: '#FF6B35',
        mood: 'playful',
      },
      narrativeArc: 'intro',
    };
    const finalStoryboard = {
      ...firstStoryboard,
      title: '认识动物老虎终稿',
      scenes: [
        {
          ...firstStoryboard.scenes[0],
          title: '老虎的本领',
          narration: '老虎会奔跑和游泳，是大型猫科动物。',
          onScreenText: '老虎本领',
        },
      ],
    };
    const quality = {
      passed: true,
      score: 82,
      issues: ['template mismatch'],
    };

    const executorService = {
      runLoop: jest.fn(
        async (
          _systemPrompt,
          _messages,
          _toolDefinitions,
          _maxIterations,
          _context,
          onToolCall,
        ) => {
          await onToolCall({
            toolName: 'generateVideoContent',
            args: { topic: '认识动物老虎' },
            result: JSON.stringify(firstStoryboard),
          });
          await onToolCall({
            toolName: 'generateVideoContent',
            args: { topic: '认识动物老虎' },
            result: JSON.stringify(finalStoryboard),
          });
          await onToolCall({
            toolName: 'reviewVideoQuality',
            args: { topic: '认识动物老虎' },
            result: JSON.stringify(quality),
          });
          return { response: 'done', toolCalls: [] };
        },
      ),
    };
    const toolRegistry = {
      getToolDefinitions: jest.fn().mockReturnValue([
        { type: 'function', function: { name: 'generateVideoContent' } },
        { type: 'function', function: { name: 'reviewVideoQuality' } },
      ]),
    };
    const service = new VideoGenerationAgentService(
      toolRegistry as any,
      {} as any,
      executorService as any,
      { getSkillsForAgent: jest.fn().mockReturnValue([]) } as any,
      undefined as any,
    );

    const result = await service.generateViaAgent({
      topic: '认识动物老虎',
      domain: 'science',
      ageGroup: '5-6',
      contentId: 62,
      childId: 2,
      payload: {},
    });

    expect(result.storyboard).toMatchObject({
      title: '认识动物老虎终稿',
      scenes: [
        expect.objectContaining({
          title: '老虎的本领',
          narration: expect.stringContaining('老虎'),
        }),
      ],
    });
    expect(result.qualityScore).toBe(82);
    expect(result.qualityPassed).toBe(true);
    expect(result.issues).toEqual(['template mismatch']);
    expect(toolRegistry.getToolDefinitions).toHaveBeenCalled();
  });

  it('generates a dynamic Remotion manifest with topic-specific tiger visuals', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '认识动物老虎',
        topic: '认识动物老虎',
        domain: 'science',
        totalDurationSec: 18,
        sceneCount: 3,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '老虎条纹',
            concept: '外形',
            narration: '老虎身上有橙色皮毛和黑色条纹，条纹能帮助它藏在森林里。',
            onScreenText: '黑色条纹',
            visualDescription: '森林里的老虎展示黑色条纹',
            durationSec: 6,
            transitionToNext: 'fade',
            emphasis: 'intro',
          },
          {
            id: 'scene-2',
            sequence: 2,
            title: '老虎游泳',
            concept: '本领',
            narration: '老虎会游泳，能穿过小河去寻找食物。',
            onScreenText: '会游泳',
            visualDescription: '老虎在河里游泳，水花飞起来',
            durationSec: 6,
            transitionToNext: 'fade',
            emphasis: 'core-concept',
          },
        ],
        visualTheme: {
          primaryPalette: '#E8F8FF',
          accentColor: '#f08c00',
          mood: 'playful',
        },
        narrativeArc: 'intro',
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    const generatedCode = manifest.files.map((file) => file.content).join('\n');
    expect(manifest.compositionId).toMatch(/^GeneratedLesson-/);
    const paths = manifest.files.map((file) => file.path);
    // 三个模板文件必须在场
    expect(paths.slice(0, 3)).toEqual(['index.ts', 'Root.tsx', 'GeneratedLesson.tsx']);
    // 渲染层源码随任务目录下发，写入路径与源目录一致（相对 import 才成立）。
    // 这里不写死完整列表：2D 角色落地后会多出 character/Puppet2D.tsx。
    expect(paths).toEqual(
      expect.arrayContaining(['character/pose.ts', 'three/ThreeActionStage.tsx']),
    );
    for (const path of paths.slice(3)) {
      // 每个下发文件都必须带内容，空内容会让渲染期报"模块找不到"
      expect(manifest.files.find((file) => file.path === path)!.content.length).toBeGreaterThan(
        200,
      );
    }
    expect(generatedCode).toContain('Img');
    expect(generatedCode).toContain('TigerSvg');
    expect(generatedCode).toContain('SceneBackground');
    // 角色来自矢量库还是本地课程素材，取决于这台机器跑没跑过
    // `npm run assets:vector`（它下载的 manifest.json 是 gitignore 的）。
    // 两者都是"真素材"，所以只断言拿到了一只 animals 目录下的 svg，
    // 不把"矢量库装没装"写进预期——否则同一份代码在两台机器上一红一绿。
    expect(manifest.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'character',
          provider: expect.stringMatching(/^(local|vector)$/),
          staticPath: expect.stringMatching(/animals\/.+\.svg$/),
        }),
      ]),
    );
    expect(manifest.sceneAssetSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '老虎条纹',
          generatedVisual: expect.stringContaining('tiger'),
        }),
      ]),
    );
    expect(manifest.sceneAssetSummary[0]).toMatchObject({
      assetProvider: expect.stringMatching(/^(local|vector)$/),
      assetLicense: expect.stringMatching(/^(cc0|mit)$/),
    });
    expect(manifest.props.scenes[0]).toMatchObject({
      assetKey: 'tiger',
      action: 'showFeatures',
      habitat: 'forest',
      visualAssets: expect.objectContaining({
        characterAssetSrc: expect.stringMatching(/^assets\/(lesson|vector)\/animals\/.+\.svg$/),
        // 背景不走矢量库，永远是本地场景图，可以写死
        backgroundAssetSrc: 'assets/lesson/backgrounds/forest-day.svg',
      }),
    });
    expect(manifest.props.scenes[1]).toMatchObject({
      assetKey: 'tiger',
      action: 'swim',
      habitat: 'river',
    });
  });

  it('renders interaction actors as vector SVG figures with code-driven motion, not emoji', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '学会分享',
        topic: '学会分享',
        domain: 'social',
        totalDurationSec: 12,
        sceneCount: 1,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '递皮球',
            concept: '分享',
            narration: '小兔把红色皮球轻轻递给另一只小兔。',
            onScreenText: '一起分享',
            visualDescription: '小兔把红色皮球递给小兔，小兔双手接过',
            durationSec: 12,
            transitionToNext: 'fade',
            emphasis: 'core-concept',
            interaction: {
              verb: 'handover',
              actors: [
                { id: 'rabbit', label: '小兔', role: 'giver' },
                { id: 'rabbit', label: '另一只小兔', role: 'receiver' },
              ],
              propId: 'ball',
            },
          },
        ],
        visualTheme: {
          primaryPalette: '#E8F8FF',
          accentColor: '#ff6b81',
          mood: 'playful',
        },
        narrativeArc: 'intro',
      } as any,
      { domain: 'social', ageGroup: '5-6' },
    );

    const generatedCode = manifest.files.map((file) => file.content).join('\n');
    expect(manifest.props.scenes[0].interaction?.verb).toBe('handover');
    // 矢量角色：从素材库按 actor.id 拼路径，不走每幕单主角的 characterAssetSrc
    expect(generatedCode).toContain('const ActorFigure');
    expect(generatedCode).toContain('assets/vector/animals/');
    expect(generatedCode).toContain('VECTOR_ANIMAL_IDS.indexOf(actor.id)');
    expect(generatedCode).toContain('"rabbit"');
    // 代码驱动的动画：入场弹性 + 呼吸 + 手臂摆动
    expect(generatedCode).toContain('0.55 + enter * 0.45');
    expect(generatedCode).toContain('armAngle');
    expect(generatedCode).toContain('spring(');
    // 交互幕不再画自己的底部 caption（与旁白字幕轨重叠）
    expect(generatedCode).not.toContain('giver.label + " 把"');
  });

  it('generates a dynamic Remotion manifest with rabbit image assets instead of the generic circle fallback', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '认识动物兔子',
        topic: '认识动物兔子',
        domain: 'science',
        totalDurationSec: 12,
        sceneCount: 2,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '兔子的长耳朵',
            concept: '外形',
            narration: '兔子有长长的耳朵，可以听见远处的声音。',
            onScreenText: '长耳朵',
            visualDescription: '草地上的兔子竖起长耳朵认真听声音',
            durationSec: 6,
            transitionToNext: 'fade',
            emphasis: 'intro',
          },
          {
            id: 'scene-2',
            sequence: 2,
            title: '爱吃青草和胡萝卜',
            concept: '食物',
            narration: '兔子喜欢吃青草、胡萝卜和菜叶，是草食动物。',
            onScreenText: '爱吃青草胡萝卜',
            visualDescription: '兔子在草地上吃胡萝卜和青草',
            durationSec: 6,
            transitionToNext: 'fade',
            emphasis: 'core-concept',
          },
        ],
        visualTheme: {
          primaryPalette: '#E8F8FF',
          accentColor: '#e76f8a',
          mood: 'playful',
        },
        narrativeArc: 'intro',
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    expect(manifest.props.scenes[0]).toMatchObject({
      assetKey: 'rabbit',
      action: 'listen',
      habitat: 'grassland',
      visualAssets: expect.objectContaining({
        backgroundAssetSrc: 'assets/lesson/backgrounds/grassland.svg',
        backgroundProvider: 'local',
      }),
    });
    expect(manifest.props.scenes[1]).toMatchObject({
      assetKey: 'rabbit',
      action: 'eat',
      visualAssets: expect.objectContaining({
        // 同上：装了矢量库拿到的是 rabbit.svg（不带姿态），没装才是
        // rabbit-eating.svg。这里关心的是"吃萝卜这一幕有真角色图"。
        characterAssetSrc: expect.stringMatching(/^assets\/(lesson|vector)\/animals\/.+\.svg$/),
      }),
    });
    expect(manifest.sceneAssetSummary[0]).toMatchObject({
      assetProvider: expect.stringMatching(/^(local|vector)$/),
      characterProvider: expect.stringMatching(/^(local|vector)$/),
      hasCharacterAsset: true,
    });
  });

  // 背景分档的判定：以前所有场景都铺同一片森林，因为默认 habitat 就是 forest
  it('picks the animal named in the visual description instead of the first rabbit keyword', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '学会分享',
        topic: '学会分享',
        domain: 'social',
        totalDurationSec: 12,
        sceneCount: 2,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '礼貌用语',
            concept: '借玩具',
            narration: '兔兔想玩，请你看着小熊的眼睛说可以借我玩吗。',
            onScreenText: '可以借我玩吗？',
            visualDescription: '小熊把红色皮球递出去，旁边有饼干',
            durationSec: 6,
          },
        ],
      } as any,
      { domain: 'social', ageGroup: '5-6' },
    );

    const scene: any = (manifest.props as any).scenes[0];
    expect(scene.assetKey).toBe('bear');
    expect(scene.generatedVisual).toContain('bear');
    expect(scene.props).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ball' }),
        expect.objectContaining({ id: 'cookie' }),
      ]),
    );
    expect(manifest.files.map((file) => file.content).join('\n')).toContain('PropArt');
  });

  describe('resolveBackgroundStyle', () => {
    const service = createService();

    const resolve = (input: { source: string; hasGraph?: boolean; hasAnimal?: boolean }) =>
      (service as any).resolveBackgroundStyle({
        source: input.source,
        hasGraph: !!input.hasGraph,
        hasAnimal: !!input.hasAnimal,
      });

    it('关系图走中性底：抽象结构不该站在草地上', () => {
      expect(resolve({ source: '水循环', hasGraph: true })).toBe('neutral');
      expect(resolve({ source: '苹果香蕉葡萄都是水果', hasGraph: true })).toBe('neutral');
      // 即使文本里出现了"森林"，关系图也优先中性底
      expect(resolve({ source: '森林里的食物链', hasGraph: true })).toBe('neutral');
    });

    it('有具体动物才给环境背景', () => {
      expect(resolve({ source: '认识动物老虎', hasAnimal: true })).toBe('environment');
      expect(resolve({ source: '小兔子在草原上', hasAnimal: true })).toBe('environment');
    });

    it('文本点名栖息地时给环境背景', () => {
      expect(resolve({ source: '森林里的清晨' })).toBe('environment');
      expect(resolve({ source: '河边的小溪' })).toBe('environment');
    });

    it('讲抽象概念不给任何"地点"', () => {
      expect(resolve({ source: '认识数字 1 到 10' })).toBe('neutral');
      expect(resolve({ source: '什么时候该说我爱你' })).toBe('neutral');
    });
  });

  // 画板通道：图形本身就是知识时，必须走 figure 而不是"概念卡片 + 箭头"
  describe('figure channel', () => {
    const rainbowFigure = {
      shapes: [
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 490,
          from: 4,
          to: 176,
          stroke: '#E5484D',
          width: 34,
          reveal: 0,
        },
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 450,
          from: 4,
          to: 176,
          stroke: '#F76B15',
          width: 34,
          reveal: 0.1,
        },
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 410,
          from: 4,
          to: 176,
          stroke: '#FFC53D',
          width: 34,
          reveal: 0.2,
        },
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 370,
          from: 4,
          to: 176,
          stroke: '#30A46C',
          width: 34,
          reveal: 0.3,
        },
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 330,
          from: 4,
          to: 176,
          stroke: '#0091FF',
          width: 34,
          reveal: 0.4,
        },
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 290,
          from: 4,
          to: 176,
          stroke: '#3E63DD',
          width: 34,
          reveal: 0.5,
        },
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 250,
          from: 4,
          to: 176,
          stroke: '#8E4EC6',
          width: 34,
          reveal: 0.6,
        },
      ],
      labels: [{ text: '水滴', x: 240, y: 560 }],
    };

    const scene = (extra: Record<string, unknown>) => ({
      id: 'scene-1',
      sequence: 1,
      title: '彩虹是怎么来的',
      concept: '光的折射',
      narration: '阳光照到空中的小水滴，被折射和反射，就散成了七种颜色。',
      onScreenText: '阳光穿过水滴',
      visualDescription: '一道横跨天空的七色弧',
      durationSec: 6,
      transitionToNext: 'fade',
      emphasis: 'core-concept',
      ...extra,
    });

    it('画板优先于关系图，并且强制中性背景', async () => {
      const service = createService();
      const manifest = await service.generateRemotionComposition({
        title: '彩虹',
        topic: '彩虹',
        domain: 'science',
        totalDurationSec: 6,
        sceneCount: 1,
        scenes: [
          scene({
            figure: rainbowFigure,
            // 同时给关系图：画板存在时它必须被丢掉，否则渲染层会拿到两套坐标系
            sceneGraph: {
              relation: 'chain',
              nodes: [
                { id: 'n1', label: '阳光', subject: '太阳' },
                { id: 'n2', label: '水滴', subject: '水滴' },
              ],
            },
          }),
        ],
      } as any);

      const built = manifest.props.scenes[0] as any;
      expect(built.figure).toBeDefined();
      expect(built.figure.shapes).toHaveLength(7);
      expect(built.sceneGraph).toBeUndefined();
      // 画板是画面主体，背景必须退到幕后
      expect(built.backgroundStyle).toBe('neutral');
    });

    it('画板非法时整份丢弃，退回关系图而不是带着脏几何渲染', async () => {
      const service = createService();
      const manifest = await service.generateRemotionComposition({
        title: '彩虹',
        topic: '彩虹',
        domain: 'science',
        totalDurationSec: 6,
        sceneCount: 1,
        scenes: [
          scene({
            // 缩在左上角的小圆：语法合法但几何不合格，覆盖率过不了
            figure: {
              shapes: [
                { kind: 'circle', cx: 120, cy: 120, r: 60, fill: '#3E63DD', reveal: 0 },
                { kind: 'circle', cx: 220, cy: 160, r: 50, fill: '#3E63DD', reveal: 1 },
              ],
            },
            sceneGraph: {
              relation: 'chain',
              nodes: [
                { id: 'n1', label: '阳光', subject: '太阳' },
                { id: 'n2', label: '水滴', subject: '水滴' },
              ],
            },
          }),
        ],
      } as any);

      const built = manifest.props.scenes[0] as any;
      expect(built.figure).toBeUndefined();
      expect(built.sceneGraph).toBeDefined();
      expect(built.sceneGraph.nodes).toHaveLength(2);
    });

    it('没有画板时走的还是原来的路，背景判定不受影响', async () => {
      const service = createService();
      const manifest = await service.generateRemotionComposition({
        title: '认识动物老虎',
        topic: '认识动物老虎',
        domain: 'science',
        totalDurationSec: 6,
        sceneCount: 1,
        scenes: [scene({ title: '老虎的条纹', narration: '老虎身上有一条条黑色的条纹。' })],
      } as any);

      const built = manifest.props.scenes[0] as any;
      expect(built.figure).toBeUndefined();
      // 有具体动物 → 环境背景，和接画板之前一致
      expect(built.backgroundStyle).toBe('environment');
    });
  });

  it('滑梯分镜解析成 3D 动作并随 props 下发（渲染层不再自己算坐标）', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition({
      title: '小兔滑滑梯',
      topic: '小兔滑滑梯',
      domain: 'social',
      totalDurationSec: 6,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '小兔滑滑梯',
          concept: '排队轮流',
          narration: '小兔爬上滑梯，从滑梯上滑下来，稳稳落在草地上。',
          onScreenText: '滑下来',
          visualDescription: '小兔坐在滑梯顶端，顺着滑梯滑下来',
          durationSec: 6,
          transitionToNext: 'fade',
          emphasis: 'core-concept',
        },
      ],
    } as any);

    const built = manifest.props.scenes[0] as any;
    expect(built.interaction?.verb).toBe('slide');
    expect(built.interaction?.action3d).toMatchObject({
      motion: 'slide',
      propId: 'slide',
      actorId: 'rabbit',
    });
    // 坐标与造型必须已由注册表补齐，渲染层拿到的是确定值
    expect(built.interaction.action3d.start).toEqual(expect.any(Array));
    expect(built.interaction.action3d.start).toHaveLength(3);
    expect(built.interaction.action3d.rig.fur).toBeTruthy();
    expect(built.interaction.action3d.durationFrames).toBeGreaterThan(0);
  });

  /**
   * 整节课共用一处场地。
   *
   * 上一版每一幕各自成景：说话幕是一只熊站在一片空草地上，爬梯幕是一把孤立
   * 的梯子，滑梯幕是另一座按"这一幕装得下"缩放的滑梯。于是同一只熊在三幕里
   * 三个大小，滑梯和它的比例也对不上。
   *
   * 修复不是给某一幕调尺寸，而是让**整节课只下发一份 world**：位置不变、
   * 缩放基准由它算出，镜头只允许变焦不平移世界。所以这里钉三件事：
   *  1. 每一幕的 world 是同一份（同一处公园、同一座滑梯坐标）；
   *  2. 滑梯坐标等于 MOTION_DEFAULTS（三维建 mesh 用的同一组数）；
   *  3. 用滑梯的幕只挂 setpiece，不额外摆道具——否则画面里会有两座滑梯。
   */
  it('整节课共用同一处场地：每幕拿到同一份 world，用滑梯的幕只标 setpiece', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition({
      title: '小兔玩滑梯',
      topic: '小兔玩滑梯',
      domain: 'social',
      totalDurationSec: 18,
      sceneCount: 3,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '草地上的小兔',
          concept: '排队轮流',
          narration: '小兔指着彩色滑梯。',
          onScreenText: '彩色滑梯',
          visualDescription: '小兔站在草地上指向滑梯',
          durationSec: 6,
          emphasis: 'core-concept',
          interaction: {
            verb: 'point',
            actors: [{ id: 'rabbit', label: '小兔', role: 'main' }],
          },
        },
        {
          id: 'scene-2',
          sequence: 2,
          title: '先爬楼梯',
          concept: '排队轮流',
          narration: '小兔抓住梯子一步一步往上爬。',
          onScreenText: '爬上去',
          visualDescription: '小兔在梯子前手脚交替向上爬',
          durationSec: 6,
          emphasis: 'core-concept',
          interaction: {
            verb: 'climb',
            actors: [{ id: 'rabbit', label: '小兔', role: 'main' }],
            propId: 'slide',
          },
        },
        {
          id: 'scene-3',
          sequence: 3,
          title: '滑下来',
          concept: '排队轮流',
          narration: '小兔顺着滑梯滑下来。',
          onScreenText: '滑下来',
          visualDescription: '小兔坐在滑梯顶端顺着滑梯滑下来',
          durationSec: 6,
          emphasis: 'core-concept',
          interaction: {
            verb: 'slide',
            actors: [{ id: 'rabbit', label: '小兔', role: 'main' }],
          },
        },
      ],
    } as any);

    const scenes = manifest.props.scenes as any[];
    expect(scenes).toHaveLength(3);

    // 1. 同一份场地：任意两幕的 world 必须逐字段相等
    for (const scene of scenes) {
      expect(scene.world).toEqual(scenes[0].world);
      expect(scene.world.venue).toBe('playground');
    }
    // 2. 滑梯坐标与三维舞台同源
    expect(scenes[0].world.slide.start).toEqual([...MOTION_DEFAULTS.slide.start]);
    expect(scenes[0].world.slide.end).toEqual([...MOTION_DEFAULTS.slide.end]);

    // 3. setpiece：用滑梯的幕才标；说话幕不标（它只是"在公园里说话"）
    expect(scenes[0].setpiece).toBeUndefined();
    expect(scenes[1].setpiece).toBe('slide');
    expect(scenes[2].setpiece).toBe('slide');
  });

  /**
   * 非滑梯主题：这是"改动只对兔子玩滑梯生效"的反证。
   *
   * 上面那条测试用的是带滑梯的分镜，所以它证明不了别的主题也被覆盖。
   * 这份《小兔子分果子》四幕分别落在四种舞台（巨图特写 / 双人徽章 / 全身木偶 ×2），
   * 只要每一幕都拿到同一份 world，"整节课一处场地"才真的是所有主题都成立——
   * 而不是渲染层对某一种分镜特判出来的效果。
   */
  it('非滑梯主题也整节课一处场地：按 habitat 推场地，四幕同一份 world 且不硬塞滑梯', async () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, '../fixtures/forest-storyboard.json'), 'utf8'),
    );
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(fixture, {} as any);
    const scenes = manifest.props.scenes as any[];

    expect(scenes).toHaveLength(4);
    // 1. 每一幕都有 world（包括"巨图特写"和"双人徽章"这两种不画全身的舞台）
    for (const scene of scenes) {
      expect(scene.world).toBeTruthy();
      expect(scene.world).toEqual(scenes[0].world);
    }
    // 2. 场地由文本里的"森林"推出，而不是默认草地
    expect(scenes[0].world.venue).toBe('forest');
    // 3. 没有滑梯就绝不硬塞一座：slide 与 setpiece 都必须缺席
    expect(scenes[0].world.slide).toBeUndefined();
    for (const scene of scenes) expect(scene.setpiece).toBeUndefined();

    // 4. 四种舞台确实都出现了——否则这条测试会在"分镜被降级成同一种舞台"时假通过
    const branches = scenes.map((s) => {
      const it = s.interaction;
      if (!it) return 'plain';
      if (it.action3d) return '3d';
      if (it.puppet) return 'puppet';
      return `actor:${it.verb}`;
    });
    expect(branches[0]).toBe('plain');
    // 双人幕现在走木偶（两个 hold），不再是徽章分支——见下一条测试
    expect(branches[1]).toBe('puppet');
    expect(branches[2]).toBe('puppet');
    expect(branches[3]).toBe('puppet');
  });

  /**
   * 双人动词的两个落点都要钉住，缺一不可：
   *  1. **路由**：handover / lift-together 必须交给木偶（两个人），而不是徽章分支。
   *     只钉住"有 partner"不够——如果路由退回徽章，partner 字段永远不会出现，
   *     测试要靠"puppet.motion === 'hold'"来判断它到底走的是哪条路。
   *  2. **道具归属**：递给是"从一个人的手移到另一个人的手"，一起抬是"两人合托"，
   *     两者用同一个字段（carryBy）区分。写错这个字，画面上就是"一起抬"变成
   *     "一个人把东西递给另一个人"，孩子的理解完全不同。
   */
  it('双人动词交给两个木偶演：递给沿手移动、一起抬两人合托', async () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, '../fixtures/forest-storyboard.json'), 'utf8'),
    );
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(fixture, {} as any);
    const scenes = manifest.props.scenes as any[];

    // 递给（第 2 幕）：两个 hold，道具从主角色手上移到副角色手上
    const handover = scenes[1].interaction;
    expect(handover.verb).toBe('handover');
    expect(handover.puppet).toBeTruthy();
    expect(handover.puppet.motion).toBe('hold');
    expect(handover.puppet.actorId).toBe('rabbit');
    expect(handover.puppet.partner).toBeTruthy();
    expect(handover.puppet.partner.motion).toBe('hold');
    expect(handover.puppet.partner.actorId).toBe('rabbit');
    expect(handover.puppet.partner.rig).toBeTruthy();
    expect(handover.puppet.carryBy).toBe('handover');

    // 一起抬：同一套骨架，但道具停在两人手之间
    const lift = JSON.parse(JSON.stringify(fixture));
    lift.scenes[1].interaction.verb = 'lift-together';
    lift.scenes[1].interaction.propId = 'block';
    const liftManifest = await service.generateRemotionComposition(lift, {} as any);
    const liftInteraction = (liftManifest.props.scenes as any[])[1].interaction;
    expect(liftInteraction.puppet.motion).toBe('hold');
    expect(liftInteraction.puppet.partner.actorId).toBe('rabbit');
    expect(liftInteraction.puppet.carryBy).toBe('shared');

    // 没有道具时不留"空手递"：carryBy 不下发，渲染层也就不会画道具
    const empty = JSON.parse(JSON.stringify(fixture));
    delete empty.scenes[1].interaction.propId;
    const emptyManifest = await service.generateRemotionComposition(empty, {} as any);
    const emptyInteraction = (emptyManifest.props.scenes as any[])[1].interaction;
    expect(emptyInteraction.puppet.partner).toBeTruthy();
    expect(emptyInteraction.puppet.carryBy).toBeUndefined();
  });

  /**
   * P3 反向闭环：prompt 教了 LLM 能写 climb/walk，装配层就必须把这两个
   * verb 接到二维渲染器上。
   *
   * 这一环最容易断：verb 白名单加了、prompt 也改了，但装配层只认
   * point/speak 的话，LLM 写得再对，画面照样退回静态构图，而且没有任何报错。
   */
  it('LLM 直接声明 verb=climb 时下发 puppet，不再掉回静态构图', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition({
      title: '小兔爬滑梯',
      topic: '小兔爬滑梯',
      domain: 'social',
      totalDurationSec: 6,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '一步一步爬上去',
          concept: '排队轮流',
          narration: '小兔抓住梯子，一步一步往上爬。',
          onScreenText: '爬上去',
          visualDescription: '小兔在梯子前，手脚交替向上爬',
          durationSec: 6,
          transitionToNext: 'fade',
          emphasis: 'core-concept',
          // 新 prompt 之后 LLM 的写法：只给 verb，不给 puppet
          interaction: {
            verb: 'climb',
            actors: [{ id: 'rabbit', label: '小兔', role: 'helper' }],
            propId: 'slide',
          },
        },
      ],
    } as any);

    const built = manifest.props.scenes[0] as any;
    expect(built.interaction?.verb).toBe('climb');
    expect(built.interaction?.puppet?.motion).toBe('climb');
    expect(built.interaction?.puppet?.rig?.fur).toBeTruthy();
    // climb 是 2D 独占原语，不该同时挂 3D 动作
    expect(built.interaction?.action3d).toBeUndefined();
  });

  it('LLM 直接声明 verb=walk 时下发 puppet walk', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition({
      title: '小兔走过来',
      topic: '小兔走过来',
      domain: 'social',
      totalDurationSec: 6,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '小兔走过来',
          concept: '见面问好',
          narration: '小兔从远处走过来，向小熊打招呼。',
          onScreenText: '走过来',
          visualDescription: '小兔从画面左侧走向小熊',
          durationSec: 6,
          transitionToNext: 'fade',
          emphasis: 'core-concept',
          interaction: {
            verb: 'walk',
            actors: [{ id: 'rabbit', label: '小兔', role: 'helper' }],
          },
        },
      ],
    } as any);

    const built = manifest.props.scenes[0] as any;
    expect(built.interaction?.verb).toBe('walk');
    expect(built.interaction?.puppet?.motion).toBe('walk');
  });

  /**
   * 一幕多动作：performance 是新的演出契约（有序动作表），interaction 只作兼容读。
   *
   * 这条测试盯的是"契约到渲染层的那一跳"：动作顺序、分帧、台词与道具的归属。
   * 少任何一项，画面就会退化成"只演第一个动作"或"指着一片空白"。
   */
  it('performance 的多个动作被下发成播放表，台词与道具挂在正确的那一步', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition({
      title: '认识滑梯',
      topic: '认识滑梯',
      domain: 'social',
      totalDurationSec: 6,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '走到滑梯前',
          concept: '认识滑梯',
          narration: '小兔走过来，指着滑梯说：看，这就是滑梯。',
          onScreenText: '滑梯',
          visualDescription: '小兔走到滑梯前，抬手介绍',
          durationSec: 6,
          transitionToNext: 'fade',
          emphasis: 'core-concept',
          performance: {
            actors: [{ id: 'rabbit', label: '小兔', role: 'helper' }],
            actions: [
              { verb: 'walk' },
              { verb: 'point', propId: 'slide' },
              { verb: 'speak', speech: '看，这就是滑梯' },
            ],
          },
        },
      ],
    } as any);

    const built = manifest.props.scenes[0] as any;
    const puppet = built.interaction?.puppet;
    expect(built.interaction?.verb).toBe('walk');
    expect(puppet?.sequence?.map((step: any) => step.motion)).toEqual(['walk', 'point', 'speak']);
    // 分帧总和必须等于场景帧数，否则最后一帧会停在动作中途
    const frames = puppet.sequence.reduce((sum: number, step: any) => sum + step.durationFrames, 0);
    expect(frames).toBe(180);
    // 台词取最后一个说话动作，道具取指认那一步——不是因为它们恰好在第一段
    expect(built.interaction?.speech).toBe('看，这就是滑梯');
    expect(built.interaction?.propId).toBe('slide');
    // 气泡要等到说话那一段再出现：多动作幕里从第一帧就挂着等于剧透
    expect(built.interaction?.speechAt).toBeGreaterThan(0.5);
    expect(built.interaction?.speechAt).toBeLessThan(1);
  });

  it('performance 写坏时回落到 interaction，而不是整幕变白卡片', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition({
      title: '小兔爬梯',
      topic: '小兔爬梯',
      domain: 'social',
      totalDurationSec: 6,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '爬上去',
          concept: '坚持',
          narration: '小兔一步一步爬上去。',
          onScreenText: '爬上去',
          visualDescription: '小兔在梯子上往上爬',
          durationSec: 6,
          transitionToNext: 'fade',
          emphasis: 'core-concept',
          performance: {
            actors: [{ id: 'rabbit', label: '小兔', role: 'helper' }],
            actions: [{ verb: 'jump' }],
          },
          interaction: { verb: 'climb', actors: [{ id: 'rabbit', label: '小兔', role: 'helper' }] },
        },
      ],
    } as any);

    const built = manifest.props.scenes[0] as any;
    expect(built.interaction?.verb).toBe('climb');
    expect(built.interaction?.puppet?.motion).toBe('climb');
  });

  it('keeps snail identity, appearance variants and vector actions instead of a default bear rig', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '蜗牛壳上的花纹',
        topic: '蜗牛壳上的花纹',
        domain: 'science',
        totalDurationSec: 18,
        sceneCount: 3,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '蜗牛慢慢爬',
            concept: '运动',
            narration: '蜗牛伸出触角，慢慢爬过叶片。',
            onScreenText: '慢慢爬',
            visualDescription: 'a small snail walking slowly across a green leaf',
            durationSec: 6,
            performance: {
              actors: [{ id: 'snail', label: '蜗牛', role: 'helper' }],
              actions: [{ verb: 'walk' }, { verb: 'speak', speech: '我慢慢地爬' }],
            },
          },
          {
            id: 'scene-2',
            sequence: 2,
            title: '不同的壳',
            concept: '比较',
            narration: '白玉蜗牛的壳白白的，花蜗牛的壳有深色条纹。',
            onScreenText: '白色和条纹',
            visualDescription: 'a white garden snail beside a striped snail',
            durationSec: 6,
            sceneGraph: {
              relation: 'compare',
              nodes: [
                { id: 'white', label: '白玉蜗牛', subject: '白玉蜗牛' },
                { id: 'striped', label: '花蜗牛', subject: '花蜗牛' },
              ],
            },
          },
          {
            id: 'scene-3',
            sequence: 3,
            title: '保护自己',
            concept: '保护',
            narration: '遇到危险，蜗牛把身体缩进壳里，只露出壳保护自己。',
            onScreenText: '缩进壳里',
            visualDescription: 'a retracted snail hiding inside its shell',
            durationSec: 6,
          },
        ],
        visualTheme: {
          primaryPalette: '#E8F8FF',
          accentColor: '#8d6e63',
          mood: 'playful',
        },
        narrativeArc: 'intro',
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    const scenes = manifest.props.scenes as any[];
    expect(scenes[0].assetKey).toBe('snail');
    expect(scenes[0].interaction?.puppet).toBeUndefined();
    expect(scenes[0].interaction?.vectorPerformance).toMatchObject({
      actorId: 'snail',
      steps: [{ motion: 'walk' }, { motion: 'speak' }],
    });
    expect(scenes[0].interaction?.actors[0]).toMatchObject({
      id: 'snail',
      assetSrc: 'assets/lesson/animals/snail-generic.svg',
    });
    expect(scenes[1].graphIcons).toMatchObject({
      white: 'assets/lesson/animals/snail-white.svg',
      striped: 'assets/lesson/animals/snail-striped.svg',
    });
    expect(scenes[2].visualAssets?.characterAssetSrc).toBe(
      'assets/lesson/animals/snail-retracted.svg',
    );

    const generatedCode = manifest.files.map((file) => file.content).join('\n');
    expect(generatedCode).toContain('const actionCarriesScene = !figureHasEnvironment');
    expect(generatedCode).toContain('const hasFigure = !hasInteraction && rawFigure');
    expect(generatedCode).toContain('activeReveal.has(glyph.id)');
    expect(generatedCode).toContain('fill={label.color || "#12303a"}');
    expect(generatedCode).toContain('Math.max(0.28, propRatioOf');
    expect(generatedCode).toContain('const VectorPerformanceStage');
    expect(generatedCode).toContain('equalScale={graph.relation === "compare"}');
    expect(generatedCode).toContain('const validSubtitleTimeline');
    expect(generatedCode).toContain('const subtitleTokenLines');
    expect(generatedCode).toContain('rgba(5, 15, 23, 0.92)');
    expect(generatedCode).toContain('color: isSpoken ? "#fff" : "rgba(255,255,255,0.68)"');
  });

  it('repairs missing acting subjects in the real garden and retraction scene shapes', async () => {
    process.env.PROP_GEN = 'on';
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '蜗牛壳上的花纹',
        topic: '蜗牛壳上的花纹',
        domain: 'science',
        totalDurationSec: 14,
        sceneCount: 2,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '花园里的蜗牛',
            concept: '认识蜗牛',
            narration: '小兔在一片叶子上发现了一只小蜗牛，蜗牛背着壳慢慢向前爬。',
            onScreenText: '花园里的蜗牛',
            visualDescription: '小兔从左侧走进画面，指向叶子上背壳爬行的小蜗牛',
            durationSec: 7,
            props: [
              { name: '蜗牛壳', place: 'floor', heightRatio: 0.12 },
              { name: '小黄花', place: 'floor', heightRatio: 0.1 },
            ],
            performance: {
              actors: [{ id: 'rabbit', label: '小兔', role: 'helper' }],
              actions: [
                { verb: 'walk' },
                { verb: 'point', propId: '蜗牛壳' },
              ],
            },
          },
          {
            id: 'scene-2',
            sequence: 2,
            title: '缩进壳里躲',
            concept: '壳的保护作用',
            narration: '遇到危险时，蜗牛会把身体缩进壳里。硬硬的壳能挡住小鸟的啄咬。',
            onScreenText: '壳是蜗牛的小盾牌',
            visualDescription: '蜗牛缩进壳里，小鸟在旁边',
            durationSec: 7,
            sceneGraph: {
              relation: 'compare',
              nodes: [
                { id: 'n1', label: '缩进壳里', subject: '蜗牛壳', role: 'place' },
                { id: 'n2', label: '外面危险', subject: '小鸟', role: 'subject' },
              ],
            },
          },
        ],
        visualTheme: {
          primaryPalette: '#F1FBEF',
          accentColor: '#F59E0B',
          mood: 'playful',
        },
        narrativeArc: 'intro',
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    const scenes = manifest.props.scenes as any[];
    expect(scenes[0].props.map((prop: any) => prop.label)).toEqual(['树叶', '蜗牛', '小黄花']);
    expect(
      scenes[0].props.filter((prop: any) => prop.label === '蜗牛'),
    ).toHaveLength(1);
    expect(scenes[0].props.find((prop: any) => prop.label === '蜗牛').heightRatio).toBe(0.34);
    expect(scenes[0].props[0].art?.markup).toBeTruthy();
    expect(scenes[0].props[1].art?.markup).toBeTruthy();
    expect(scenes[0].interaction?.propId).toBe('蜗牛');
    expect(scenes[1].sceneGraph?.nodes[0].subject).toBe('缩进壳里蜗牛');
    expect(scenes[1].graphIcons?.n1).toBe('assets/lesson/animals/snail-retracted.svg');
  });

  it('turns explicit snail-shell lesson semantics into dedicated teaching stages', async () => {
    const service = createService(new VisualAssetService());
    const semantics = [
      [
        '壳上的螺旋线',
        '蜗牛壳上的螺旋像棒棒糖花纹。',
        'Close-up of a snail shell spiral and a lollipop.',
        'spiral',
      ],
      [
        '放大镜看花纹',
        '用放大镜看彩色条纹。',
        'A magnifying glass shows colorful bands on the snail shell.',
        'magnifier',
      ],
      [
        '壳是怎么长大的',
        '新的一圈从壳的边缘加上去。',
        'The snail shell grows at its outer opening edge.',
        'growth',
      ],
      [
        '壳上的生长线',
        '蜗牛壳上的螺旋花纹，是慢慢长大留下的记号。',
        'A close-up of the spiral growth lines on a snail shell.',
        'spiral',
      ],
      [
        '花纹不是年轮',
        '蜗牛花纹和大树年轮不一样。',
        'Compare tree rings with a banded snail shell.',
        'tree-rings',
      ],
      ['小蜗牛出生', '小蜗牛从卵里孵出来。', 'A baby snail hatches from an egg.', 'hatch'],
      [
        '一起观察',
        '数一数壳上的花纹，看看哪一圈最新。',
        'Count the rings on a snail shell in the garden.',
        'count',
      ],
    ];
    const manifest = await service.generateRemotionComposition(
      {
        title: '蜗牛壳上的花纹',
        topic: '蜗牛壳上的花纹',
        domain: 'science',
        totalDurationSec: 36,
        sceneCount: semantics.length,
        scenes: semantics.map(([title, narration, visualDescription], index) => ({
          id: `scene-${index + 1}`,
          sequence: index + 1,
          title,
          concept: title,
          narration,
          onScreenText: title,
          visualDescription,
          durationSec: 6,
        })),
        visualTheme: { primaryPalette: '#E8F8FF', accentColor: '#8d6e63', mood: 'playful' },
        narrativeArc: 'intro',
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    expect((manifest.props.scenes as any[]).map((scene) => scene.snailShellStudy)).toEqual(
      semantics.map((item) => item[3]),
    );
    const stage = manifest.files.find((file) => file.path === 'character/SnailShellStudyStage.tsx');
    expect(stage).toBeDefined();
    expect(stage!.content).toContain('镜片里：棕色、黄色、黑色条纹');
    expect(stage!.content).not.toContain('镜片里：棕色、黄色、白色条纹');
    expect(stage!.content).toContain('新壳从壳口边缘加上去');
    expect(stage!.content).toContain('蜗牛花纹：不是年轮');
    expect(stage!.content).toContain('从卵里孵出来');
    expect(stage!.content).toContain('最外面是较新的一圈');
    expect(stage!.content).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    const generated = manifest.files.map((file) => file.content).join('\n');
    expect(generated).toContain(
      'import { SnailShellStudyStage } from "./character/SnailShellStudyStage"',
    );
    expect(generated).toContain('{scene.snailShellStudy ? (');
  });

  it('keeps structured comparison and summary scenes out of the snail-shell stage', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '蜗牛壳上的花纹',
        topic: '蜗牛壳上的花纹',
        domain: 'science',
        totalDurationSec: 24,
        sceneCount: 4,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '小蜗牛来了',
            concept: '认识蜗牛',
            narration: '一只小蜗牛慢慢爬过小草，走累了就躲进壳里休息。',
            onScreenText: '小蜗牛和它的壳',
            visualDescription: '绿色草地背景，小蜗牛慢慢爬入，背上背着蜗牛壳。',
            durationSec: 6,
            emphasis: 'intro',
            performance: {
              actors: [{ id: 'snail', label: '小蜗牛', role: 'helper' }],
              actions: [
                { verb: 'walk', caption: '小蜗牛慢慢爬过来' },
                { verb: 'speak', speech: '大家好，我是小蜗牛！' },
              ],
            },
          },
          {
            id: 'scene-2',
            sequence: 2,
            title: '壳保护蜗牛',
            concept: '保护',
            narration: '遇到危险时，蜗牛把身体缩进壳里，只露出壳保护自己。',
            onScreenText: '缩进壳里',
            visualDescription: '小蜗牛把身体缩进蜗牛壳里，旁边有一只小鸟好奇地看。',
            durationSec: 6,
            emphasis: 'example',
            sceneGraph: {
              relation: 'compare',
              nodes: [
                { id: 'n1', label: '缩进壳里', subject: '蜗牛壳', role: 'object' },
                { id: 'n2', label: '小心翼翼', subject: '小蜗牛', role: 'subject' },
              ],
            },
            performance: {
              actors: [
                { id: 'snail', label: '小蜗牛', role: 'helper' },
                { id: 'bird', label: '小鸟', role: 'helper' },
              ],
              actions: [
                { verb: 'speak', speech: '我缩进壳里，安全一点啦！' },
                { verb: 'point', propId: '蜗牛壳' },
              ],
            },
          },
          {
            id: 'scene-3',
            sequence: 3,
            title: '找螺旋',
            concept: '生活中的螺旋',
            narration: '牵牛花的藤会绕成螺旋形，羊角也是螺旋形的。',
            onScreenText: '螺旋形找一找',
            visualDescription: '蜗牛壳、牵牛花藤和羊角三个螺旋形物品并排摆放。',
            durationSec: 6,
            emphasis: 'practice',
            sceneGraph: {
              relation: 'group',
              nodes: [
                { id: 'n1', label: '螺旋形', subject: '螺旋', role: 'abstract', sign: 'orb' },
                { id: 'n2', label: '蜗牛壳', subject: '蜗牛壳', role: 'object' },
                { id: 'n3', label: '牵牛花藤', subject: '牵牛花', role: 'object' },
                { id: 'n4', label: '羊角', subject: '羊角', role: 'object' },
              ],
            },
          },
          {
            id: 'scene-4',
            sequence: 4,
            title: '记住它',
            concept: '回顾',
            narration: '小蜗牛背着蜗牛壳，壳从壳口一点点长大，还能给蜗牛一点保护。',
            onScreenText: '蜗牛壳的小秘密',
            visualDescription:
              '小蜗牛站在画面中央挥手告别，身旁漂浮着螺旋花纹、壳口和盾牌三个小图标。',
            durationSec: 6,
            emphasis: 'summary',
            sceneGraph: {
              relation: 'chain',
              nodes: [
                { id: 'n1', label: '蜗牛壳', subject: '蜗牛壳', role: 'object' },
                { id: 'n2', label: '螺旋花纹', subject: '螺旋花纹', role: 'abstract', sign: 'orb' },
                { id: 'n3', label: '壳口长大', subject: '壳口', role: 'object' },
                { id: 'n4', label: '一点保护', subject: '保护', role: 'abstract', sign: 'orb' },
              ],
            },
            performance: {
              actors: [{ id: 'snail', label: '小蜗牛', role: 'helper' }],
              actions: [
                { verb: 'cheer', caption: '再见啦，小朋友！' },
                { verb: 'speak', speech: '下次见，记得看看我的壳哦！' },
              ],
            },
          },
        ],
        visualTheme: { primaryPalette: '#F2FBF4', accentColor: '#3E9B5F', mood: 'warm' },
        narrativeArc: 'introduction → exploration → practice → summary',
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    const scenes = manifest.props.scenes as any[];
    expect(scenes.map((scene) => scene.snailShellStudy)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(scenes[0].interaction?.actors[0].assetSrc).toBe(
      'assets/lesson/animals/snail-retracted.svg',
    );
    expect(scenes[0].interaction?.vectorPerformance?.speech).toBeUndefined();
    expect(scenes[1].graphIcons).toMatchObject({
      n1: 'assets/lesson/animals/snail-retracted.svg',
      n2: 'assets/lesson/animals/snail-retracted.svg',
    });

    const generated = manifest.files.map((file) => file.content).join('\n');
    expect(generated).toContain('!!vp.speech && (vp.speechAt === undefined');
    expect(generated).not.toContain('vp.speech || scene.onScreenText || "我来说一说"');
    expect(generated).toContain('!["speak", "point", "hold", "wave", "cheer", "idle", "sit"]');
  });

  it('keeps a single-action vector actor when an explanatory figure is also present', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '蜗牛壳上的花纹',
        topic: '蜗牛壳上的花纹',
        domain: 'science',
        totalDurationSec: 6,
        sceneCount: 1,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '慢慢爬',
            narration: '小蜗牛慢慢爬过叶片。',
            onScreenText: '慢慢爬',
            visualDescription: 'a snail walking across a green leaf',
            durationSec: 6,
            performance: {
              actors: [{ id: 'snail', label: '蜗牛', role: 'helper' }],
              actions: [{ verb: 'walk' }],
            },
            figure: {
              shapes: [{ kind: 'circle', cx: 120, cy: 120, r: 60, fill: '#8d6e63', reveal: 0 }],
            },
          },
        ],
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    const scene = manifest.props.scenes[0] as any;
    expect(scene.backgroundStyle).toBe('environment');
    expect(scene.interaction?.puppet).toBeUndefined();
    expect(scene.interaction?.vectorPerformance).toMatchObject({
      actorId: 'snail',
      steps: [{ motion: 'walk' }],
    });
    expect(scene.interaction?.vectorPerformance.speech).toBeUndefined();
  });

  it('preserves structured leaf scenes and routes shell semantics without replacing the lesson', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '蜗牛壳上的花纹',
        topic: '蜗牛壳上的花纹',
        domain: 'science',
        totalDurationSec: 36,
        sceneCount: 6,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '蜗牛爬向树叶',
            narration: '小蜗牛背着壳，慢慢爬向一片大树叶。',
            onScreenText: '爬向大树叶',
            visualDescription: 'a snail walking toward a green leaf',
            durationSec: 6,
            figure: {
              shapes: [
                { kind: 'subjectIcon', subject: 'snail', x: 240, y: 280, size: 180, reveal: 0 },
                { kind: 'subjectIcon', subject: '树叶', x: 1100, y: 260, size: 260, reveal: 0 },
              ],
            },
            performance: {
              actors: [{ id: 'lele', label: '乐乐', role: 'speaker' }],
              actions: [{ verb: 'walk' }, { verb: 'hold', propId: '放大镜' }],
            },
            props: [{ name: '放大镜', place: 'hand', holder: 'lele' }],
          },
          {
            id: 'scene-2',
            sequence: 2,
            title: '找到螺旋',
            narration: '从外圈沿着壳上的螺旋线往里看，终点就是壳口。',
            onScreenText: '沿着螺旋找壳口',
            visualDescription: 'the spiral on a snail shell',
            durationSec: 6,
          },
          {
            id: 'scene-3',
            sequence: 3,
            title: '壳口长出新壳',
            narration: '蜗牛长大时，新壳从壳口边缘加上去。花纹不是年轮，不能猜年龄。',
            onScreenText: '新壳长在壳口边缘',
            visualDescription: 'snail shell growth at the opening, not tree rings',
            durationSec: 6,
            sceneGraph: {
              relation: 'chain',
              nodes: [
                { id: 'n1', label: '蜗牛', subject: '蜗牛', role: 'subject' },
                { id: 'n2', label: '壳口', subject: '壳口', role: 'place' },
                { id: 'n3', label: '新壳', subject: '新壳', role: 'object' },
              ],
            },
          },
          {
            id: 'scene-4',
            sequence: 4,
            title: '左右旋',
            narration: '有的蜗牛壳左旋，有的蜗牛壳右旋，绕的方向相反。',
            onScreenText: '左旋和右旋',
            visualDescription: 'left and right handed snail shells in mirror directions',
            durationSec: 6,
            sceneGraph: {
              relation: 'compare',
              nodes: [
                { id: 'n1', label: '左旋', subject: '蜗牛壳', role: 'object' },
                { id: 'n2', label: '右旋', subject: '蜗牛壳', role: 'object' },
              ],
            },
          },
          {
            id: 'scene-5',
            sequence: 5,
            title: '雨天躲雨',
            narration: '下雨了，雨滴落下来，蜗牛把身体缩进壳里躲雨。',
            onScreenText: '下雨就缩进壳里',
            visualDescription: 'rain falling while a snail retracts into its shell',
            durationSec: 6,
            figure: {
              shapes: [
                { kind: 'circle', cx: 700, cy: 450, r: 200, fill: '#8d6e63', reveal: 0 },
                {
                  kind: 'line',
                  x1: 1050,
                  y1: 230,
                  x2: 1000,
                  y2: 330,
                  stroke: '#5b8ba8',
                  reveal: 0,
                },
              ],
            },
          },
          {
            id: 'scene-6',
            sequence: 6,
            title: '复习总结',
            narration: '蜗牛壳有螺旋花纹，壳口会慢慢长大，花纹不是年轮。',
            onScreenText: '花纹小总结',
            visualDescription: 'a friendly snail with three shell fact icons',
            durationSec: 6,
            emphasis: 'summary',
          },
        ],
        visualTheme: { primaryPalette: '#E8F8FF', accentColor: '#8d6e63', mood: 'playful' },
        narrativeArc: 'intro',
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    const scenes = manifest.props.scenes as any[];
    expect(scenes.map((scene) => scene.snailShellStudy)).toEqual([
      undefined,
      'spiral',
      'growth',
      'chirality',
      undefined,
      undefined,
    ]);
    expect(scenes[0].figure?.shapes?.length).toBeGreaterThan(0);
    expect(scenes[0].interaction?.actors?.[0]?.id).toBe('lele');
    expect(scenes[4].figure?.shapes?.length).toBeGreaterThan(0);
    const generated = manifest.files.map((file) => file.content).join('\n');
    expect(generated).toContain('const figureHasEnvironment');
    expect(generated).toContain('const actionCarriesScene = !figureHasEnvironment');
    expect(generated).toContain('if (rain) return <SceneBackground scene={scene} />');
    const stage = manifest.files.find(
      (file) => file.path === 'character/SnailShellStudyStage.tsx',
    )!;
    expect(stage.content).toContain('mode === "chirality"');
    expect(stage.content).toContain('translate(1390 0) scale(-1 1)');
    expect(stage.content).toContain('treeRingComparison ?');
    expect(generated).toContain('treeRingComparison={/年轮|tree\\s+rings?/i.test');
    expect(generated).toContain('const sceneTitle = scene.onScreenText || scene.title');
    expect(generated).toContain('{sceneTitle}');
    // 关系图舞台自己也要声明 sceneTitle：主舞台的同名变量不会进入这个函数作用域。
    const graphStageSource = generated.slice(
      generated.indexOf('const SceneGraphStage'),
      generated.indexOf('const SceneLayer'),
    );
    expect(graphStageSource).toContain('const sceneTitle = scene.onScreenText || scene.title');
    expect(graphStageSource).toContain('isRedundantSceneCaption(graph.caption, sceneTitle)');
    // 焦点挂词与流光挂词解耦，流光退回时钟时讲解焦点仍按旁白切换。
    expect(graphStageSource).toContain('if (anchorOrder && !starRelation)');
    expect(graphStageSource).toContain('applyNarrationGraphFocus(activeIds, visitedIds, anchorOrder, frame)');
    expect(graphStageSource).toContain('buildBeatActiveIds(');
    // 对比幕不靠缩放表达焦点（大小是教学语义），所有节点用轻微漂移避免长句冻结。
    expect(generated).toContain('const ambientY = Math.sin(frame / 14 + item.x / 220) * 6;');
    expect(generated).toContain('(dy + ambientY) + "px)"');
    // 720p 兼容成片需要整张关系图一起微动，不能只动占比很小的小卡片。
    expect(graphStageSource).toContain('const graphDriftY = Math.sin(frame / 18) * 4;');
    expect(graphStageSource).toContain('const graphBreath = 1 + Math.sin(frame / 36) * 0.003;');
    expect(graphStageSource).toContain(
      'transform: "translateY(" + graphDriftY + "px) scale(" + graphBreath + ")"',
    );
    // 危险提示必须来自真实 TTS 字边界，并在同一张缩壳卡上切换可见裂纹。
    expect(graphStageSource).toContain('const crackFrame = narrationCueFrame(scene, /啄裂|裂纹|啄破|crack/i)');
    expect(graphStageSource).toContain('assets/lesson/animals/snail-shell-cracked.svg');
    expect(graphStageSource).toContain('warningFrame={crackNodeId === item.node.id ? crackFrame ?? undefined : undefined}');
    expect(generated).toContain('border: "8px solid #D9534F"');
    expect(generated).toContain('drop-shadow(0 0 9px rgba(217,83,79,0.72))');
    // 指认物占用一侧后，同侧装饰必须向外错位，不能把蜗牛和标签压在下面。
    expect(generated).toContain('let pointPropPlaced = false');
    expect(generated).toContain('floorPropStep(slot, pointPropPlaced, side, pointSide)');
    expect(generated).toContain('pointedLeafCarrier(');
    expect(generated).toContain('y: carrierSize > 0 ? carrierSize + pointSlot.size / 2 - 0.02 : pointSlot.y');
    // 生长幕不能只写“慢慢变大”：三圈实线必须逐圈画出并带序号。
    expect(generated).toContain('strokeDashoffset={1 - ringProgress}');
    expect(generated).toContain('一圈比一圈大');
    expect(generated).not.toContain('{title || topic}');
    expect(generated).toContain('const RainOverlay');
    expect(generated).toContain(') : !rain ? (');
    expect(generated).toContain('{rain ? <RainOverlay frame={frame} /> : null}');
  });

  it('only hides a scene caption when its normalized wording equals the title', () => {
    const isRedundantSceneCaption = loadTemplateHelper('isRedundantSceneCaption');

    expect(isRedundantSceneCaption('背着家，慢慢长大', '背着壳，慢慢长大')).toBe(true);
    expect(isRedundantSceneCaption('每只蜗牛的花纹都不一样', '背着壳，慢慢长大')).toBe(false);
    expect(isRedundantSceneCaption('蜗牛壳上的花纹', '花纹')).toBe(false);
  });

  it('anchors the shell warning to the first real TTS token instead of the scene clock', () => {
    const narrationCueFrame = loadTemplateHelper('narrationCueFrame');
    const scene = {
      narration: '缩进壳里很安全，但壳也可能被啄裂。',
      durationFrames: 180,
      subtitlePages: [
        {
          tokens: ['缩进', '壳里', '很', '安全', '，', '但', '壳', '也', '可能', '被', '啄裂', '。'],
          starts: [12, 18, 27, 32, 38, 44, 48, 52, 57, 62, 68, 78],
        },
      ],
    };

    expect(narrationCueFrame(scene, /啄裂|裂纹/)).toBe(68);
    expect(narrationCueFrame(scene, /盛开/)).toBeNull();
  });

  it('keeps floor decorations out of the pointed teaching prop slot', () => {
    const floorPropStep = loadTemplateHelper('floorPropStep');

    expect(floorPropStep(0, true, -1, 1)).toBe(0);
    expect(floorPropStep(1, true, 1, 1)).toBe(1);
    expect(floorPropStep(3, true, -1, 1)).toBe(1);
    expect(floorPropStep(1, true, 1, -1)).toBe(0);
    expect(floorPropStep(1, false, 1, 1)).toBe(0);
  });

  it('uses a floor leaf as the carrier only for a pointed snail', () => {
    const pointedLeafCarrier = loadTemplateHelper('pointedLeafCarrier');
    const props = [
      { id: '树叶', label: '树叶', place: 'floor' },
      { id: '蜗牛', label: '蜗牛', place: 'floor' },
      { id: '小黄花', label: '小黄花', place: 'floor' },
    ];

    expect(pointedLeafCarrier(props, '蜗牛', '蜗牛', true)).toBe('树叶');
    expect(pointedLeafCarrier(props, '蜗牛', '蜗牛', false)).toBeUndefined();
    expect(pointedLeafCarrier(props, '苹果', '苹果', true)).toBeUndefined();
    expect(pointedLeafCarrier(props, 'snail', '小蜗牛', true)).toBe('树叶');
    expect(
      pointedLeafCarrier(
        [{ id: '树叶', label: '树叶', place: 'hand' }],
        '蜗牛',
        '蜗牛',
        true,
      ),
    ).toBeUndefined();
  });

  it('moves graph focus by narration order even when flow follows a clock', () => {
    const applyNarrationGraphFocus = loadTemplateHelper('applyNarrationGraphFocus');
    const active = new Set<string>(['n1']);
    const visited = new Set<string>();
    const anchors = [
      { id: 'n4', at: 20 },
      { id: 'n2', at: 50 },
      { id: 'n3', at: 80 },
      { id: 'n1', at: 110 },
    ];

    applyNarrationGraphFocus(active, visited, anchors, 60);
    expect(Array.from(active)).toEqual(['n2']);
    expect(Array.from(visited)).toEqual(['n4']);

    applyNarrationGraphFocus(active, visited, anchors, 120);
    expect(Array.from(active)).toEqual(['n1']);
    expect(Array.from(visited)).toEqual(['n4', 'n2', 'n3']);
  });

  it('keeps one narration-focused node even when a beat reveals the whole graph', () => {
    const buildBeatActiveIds = loadTemplateHelper('buildBeatActiveIds');
    const source = readFileSync(
      join(__dirname, '../../src/modules/learning/video-generation-agent.service.ts'),
      'utf8',
    );
    const helperStart = source.indexOf('const buildBeatActiveIds');
    const helperSource = source.slice(helperStart, source.indexOf('\n};', helperStart));

    // resolveFocusId() 的未匹配分支返回 undefined；模板生成时必须接受这个真实类型。
    expect(helperSource).toContain('focusId: string | null | undefined');
    expect(buildBeatActiveIds('n3', 'n1', ['n1', 'n2', 'n3', 'n4'], true)).toEqual(['n3']);
    expect(buildBeatActiveIds(null, 'n1', ['n1', 'n2', 'n3', 'n4'], false)).toEqual([
      'n1',
      'n2',
      'n3',
      'n4',
    ]);
    expect(buildBeatActiveIds(null, undefined, [null, 'n2', 'n2'], false)).toEqual(['n2']);
    expect(buildBeatActiveIds(null, null, [null, 'n2', 'n2'], false)).toEqual(['n2']);
  });

  it('shows snail pattern differences and keeps shell growth scenes on the teaching stage', async () => {
    const service = createService(new VisualAssetService());
    const manifest = await service.generateRemotionComposition(
      {
        title: '蜗牛壳上的花纹',
        topic: '蜗牛壳上的花纹',
        domain: 'science',
        totalDurationSec: 12,
        sceneCount: 2,
        scenes: [
          {
            id: 'scene-1',
            sequence: 1,
            title: '彩色的条纹',
            narration: '有棕色、黄色，还有黑色。每只蜗牛的花纹都不一样呢！',
            onScreenText: '每只都不一样',
            visualDescription: '放大镜观察蜗牛壳上的彩色条纹',
            durationSec: 6,
            emphasis: 'core-concept',
            props: [
              { id: 'tree', label: '大树', place: 'floor' },
              { id: 'grass', label: '草地', place: 'floor' },
            ],
          },
          {
            id: 'scene-2',
            sequence: 2,
            title: '壳是怎么长大的',
            narration: '蜗牛长大一点，壳的边缘也往外长一点，就多出一圈花纹。',
            onScreenText: '边缘长出新壳',
            visualDescription: '草地上的蜗牛壳，旧花纹留在原处，壳口边缘长出新壳',
            durationSec: 6,
            emphasis: 'core-concept',
            props: [{ id: 'grass', label: '草地', place: 'floor' }],
          },
        ],
      } as any,
      { domain: 'science', ageGroup: '5-6' },
    );

    const scenes = manifest.props.scenes as any[];
    expect(scenes.map((scene) => scene.snailShellStudy)).toEqual(['magnifier', 'growth']);
    const generated = manifest.files.map((file) => file.content).join('\n');
    expect(generated).toContain('comparison={shellComparison}');
    expect(generated).toContain('variant="white"');
    expect(generated).toContain('每只蜗牛的花纹都不一样');
    expect(generated).toContain('棕色、黄色、黑色条纹');
    expect(generated).not.toContain('棕色、黄色、白色条纹');
  });
});
