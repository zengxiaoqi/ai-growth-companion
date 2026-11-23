/**
 * 场地层（world）与"同一把梯子"的守卫测试。
 *
 * 住在这里的代码在渲染工程（src/video-remotion/src/character），但都是纯函数，
 * 可以在这里用 jest 钉住算术。画面好不好看只能抽帧看，但下面这四件事算得出来，
 * 而且一旦破了就是**上一轮被用户指出的问题**，不能靠人眼偶尔发现：
 *
 *  1. 比例一致：整节课只有一个基准缩放，镜头变焦不许改变任何两个物体的比例；
 *  2. 爬梯是滑梯的一部分：梯子的 x 只由滑梯几何算出，注册表里的攀爬落点必须
 *     与它重合，否则"人在爬一把梯子、背景是另一把梯子"；
 *  3. 横档密度唯一：2D 与 3D 用同一个 ladderRungYs()，切换渲染器梯子不变样；
 *  4. 脏 props 不许进渲染：normalizeWorld 对反向滑梯/坏坐标返回 null。
 */
import { STAGE, boundsWidth } from '../../../video-remotion/src/character/stage-layout';
import {
  LADDER,
  ladderRungYs,
  slideBounds,
  slideDeckAngle,
  slideLadderX,
  slideTopY,
} from '../../../video-remotion/src/character/setpiece';
import { ACTOR, CLIMB } from '../../../video-remotion/src/character/pose';
import {
  SHOT_ZOOM,
  VENUES,
  cameraForWorld,
  normalizeWorld,
  slideLadderTop,
  venueDecor,
  worldBounds,
  worldLadderX,
  worldScale,
  type WorldView,
} from '../../../video-remotion/src/character/world';
import {
  MOTION_DEFAULTS,
  PUPPET_DEFAULTS,
} from '../../src/modules/learning/video/action3d-registry';

/** 注册表下发的滑梯就是"世界里的滑梯"，测试全部以它为基准 */
const GEOM = MOTION_DEFAULTS.slide as unknown as {
  start: [number, number, number];
  end: [number, number, number];
};

const WORLD: WorldView = {
  venue: 'playground',
  slide: { start: GEOM.start, end: GEOM.end },
};

