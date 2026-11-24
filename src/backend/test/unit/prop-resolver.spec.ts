/**
 * 道具解析的守卫测试。
 *
 * 这一层要挡的是"生成链路特有的故障"，都不报错、只让画面悄悄变差：
 *
 *  1. **同一个名字画了两次**：逐幕解析会得到两份 markup，第 1 幕的水桶和第 3 幕
 *     的水桶长得不一样，孩子会以为是两个东西。所以必须整课只解析一次。
 *  2. **失败静默**：画不出来返回 null，画面安静地少一个物件——1080 帧里没人
 *     找得出来。必须变成占位件 + warn。
 *  3. **内置道具被重新生成**：既浪费一次模型调用，又比自带的美术难看。
 *
 * 这里的 `source` 是假实现：解析器不认识"水桶"，只负责"要到就贴、要不到就占位"，
 * 所以这些用例不依赖网络、也不依赖模型。
 */
import {
  PROP_GEN_FILL,
  PROP_PLACEHOLDER_FILL,
  attachPropArt,
  placeholderArt,
  resolveLessonPropArt,
  type PropSvgSource,
} from '../../src/modules/learning/video/prop-resolver';

/** 假生成器：只认这几个名字，其余当失败 */
function fakeSource(known: Record<string, string> = {}): PropSvgSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async loadSvg(name: string) {
      calls.push(name);
      const markup = known[name];
      return markup ? { markup, canvas: 256 } : null;
    },
  };
}

describe('整课只解析一次：同名同图', () => {
  it('跨幕同名道具共用一份 markup，且只调用一次生成', async () => {
    const source = fakeSource({ 水桶: '<path d="M0 0 L10 10"/>' });
    const scenes = [
      { props: [{ id: '水桶', label: '水桶' }] },
      { props: [{ id: '水桶', label: '水桶' }] },
      { props: [{ id: '水桶', label: '水桶' }, { id: '苹果', label: '苹果' }] },
    ];
    const art = await resolveLessonPropArt(scenes, source);
    expect(source.calls.filter((n) => n === '水桶')).toHaveLength(1);
    expect(art.get('水桶')!.markup).toBe('<path d="M0 0 L10 10"/>');
  });

  it('attach 之后每一幕都能拿到同一份几何', async () => {
    const source = fakeSource({ 水桶: '<circle cx="1" cy="1" r="1"/>' });
    const scenes: Array<{ props: Array<{ id: string; label: string; art?: any }> }> = [
      { props: [{ id: '水桶', label: '水桶' }] },
      { props: [{ id: '水桶', label: '水桶' }] },
    ];
    const art = await resolveLessonPropArt(scenes, source);
    attachPropArt(scenes, art);
    expect(scenes[0].props[0].art.markup).toBe(scenes[1].props[0].art.markup);
  });
});

describe('内置道具不走生成', () => {
  it('苹果/皮球这类自带几何的，一个调用都不发', async () => {
    const source = fakeSource({ 苹果: '<path d="M0 0"/>' });
    const art = await resolveLessonPropArt(
      [{ props: [{ id: 'apple', label: '苹果' }, { id: 'ball', label: '皮球' }] }],
      source,
    );
    expect(source.calls).toEqual([]);
    // 内置道具的 art 留空：渲染层用自带 markup（也是"内置"与"现画"同一条渲染路径）
    expect(art.has('apple')).toBe(false);
    expect(art.has('ball')).toBe(false);
  });
});

describe('失败要看得见：占位件而不是空白', () => {
  it('生成失败 → source=placeholder，且带 canvas/fill 可供渲染', async () => {
    const art = await resolveLessonPropArt(
      [{ props: [{ id: '洒水壶', label: '洒水壶' }] }],
      fakeSource({}),
    );
    const payload = art.get('洒水壶')!;
    expect(payload.source).toBe('placeholder');
    expect(payload.markup).toBeUndefined();
    expect(payload.canvas).toBe(256);
    // 占位件是代码画的方盒，占位比例是确定的 0.66，不是生成物那个估出来的 0.75
    expect(payload.fill).toBe(PROP_PLACEHOLDER_FILL);
  });

  it('生成通道抛异常也降级，不把出片带崩', async () => {
    const source: PropSvgSource = {
      async loadSvg() {
        throw new Error('network down');
      },
    };
    const art = await resolveLessonPropArt([{ props: [{ id: '风筝', label: '风筝' }] }], source);
    expect(art.get('风筝')!.source).toBe('placeholder');
  });

  it('完全没有生成通道（未注入）时也是占位件', async () => {
    const art = await resolveLessonPropArt([{ props: [{ id: '向日葵', label: '向日葵' }] }], undefined);
    expect(art.get('向日葵')!.source).toBe('placeholder');
  });

  it('placeholderArt 的形状稳定（渲染层靠 canvas/fill 算尺寸）', () => {
    expect(placeholderArt()).toEqual({
      canvas: 256,
      fill: PROP_PLACEHOLDER_FILL,
      source: 'placeholder',
      markup: undefined,
    });
  });
});

describe('老分镜：没有声明就没有开销', () => {
  it('props 只有 {id,label}（内置 id）时，零调用、零结果', async () => {
    const source = fakeSource({});
    const art = await resolveLessonPropArt(
      [{ props: [{ id: 'apple', label: '苹果' }] }, { props: [] }, {}],
      source,
    );
    expect(source.calls).toEqual([]);
    expect(art.size).toBe(0);
  });
});

/**
 * 尺寸与落点来自光栅化实测，不是"内容占七成、垂直居中"的假设。
 *
 * 这几条守的是"测量结果真的传到了渲染层"：一旦某处又把 fill 写回常量，
 * 或者把没量到的锚点写成 0（0 会把道具整个顶出画面），这里会红。
 */
describe('几何取自实测', () => {
  const sourceWith = (box?: { fill: number; anchorX: number; anchorY: number }): PropSvgSource => ({
    async loadSvg() {
      return { markup: '<path d="M0 0"/>', canvas: 256, box };
    },
  });

  it('box 的三个值原样透传', async () => {
    const art = await resolveLessonPropArt(
      [{ props: [{ id: '洒水壶', label: '洒水壶' }] }],
      sourceWith({ fill: 0.645, anchorX: 120, anchorY: 232 }),
    );
    expect(art.get('洒水壶')).toMatchObject({ fill: 0.645, anchorX: 120, anchorY: 232 });
  });

  it('量不到 box → 退回 0.75，且不写锚点（让渲染层走居中假设）', async () => {
    const art = await resolveLessonPropArt(
      [{ props: [{ id: '风筝', label: '风筝' }] }],
      sourceWith(undefined),
    );
    const payload = art.get('风筝')!;
    expect(payload.fill).toBe(PROP_GEN_FILL);
    expect(payload.anchorX).toBeUndefined();
    expect(payload.anchorY).toBeUndefined();
  });

  it('box.fill 为 0（量出空图）不当成合法尺寸', async () => {
    const art = await resolveLessonPropArt(
      [{ props: [{ id: '毛巾', label: '毛巾' }] }],
      sourceWith({ fill: 0, anchorX: 0, anchorY: 0 }),
    );
    expect(art.get('毛巾')!.fill).toBe(PROP_GEN_FILL);
  });
});
