/**
 * 场地配方的守卫测试。
 *
 * 这套测试要挡住三类事故，它们都不会让画面"报错"，只会让画面"悄悄地不对"：
 *
 *  1. 配方漏了 ground：角色悬空；
 *  2. 配方里混进像素坐标：背景变回"贴在后面的屏保"，和角色不在一个空间；
 *  3. 配方引用了没注册的资产：少画一层，某一侧空掉，直到某节课看起来莫名空。
 *
 * 还有一条"通用性"的证明：`VENUE_RECIPES` 的键是开放字符串，所以编译器不再
 * 替我们检查"每个场地都有配方"。这里改成遍历真实数据全量校验——覆盖面比
 * 编译期穷举更全（后加的配方也会被扫到）。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  BUILTIN_VENUES,
  DECOR_ASSET_IDS,
  VENUE_RECIPES,
  VENUE_THEMES,
  normalizeRecipe,
  venueRecipe,
  type VenueRecipe,
} from '../../../video-remotion/src/character/venue-recipes';
import { venueDecor, venueHasFence } from '../../../video-remotion/src/character/world';

const ASSETS_SOURCE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'video-remotion',
  'src',
  'character',
  'venue-assets.tsx',
);

describe('venue recipes / 内置场地一个都不少', () => {
  it('回归基线里的每个场地都有配方', () => {
    expect(BUILTIN_VENUES.filter((venue) => !VENUE_RECIPES[venue])).toEqual([]);
  });

  it('配方 id 与键一致（否则日志里的场地名会对不上）', () => {
    for (const [key, recipe] of Object.entries(VENUE_RECIPES)) {
      expect(recipe.id).toBe(key);
    }
  });
});

describe('venue recipes / 所有配方（含后加的）都通过校验', () => {
  it('遍历 Object.keys(VENUE_RECIPES) 逐个校验，不靠人工清单', () => {
    const failures: Array<[string, unknown]> = [];
    for (const key of Object.keys(VENUE_RECIPES)) {
      const issues = normalizeRecipe(VENUE_RECIPES[key], key);
      if (issues.length) failures.push([key, issues]);
    }
    expect(failures).toEqual([]);
  });

  it('每个配方都有 ground 层（缺了角色会悬空）', () => {
    for (const [key, recipe] of Object.entries(VENUE_RECIPES)) {
      const hasGround = recipe.layers.some((layer) => layer.kind === 'ground');
      if (!hasGround) throw new Error(`${key} 没有 ground 层`);
    }
  });

  it('配方里没有像素坐标字段', () => {
    const bad = normalizeRecipe({
      id: 'bad',
      theme: VENUE_THEMES.meadow,
      layers: [
        { kind: 'ground', asset: 'grass', topBand: 0 },
        { kind: 'decor', items: [{ asset: 'tree', x: 0, params: { px: 120 } }] },
      ],
    } as VenueRecipe);
    expect(bad).toEqual([
      { kind: 'pixel-coordinate', path: 'recipe.layers[1].items[0].params.px' },
    ]);
  });

  it('漏掉 ground 会被点名', () => {
    const issues = normalizeRecipe({
      id: 'bad',
      theme: VENUE_THEMES.meadow,
      layers: [{ kind: 'sky', fill: 'solid' }],
    } as VenueRecipe);
    expect(issues).toContainEqual({ kind: 'missing-ground' });
  });

  it('未知 asset 会被点名（不静默跳过）', () => {
    const issues = normalizeRecipe({
      id: 'bad',
      theme: VENUE_THEMES.meadow,
      layers: [
        { kind: 'ground', asset: 'grass', topBand: 0 },
        { kind: 'decor', items: [{ asset: 'dragon', x: 0 }] },
      ],
    } as VenueRecipe);
    expect(issues).toEqual([
      { kind: 'unknown-asset', path: 'recipe.layers[1].items[0]', asset: 'dragon' },
    ]);
  });
});

describe('venue recipes / 资产注册表', () => {
  /**
   * 为什么扫源码而不是 import：jest 的 moduleFileExtensions 不含 tsx，
   * 直接 import 会编不过。源码文本扫描一样能守住"漏注册"，而且不引入
   * 一套只为测试服务的运行时代码。
   */
  it('DECOR_RENDERERS 覆盖 DECOR_ASSET_IDS 的每一项', () => {
    const source = fs.readFileSync(ASSETS_SOURCE, 'utf8');
    const at = source.indexOf('export const DECOR_RENDERERS');
    expect(at).toBeGreaterThan(-1);
    const registry = source.slice(at);
    const missing = DECOR_ASSET_IDS.filter((id) => !registry.includes(`${id}: `));
    expect(missing).toEqual([]);
  });
});

describe('venue recipes / 场地词汇与场地匹配', () => {
  it('教室没有围栏，也没有摩天轮', () => {
    expect(venueHasFence('classroom')).toBe(false);
    const kinds = venueDecor({ venue: 'classroom' }).map((d) => d.kind);
    expect(kinds).not.toContain('wheel');
    expect(kinds).not.toContain('fence');
  });

  it('教室有墙（室内不是一块空地板）', () => {
    const recipe = venueRecipe('classroom');
    const items = recipe.layers.flatMap((layer) => (layer.kind === 'decor' ? layer.items : []));
    expect(items.some((item) => item.asset === 'wall')).toBe(true);
  });

  it('河边真的有水（water 是原语，不是「河边」这个场地）', () => {
    const water = VENUE_RECIPES.riverside.layers.filter((layer) => layer.kind === 'water');
    expect(water).toHaveLength(1);
  });

  it('森林与夜晚仍然没有围栏（上一轮修的问题不许回归）', () => {
    expect(venueHasFence('forest')).toBe(false);
    expect(venueHasFence('night')).toBe(false);
    expect(venueHasFence('playground')).toBe(true);
  });

  it('未知场地回落 meadow 并且不抛', () => {
    expect(venueRecipe('space-station').id).toBe('meadow');
  });
});
