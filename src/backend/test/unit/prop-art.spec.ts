/**
 * 道具几何的守卫测试。
 *
 * 这套测试针对的是一个**已经发生过**的失败：道具画在模板字符串里，是一条
 * `if (id === "ball") …` 的十连判断，兜底 `return null`。于是
 *
 *  1. 分镜写"苹果/书本/水桶"，词表不认的那个**静默消失**，画面少个东西，
 *     1080 帧里没人看得出来；
 *  2. 新增一个道具要改 5000 行模板里的字符串，改错了没有编译器提醒
 *     （模板只做语法转译，不解析类型）；
 *  3. "画不出来"和"这个道具不存在"在代码里长得一模一样（都是 null）。
 *
 * 现在道具的几何是数据（`prop-art.ts` 的 `PROP_BUILTIN_MARKUP`），渲染是
 * 一个零分支的组件。所以这里能钉住四件事：
 *
 *  - **几何是纯数据**：10 条 markup 都在，形状元素齐，不含可执行/外部引用；
 *  - **id 规范化**：大小写/空格不该决定"画不画得出"；
 *  - **失败可区分**：未登记返回 null（由调用方决定占位），不在这里偷偷兜底；
 *  - **模板里不再有枚举分支**：这条是防回退——谁再把 `if (id === "ball")`
 *    写回模板，测试就红。
 */
import fs from 'fs';
import path from 'path';
import {
  PROP_BUILTIN_CANVAS,
  PROP_BUILTIN_IDS,
  PROP_BUILTIN_MARKUP,
  builtinPropGlyph,
} from '../../../video-remotion/src/character/prop-art';
import { PROP_LABELS } from '../../src/modules/learning/video/prop-lexicon';

const SHAPE_TAGS = ['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline'];

describe('道具几何：内置 10 条是纯数据', () => {
  it('10 个内置道具都在，且 key 与标记一致', () => {
    expect(PROP_BUILTIN_IDS.sort()).toEqual(
      ['apple', 'ball', 'banana', 'block', 'book', 'cookie', 'heart', 'slide', 'star', 'table'].sort(),
    );
    for (const id of PROP_BUILTIN_IDS) {
      expect(typeof PROP_BUILTIN_MARKUP[id]).toBe('string');
      expect(PROP_BUILTIN_MARKUP[id].length).toBeGreaterThan(20);
    }
  });

  it('每条 markup 至少有一个可见形状，且属性是 HTML 形式', () => {
    for (const id of PROP_BUILTIN_IDS) {
      const markup = PROP_BUILTIN_MARKUP[id];
      const shapes = SHAPE_TAGS.filter((tag) => markup.includes(`<${tag}`));
      expect({ id, shapes: shapes.length }).toEqual({ id, shapes: expect.any(Number) });
      expect(shapes.length).toBeGreaterThan(0);
      // React 的 camelCase 属性直接塞进字符串会被浏览器忽略（描边全没了），
      // 而"描边没了"在缩略图上看着只是"颜色淡了一点"，很难发现。
      expect(markup).not.toMatch(/strokeWidth|strokeLinecap|strokeDasharray|fontSize/);
    }
  });

  it('markup 不含可执行内容与外部引用（内联进画面的前提）', () => {
    for (const id of PROP_BUILTIN_IDS) {
      const markup = PROP_BUILTIN_MARKUP[id];
      expect(markup).not.toMatch(/<script/i);
      expect(markup).not.toMatch(/<style/i);
      expect(markup).not.toMatch(/<foreignObject/i);
      expect(markup).not.toMatch(/<image/i);
      expect(markup).not.toMatch(/<use/i);
      expect(markup).not.toMatch(/\son\w+=/i);
      expect(markup).not.toMatch(/href\s*=/i);
      expect(markup).not.toMatch(/url\(/i);
      expect(markup).not.toMatch(/data:/i);
      // 道具不该带文字：文字要由标签层渲染，画在几何里会在缩放时糊掉
      expect(markup).not.toMatch(/<text/i);
    }
  });
});

describe('builtinPropGlyph：规范化与失败语义', () => {
  it('大小写与空格不影响命中', () => {
    for (const raw of ['Apple', ' APPLE ', 'apple']) {
      const glyph = builtinPropGlyph(raw, '苹果');
      expect(glyph).not.toBeNull();
      expect(glyph!.id).toBe('apple');
      expect(glyph!.label).toBe('苹果');
    }
  });

  it('未登记返回 null，不自作主张兜底', () => {
    // 关键点：这条与"画占位件"是两个决定，占位由调用方（prop-resolver）做。
    // 在这里兜底会让"词表猜错了"与"分镜声明的道具画不出来"变成同一件事。
    expect(builtinPropGlyph('水桶')).toBeNull();
    expect(builtinPropGlyph('')).toBeNull();
    expect(builtinPropGlyph(undefined as unknown as string)).toBeNull();
  });

  it('canvas/fill 是尺寸参数，内置一律画满 160 盒', () => {
    const glyph = builtinPropGlyph('apple', '苹果')!;
    expect(glyph.canvas).toBe(PROP_BUILTIN_CANVAS);
    expect(glyph.fill).toBe(1);
    expect(glyph.source).toBe('builtin');
    // 外层平移是坐标约定：−80..80 的旧几何搬进 0..160 的盒子
    expect(glyph.markup).toContain('translate(80 80)');
  });

  it('尺寸可下发：size 由调用方给，不写死在数据里', () => {
    expect(builtinPropGlyph('apple', '苹果')!.size).toBe(PROP_BUILTIN_CANVAS);
    expect(builtinPropGlyph('apple', '苹果', 0.168)!.size).toBe(0.168);
  });
});

describe('内置道具与标签表不漂移', () => {
  it('每个内置 id 都有中文标签', () => {
    for (const id of PROP_BUILTIN_IDS) {
      expect(PROP_LABELS[id]).toBeTruthy();
    }
  });
});

describe('模板不再枚举道具', () => {
  const servicePath = path.resolve(
    __dirname,
    '../../src/modules/learning/video-generation-agent.service.ts',
  );
  const source = fs.readFileSync(servicePath, 'utf-8');

  it('模板里没有 if (id === "…") 的道具分支', () => {
    // 以前的写法是十连判断。允许出现"场地"这类别的 id 比较，但道具那十个
    // 名字不该再作为**代码**里的分支条件出现——它们现在只是数据里的一行。
    // 注释里提到这段历史不算违规（恰恰相反，那是为什么改成数据的原因），
    // 所以先剔掉注释行再扫。
    const code = source
      .split(/\r?\n/)
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');
    for (const id of PROP_BUILTIN_IDS) {
      expect(code).not.toMatch(new RegExp(`id\\s*===\\s*"${id}"`));
    }
  });

  it('模板通过 prop-glyph 渲染道具，而不是自带绘制链', () => {
    expect(source).toContain('from "./character/prop-glyph"');
    expect(source).toContain('<PropGlyph');
  });
});