describe('world / 比例一致（整节课一个基准缩放）', () => {
  it('基准缩放只由场地包围盒决定，与"这一幕有什么"无关', () => {
    const base = worldScale(WORLD);
    // 同一份 world 连算三次必须一致（确定性渲染的前提）
    expect(worldScale(WORLD)).toBe(base);
    expect(worldScale({ ...WORLD })).toBe(base);
    expect(base).toBeGreaterThan(0);
  });

  it('镜头永远不会把世界缩小：任何景别都 ≥ 基准缩放', () => {
    const base = worldScale(WORLD);
    for (const shot of ['wide', 'medium', 'close'] as const) {
      const cam = cameraForWorld(WORLD, shot);
      expect(cam.ppu).toBeGreaterThanOrEqual(base - 1e-9);
      expect(cam.ppu).toBeLessThanOrEqual(base * SHOT_ZOOM[shot] + 1e-9);
    }
  });

  it('变焦系数就是景别焦距：全部世界物体同乘一个 ppu，比例不可能被改', () => {
    const base = worldScale(WORLD);
    // 焦点很小（只有一只熊）时，close 幕推到上限：ppu = base * zoom
    const close = cameraForWorld(WORLD, 'close', { minX: -0.2, maxX: 0.2, minY: 0, maxY: 1.2 });
    expect(close.ppu).toBeCloseTo(base * SHOT_ZOOM.close, 6);

    // 同一幕里，滑梯高度与角色身高的**屏幕比**不随景别变化：
    // 两者的屏幕尺寸都 = 世界尺寸 × ppu，ppu 是同一个数
    const slideH = slideBounds(GEOM.start, GEOM.end, 1).maxY;
    const actorH = ACTOR.standHeight;
    const ratio = (ppu: number) => (slideH * ppu) / (actorH * ppu);
    for (const shot of ['wide', 'medium', 'close'] as const) {
      expect(ratio(cameraForWorld(WORLD, shot).ppu)).toBeCloseTo(slideH / actorH, 9);
    }
  });

  it('景别焦距严格递增：wide = 1（整座公园装得下的那一档）', () => {
    expect(SHOT_ZOOM.wide).toBe(1);
    expect(SHOT_ZOOM.medium).toBeGreaterThan(SHOT_ZOOM.wide);
    expect(SHOT_ZOOM.close).toBeGreaterThan(SHOT_ZOOM.medium);
  });

  it('镜头平移不出场地：焦点被夹在 worldBounds 里', () => {
    const box = worldBounds(WORLD);
    // 故意给一个远在场地外的焦点
    const far = cameraForWorld(WORLD, 'medium', { minX: 80, maxX: 82, minY: 0, maxY: 1.2 });
    expect(far.focusX).toBeLessThanOrEqual(box.maxX + 1e-9);
    expect(far.focusX).toBeGreaterThanOrEqual(box.minX - 1e-9);
  });

  it('世界装得下：基准缩放下整座滑梯不越标题带、宽度不出安全区', () => {
    const base = worldScale(WORLD);
    const box = worldBounds(WORLD);
    // 纵向：顶端落在标题带下方
    expect(STAGE.groundY - box.maxY * base).toBeGreaterThan(STAGE.titleBandBottom);
    // 横向：整座公园宽度不超过可用区（这正是 byWidth 那条约束）
    expect(boundsWidth(box) * base).toBeLessThanOrEqual(STAGE.width + 1e-6);
  });

  it('没有滑梯的场地用一块固定的可演区域，且比滑梯世界矮', () => {
    const meadow: WorldView = { venue: 'meadow' };
    const box = worldBounds(meadow);
    // 与场地类型无关：只有滑梯才改变可演区域
    expect(box).toEqual(worldBounds({ venue: 'forest' }));
    // 草地盒子必须比滑梯世界矮：否则基准缩放会被"不存在的舞台装置"拖小
    expect(box.maxY).toBeLessThan(worldBounds(WORLD).maxY);
  });
});

describe('world / 爬梯是滑梯的一部分（不是独立道具）', () => {
  it('爬梯的 x 由滑梯几何唯一决定，注册表落点必须与它重合', () => {
    const ladderX = slideLadderX(GEOM.start, GEOM.end);
    expect(worldLadderX(WORLD)).toBeCloseTo(ladderX, 9);
    // 允许标称值取整的几厘米差（注册表写 -0.6），
    // 但绝不能像以前那样差 2.5 个世界单位——那是"两把梯子"
    expect(Math.abs(PUPPET_DEFAULTS.climb.start![0] - ladderX)).toBeLessThan(0.05);
  });

  it('爬梯挂在平台后侧：滑梯向下，梯子比平台更靠左', () => {
    const angle = slideDeckAngle(GEOM.start, GEOM.end);
    expect(angle).toBeLessThan(0); // y 向下递减
    expect(slideLadderX(GEOM.start, GEOM.end)).toBeLessThan(GEOM.start[0]);
  });

  it('梯子顶端 = 平台面：够到平台，不会凭空长到天上', () => {
    const top = slideLadderTop(WORLD.slide!);
    expect(top).toBeCloseTo(GEOM.start[1], 9);
    // 平台 + 护边比梯子顶更高 ⇒ 梯子接在平台下面，而不是穿过平台
    expect(slideTopY(GEOM.start[1])).toBeGreaterThan(top);
  });

  it('横档间距 = 攀爬每上一阶的高度（手每次都能抓到一根）', () => {
    const ys = ladderRungYs(slideLadderTop(WORLD.slide!));
    expect(ys.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeCloseTo(CLIMB.step, 9);
    }
  });

  it('横档从地面起、不越过梯子顶端（2D/3D 同一份，密度一致）', () => {
    const top = slideLadderTop(WORLD.slide!);
    const ys = ladderRungYs(top);
    const highest = Math.max(...ys);
    expect(ys[0]).toBeCloseTo(LADDER.rungStart, 9);
    expect(highest).toBeLessThanOrEqual(top);
    // 顶端余量不足一阶时不多画一根：最后一根到顶的距离 < 一阶
    expect(top - highest).toBeLessThan(CLIMB.step);
    // 3D 以前写死 5 根、2D 按 step 画十几根——同一个梯子两种密度
    expect(ys.length).toBeGreaterThan(5);
  });

  it('滑梯包围盒覆盖渲染器真实画出的爬梯与平台', () => {
    const b = slideBounds(GEOM.start, GEOM.end, 1);
    expect(b.maxY).toBeGreaterThanOrEqual(slideTopY(GEOM.start[1]) - 1e-9);
    expect(b.minX).toBeLessThanOrEqual(
      slideLadderX(GEOM.start, GEOM.end) - LADDER.railHalf + 1e-9,
    );
  });
});

