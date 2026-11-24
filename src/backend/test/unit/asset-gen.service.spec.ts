import { promises as fs } from 'fs';
import {
  AssetGenService,
  extractSvg,
  validateGeneratedSvg,
} from '../../src/modules/learning/asset-gen.service';
import { VisualAssetService } from '../../src/modules/learning/visual-asset.service';

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">' +
  '<circle cx="128" cy="128" r="90" fill="#FFB020" stroke="#334155" stroke-width="8"/>' +
  '<circle cx="100" cy="110" r="12" fill="#334155"/>' +
  '</svg>';

const VALID_SVG2 =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">' +
  '<rect x="70" y="70" width="116" height="140" rx="18" fill="#7DD3FC" stroke="#334155" stroke-width="8"/>' +
  '<ellipse cx="128" cy="72" rx="58" ry="14" fill="#BAE6FD" stroke="#334155" stroke-width="8"/>' +
  '</svg>';

const makeLlm = (overrides: Record<string, any> = {}) =>
  ({
    isConfigured: true,
    visionModel: undefined,
    chatCompletion: jest.fn(async () => ({ content: VALID_SVG })),
    ...overrides,
  }) as any;

describe('validateGeneratedSvg', () => {
  it('接受纯图形 SVG', () => {
    expect(validateGeneratedSvg(VALID_SVG)).toEqual({ ok: true });
  });

  it.each([
    ['script', VALID_SVG.replace('</svg>', '<script>alert(1)</script></svg>')],
    ['text', VALID_SVG.replace('</svg>', '<text x="10" y="10">你好</text></svg>')],
    ['external image', VALID_SVG.replace('</svg>', '<image href="http://x/a.png"/></svg>')],
    ['use 引用', VALID_SVG.replace('</svg>', '<use xlink:href="#a"/></svg>')],
    ['filter', VALID_SVG.replace('</svg>', '<filter id="f"/></svg>')],
    ['style 标签', VALID_SVG.replace('</svg>', '<style>@import url(x);</style></svg>')],
    ['事件属性', VALID_SVG.replace('<circle ', '<circle onload="x()" ')],
    ['data URI', VALID_SVG.replace('</svg>', '<rect fill="url(data:image/png;base64,xx)"/></svg>')],
    ['空内容', ''],
    ['非 SVG', '这是一段解释文字'],
    ['只有一个图元', '<svg viewBox="0 0 256 256"><circle cx="1" cy="1" r="2"/></svg>'],
  ])('拒绝：%s', (_label, svg) => {
    expect(validateGeneratedSvg(svg).ok).toBe(false);
  });

  it('拒绝超大数据与超量元素', () => {
    expect(validateGeneratedSvg(VALID_SVG + '<!--' + 'x'.repeat(40000) + '-->').ok).toBe(false);
    const many =
      '<svg viewBox="0 0 256 256">' + '<circle cx="1" cy="1" r="2"/>'.repeat(70) + '</svg>';
    expect(validateGeneratedSvg(many).ok).toBe(false);
  });
});

describe('extractSvg', () => {
  it('从围栏代码块里取 SVG', () => {
    expect(extractSvg('好的，这是图标：\n```svg\n' + VALID_SVG + '\n```\n希望喜欢')).toBe(VALID_SVG);
  });

  it('从裸回复里取 SVG（容忍前后废话）', () => {
    expect(extractSvg('图标如下 ' + VALID_SVG + ' 完成')).toBe(VALID_SVG);
  });

  it('没有 SVG 返回 null', () => {
    expect(extractSvg('我不会画')).toBeNull();
  });
});

