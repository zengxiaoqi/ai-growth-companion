/**
 * 三维动作舞台（方案 A：纯代码参数化 3D）
 *
 * 这份文件是 3D 舞台的唯一实现来源。它同时被两处使用：
 *  1. 后端生成的任务目录：buildGeneratedLessonTsx() 通过 three-stage-template.ts
 *     把它原样写进 .generated/remotion-tasks/task-<id>/three/ThreeActionStage.tsx，
 *     GeneratedLesson 再 import 进来；
 *  2. 本地预览：src/__preview3d 直接 import 本文件，用来抽帧验收。
 * 改完这里要跑 `npm run sync:three-stage`（backend）把模板串同步过去。
 *
 * 为什么全用几何体而不加载模型：
 * 滑梯和拍球的关键不是"像不像真熊"，而是"身体贴着滑面""掌球同帧接触"。
 * 几何体拼出来的角色有真实的头/躯干/四肢与关节枢轴，四肢用"从肩到目标点"
 * 的定向算法定位，接触点因此是算出来的而不是画上去的。
 *
 * 确定性约束（Remotion 硬要求，改这个文件时务必守住）：
 *  - 只用 useCurrentFrame() 推帧，禁止 useFrame / requestAnimationFrame / delta；
 *  - 禁止 Math.random()、Date.now()、performance.now()；
 *  - 禁止自带时钟的 drei helper（Float / Sparkles / Stars / Trail …）；
 *  - 阴影不用实时阴影贴图（无头 WebGL 下帧序与耗时都不可控），用贴地圆片假阴影。
 */

import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { useVideoConfig } from "remotion";

export type ThreeRig = {
  fur: string;
  belly: string;
  ears: "round" | "long" | "pointy" | "flap" | "none";
  tail: "stub" | "long" | "bushy";
  scale: number;
};

export type ThreeStageScene = {
  motion: "slide" | "dribble";
  /** GLB 分支用；程序化分支只拿它做日志与标签 */
  actorId: string;
  rig: ThreeRig;
  start: [number, number, number];
  end: [number, number, number];
  bounce?: { periodFrames: number; height: number };
  ballRestY?: number;
  durationFrames: number;
  accent: string;
  label?: string;
};

type Tri = [number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ *
 * 场景常量：相机与角色尺寸
 *
 * 相机放在 z 轴上、y=0、看向 -Z（R3F 默认相机的朝向），画面垂直中心对应
 * 世界 lookY。这样"地面落在屏幕哪一行"是一个可算的量：
 *   屏幕Y = 540 + lookY * ppu，ppu = 1080 / (2 * z * tan(fov/2))
 * 滑梯需要装下 y=0…3.6 的整个结构，用 z=8（ppu≈185，地面 799，顶端 188）；
 * 拍球只需要装下小熊，用 z=6.2（ppu≈231，小熊约 380px 高）。
 * 两套取景共用同一 fov，切换动作时透视感一致。
 *
 * 注意：不能用 `camera.position.y` 抬高视角——R3F 的默认相机会 lookAt(0,0,0)，
 * 抬高相机等于让画面俯视，地面会被拉到中线（实测地面落在 551px 而不是 799px）。
 * 正确做法是相机留在 y=0，把整个世界下移 lookY（见 <group position> 那一层）。
 * ------------------------------------------------------------------ */
const CAMERA = { fov: 40 };
const VIEW = {
  slide: { z: 8, lookY: 1.55 },
  dribble: { z: 6.2, lookY: 1.15 },
};

/** 角色尺寸（局部坐标，原点在髋部中心，脚底约 -0.64） */
const SPEC = {
  hipY: 0,
  torsoR: 0.3,
  shoulder: [0.28, 0.42, 0.02] as Tri,
  hipJoint: [0.14, -0.12, 0] as Tri,
  /** 手臂/腿的最大伸展（站姿距离约 0.45 / 0.50，留一点余量，否则会被钳制） */
  armLen: 0.54,
  legLen: 0.52,
  headY: 0.72,
  headR: 0.29,
  /** 站立时髋部离地高度：脚底 -0.64 + 0.02 间隙 */
  standHipY: 0.66,
};

/**
 * 把一根肢体从 from 指向 to：返回中点位置、四元数（+Y 轴指向目标方向）、
 * 圆柱段长度。用四元数解析式而不是逐帧建 Object3D.lookAt，
 * 省掉一份可变的场景对象，也保证同样输入永远同样结果。
 */
function limb(from: Tri, to: Tri) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  // q ∝ (cross(a,b), 1 + a·b)，其中 a=(0,1,0)
  const cx = uz;
  const cz = -ux;
  const w = 1 + uy;
  const n = Math.sqrt(cx * cx + w * w + cz * cz) || 1;
  const quaternion: [number, number, number, number] =
    w < 1e-6 ? [1, 0, 0, 0] : [cx / n, 0, cz / n, w / n];
  return {
    position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2] as Tri,
    quaternion,
    length: len,
  };
}

