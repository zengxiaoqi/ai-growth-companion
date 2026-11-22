import React from "react";
import type { Puppet2DScene } from "../character/Puppet2D";
import type { ActorRig } from "../character/pose";

const BEAR: ActorRig = {
  fur: "#c98a5a",
  belly: "#f0cfae",
  ears: "round",
  tail: "stub",
  scale: 1,
};

/**
 * 2D 角色的验收样例。
 *
 * 选这四个不是随意的：
 *  - walk   最容易看出"腿有没有真的摆"（贴图平移和骨骼摆腿差别极大）
 *  - climb  这正是线上第 2 幕缺失的动作，必须能看出手脚交替与离地
 *  - speak  检查徽章原有的强项没有丢（说话 + 点头 + 手势）
 *  - dribble 检查 2D 也能表达接触（掌球同帧），不再是 3D 专属
 */
export const WALK_PREVIEW: Puppet2DScene = {
  motion: "walk",
  rig: BEAR,
  start: [-1.9, 0.66, 0],
  end: [0.5, 0.66, 0],
  durationFrames: 90,
  accent: "#4d96ff",
  label: "小熊",
};

export const CLIMB_PREVIEW: Puppet2DScene = {
  motion: "climb",
  rig: BEAR,
  start: [-0.55, 0.66, 0],
  end: [-0.55, 1.5, 0],
  steps: 4,
  durationFrames: 120,
  accent: "#4d96ff",
  label: "小熊",
};

export const SPEAK_PREVIEW: Puppet2DScene = {
  motion: "speak",
  rig: BEAR,
  durationFrames: 90,
  accent: "#4d96ff",
  label: "小熊",
};

export const DRIBBLE_PREVIEW: Puppet2DScene = {
  motion: "dribble",
  rig: BEAR,
  bounce: { periodFrames: 18, height: 0.62 },
  ballRestY: 0.27,
  durationFrames: 96,
  accent: "#4d96ff",
  label: "小熊",
};

/**
 * 指认幕（线上第 1 幕的真实形态）：小熊站着指右边的滑梯。
 *
 * 道具节点不在夹具里构造——Remotion 的 defaultProps 会被 JSON 序列化，
 * React 元素过不去（真渲染时 JSX 是编译进模板源码的，不经过这条路径）。
 * 所以这里只给运动学与槽位坐标，占位图形由 PuppetPreview 在渲染时拼上。
 * 坐标与线上 SceneLayer 里 point 分支完全一致，所以"手臂末端有没有落到
 * 道具上"这个唯一会出错的几何关系仍然被验证到。
 */
export const POINT_PREVIEW: Puppet2DScene = {
  motion: "point",
  rig: BEAR,
  durationFrames: 90,
  accent: "#4d96ff",
  label: "小熊",
};

/** 与 SceneLayer 的 point 分支同源：右侧 1430/580，260 见方 */
export const POINT_PROP_SLOT = { x: 1430, y: 690, size: 280, label: "滑梯" };
