/**
 * 景别层与布景注册表的守门测试。
 *
 * 这两个模块住在渲染工程里（src/video-remotion/src/character），但它们是纯函数、
 * 不碰 React/Three，所以可以在这里用 jest 直接钉住它们的**算术**。
 * 画面好不好看只能靠抽帧看，但"会不会撞标题""2D/3D 地面是不是同一条"
 * 是算得出来的，必须自动守住——上一次就是靠人眼看出来才发现的。
 */
import {
  SAFE_X,
  STAGE,
  SUBJECT_BAND,
  SUBJECT_TOP,
  boundsCenterX,
  boundsWidth,
  framingFor,
  portraitFraming,
  propBounds,
  propSlotForSize,
  shotForMotion,
  unionAll,
  type Bounds,
  type Shot,
} from '../../../video-remotion/src/character/stage-layout';
import {
  LADDER,
  SLIDE,
  actorHeadTop,
  ladderBounds,
  ladderTopY,
  slideBounds,
  slideTopY,
  slideWorldHeight,
} from '../../../video-remotion/src/character/setpiece';
import { ACTOR, CLIMB, SPEC, SLIDE_SEAT_LIFT } from '../../../video-remotion/src/character/pose';

/** 世界高度 h 的主体在给定取景下，顶端落在屏幕第几行 */
const topRow = (h: number, ppu: number) => STAGE.groundY - h * ppu;

/** 包围盒在屏幕上落到哪几列（左/右/中心），以及取景给的 ppu */
const projectBox = (box: Bounds, shot: Shot, subjectHeight = ACTOR.standHeight) => {
  const f = framingFor({ bounds: box, subjectHeight }, shot);
  return {
    ppu: f.ppu,
    left: f.originX + box.minX * f.ppu,
    right: f.originX + box.maxX * f.ppu,
    center: f.originX + boundsCenterX(box) * f.ppu,
  };
};

describe('stage-layout / 取景定律', () => {
  it('任何内容高度都不会越进标题带', () => {
    // 0.8~6.0 世界单位：从最小的道具到"比滑梯还高的布景"
    for (let h = 0.8; h <= 6; h += 0.1) {
      for (const shot of ['wide', 'medium', 'close'] as const) {
        const { ppu } = framingFor({ contentHeight: h }, shot);
        // 允许 0.5px 的浮点误差；这是"不许越过标题下沿"的硬线
        expect(topRow(h, ppu)).toBeGreaterThanOrEqual(SUBJECT_TOP - 0.5);
      }
    }
  });

  it('内容特别高时，wide 会刚好铺满可用带（再高也不会顶出去）', () => {
    for (const h of [2.75, 3.0, 3.98, 5.2]) {
      const { ppu } = framingFor({ contentHeight: h, subjectHeight: 1.67 }, 'wide');
      // 受 ppu 上限保护前，wide 的装下约束就是"顶端正好落在 SUBJECT_TOP"
      if (ppu > 110) expect(topRow(h, ppu)).toBeCloseTo(SUBJECT_TOP, 0);
    }
  });

  it('景别是单调的：同一主体 wide ≤ medium < close', () => {
    const input = { contentHeight: 1.67, subjectHeight: 1.67 };
    const wide = framingFor(input, 'wide').ppu;
    const medium = framingFor(input, 'medium').ppu;
    const close = framingFor(input, 'close').ppu;
    expect(wide).toBeLessThanOrEqual(medium + 1e-9);
    expect(close).toBeGreaterThan(medium);
  });

  it('布景更高时 wide 自动后退，但不会小于 medium', () => {
    const actor = { contentHeight: 1.67, subjectHeight: 1.67 };
    const climb = { contentHeight: 2.75, subjectHeight: 1.67 };
    expect(framingFor(climb, 'wide').ppu).toBeLessThan(framingFor(actor, 'wide').ppu);
    expect(framingFor(climb, 'wide').ppu).toBeLessThanOrEqual(framingFor(actor, 'medium').ppu);
  });

  it('三维相机的地面恰好落在二维地面线上（同源）', () => {
    for (const shot of ['wide', 'medium', 'close'] as const) {
      const { camera, ppu } = framingFor({ contentHeight: 2.4 }, shot);
      // 屏幕Y = H/2 + lookY * ppu
      expect(STAGE.height / 2 + camera.lookY * ppu).toBeCloseTo(STAGE.groundY, 6);
    }
  });

  it('相机距离与 ppu 互为倒数关系（换 fov 也不会破）', () => {
    const { camera, ppu } = framingFor({ contentHeight: 1.67 }, 'medium');
    const ppuFromCamera = STAGE.height / (2 * camera.z * Math.tan((camera.fov * Math.PI) / 360));
    expect(ppuFromCamera).toBeCloseTo(ppu, 6);
  });

  it('带高就是"地面到标题下沿"的距离', () => {
    expect(SUBJECT_BAND).toBe(STAGE.groundY - SUBJECT_TOP);
    expect(SUBJECT_BAND).toBeGreaterThan(600);
  });

  it('动作 → 景别：要装下布景的动作才是 wide', () => {
    expect(shotForMotion('climb')).toBe('wide');
    expect(shotForMotion('slide')).toBe('wide');
    expect(shotForMotion('walk')).toBe('medium');
    expect(shotForMotion('point')).toBe('medium');
    // 未知动作落到 medium：最坏是布景裁一点，而不是压住标题
    expect(shotForMotion('backflip')).toBe('medium');
  });

  it('头像取景贴地、不越标题带', () => {
    const p = portraitFraming();
    // 布局盒底边贴地，缩放原点在底边 ⇒ 视觉上沿 = top + 盒高，必须不越界
    expect(p.top + 470).toBeCloseTo(STAGE.groundY, 6);
    expect(STAGE.groundY - p.height).toBeGreaterThanOrEqual(SUBJECT_TOP);
    expect(p.scale).toBeGreaterThan(1);
    expect(p.centerY).toBeCloseTo(STAGE.groundY - p.height / 2, 6);
  });
});