/** 一段肢体：胶囊体（圆柱段留出两端半球，避免关节处露缝） */
const Limb: React.FC<{
  from: Tri;
  to: Tri;
  radius: number;
  color: string;
  /** 末端球（手掌/脚掌） */
  capColor?: string;
  capRadius?: number;
  /**
   * 最大长度。目标点超出这个距离时沿方向钳制——手要够球，但手臂不能被拉长：
   * 拉长的手臂在画面上是"橡皮人"，比够不到更糟。当前动作的目标点都在
   * 0.45 以内，这里只是安全网（斜接道具或极端时长时才起作用）。
   */
  maxLength?: number;
}> = ({ from, to, radius, color, capColor, capRadius, maxLength }) => {
  let target: Tri = to;
  if (maxLength) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > maxLength) {
      const k = maxLength / len;
      target = [from[0] + dx * k, from[1] + dy * k, from[2] + dz * k];
    }
  }
  const g = limb(from, target);
  const bodyLen = Math.max(0.01, g.length - radius * 1.4);
  const cap = capRadius ?? radius * 1.25;
  return (
    <group>
      <mesh position={g.position} quaternion={g.quaternion}>
        <capsuleGeometry args={[radius, bodyLen, 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
      </mesh>
      {capColor ? (
        <mesh position={target}>
          <sphereGeometry args={[cap, 12, 12]} />
          <meshStandardMaterial color={capColor} roughness={0.8} metalness={0} />
        </mesh>
      ) : null}
    </group>
  );
};

const Ears: React.FC<{ rig: ThreeRig; headY: number; headR: number }> = ({ rig, headY, headR }) => {
  const y = headY + headR * 0.72;
  const x = headR * 0.62;
  const color = rig.fur;
  if (rig.ears === "none") return null;
  if (rig.ears === "long") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * x * 0.7, y + 0.2, -0.02]} scale={[1, 1, 0.55]}>
            <capsuleGeometry args={[0.075, 0.26, 5, 10]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        ))}
      </group>
    );
  }
  if (rig.ears === "pointy") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * x * 0.9, y, -0.01]} rotation={[0, 0, side * 0.32]}>
            <coneGeometry args={[0.1, 0.22, 10]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        ))}
      </group>
    );
  }
  if (rig.ears === "flap") {
    return (
      <group>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * (headR + 0.12), headY + 0.02, 0]}
            scale={[0.5, 1, 1]}
          >
            <sphereGeometry args={[0.19, 14, 14]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * x, y, 0]} scale={[1, 1, 0.6]}>
          <sphereGeometry args={[0.115, 14, 14]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
};

const Tail: React.FC<{ rig: ThreeRig; swing: number }> = ({ rig, swing }) => {
  if (rig.tail === "stub") {
    return (
      <mesh position={[0, -0.02, -0.28]}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color={rig.belly} roughness={0.9} />
      </mesh>
    );
  }
  if (rig.tail === "bushy") {
    return (
      <mesh position={[0, 0.12, -0.36]} rotation={[0.5, 0, swing * 0.4]} scale={[0.8, 1.2, 0.9]}>
        <sphereGeometry args={[0.17, 14, 14]} />
        <meshStandardMaterial color={rig.fur} roughness={0.9} />
      </mesh>
    );
  }
  return (
    <mesh position={[0.03, 0.1, -0.3]} rotation={[0.7, 0, swing * 0.5]} scale={[0.55, 1, 0.55]}>
      <capsuleGeometry args={[0.06, 0.22, 5, 10]} />
      <meshStandardMaterial color={rig.fur} roughness={0.9} />
    </mesh>
  );
};