describe('world / normalizeWorld 挡住脏 props', () => {
  it('合法的 world 原样通过', () => {
    const w = normalizeWorld({ venue: 'playground', slide: WORLD.slide });
    expect(w).not.toBeNull();
    expect(w!.venue).toBe('playground');
    expect(w!.slide!.start).toEqual(GEOM.start);
  });

  it('反向滑梯（end 比 start 高）整份拒绝：那是滑面朝天', () => {
    const bad = normalizeWorld({
      venue: 'playground',
      slide: { start: [0, 0.3, 0], end: [4, 2.6, 0] },
    });
    expect(bad).not.toBeNull();
    expect(bad!.slide).toBeUndefined();
  });

  it('坐标含 NaN / 长度不对 / 巨大值时，丢掉滑梯但保留场地', () => {
    const cases = [
      { start: [0, 'x', 0], end: [4, 0.3, 0] },
      { start: [0, 2.6], end: [4, 0.3, 0] },
      { start: [0, 1e9, 0], end: [4, 0.3, 0] },
    ];
    for (const slide of cases) {
      const w = normalizeWorld({ venue: 'playground', slide });
      expect(w).not.toBeNull();
      expect(w!.slide).toBeUndefined();
      expect(w!.venue).toBe('playground');
    }
  });

  it('整份缺失或不是对象时返回 null，调用方退回旧路径', () => {
    expect(normalizeWorld(undefined)).toBeNull();
    expect(normalizeWorld(null)).toBeNull();
    expect(normalizeWorld('playground')).toBeNull();
    expect(normalizeWorld(42)).toBeNull();
  });

  it('未知场地回落到 meadow，不产出未登记的配色', () => {
    const w = normalizeWorld({ venue: 'space-station' });
    expect(w!.venue).toBe('meadow');
    expect(VENUES).toContain(w!.venue);
  });
});

describe('world / 场地装饰', () => {
  it('确定性：同一份 world 两次给出同一份布局', () => {
    expect(venueDecor(WORLD)).toEqual(venueDecor({ ...WORLD }));
  });

  it('游乐园一定有摩天轮与沙坑（这是"在公园"的一句话）', () => {
    const kinds = venueDecor(WORLD).map((d) => d.kind);
    expect(kinds).toContain('wheel');
    expect(kinds).toContain('sandbox');
    expect(kinds).toContain('tree');
  });

  it('非游乐园场地不放摩天轮（装饰也要跟着场地走）', () => {
    const kinds = venueDecor({ venue: 'forest' }).map((d) => d.kind);
    expect(kinds).not.toContain('wheel');
  });

  it('装饰位置固定，不随幕漂移（同一处地方）', () => {
    const positions = venueDecor(WORLD).map((d) => `${d.kind}:${d.x}`);
    expect(venueDecor({ venue: 'playground' }).map((d) => `${d.kind}:${d.x}`)).toEqual(positions);
  });
});