describe('stage-layout / 道具承载', () => {
  it('贴地道具的包围盒仍从地面起算', () => {
    const slot = propSlotForSize(1, 0.6);
    expect(slot.y).toBeCloseTo(0.3, 9);
    expect(propBounds(slot)).toEqual({ minX: slot.x - 0.3, maxX: slot.x + 0.3, minY: 0, maxY: 0.6 });
  });

  it('被叶片托高的蜗牛会把真实壳顶计入取景', () => {
    const snail = { x: 1.2, y: 0.92, size: 0.56 };
    const box = propBounds(snail);
    expect(box.minY).toBeCloseTo(0.64, 9);
    expect(box.maxY).toBeCloseTo(1.2, 9);
    expect(box.maxY).toBeGreaterThan(snail.size);
  });
});

describe('setpiece / 布景高度', () => {
  it('梯子高度必须包含顶端余量，否则取景会算矮', () => {
    const endY = 1.5;
    expect(ladderTopY(endY)).toBeCloseTo(endY + LADDER.topHeadroom, 6);
    // 曾经的 bug：取景只算角色头顶（endY + 1.01 = 2.51），梯子 2.75 越界
    expect(ladderTopY(endY)).toBeGreaterThan(actorHeadTop(endY, 1));
  });

  it('滑梯布景高度按平台厚度 + 护边算，不是估计值', () => {
    expect(slideTopY(2.7)).toBeCloseTo(2.7 + SLIDE.platformThickness + SLIDE.railHeight, 6);
  });

  it('滑梯幕的内容高度取"结构/坐姿/站姿"三者最大', () => {
    const start: [number, number, number] = [-3.1, 2.7, 0];
    const end: [number, number, number] = [2.9, 0.3, 0];
    const h = slideWorldHeight(start, end, 1);
    const seated = start[1] + SLIDE_SEAT_LIFT + SPEC.headY + SPEC.headR;
    expect(h).toBeCloseTo(Math.max(slideTopY(2.7), seated, SPEC.standHipY + SPEC.headY + SPEC.headR), 6);
    expect(h).toBeGreaterThan(seated - 0.05);
  });

  it('爬梯幕的实际取景：梯子顶端落在标题带下方', () => {
    const h = ladderTopY(1.5);
    const { ppu } = framingFor({ contentHeight: h, subjectHeight: actorHeadTop(SPEC.standHipY, 1) }, shotForMotion('climb'));
    const ladderTopRow = topRow(h, ppu);
    // 留白 30px（含 2D 描边约 7px 的视觉溢出），实际观感约 23px
    expect(ladderTopRow).toBeGreaterThanOrEqual(STAGE.titleBandBottom + 26);
    expect(ladderTopRow).toBeLessThan(STAGE.titleBandBottom + 34);
  });

  it('滑梯幕的实际取景：坐姿头顶落在标题带下方', () => {
    const h = slideWorldHeight([-3.1, 2.7, 0], [2.9, 0.3, 0], 1);
    const { ppu } = framingFor({ contentHeight: h, subjectHeight: actorHeadTop(SPEC.standHipY, 1) }, shotForMotion('slide'));
    expect(topRow(h, ppu)).toBeGreaterThanOrEqual(STAGE.titleBandBottom + 26);
  });

  it('常见动物体型都不会顶出去（scale 0.75~1.1）', () => {
    for (const scale of [0.75, 0.9, 1, 1.05, 1.1]) {
      const h = actorHeadTop(SPEC.standHipY, Math.max(1, scale));
      const { ppu } = framingFor({ contentHeight: h, subjectHeight: h }, 'medium');
      // 角色本身按 scale 绘制，绘制后的顶端
      const drawn = topRow(actorHeadTop(SPEC.standHipY, scale), ppu);
      expect(drawn).toBeGreaterThanOrEqual(SUBJECT_TOP - 0.5);
    }
  });
});