describe('AssetGenService.generateSubjectIcon', () => {
  const envBackup = { ...process.env };
  let mkdirSpy: jest.SpyInstance;
  let writeFileSpy: jest.SpyInstance;
  let readFileSpy: jest.SpyInstance;
  let accessSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.ASSET_GEN = 'on';
    delete process.env.IMAGE_GEN_API_URL;
    delete process.env.IMAGE_GEN_API_KEY;
    mkdirSpy = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);
    readFileSpy = jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('no manifest'));
    accessSpy = jest.spyOn(fs, 'access').mockRejectedValue(new Error('no cache'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...envBackup };
  });

  it('层1：LLM 画 SVG → 结构校验 → 落盘 + manifest（license/provider=generated）', async () => {
    const llm = makeLlm();
    const service = new AssetGenService(llm);
    const result = await service.generateSubjectIcon('小蝌蚪');

    expect(result).not.toBeNull();
    expect(result!.layer).toBe('svg');
    expect(result!.provider).toBe('generated');
    expect(result!.license).toBe('generated');
    expect(result!.staticPath).toBe(`.generated/assets/generated/${service.cacheKey('小蝌蚪')}.svg`);
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
    expect(writeFileSpy).toHaveBeenCalledTimes(2); // 图标 + manifest
    const manifestWrite = writeFileSpy.mock.calls.find((c: any[]) =>
      String(c[0]).includes('asset-manifest.json'),
    );
    expect(manifestWrite).toBeTruthy();
    const manifest = JSON.parse(String(manifestWrite![1]));
    expect(manifest.assets[0]).toMatchObject({
      provider: 'generated',
      license: 'generated',
      subject: '小蝌蚪',
    });
  });

  it('缓存命中不再调 LLM', async () => {
    const llm = makeLlm();
    const service = new AssetGenService(llm);
    await service.generateSubjectIcon('小蝌蚪');
    accessSpy.mockResolvedValue(undefined as any);
    const second = await service.generateSubjectIcon('小蝌蚪');
    expect(second!.layer).toBe('svg');
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('同 subject 并发请求共享一次生成', async () => {
    const llm = makeLlm();
    const service = new AssetGenService(llm);
    const [a, b] = await Promise.all([
      service.generateSubjectIcon('树根'),
      service.generateSubjectIcon('树根'),
    ]);
    expect(a!.staticPath).toBe(b!.staticPath);
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('ASSET_GEN=off 整层关闭，不调 LLM', async () => {
    process.env.ASSET_GEN = 'off';
    const llm = makeLlm();
    const service = new AssetGenService(llm);
    expect(await service.generateSubjectIcon('小蝌蚪')).toBeNull();
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('LLM 两轮都交回带文字的 SVG → 层1 放弃；层2 未配置 → null（不静默）', async () => {
    const bad = VALID_SVG.replace('</svg>', '<text x="1" y="1">字</text></svg>');
    const llm = makeLlm({ chatCompletion: jest.fn(async () => ({ content: bad })) });
    const service = new AssetGenService(llm);
    expect(await service.generateSubjectIcon('小蝌蚪')).toBeNull();
    expect(writeFileSpy).not.toHaveBeenCalled();
    // 首画一次 + 重画一次，不多不少
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('vision 两轮都不认 → 不落盘（首画 + 重画各验收一次）', async () => {
    const llm = makeLlm({
      visionModel: 'vision-test',
      chatCompletion: jest
        .fn()
        .mockResolvedValueOnce({ content: VALID_SVG })
        .mockResolvedValueOnce({ content: '{"pass":false,"reason":"主体不可辨认"}' })
        .mockResolvedValueOnce({ content: VALID_SVG })
        .mockResolvedValueOnce({ content: '{"pass":false,"reason":"还是不像"}' }),
    });
    const service = new AssetGenService(llm);
    expect(await service.generateSubjectIcon('小蝌蚪')).toBeNull();
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(llm.chatCompletion).toHaveBeenCalledTimes(4);
  });

  it('vision 通过 → visionPassed=true 进 manifest', async () => {
    const llm = makeLlm({
      visionModel: 'vision-test',
      chatCompletion: jest
        .fn()
        .mockResolvedValueOnce({ content: VALID_SVG })
        .mockResolvedValueOnce({ content: '{"pass":true,"reason":"ok"}' }),
    });
    const service = new AssetGenService(llm);
    const result = await service.generateSubjectIcon('小蝌蚪');
    expect(result!.visionPassed).toBe(true);
  });

  it('空 subject 直接 null', async () => {
    const llm = makeLlm();
    const service = new AssetGenService(llm);
    expect(await service.generateSubjectIcon('   ')).toBeNull();
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });
});

describe('AssetGenService 层1 重画（带拒绝原因）', () => {
  const envBackup = { ...process.env };
  let writeFileSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.ASSET_GEN = 'on';
    delete process.env.IMAGE_GEN_API_URL;
    delete process.env.IMAGE_GEN_API_KEY;
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('no manifest'));
    jest.spyOn(fs, 'access').mockRejectedValue(new Error('no cache'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...envBackup };
  });

  /** 第 n 次 chatCompletion 收到的用户提示词（0 起） */
  const promptAt = (llm: any, n: number): string =>
    String(llm.chatCompletion.mock.calls[n]?.[0]?.[0]?.content ?? '');

  it('首画交回说明文 → 把样本喂回去重画一次就成功', async () => {
    const llm = makeLlm({
      chatCompletion: jest
        .fn()
        .mockResolvedValueOnce({ content: '水桶图标如下：一个圆柱形……抱歉我没法直接输出 SVG。' })
        .mockResolvedValueOnce({ content: VALID_SVG }),
    });
    const service = new AssetGenService(llm);

    const result = await service.generateSubjectIcon('水桶');

    expect(result).not.toBeNull();
    expect(result!.layer).toBe('svg');
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2);
    const second = promptAt(llm, 1);
    expect(second).toContain('上一版被拒');
    expect(second).toContain('没有 <svg> 标签');
    // 把模型自己写的那段说明文贴回去，它才知道"我刚才在写说明文"
    expect(second).toContain('水桶图标如下');
    // 首画不该带这段（只有失败后才加）
    expect(promptAt(llm, 0)).not.toContain('上一版被拒');
  });

  it('结构违规的原因被翻成"照着改"的话，而不是原样丢失败码', async () => {
    const bad = VALID_SVG.replace('</svg>', '<text x="1" y="1">字</text></svg>');
    const llm = makeLlm({
      chatCompletion: jest
        .fn()
        .mockResolvedValueOnce({ content: bad })
        .mockResolvedValueOnce({ content: VALID_SVG }),
    });
    const service = new AssetGenService(llm);

    expect(await service.generateSubjectIcon('水桶')).not.toBeNull();
    const second = promptAt(llm, 1);
    // 原样失败码是 'forbidden tag (text/script/external ref/filter)'，模型看不懂
    expect(second).not.toContain('forbidden tag');
    expect(second).toContain('不允许 text/tspan/script');
    expect(second).toContain('上一版内容');
  });

  it('两轮都失败就放弃，不会无限重试', async () => {
    const llm = makeLlm({
      chatCompletion: jest.fn(async () => ({ content: '好的，我这就画！' })),
    });
    const service = new AssetGenService(llm);

    expect(await service.generateSubjectIcon('水桶')).toBeNull();
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2);
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('vision 拒绝 → 把它自己画的整段回灌，第二轮通过则落盘', async () => {
    const llm = makeLlm({
      visionModel: 'vision-test',
      chatCompletion: jest
        .fn()
        .mockResolvedValueOnce({ content: VALID_SVG })
        .mockResolvedValueOnce({ content: '{"pass":false,"reason":"不像水桶，像个苹果"}' })
        .mockResolvedValueOnce({ content: VALID_SVG2 })
        .mockResolvedValueOnce({ content: '{"pass":true,"reason":"ok"}' }),
    });
    const service = new AssetGenService(llm);

    const result = await service.generateSubjectIcon('水桶');

    expect(result!.visionPassed).toBe(true);
    expect(llm.chatCompletion).toHaveBeenCalledTimes(4);
    const secondDraw = promptAt(llm, 2);
    expect(secondDraw).toContain('画面验收没通过');
    expect(secondDraw).toContain('不像水桶');
    // 回灌的是它自己上一次画的 SVG，而不只是一句"不像"
    expect(secondDraw).toContain('<circle cx="128" cy="128" r="90"');
  });

  it('绘制调用抛错（超时）也会重画一次', async () => {
    const llm = makeLlm({
      chatCompletion: jest
        .fn()
        .mockRejectedValueOnce(new Error('svg draw timed out after 90000ms'))
        .mockResolvedValueOnce({ content: VALID_SVG }),
    });
    const service = new AssetGenService(llm);

    expect(await service.generateSubjectIcon('水桶')).not.toBeNull();
    const second = promptAt(llm, 1);
    expect(second).toContain('绘制调用失败');
    expect(second).toContain('timed out');
  });

  it('输出预算被思考吃光（finishReason=length、正文空）→ 不重画', async () => {
    // 实测过的真实回包：completionTokens 正好顶到上限，content 是空串
    const llm = makeLlm({
      chatCompletion: jest.fn(async () => ({
        content: '',
        finishReason: 'length',
        usage: { promptTokens: 118, completionTokens: 4096 },
      })),
    });
    const service = new AssetGenService(llm);

    expect(await service.generateSubjectIcon('水桶')).toBeNull();
    // 重画只会同样被截断，白等一次 30s
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('finishReason=length 但正文已画完整 → 照常接受，不因截断标记误杀', async () => {
    const llm = makeLlm({
      chatCompletion: jest.fn(async () => ({ content: VALID_SVG, finishReason: 'length' })),
    });
    const service = new AssetGenService(llm);

    expect(await service.generateSubjectIcon('水桶')).not.toBeNull();
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
  });
});

describe('VisualAssetService × AssetGenService 接入', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('关系图节点 miss → 生成层救回，miss 日志带 rescued=true', async () => {
    const appendSpy = jest.spyOn(fs, 'appendFile').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    const assetGen = {
      isEnabled: true,
      generateSubjectIcon: jest.fn(async (subject: string) => ({
        staticPath: `.generated/assets/generated/test-${subject}.svg`,
        filePath: '',
        subject,
        layer: 'svg' as const,
        provider: 'generated' as const,
        license: 'generated' as const,
      })),
    } as any;
    const service = new VisualAssetService(assetGen);
    const graph = {
      relation: 'parts',
      nodes: [{ id: 'n1', label: '树根', subject: '树根', role: 'part' }],
    } as any;

    const icons = await service.resolveGraphIcons(graph, '大树的样子');

    expect(icons.n1).toBe('.generated/assets/generated/test-树根.svg');
    expect(assetGen.generateSubjectIcon).toHaveBeenCalledWith('树根');
    const missLine = appendSpy.mock.calls
      .map((c: any[]) => String(c[1]))
      .find((line: string) => line.includes('"subject":"树根"'));
    expect(missLine).toBeTruthy();
    expect(JSON.parse(missLine!).rescued).toBe(true);
  });

  it('生成层关闭时 miss 照记（rescued=false），不抛错', async () => {
    const appendSpy = jest.spyOn(fs, 'appendFile').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    const assetGen = { isEnabled: false, generateSubjectIcon: jest.fn() } as any;
    const service = new VisualAssetService(assetGen);
    const graph = {
      relation: 'parts',
      nodes: [{ id: 'n1', label: '青草', subject: '青草', role: 'part' }],
    } as any;

    const icons = await service.resolveGraphIcons(graph, '大树的样子');

    expect(icons.n1).toBeUndefined();
    expect(assetGen.generateSubjectIcon).not.toHaveBeenCalled();
    const missLine = appendSpy.mock.calls
      .map((c: any[]) => String(c[1]))
      .find((line: string) => line.includes('"subject":"青草"'));
    expect(JSON.parse(missLine!).rescued).toBe(false);
  });

  it('subjectIcon 解析写回 iconSrc；矢量库命中的不调生成层', async () => {
    jest.spyOn(fs, 'appendFile').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    const assetGen = {
      isEnabled: true,
      generateSubjectIcon: jest.fn(async () => ({
        staticPath: '.generated/assets/generated/stone.svg',
        filePath: '',
        subject: '石头',
        layer: 'svg' as const,
        provider: 'generated' as const,
        license: 'generated' as const,
      })),
    } as any;
    const service = new VisualAssetService(assetGen);
    const figure = {
      shapes: [
        { kind: 'subjectIcon', subject: '石头', x: 400, y: 460, size: 160, reveal: 0.5 },
        { kind: 'subjectIcon', subject: '树', x: 1200, y: 300, size: 200, reveal: 0.2 },
      ],
    } as any;

    await service.resolveFigureIcons(figure, '大树的样子');

    const stone = figure.shapes[0];
    const tree = figure.shapes[1];
    expect(stone.iconSrc).toBe('.generated/assets/generated/stone.svg');
    // 「树」在矢量库里有（tree.svg 别名含「树」）——精确命中走库，不生成
    expect(tree.iconSrc).toBeTruthy();
    expect(assetGen.generateSubjectIcon).toHaveBeenCalledTimes(1);
    expect(assetGen.generateSubjectIcon).toHaveBeenCalledWith('石头');
  });
});