type Pose = {
  root: Tri;
  rotZ: number;
  rotY: number;
  handL: Tri;
  handR: Tri;
  footL: Tri;
  footR: Tri;
  tailSwing: number;
  headTilt: number;
  squash: number;
};

/** 静止站姿的四肢位置，所有动作都以它为基准混合 */
const STAND_POSE: Omit<Pose, "root"> = {
  rotZ: 0,
  rotY: 0,
  handL: [-0.36, -0.02, 0.06],
  handR: [0.36, -0.02, 0.06],
  footL: [-0.16, -0.62, 0.02],
  footR: [0.16, -0.62, 0.02],
  tailSwing: 0,
  headTilt: 0,
  squash: 1,
};

const ProceduralChar: React.FC<{ rig: ThreeRig; pose: Pose }> = ({ rig, pose }) => {
  const s = rig.scale;
  return (
    <group position={pose.root} rotation={[0, pose.rotY, pose.rotZ]} scale={[s, s, s]}>
      {/* 躯干 */}
      <mesh position={[0, 0.16, 0]} scale={[1, 1.05, 0.85]}>
        <capsuleGeometry args={[SPEC.torsoR, 0.24, 8, 18]} />
        <meshStandardMaterial color={rig.fur} roughness={0.88} />
      </mesh>
      {/* 肚皮 */}
      <mesh position={[0, 0.1, 0.2]} scale={[0.72, 0.82, 0.4]}>
        <sphereGeometry args={[SPEC.torsoR, 16, 16]} />
        <meshStandardMaterial color={rig.belly} roughness={0.9} />
      </mesh>
      {/* 头 */}
      <mesh position={[0, SPEC.headY, 0.02]} rotation={[pose.headTilt, 0, 0]}>
        <sphereGeometry args={[SPEC.headR, 20, 20]} />
        <meshStandardMaterial color={rig.fur} roughness={0.88} />
      </mesh>
      {/* 口鼻 + 鼻头 + 眼睛 */}
      <mesh position={[0, SPEC.headY - 0.07, SPEC.headR * 0.82]} scale={[1, 0.78, 0.85]}>
        <sphereGeometry args={[0.135, 16, 16]} />
        <meshStandardMaterial color={rig.belly} roughness={0.92} />
      </mesh>
      <mesh position={[0, SPEC.headY - 0.03, SPEC.headR * 1.12]}>
        <sphereGeometry args={[0.058, 12, 12]} />
        <meshStandardMaterial color="#3b2a20" roughness={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.108, SPEC.headY + 0.075, SPEC.headR * 0.9]}>
          <sphereGeometry args={[0.036, 10, 10]} />
          <meshStandardMaterial color="#241812" roughness={0.6} />
        </mesh>
      ))}
      <Ears rig={rig} headY={SPEC.headY} headR={SPEC.headR} />
      <Tail rig={rig} swing={pose.tailSwing} />
      {/* 四肢：肩/髋为共同枢轴，末端用目标点定向 */}
      <Limb
        from={[-SPEC.shoulder[0], SPEC.shoulder[1], SPEC.shoulder[2]]}
        to={pose.handL}
        radius={0.082}
        color={rig.fur}
        capColor={rig.belly}
        capRadius={0.095}
        maxLength={SPEC.armLen}
      />
      <Limb
        from={[SPEC.shoulder[0], SPEC.shoulder[1], SPEC.shoulder[2]]}
        to={pose.handR}
        radius={0.082}
        color={rig.fur}
        capColor={rig.belly}
        capRadius={0.095}
        maxLength={SPEC.armLen}
      />
      <Limb
        from={[-SPEC.hipJoint[0], SPEC.hipJoint[1], SPEC.hipJoint[2]]}
        to={pose.footL}
        radius={0.095}
        color={rig.fur}
        capColor={rig.fur}
        capRadius={0.11}
        maxLength={SPEC.legLen}
      />
      <Limb
        from={[SPEC.hipJoint[0], SPEC.hipJoint[1], SPEC.hipJoint[2]]}
        to={pose.footR}
        radius={0.095}
        color={rig.fur}
        capColor={rig.fur}
        capRadius={0.11}
        maxLength={SPEC.legLen}
      />
    </group>
  );
};

