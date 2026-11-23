/**
 * 场地覆盖守卫：把"这处场地在镜头里还看得见东西吗"变成算术。
 *
 * 起因是一次真实的成片缺陷：森林配方里摆了六棵树（-7.2 ~ 10.4），看起来"很茂密"，
 * 但森林没有滑梯，基准缩放是 286 px/世界单位，wide 景别可见的世界半宽只有 ±3.35，
 * 镜头再往右偏一点，六棵树**全部**在画外——那一帧只剩左下角一丛灌木，"森林"和
 * "草地"分不出来。配方本身"没错"，错的是配方与镜头宽度之间那条没人算过的账。
 *
 * 这种账算得出来，就不该靠抽帧时人眼偶尔撞见。这里钉住三件事：
 *
 *  1. **没有空机位**：镜头目标扫过整个可演区域，任何位置画内都至少有东西；
 *  2. **森林/夜晚始终有树**：这两处场地的身份就是树，任何机位至少两棵；
 *  3. **没有死装饰**：配方里的每一件装饰，都必须在某个机位真的出现过——
 *     摆在永远拍不到的地方等于没摆，还会让配方"看起来很丰富"。
 *
 * 「镜头目标」（targetX）取 `worldBounds` 的 x 区间：`cameraForWorld` 会把它
 * clamp 到这个世界盒里，所以这就是镜头能停的最左/最右。
 */

import {
  DECOR_ASSET_IDS,
  DECOR_HALF_WIDTH,
  VENUE_RECIPES,
  decorHalfWidth,
  type DecorItem,
  type DecorLayer,
} from '../../../video-remotion/src/character/venue-recipes';
import { STAGE } from '../../../video-remotion/src/character/stage-layout';
import { worldBounds, worldScale, type WorldView } from '../../../video-remotion/src/character/world';
import { MOTION_DEFAULTS } from '../../src/modules/learning/video/action3d-registry';

/**
 * 这套算术只对"会画到世界坐标里的装饰"有意义。室内那几件（墙/窗/课桌/灯/书架）
 * 也走同一个 decor 层，所以统一处理，不做场地白名单。
 */
function decorItemsOf(venue: string): DecorItem[] {
  const recipe = VENUE_RECIPES[venue];
  if (!recipe) return [];
  const items: DecorItem[] = [];
  for (const layer of recipe.layers) {
    if (layer.kind !== 'decor') continue;
    items.push(...(layer as DecorLayer).items);
  }
  return items;
}

/**
 * 这场地在真实使用时的世界。
 *
 * 只有 playground 带滑梯——它本来就是"有滑梯的公园"，`MOTION_DEFAULTS.slide`
 * 是唯一的滑梯几何。带不带滑梯会改变基准缩放（`worldBounds` 并入滑梯盒），
 * 所以这里必须按实际用法构造，不能一律给空世界。
 */
function worldOf(venue: string): WorldView {
  if (venue !== 'playground') return { venue };
  return {
    venue,
    slide: {
      start: [...MOTION_DEFAULTS.slide.start] as [number, number, number],
      end: [...MOTION_DEFAULTS.slide.end] as [number, number, number],
    },
  };
}

/** 镜头能停的所有位置（0.1 世界单位的步长，约 28 px，比任何一次平移都密） */
function cameraTargets(world: WorldView): number[] {
  const box = worldBounds(world);
  const targets: number[] = [];
  for (let x = box.minX; x <= box.maxX + 1e-9; x += 0.1) targets.push(Number(x.toFixed(3)));
  return targets;
}

/** 可见半宽（世界单位）：屏幕半宽 ÷ 基准缩放。wide 景别的 ppu 就是 base（焦距 1） */
function visibleHalfWidth(world: WorldView): number {
  return STAGE.width / 2 / worldScale(world);
}

function visibleAt(items: DecorItem[], target: number, half: number): DecorItem[] {
  return items.filter((item) => Math.abs(item.x - target) <= half + decorHalfWidth(item));
}

const OUTDOOR = Object.keys(VENUE_RECIPES).filter((venue) => decorItemsOf(venue).length > 0);

describe('场地覆盖：镜头里必须看得见东西', () => {
  it('基准缩放与可见半宽没被人改动过（改了下面所有阈值都失效）', () => {
    // 非滑梯场地：可演盒宽 6.2、高 2.07，横向约束先到 → 286 px/单位
    expect(worldScale({ venue: 'forest' })).toBeCloseTo(286.45, 1);
    expect(visibleHalfWidth({ venue: 'forest' })).toBeCloseTo(3.35, 1);
  });

  it('装饰半宽表覆盖所有登记资产（加资产不补一行会红）', () => {
    const missing = DECOR_ASSET_IDS.filter((id) => !(id in DECOR_HALF_WIDTH));
    expect(missing).toEqual([]);
  });

  it('每个机位画内都至少有一件装饰（没有"一片空草地"的机位）', () => {
    const holes: string[] = [];
    for (const venue of OUTDOOR) {
      const world = worldOf(venue);
      const half = visibleHalfWidth(world);
      const items = decorItemsOf(venue);
      for (const target of cameraTargets(world)) {
        if (!visibleAt(items, target, half).length) {
          holes.push(`${venue} @ ${target.toFixed(1)}`);
        }
      }
    }
    expect(holes).toEqual([]);
  });

  it('森林与夜晚在任何机位都至少有两棵树（否则读不出"林子"）', () => {
    const thin: string[] = [];
    for (const venue of ['forest', 'night']) {
      const world = worldOf(venue);
      const half = visibleHalfWidth(world);
      const trees = decorItemsOf(venue).filter((item) => item.asset === 'tree');
      for (const target of cameraTargets(world)) {
        const count = visibleAt(trees, target, half).length;
        if (count < 2) thin.push(`${venue} @ ${target.toFixed(1)}: ${count} 棵`);
      }
    }
    expect(thin).toEqual([]);
  });

  it('配方里没有死装饰（每件都必须在某个机位出现过）', () => {
    const dead: string[] = [];
    for (const venue of OUTDOOR) {
      const world = worldOf(venue);
      const half = visibleHalfWidth(world);
      const targets = cameraTargets(world);
      for (const item of decorItemsOf(venue)) {
        const reachable = targets.some((target) => Math.abs(item.x - target) <= half + decorHalfWidth(item));
        if (!reachable) dead.push(`${venue}: ${item.asset}@${item.x}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('树的摆位不压住角色表演区（树干不许穿过可演盒中间）', () => {
    // 树是背景，角色会盖住树干——但一棵"站在角色正后方"的大树看起来像顶在头上。
    // 这条不追求严格避让，只挡住最离谱的情况：树干落在 ±1.2 的正中央。
    const intrusive: string[] = [];
    for (const venue of ['forest', 'night']) {
      for (const item of decorItemsOf(venue)) {
        if (item.asset !== 'tree') continue;
        if (Math.abs(item.x) < 1.2) intrusive.push(`${venue}: tree@${item.x}`);
      }
    }
    expect(intrusive).toEqual([]);
  });
});
