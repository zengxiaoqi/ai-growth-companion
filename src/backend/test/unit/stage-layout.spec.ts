/**
 * 景别层与布景注册表的守门测试。
 *
 * 这两个模块住在渲染工程里（src/video-remotion/src/character），但它们是纯函数、
 * 不碰 React/Three，所以可以在这里用 jest 直接钉住它们的**算术**。
 * 画面好不好看只能靠抽帧看，但"会不会撞标题""2D/3D 地面是不是同一条"
 * 是算得出来的，必须自动守住——上一次就是靠人眼看出来才发现的。
 */
import {
  STAGE,
  SUBJECT_BAND,
  SUBJECT_TOP,
  framingFor,
  portraitFraming,
  shotForMotion,
} from '../../../video-remotion/src/character/stage-layout';
import {
  LADDER,
  SLIDE,
  actorHeadTop,
  ladderTopY,
  slideTopY,
  slideWorldHeight,
} from '../../../video-remotion/src/character/setpiece';
import { SPEC, SLIDE_SEAT_LIFT } from '../../../video-remotion/src/character/pose';

/** 世界高度 h 的主体在给定取景下，顶端落在屏幕第几行 */
const topRow = (h: number, ppu: number) => STAGE.groundY - h * ppu;

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