/**
 * 横向取景。
 *
 * 这些断言守的不是"某一帧好不好看"，而是**只要内容盒是对的，就一定不会
 * 一边贴边、一边空一大块**。以前的取景只有高度，横向唯一的行为是把世界原点
 * 按在画面中线：滑梯几何中心在 x=-0.41，于是左留白 106px、右留白 252px，
 * 看起来像左边被裁了。修复方式不是给滑梯加偏移，而是让取景吃包围盒。
 */
describe('取景 / 横向（包围盒驱动）', () => {
  const slide = slideBounds([-3.1, 2.7, 0], [2.9, 0.3, 0], 1);

  it('内容中心落在画面中线（按内容对齐，而不是按世界原点对齐）', () => {
    const boxes: Bounds[] = [
      slide,
      ladderBounds(0, ladderTopY(1.5)),
      // 偏左 / 偏右 / 不对称内容：中心都必须被搬到画面中线
      { minX: -3.5, maxX: -0.5, minY: 0, maxY: 2 },
      { minX: 0.2, maxX: 4.4, minY: 0, maxY: 1.2 },
    ];
    for (const box of boxes) {
      const p = projectBox(box, 'wide');
      expect(p.center).toBeCloseTo(STAGE.centerX, 6);
    }
  });

  it('滑梯幕两侧留白相等，且都不小于安全留白', () => {
    const p = projectBox(slide, 'wide');
    expect(p.left).toBeGreaterThanOrEqual(SAFE_X - 0.5);
    expect(p.right).toBeLessThanOrEqual(STAGE.width - SAFE_X + 0.5);
    // 两边对称：|左留白 − 右留白| 不超过 1px
    expect(Math.abs(p.left - (STAGE.width - p.right))).toBeLessThanOrEqual(1);
  });

  it('内容越宽，缩放越小（横向约束会真的起作用）', () => {
    const h = 1.5;
    const widths = [1, 2, 4, 8, 14];
    let prev = Infinity;
    for (const half of widths) {
      const box: Bounds = { minX: -half, maxX: half, minY: 0, maxY: h };
      const { ppu } = framingFor({ bounds: box, subjectHeight: ACTOR.standHeight }, 'medium');
      expect(ppu).toBeLessThanOrEqual(prev);
      prev = ppu;
    }
  });

  it('宽度超过可用区时，宁可两侧对等裁切，也不许一边出画一边空着', () => {
    const huge: Bounds = { minX: -30, maxX: 30, minY: 0, maxY: 1.5 };
    const p = projectBox(huge, 'wide');
    // 缩放下限保护（不能把角色缩成米粒），此时必然溢出，但溢出必须对称
    expect(p.left).toBeLessThan(0);
    expect(p.right).toBeGreaterThan(STAGE.width);
    expect(p.left + p.right).toBeCloseTo(STAGE.width, 6);
  });

  it('包围盒一旦给了，纵向也以它为准（与只报高度等价）', () => {
    for (const h of [1.2, 1.67, 2.8, 3.98]) {
      const byHeight = framingFor({ contentHeight: h, subjectHeight: ACTOR.standHeight }, 'wide');
      const byBox = framingFor(
        { bounds: { minX: -0.4, maxX: 0.4, minY: 0, maxY: h }, subjectHeight: ACTOR.standHeight },
        'wide',
      );
      expect(byBox.ppu).toBeCloseTo(byHeight.ppu, 9);
    }
  });

  it('三维相机的横向平移与二维 originX 同源（切渲染器时位置不跳）', () => {
    const f = framingFor({ bounds: slide, subjectHeight: ACTOR.standHeight }, 'wide');
    expect(f.camera.lookX).toBeCloseTo(boundsCenterX(slide), 9);
    expect(f.originX).toBeCloseTo(STAGE.centerX - f.camera.lookX * f.ppu, 9);
  });

  it('unionAll 把多个盒并成一个，漏一项就等于漏一块画面', () => {
    const a: Bounds = { minX: -1, maxX: 0, minY: 0, maxY: 1.5 };
    const b: Bounds = { minX: 0.2, maxX: 1.8, minY: 0, maxY: 0.9 };
    expect(unionAll([a, b])).toEqual({ minX: -1, maxX: 1.8, minY: 0, maxY: 1.5 });
    expect(boundsWidth(unionAll([a, b]))).toBeCloseTo(2.8, 9);
  });
});

