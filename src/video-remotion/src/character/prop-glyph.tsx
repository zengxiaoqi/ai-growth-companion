/**
 * 道具渲染器：一个组件、两种来源、零 id 分支。
 *
 * 为什么要有这一层：
 * 道具以前画在 `buildGeneratedLessonTsx()` 的模板字符串里，是一条
 * `if (id === "ball") … if (id === "cookie") …` 的十连判断，兜底 `return null`。
 * 后果有三条：画不出的道具静默消失、新增道具要改 5000 行模板里的字符串、
 * 画好的道具不能在 Studio 里单独预览（模板只做语法转译，类型错误拦不住）。
 *
 * 现在 `PropGlyph` 只做一件事：把 `prop-art.ts` 给的几何盒换算成
 * "高 `height`、底边中点在原点"的图形。计算公式对内置道具与现画道具**完全相同**，
 * 所以这里没有 `if (id === ...)`，也没有 `Record<id, fn>`。
 *
 * 坐标约定（改这个文件前必须先读）：
 *  - markup 的坐标系是 `0..canvas`，内容垂直居中；
 *  - 输出图形的**底边中点**落在局部原点 (0, 0)，调用方负责 `translate` 到地面/手边；
 *    于是调用方不需要知道道具多高——`height` 已经把高度定死了，这也是以前
 *    "每处都手写 y = size / 2"的来源。
 *
 * 依赖只有 React 与 prop-art：本文件会被 `scripts/sync-three-stage.cjs` 原样写进
 * 渲染任务目录，import 任何本项目其它模块都会在任务目录里炸（那边没有工程配置）。
 */
import React from 'react';
import type { ScenePropGlyph } from './prop-art';

/** 任意 glyph 的 markup 注入点：整个渲染层唯一一处把字符串塞进 SVG 的地方 */
const Markup: React.FC<{ markup: string }> = ({ markup }) => (
  <g dangerouslySetInnerHTML={{ __html: markup }} />
);

/**
 * 占位件：圆角盒 + 名字首字。
 *
 * 存在的理由是"失败要看得见"：道具画不出来时，画面该出现一个明显的占位，
 * 让出片一眼能看出缺了什么；返回 `null` 只会让画面安静地少一个东西，
 * 而这种缺失在 1080 帧里没人找得出来。
 */
export const PlaceholderGlyph: React.FC<{ label: string; canvas: number }> = ({ label, canvas }) => {
  const half = canvas / 2;
  const side = canvas * 0.66;
  const fontSize = side * 0.52;
  return (
    <g>
      <rect
        x={half - side / 2}
        y={half - side / 2}
        width={side}
        height={side}
        rx={side * 0.22}
        fill="#ffe9b8"
        stroke="#c9a227"
        strokeWidth={canvas * 0.012}
        strokeDasharray={`${canvas * 0.05} ${canvas * 0.035}`}
      />
      <text
        x={half}
        y={half + fontSize * 0.36}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={900}
        fill="#8a6a12"
      >
        {(label || '?').slice(0, 1)}
      </text>
    </g>
  );
};

/**
 * 道具渲染器。
 *
 * `height` 是**当前用户空间里的高度**：
 *  - 世界道具传 `glyph.size * ppu`（跟着镜头缩放）；
 *  - 徽章/特写这类固定画布传绘图盒边长（`glyph.canvas`），由外层 viewBox 定尺寸。
 *
 * 两种传法走同一行换算，区别只在一个数字——这就是"内置"和"现画"没有两条路径的意思。
 */
export const PropGlyph: React.FC<{ glyph: ScenePropGlyph; height: number }> = ({ glyph, height }) => {
  const half = glyph.canvas / 2;
  const fill = glyph.fill > 0 ? glyph.fill : 1;
  const k = height / (glyph.canvas * fill);
  // 内容垂直居中：底边在 canvas/2 + canvas/2*fill 处
  const bottom = half + half * fill;
  const body = glyph.markup ? (
    <Markup markup={glyph.markup} />
  ) : (
    <PlaceholderGlyph label={glyph.label} canvas={glyph.canvas} />
  );
  return <g transform={`scale(${k}) translate(${-half} ${-bottom})`}>{body}</g>;
};
