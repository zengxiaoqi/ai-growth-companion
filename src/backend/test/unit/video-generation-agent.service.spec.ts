import { VideoGenerationAgentService } from '../../src/modules/learning/video-generation-agent.service';
import { VisualAssetService } from '../../src/modules/learning/visual-asset.service';

describe('VideoGenerationAgentService', () => {
  const createService = (visualAssetService?: VisualAssetService) =>
    new VideoGenerationAgentService(
      { getToolDefinitions: jest.fn().mockReturnValue([]) } as any,
      {} as any,
      { runLoop: jest.fn() } as any,
      { getSkillsForAgent: jest.fn().mockReturnValue([]) } as any,
      visualAssetService,
    );

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
      expect(manifest.files.find((file) => file.path === path)!.content.length).toBeGreaterThan(200);
    }
    expect(generatedCode).toContain('Img');
    expect(generatedCode).toContain('TigerSvg');
    expect(generatedCode).toContain('SceneBackground');
    expect(manifest.assets).toEqual(
      expect.arrayContaining([
        // provider 链是 vector > local > 网络：库里有真素材时优先用库，手绘只做兜底
        expect.objectContaining({
          provider: 'vector',
          role: 'tiger',
          license: 'mit',
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
      assetProvider: 'vector',
      assetLicense: 'mit',
    });
    expect(manifest.props.scenes[0]).toMatchObject({
      assetKey: 'tiger',
      action: 'showFeatures',
      habitat: 'forest',
      visualAssets: expect.objectContaining({
        characterAssetSrc: 'assets/vector/animals/tiger.svg',
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
            narration: '小熊把红色皮球轻轻递给小兔。',
            onScreenText: '一起分享',
            visualDescription: '小熊把红色皮球递给小兔，小兔双手接过',
            durationSec: 12,
            transitionToNext: 'fade',
            emphasis: 'core-concept',
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
    expect(generatedCode).toContain('"bear"');
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
        // 矢量库是每个动物一张标准姿态图，不再按 listen/eat 切分动作
        characterAssetSrc: 'assets/vector/animals/rabbit.svg',
        backgroundAssetSrc: 'assets/lesson/backgrounds/grassland.svg',
        hasCharacterAsset: true,
        characterProvider: 'vector',
      }),
    });
    expect(manifest.props.scenes[1]).toMatchObject({
      assetKey: 'rabbit',
      action: 'eat',
      visualAssets: expect.objectContaining({
        characterAssetSrc: 'assets/vector/animals/rabbit.svg',
      }),
    });
    expect(manifest.sceneAssetSummary[0]).toMatchObject({
      assetProvider: 'vector',
      characterProvider: 'vector',
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
        { kind: 'arc', cx: 800, cy: 640, r: 490, from: 4, to: 176, stroke: '#E5484D', width: 34, reveal: 0 },
        { kind: 'arc', cx: 800, cy: 640, r: 450, from: 4, to: 176, stroke: '#F76B15', width: 34, reveal: 0.1 },
        { kind: 'arc', cx: 800, cy: 640, r: 410, from: 4, to: 176, stroke: '#FFC53D', width: 34, reveal: 0.2 },
        { kind: 'arc', cx: 800, cy: 640, r: 370, from: 4, to: 176, stroke: '#30A46C', width: 34, reveal: 0.3 },
        { kind: 'arc', cx: 800, cy: 640, r: 330, from: 4, to: 176, stroke: '#0091FF', width: 34, reveal: 0.4 },
        { kind: 'arc', cx: 800, cy: 640, r: 290, from: 4, to: 176, stroke: '#3E63DD', width: 34, reveal: 0.5 },
        { kind: 'arc', cx: 800, cy: 640, r: 250, from: 4, to: 176, stroke: '#8E4EC6', width: 34, reveal: 0.6 },
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
      title: '小熊滑滑梯',
      topic: '小熊滑滑梯',
      domain: 'social',
      totalDurationSec: 6,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '小熊滑滑梯',
          concept: '排队轮流',
          narration: '小熊爬上滑梯，从滑梯上滑下来，稳稳落在草地上。',
          onScreenText: '滑下来',
          visualDescription: '小熊坐在滑梯顶端，顺着滑梯滑下来',
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
      actorId: 'bear',
    });
    // 坐标与造型必须已由注册表补齐，渲染层拿到的是确定值
    expect(built.interaction.action3d.start).toEqual(expect.any(Array));
    expect(built.interaction.action3d.start).toHaveLength(3);
    expect(built.interaction.action3d.rig.fur).toBeTruthy();
    expect(built.interaction.action3d.durationFrames).toBeGreaterThan(0);
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
      title: '小熊爬滑梯',
      topic: '小熊爬滑梯',
      domain: 'social',
      totalDurationSec: 6,
      sceneCount: 1,
      scenes: [
        {
          id: 'scene-1',
          sequence: 1,
          title: '一步一步爬上去',
          concept: '排队轮流',
          narration: '小熊抓住梯子，一步一步往上爬。',
          onScreenText: '爬上去',
          visualDescription: '小熊在梯子前，手脚交替向上爬',
          durationSec: 6,
          transitionToNext: 'fade',
          emphasis: 'core-concept',
          // 新 prompt 之后 LLM 的写法：只给 verb，不给 puppet
          interaction: {
            verb: 'climb',
            actors: [{ id: 'bear', label: '小熊', role: 'helper' }],
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
});