/** 贴地假阴影：一个压扁的圆片，无实时阴影贴图，帧序无关 */
const Blob: React.FC<{ x: number; z: number; y?: number; r: number; opacity: number }> = ({
  x,
  z,
  y = 0.012,
  r,
  opacity,
}) => (
  <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[r, r * 0.55, 1]}>
    <circleGeometry args={[1, 24]} />
    <meshBasicMaterial color="#1b2a33" transparent opacity={opacity} />
  </mesh>
);

/* ------------------------------------------------------------------ *
 * 道具：滑梯
 * ------------------------------------------------------------------ */
const SlideRig: React.FC<{ start: Tri; end: Tri }> = ({ start, end }) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const angle = Math.atan2(dy, dx);
  const mid: Tri = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, 0];
  const deckColor = "#ffb347";
  const railColor = "#ff8f4d";
  const postColor = "#cf9a63";
  return (
    <group>
      {/* 滑面 */}
      <mesh position={mid} rotation={[0, 0, angle]}>
        <boxGeometry args={[len, 0.12, 1.4]} />
        <meshStandardMaterial color={deckColor} roughness={0.7} />
      </mesh>
      {/* 两侧护边 */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[mid[0], mid[1] + 0.09, side * 0.72]}
          rotation={[0, 0, angle]}
        >
          <boxGeometry args={[len, 0.18, 0.1]} />
          <meshStandardMaterial color={railColor} roughness={0.65} />
        </mesh>
      ))}
      {/* 顶端平台 */}
      <mesh position={[start[0] - Math.cos(angle) * 0.75, start[1] + 0.06, 0]}>
        <boxGeometry args={[1.6, 0.12, 1.4]} />
        <meshStandardMaterial color={deckColor} roughness={0.7} />
      </mesh>
      {/* 顶端支柱：只留两根，四根会把左侧糊成一片栅栏 */}
      {[-1, 1].map((side) => (
        <mesh
          key={`post-${side}`}
          position={[start[0] - Math.cos(angle) * 1.2, start[1] / 2 - 0.06, side * 0.6]}
        >
          <cylinderGeometry args={[0.08, 0.08, Math.max(0.3, start[1] - 0.1), 10]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
      {/* 底端支柱：滑道末端离地 0.3，不撑起来就是一块悬空的板 */}
      {[-1, 1].map((side) => (
        <mesh key={`end-post-${side}`} position={[end[0] - 0.3, end[1] / 2, side * 0.5]}>
          <cylinderGeometry args={[0.07, 0.07, Math.max(0.12, end[1] - 0.06), 10]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
      {/* 爬梯：两根立杆（左右分开，正面才看得出是梯子）+ 横档 */}
      {[-1, 1].map((side) => (
        <mesh
          key={`ladder-${side}`}
          position={[start[0] - Math.cos(angle) * 1.5 + side * 0.28, start[1] / 2 - 0.06, 0]}
        >
          <cylinderGeometry args={[0.05, 0.05, Math.max(0.5, start[1] - 0.12), 8]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={`rung-${i}`}
          position={[
            start[0] - Math.cos(angle) * 1.5,
            0.28 + i * ((Math.max(0.5, start[1] - 0.3) - 0.28) / 4),
            0,
          ]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.04, 0.04, 0.56, 8]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 道具：球（两条环带，比纯色球更容易看出滚动）
 * ------------------------------------------------------------------ */
const Ball: React.FC<{ position: Tri; radius: number; squash: number; spin: number; accent: string }> = ({
  position,
  radius,
  squash,
  spin,
  accent,
}) => (
  <group position={position} rotation={[spin, 0, 0]} scale={[1 / squash, squash, 1 / squash]}>
    <mesh>
      <sphereGeometry args={[radius, 24, 24]} />
      <meshStandardMaterial color="#ef5f58" roughness={0.55} />
    </mesh>
    {[0, Math.PI / 2].map((rot) => (
      <mesh key={rot} rotation={[rot, 0, 0]} scale={[1, 1, 1.005]}>
        <torusGeometry args={[radius * 0.99, radius * 0.05, 8, 40]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
    ))}
  </group>
);

/* ------------------------------------------------------------------ *
 * 动作：滑滑梯
 * ------------------------------------------------------------------ */
function slidePose(scene: ThreeStageScene, localFrame: number): Pose {
  const dur = Math.max(24, scene.durationFrames || 90);
  const u = clamp(localFrame / dur, 0, 1);
  // 加速度曲线：起滑慢、中段快、到底前不再加速（u^1.5 而不是线性）
  const travel = Math.pow(u, 1.5);

  const [sx, sy] = scene.start;
  const [ex, ey] = scene.end;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const angle = Math.atan2(dy, dx);

  // 沿滑面 4% → 96%：起点落在平台上，终点停在滑面底端
  const p = lerp(0.04, 0.96, travel);
  const px = sx + dx * p;
  const py = sy + dy * p;

  // 坐姿：髋部沿法线抬起 0.26（躯干底 -0.28 刚好压在滑面上），双腿沿滑面
  // 向前伸出而不是垂到板下面——垂下去会被滑板挡住，看起来像"浮在板上"。
  const slideRoot: Tri = [px + nx * 0.27, py + ny * 0.27, 0];
  const swing = Math.sin(localFrame / 5) * 0.06;
  const sitting: Omit<Pose, "root"> = {
    rotZ: angle + 0.1,
    rotY: 0,
    handL: [-0.4, 0.74 + swing, 0.2],
    handR: [0.4, 0.74 - swing, 0.2],
    footL: [0.5, 0.12 + swing * 0.5, -0.14],
    footR: [0.5, 0.12 - swing * 0.5, 0.14],
    tailSwing: Math.sin(localFrame / 8) * 0.5,
    headTilt: -0.12,
    squash: 1,
  };

  // 最后一程站起来：坐姿 → 站姿，位置从滑面底端落到地面
  const standT = smooth(clamp((u - 0.9) / 0.1, 0, 1));
  // 落地点要离开滑道末端：贴着末端站会和斜板叠在一起，像被插穿
  const standRoot: Tri = [ex + 0.8, SPEC.standHipY, 0];
  const root: Tri = [
    lerp(slideRoot[0], standRoot[0], standT),
    lerp(slideRoot[1], standRoot[1], standT),
    lerp(slideRoot[2], standRoot[2], standT),
  ];
  const mixTri = (a: Tri, b: Tri): Tri => [
    lerp(a[0], b[0], standT),
    lerp(a[1], b[1], standT),
    lerp(a[2], b[2], standT),
  ];

  return {
    root,
    rotZ: lerp(sitting.rotZ, STAND_POSE.rotZ, standT),
      rotY: 0,
    handL: mixTri(sitting.handL, STAND_POSE.handL),
    handR: mixTri(sitting.handR, STAND_POSE.handR),
    footL: mixTri(sitting.footL, STAND_POSE.footL),
    footR: mixTri(sitting.footR, STAND_POSE.footR),
    tailSwing: lerp(sitting.tailSwing, 0, standT),
    headTilt: lerp(sitting.headTilt, 0, standT),
    squash: 1,
  };
}

/* ------------------------------------------------------------------ *
 * 动作：拍球
 *
 * 接触关系是这一段的核心：球的 Y 由周期函数给出，接触帧固定在周期边界；
 * 熊掌目标点 = 球心 + 0.9R（搭在球顶），手臂用"肩→目标"定向自动跟手。
 * 因此"掌球同帧接触"不是靠调参对齐两条时间线，而是同一个变量算出来的。
 * ------------------------------------------------------------------ */
/** 球半径与静置高度（球心离地）——渲染与注册表各存一份，注册表是权威值 */
const BALL_RADIUS = 0.26;

function dribblePose(
  scene: ThreeStageScene,
  localFrame: number,
): { pose: Pose; ball: Tri; squash: number; spin: number } {
  const period = Math.max(6, scene.bounce?.periodFrames ?? 18);
  const height = Math.max(0.2, scene.bounce?.height ?? 0.62);
  const rest = scene.ballRestY ?? 0.27;
  const radius = BALL_RADIUS;

  const cyclePhase = (((localFrame % period) + period) % period) / period;
  const lift = Math.abs(Math.sin(Math.PI * cyclePhase));
  const ballY = rest + height * lift;

  // 球在小熊右侧、同一景深平面内：再往前放会让手臂藏在球后面，
  // 孩子看到的是"一颗球悬在耳边"，不是"熊掌在拍球"。
  const ballX = 0.72;
  const ballZ = 0.15;
  const ball: Tri = [ballX, ballY, ballZ];

  // 落地附近压扁，最高点恢复
  const contact = clamp(1 - (ballY - rest) / 0.14, 0, 1);
  const squash = 1 - 0.12 * contact;
  const spin = localFrame * 0.1;

  // 身体随球起伏：球到手边时微微下蹲，球飞起时站直
  const hipY = SPEC.standHipY - 0.07 * (1 - lift);
  const root: Tri = [0, hipY, 0];

  // 右掌搭在球顶靠前的一侧（z 比球心大 0.11）：既真实接触又不被球挡住。
  // 目标点 = 球心 + 0.9R，臂长 0.46 覆盖得了这个范围，所以不会被拉伸。
  const handR: Tri = [ballX, ballY + radius * 0.9 - hipY, ballZ + 0.11];
  // 左臂自然摆动配平
  const handL: Tri = [-0.38, -0.02 + Math.sin(localFrame / 7) * 0.05, 0.08];
  // 脚随下蹲略微屈膝
  const kneeDrop = 0.07 * (1 - lift);
  const footL: Tri = [-0.16, -0.62 + kneeDrop, 0.02];
  const footR: Tri = [0.16, -0.62 + kneeDrop, 0.02];

  return {
    pose: {
      root,
      rotZ: 0,
      // 身体正对镜头：转身体会把手臂目标点一起转走，掌心就贴不到球了
      rotY: 0,
      handL,
      handR,
      footL,
      footR,
      tailSwing: Math.sin(localFrame / 9) * 0.35,
      headTilt: 0.18 + lift * 0.05,
      squash: 1,
    },
    ball,
    squash,
    spin,
  };
}

/* ------------------------------------------------------------------ *
 * 舞台
 * ------------------------------------------------------------------ */
export const ThreeActionStage: React.FC<{
  scene: ThreeStageScene;
  /** 场景局部帧（由 GeneratedLesson 的 useLocalFrame 传入，不用 useCurrentFrame：
   *  收尾窗口里画面要被钉在冻结帧上，否则最后一秒会自己动起来） */
  frame: number;
}> = ({ scene, frame }) => {
  const { width, height } = useVideoConfig();
  const accent = scene.accent || "#4d96ff";
  const isSlide = scene.motion === "slide";
  const view = isSlide ? VIEW.slide : VIEW.dribble;

  const slide = isSlide ? slidePose(scene, frame) : null;
  const dribble = isSlide ? null : dribblePose(scene, frame);
  const pose = slide || dribble!.pose;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0, view.z], fov: CAMERA.fov, near: 0.1, far: 100 }}
        style={{ position: "absolute", inset: 0, background: "transparent" }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[4, 7, 6]} intensity={1.15} />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} />

        {/* 世界整体下移 lookY：相机留在 y=0，靠位移把地面压到屏幕下方 */}
        <group position={[0, -view.lookY, 0]}>
          <ProceduralChar rig={scene.rig} pose={pose} />

          {isSlide ? <SlideRig start={scene.start} end={scene.end} /> : null}

          {dribble ? (
            <>
              <Ball
                position={dribble.ball}
                radius={BALL_RADIUS}
                squash={dribble.squash}
                spin={dribble.spin}
                accent={accent}
              />
              <Blob
                x={dribble.ball[0]}
                z={dribble.ball[2]}
                r={clamp(0.42 - (dribble.ball[1] - 0.27) * 0.12, 0.18, 0.42)}
                opacity={clamp(0.3 - (dribble.ball[1] - 0.27) * 0.12, 0.06, 0.3)}
              />
              <Blob x={pose.root[0]} z={pose.root[2]} r={0.5} opacity={0.22} />
            </>
          ) : null}
        </group>
      </ThreeCanvas>

      {/* 角色名条：3D 里画不了可读文字，用 DOM 覆盖。
          放在左上角而不是角色脚下——角色站在世界 y=0（屏幕约 854px），
          脚下正好是字幕面板的位置，摆那儿会被字幕压掉一半。 */}
      {scene.label ? (
        <div
          style={{
            position: "absolute",
            left: 64,
            top: 132,
            padding: "8px 26px",
            borderRadius: 999,
            background: accent,
            color: "#fff",
            fontSize: 34,
            fontWeight: 900,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 18px rgba(0,0,0,0.16)",
          }}
        >
          {scene.label}
        </div>
      ) : null}
    </div>
  );
};