/**
 * 布景比例守卫。
 *
 * 上一轮抽帧发现"梯子单独出现时像一面格子墙"。根因不是某个数字不好看，而是
 * 布景尺寸各自凭手感定、与角色无关：2D 梯宽 0.92（角色身宽的 1.5 倍），
 * 3D 梯宽 0.56，同一个梯子两种宽度。这里把"布景必须由角色导出"写成断言，
 * 以后调角色体型或加布景时，比例跑偏会在测试里失败，而不是在下一条成片里。
 */
describe('setpiece / 比例与覆盖守卫', () => {
  it('梯子宽度由角色身宽导出，不再是一面格子墙', () => {
    const width = LADDER.railHalf * 2;
    expect(width / ACTOR.bodyWidth).toBeLessThanOrEqual(1.2);
    expect(width / ACTOR.bodyWidth).toBeGreaterThanOrEqual(0.9);
    // 横档长 : 间距过大就成了窗格；爬到顶也够不到两侧
    expect(width / CLIMB.step).toBeLessThanOrEqual(3.4);
  });

  it('2D 与 3D 是同一把梯子：横档长 = 两杆间距，不再各写一套', () => {
    expect(LADDER.sideRungLength).toBeCloseTo(LADDER.railHalf * 2, 9);
  });

  it('梯子顶端余量 = 手能抓到的最高点 + 两阶', () => {
    expect(LADDER.topHeadroom).toBeCloseTo(CLIMB.gripY + 2 * CLIMB.step, 9);
    expect(LADDER.topHeadroom).toBeGreaterThanOrEqual(CLIMB.gripY + CLIMB.step);
  });

  it('攀爬的手落在立杆内侧（手位与杆距同源，不是两个数对不上）', () => {
    // climbPose 的 handX = gripWidth/2 * 0.96，必须严格小于杆位
    expect((ACTOR.gripWidth / 2) * 0.96).toBeLessThan(LADDER.railHalf);
  });

  it('滑梯包围盒覆盖渲染器真实画出的每一块几何', () => {
    const start: [number, number, number] = [-3.1, 2.7, 0];
    const end: [number, number, number] = [2.9, 0.3, 0];
    const b = slideBounds(start, end, 1);
    const len = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const cos = (end[0] - start[0]) / len;

    // 顶端平台整体
    expect(b.minX).toBeLessThanOrEqual(
      start[0] - cos * SLIDE.platformInset - SLIDE.platformWidth / 2 + 1e-9,
    );
    // 爬梯两根立杆
    expect(b.minX).toBeLessThanOrEqual(
      start[0] - cos * SLIDE.ladderInset - LADDER.sideRungLength / 2 + 1e-9,
    );
    // 滑到底站起来还要往前迈一步
    expect(b.maxX).toBeGreaterThanOrEqual(end[0] + 0.8 + ACTOR.bodyWidth / 2 - 1e-9);
    // 平台上的坐姿角色比结构本身还高
    expect(b.maxY).toBeGreaterThanOrEqual(actorHeadTop(start[1] + SLIDE_SEAT_LIFT, 1) - 1e-9);
    // 支柱落地
    expect(b.minY).toBeLessThanOrEqual(0);
  });

  it('滑梯幕的横向范围确实需要 8 个世界单位——这就是"只报高度"会失衡的原因', () => {
    const b = slideBounds([-3.1, 2.7, 0], [2.9, 0.3, 0], 1);
    expect(boundsWidth(b)).toBeGreaterThan(8);
  });
});
