import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Puppet2D, type Puppet2DScene } from "../character/Puppet2D";
import { POINT_PROP_SLOT } from "./fixtures";

/** 占位滑梯：用来验证"手指出去的方向有没有落到道具上"，不追求像 PropArt */
const SlideStandIn: React.FC = () => (
  <g>
    <rect x={-62} y={-74} width={124} height={16} rx={8} fill="#5bc0eb" />
    <path
      d="M -54 -58 L 54 62"
      stroke="#5bc0eb"
      strokeWidth={16}
      strokeLinecap="round"
      fill="none"
    />
    <rect x={-58} y={54} width={116} height={14} rx={7} fill="#7fd1f0" />
  </g>
);

/**
 * 2D 角色预览（仅本地抽帧验收用，不参与线上渲染）。
 *
 * 画一条草地线而不是纯白底：判断"脚有没有踩在地上"必须有参照，
 * 空背景下任何悬空都看不出来。
 *
 * withPointProp 走的是线上 point 幕的同一条布局路径，只是把 PropArt
 * 换成占位图形——不能直接传 React 元素给 Composition（defaultProps 会
 * 被 JSON 序列化），所以在组件内部拼。
 */
export const PuppetPreview: React.FC<{ scene: Puppet2DScene; withPointProp?: boolean }> = ({
  scene,
  withPointProp,
}) => {
  const frame = useCurrentFrame();
  const resolved: Puppet2DScene = withPointProp
    ? {
        ...scene,
        props: [{ ...POINT_PROP_SLOT, node: <SlideStandIn /> }],
      }
    : scene;
  return (
    <AbsoluteFill style={{ backgroundColor: "#eef7ff" }}>
      {/* 天空 → 远景 → 草地，三段纯色，够判断站位 */}
      <AbsoluteFill style={{ top: 520, height: 336, backgroundColor: "#dff0e4" }} />
      <AbsoluteFill style={{ top: 856, height: 224, backgroundColor: "#c9e7c4" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 856,
          height: 4,
          background: "#a9d3a2",
        }}
      />
      <Puppet2D scene={resolved} frame={frame} />
    </AbsoluteFill>
  );
};
