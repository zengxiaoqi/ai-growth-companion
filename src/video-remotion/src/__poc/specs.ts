import { FigureSpec } from './figure-spec';

/**
 * 三份手写 spec —— 模拟"如果 LLM 能交几何"，它会交出什么。
 *
 * 这三份不是模板，是数据。代码里没有任何一处出现"彩虹""太阳系""透镜"，
 * 画布只认识 arc / line / circle / curve / rect / polygon。
 * 这就是和"给科学类做 3-5 个专用组件"的根本区别。
 */

const RAINBOW = ['#E5484D', '#F76B15', '#FFC53D', '#30A46C', '#0091FF', '#3E63DD', '#8E4EC6'];

/** 1. 彩虹：七条同心弧，从内到外依次长出来 */
export const rainbowSpec: FigureSpec = {
  shapes: [
    // 太阳
    { kind: 'circle', cx: 1420, cy: 130, r: 54, fill: '#FFC53D', reveal: 0.05 },
    // 雨滴：彩虹的前提，先出现
    { kind: 'circle', cx: 235, cy: 330, r: 11, fill: '#4DABF7', reveal: 0.14 },
    { kind: 'circle', cx: 292, cy: 415, r: 9, fill: '#4DABF7', reveal: 0.16 },
    { kind: 'circle', cx: 190, cy: 448, r: 10, fill: '#4DABF7', reveal: 0.18 },
    { kind: 'circle', cx: 322, cy: 262, r: 8, fill: '#4DABF7', reveal: 0.2 },
    // 七条弧：圆心压到画面底部之外，让弧更宽、两端沉到地平线下，
    // 才是真实彩虹的样子（虹本是整圆，下半被地面挡住）
    ...RAINBOW.map((color, i) => ({
      kind: 'arc' as const,
      cx: 800,
      cy: 640,
      r: 490 - i * 40,
      from: 4,
      to: 176,
      stroke: color,
      width: 34,
      reveal: 0.3 + i * 0.045,
    })),
  ],
  labels: [
    { text: '阳光', x: 1420, y: 236 },
    { text: '水滴', x: 250, y: 520 },
  ],
};

/** 2. 太阳系：中心恒星 + 三条轨道（每条拆成两段半圆）+ 行星 */
export const solarSpec: FigureSpec = {
  shapes: [
    { kind: 'circle', cx: 800, cy: 285, r: 60, fill: '#FFB020', reveal: 0 },
    // 轨道半径 115 / 195 / 275，每圈拆成两段 arc，拼成完整圆环
    ...[115, 195, 275].flatMap((r, i) => [
      {
        kind: 'arc' as const,
        cx: 800,
        cy: 285,
        r,
        from: 0,
        to: 180,
        stroke: '#B9C6D4',
        width: 3,
        reveal: 0.12 + i * 0.08,
      },
      {
        kind: 'arc' as const,
        cx: 800,
        cy: 285,
        r,
        from: 180,
        to: 360,
        stroke: '#B9C6D4',
        width: 3,
        reveal: 0.12 + i * 0.08,
      },
    ]),
    // 三颗行星落在各自轨道上
    { kind: 'circle', cx: 888, cy: 211, r: 15, fill: '#8B9AA8', reveal: 0.7 },
    { kind: 'circle', cx: 617, cy: 352, r: 21, fill: '#4DABF7', reveal: 0.76 },
    { kind: 'circle', cx: 575, cy: 127, r: 26, fill: '#E5484D', reveal: 0.82 },
  ],
  labels: [
    { text: '太阳', x: 800, y: 400 },
    { text: '地球', x: 617, y: 300 },
  ],
};

/** 3. 凸透镜成像：透镜轮廓 + 光轴 + 物 + 像 + 两条光线
 *  几何按薄透镜公式排：f=200，物距 470，像距 348，横向放大 0.74。
 *  两条光线的交点必须落在像顶，这不是"看着像"，是可以算出来的。
 */
export const lensSpec: FigureSpec = {
  shapes: [
    // 光轴
    { kind: 'line', x1: 110, y1: 300, x2: 1490, y2: 300, stroke: '#9AA7B4', width: 3, reveal: 0 },
    // 透镜轮廓（左右两条对称贝塞尔，合成一个凸透镜）
    {
      kind: 'curve',
      x1: 800,
      y1: 90,
      c1x: 700,
      c1y: 180,
      c2x: 700,
      c2y: 420,
      x2: 800,
      y2: 510,
      stroke: '#3E63DD',
      width: 7,
      reveal: 0.1,
    },
    {
      kind: 'curve',
      x1: 800,
      y1: 90,
      c1x: 900,
      c1y: 180,
      c2x: 900,
      c2y: 420,
      x2: 800,
      y2: 510,
      stroke: '#3E63DD',
      width: 7,
      reveal: 0.14,
    },
    // 物体：从光轴向上 150
    { kind: 'line', x1: 330, y1: 300, x2: 330, y2: 150, stroke: '#E5484D', width: 8, reveal: 0.26 },
    { kind: 'polygon', points: '330,124 313,166 347,166', fill: '#E5484D', reveal: 0.32 },
    // 像：倒立、缩小到 0.74，落在 x=1148
    { kind: 'line', x1: 1148, y1: 300, x2: 1148, y2: 411, stroke: '#30A46C', width: 8, reveal: 0.5 },
    { kind: 'polygon', points: '1148,437 1131,395 1165,395', fill: '#30A46C', reveal: 0.56 },
    // 平行于光轴入射 → 过右侧焦点（1000,300）→ 落到像顶
    { kind: 'line', x1: 330, y1: 150, x2: 800, y2: 150, stroke: '#F76B15', width: 4, reveal: 0.64 },
    { kind: 'line', x1: 800, y1: 150, x2: 1148, y2: 411, stroke: '#F76B15', width: 4, reveal: 0.7 },
    // 过光心入射 → 方向不变，也落到像顶（与上一条在像顶相交）
    { kind: 'line', x1: 330, y1: 150, x2: 1148, y2: 411, stroke: '#F76B15', width: 4, reveal: 0.78 },
  ],
  labels: [
    { text: '物体', x: 330, y: 540 },
    { text: '像', x: 1148, y: 540 },
  ],
};
