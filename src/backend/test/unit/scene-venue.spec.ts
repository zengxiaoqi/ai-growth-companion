/**
 * 幕级场地的守卫测试。
 *
 * 这套机制的失效方式很安静：画面照样出得来，只是"孩子在两帧之间换了地方"。
 * 所以四件事必须算得出来：
 *
 *  1. 没有场地线索的幕**继承上一幕**（不是默认草地）；
 *  2. 有滑梯的课，所有 playground 幕都带同一份滑梯（不是"用到才有"）；
 *  3. 整课有滑梯时，室内幕的基准缩放也走滑梯档（熊不会在室内变大）；
 *  4. 室内线索优先于 habitat 线索（"房间里刷牙"不许判成森林）。
 */
import { MOTION_DEFAULTS } from '../../src/modules/learning/video/action3d-registry';
import {
  HABITAT_TO_VENUE,
  detectSceneVenue,
  resolveSceneVenues,
  type SceneVenueInput,
} from '../../src/modules/learning/video/scene-venue';
import { worldScale, type WorldView } from '../../../video-remotion/src/character/world';

const GEOM = MOTION_DEFAULTS.slide as unknown as {
  start: [number, number, number];
  end: [number, number, number];
};

const scene = (text: string, usesSlide = false): SceneVenueInput => ({ text, usesSlide });

describe('scene-venue / 逐幕判定', () => {
  it('森林 → 无信号 → 回家 → 无信号：后者继承，不是默认草地', () => {
    const worlds = resolveSceneVenues(
      [
        scene('小熊在林子里捡到一颗苹果'),
        scene('他把苹果擦干净'),
        scene('他走回家，把苹果放在桌上'),
        scene('他坐在桌边笑'),
      ],
      { venue: 'forest' },
    );

    expect(worlds.map((w) => w.venue)).toEqual([
      'forest',
      'forest',
      'classroom',
      'classroom',
    ]);
    expect(worlds.map((w) => w.venueFrom)).toEqual(['habitat', 'inherit', 'indoor', 'inherit']);
  });

  it('室内线索优先于 habitat：房间里有树也还是教室', () => {
    const hit = detectSceneVenue(scene('小熊在房间里刷牙，窗外有一棵树'));
    expect(hit).toEqual({ venue: 'classroom', source: 'indoor' });
  });

  it('滑梯线索最优先：文本里有树也还是游乐园', () => {
    const hit = detectSceneVenue(scene('小熊在林子里爬上去滑下来', true));
    expect(hit).toEqual({ venue: 'playground', source: 'slide' });
  });

  it('首幕没有任何线索时用全篇兜底', () => {
    const worlds = resolveSceneVenues([scene('他笑了')], { venue: 'night' });
    expect(worlds[0]).toEqual({ venue: 'night', venueFrom: 'lesson' });
  });

  it('完全没有线索的连幕不会来回跳', () => {
    const worlds = resolveSceneVenues(
      [scene('小熊在林子里走'), scene('他笑了'), scene('他挥挥手'), scene('他坐下')],
      { venue: 'meadow' },
    );
    expect(new Set(worlds.map((w) => w.venue)).size).toBe(1);
  });
});

describe('scene-venue / 滑梯属于场地，不属于某一幕', () => {
  const hint = { venue: 'playground', slide: GEOM };

  it('本课有滑梯：所有 playground 幕都带同一份几何', () => {
    const worlds = resolveSceneVenues(
      [scene('小熊爬上滑梯'), scene('他坐在公园长椅上'), scene('他滑下来了', true)],
      hint,
    );
    expect(worlds.map((w) => w.venue)).toEqual(['playground', 'playground', 'playground']);
    for (const world of worlds) {
      expect(world.slide).toEqual(GEOM);
    }
  });

  it('切到室内就缺席滑梯，但仍带 scaleSlide（整课尺度不变）', () => {
    const worlds = resolveSceneVenues(
      [scene('小熊在家里看书'), scene('他跑回公园滑滑梯', true)],
      hint,
    );
    expect(worlds[0].venue).toBe('classroom');
    expect(worlds[0].slide).toBeUndefined();
    expect(worlds[0].scaleSlide).toEqual(GEOM);
    expect(worlds[1].slide).toEqual(GEOM);
  });

  it('本课没有滑梯时不下发 scaleSlide（室内可以按自己的档取景）', () => {
    const worlds = resolveSceneVenues([scene('小熊在房间里')], { venue: 'classroom' });
    expect(worlds[0].scaleSlide).toBeUndefined();
  });
});

describe('scene-venue / 基准缩放整课一致', () => {
  it('室内幕带 scaleSlide 时，ppu 与滑梯幕完全相同', () => {
    const indoor: WorldView = { venue: 'classroom', scaleSlide: GEOM };
    const park: WorldView = { venue: 'playground', slide: GEOM };
    expect(worldScale(indoor)).toBe(worldScale(park));
  });

  it('室内幕不带 scaleSlide 时 ppu 更大（说明前者真的起作用了）', () => {
    const bare: WorldView = { venue: 'classroom' };
    const withSlide: WorldView = { venue: 'classroom', scaleSlide: GEOM };
    expect(worldScale(bare)).toBeGreaterThan(worldScale(withSlide));
  });

  it('显式 scaleRef 直接生效，不再二次推导', () => {
    expect(worldScale({ venue: 'classroom', scaleRef: 123.5 })).toBe(123.5);
  });
});

describe('scene-venue / habitat 别名表', () => {
  it('river → riverside（这条缺失时"河边"在线上永远出不来）', () => {
    expect(HABITAT_TO_VENUE.river).toBe('riverside');
    expect(detectSceneVenue(scene('他来到小河边'))?.venue).toBe('riverside');
  });

  it('grassland → meadow', () => {
    expect(HABITAT_TO_VENUE.grassland).toBe('meadow');
    expect(detectSceneVenue(scene('他在草地上打滚'))?.venue).toBe('meadow');
  });
});
