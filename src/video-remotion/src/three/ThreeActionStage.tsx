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
// 姿态解算在 character/pose.ts（与渲染器无关）。这个文件只负责"把关节目标点
// 画成圆柱和四元数"，不负责"角色该怎么动"——那是 pose 层的事。
import {
  ACTOR,
  BALL_RADIUS,
  SPEC,
  clamp,
  dribblePose,
  slidePose,
  type Pose,
  type Tri,
} from "../character/pose";
// 取景规则与布景几何都在 character/ 下：相机不再是"每个动作一组魔法数字"，
// 而是由内容包围盒 + 景别反推，地面永远落在 STAGE.groundY。
import {
  framingFor,
  shotForMotion,
  STAGE,
  unionAll,
  type Bounds,
  type Shot,
} from "../character/stage-layout";
import { LADDER, SLIDE, actorHeadTop, ladderRungYs, slideBounds, slideLadderX } from "../character/setpiece";
import { WorldLayer } from "../character/WorldLayer";
import { cameraForWorld, normalizeWorld } from "../character/world";

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


/* ------------------------------------------------------------------ *
 * 取景
 *
 * 相机不再有"按动作写死的一套参数"（曾经是 slide: z=8/lookY=1.55、
 * dribble: z=6.2/lookY=1.15）。那套写法有两个后果：地面行跟着动作跳
 * （2D 856、3D 827），以及"结构再高一点就出画"无法自动处理。
 *
 * 现在只由取景定律给一个 ppu，相机距离与 lookY/lookX 反推：
 *   屏幕Y = 540 + lookY * ppu ⇒ lookY = (地面行 − 540) / ppu
 *   屏幕X = 960 − (lookX − x) * ppu ⇒ lookX = 内容中心的世界 x
 *   z = 1080 / (2 * ppu * tan(fov/2))
 *
 * 注意：不能用 camera.position.y 抬高视角——R3F 的默认相机会 lookAt(0,0,0)，
 * 抬高相机等于让画面俯视，地面会被拉到中线。相机留在 y=0，把世界下移 lookY。
 * 横向同理：相机不动，世界整体平移 lookX。
 * ------------------------------------------------------------------ */

/**
 * 非滑梯幕的内容范围：角色轨迹 + 球。
 *
 * 为什么采样而不是只取末帧：拍球是往复运动，末帧多半不是极值；改了动作
 * 曲线之后"末帧即极值"这个假设也不成立。采样是通用的——新增动作不用改这里。
 */
function actorBounds(scene: ThreeStageScene, scale: number): Bounds {
  const n = 12;
  const dur = Math.max(1, scene.durationFrames);
  const half = (ACTOR.bodyWidth / 2) * scale;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= n; i++) {
    const d = dribblePose(scene, (dur * i) / n);
    const root = d.pose.root;
    minX = Math.min(minX, root[0] - half, d.ball[0] - BALL_RADIUS);
    maxX = Math.max(maxX, root[0] + half, d.ball[0] + BALL_RADIUS);
    maxY = Math.max(maxY, actorHeadTop(root[1], scale), d.ball[1] + BALL_RADIUS);
  }
  return { minX, maxX, minY: 0, maxY };
}


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
 *
 * 几何全部来自 character/setpiece.ts。这里只做"参数 → mesh"的翻译，
 * 因为"平台多厚、护边多高"同时决定取景高度（见 slideWorldHeight），
 * 两处各写一份，就会出现"画面装下了结构、取景却算矮了"的分裂。
 * ------------------------------------------------------------------ */
const SlideRig: React.FC<{ start: readonly [number, number, number]; end: readonly [number, number, number] }> = ({ start, end }) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const angle = Math.atan2(dy, dx);
  const mid: Tri = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, 0];
  // 爬梯的位置与横档高度都从 setpiece 取，和二维 WorldLayer 是同一份：
  // 同一个梯子不能有两种密度，否则切换渲染器时梯子会整个换一个样子。
  const ladderX = slideLadderX(start, end);
  const rungYs = ladderRungYs(start[1]);
  const deckColor = "#ffb347";
  const railColor = "#ff8f4d";
  const postColor = "#cf9a63";
  return (
    <group>
      {/* 滑面 */}
      <mesh position={mid} rotation={[0, 0, angle]}>
        <boxGeometry args={[len, SLIDE.deckThickness, SLIDE.deckWidth]} />
        <meshStandardMaterial color={deckColor} roughness={0.7} />
      </mesh>
      {/* 两侧护边 */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[mid[0], mid[1] + SLIDE.railLift, side * SLIDE.railHalf]}
          rotation={[0, 0, angle]}
        >
          <boxGeometry args={[len, SLIDE.railHeight, SLIDE.railThickness]} />
          <meshStandardMaterial color={railColor} roughness={0.65} />
        </mesh>
      ))}
      {/* 顶端平台 */}
      <mesh position={[start[0] - Math.cos(angle) * SLIDE.platformInset, start[1] + SLIDE.platformThickness / 2, 0]}>
        <boxGeometry args={[SLIDE.platformWidth, SLIDE.platformThickness, SLIDE.deckWidth]} />
        <meshStandardMaterial color={deckColor} roughness={0.7} />
      </mesh>
      {/* 顶端支柱：只留两根，四根会把左侧糊成一片栅栏 */}
      {[-1, 1].map((side) => (
        <mesh
          key={`post-${side}`}
          position={[start[0] - Math.cos(angle) * SLIDE.topPostInset, start[1] / 2 - SLIDE.postLift, side * SLIDE.topPostHalfZ]}
        >
          <cylinderGeometry args={[SLIDE.topPostRadius, SLIDE.topPostRadius, Math.max(0.3, start[1] - SLIDE.topPostFoot), 10]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
      {/* 底端支柱：滑道末端离地 0.3，不撑起来就是一块悬空的板 */}
      {[-1, 1].map((side) => (
        <mesh key={`end-post-${side}`} position={[end[0] - SLIDE.endPostInset, end[1] / 2, side * SLIDE.endPostHalfZ]}>
          <cylinderGeometry args={[SLIDE.endPostRadius, SLIDE.endPostRadius, Math.max(0.12, end[1] - SLIDE.endPostFoot), 10]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
      {/* 爬梯：两根立杆（左右分开，正面才看得出是梯子）+ 横档。
          杆距 = 横档长的一半，与 2D 梯子同一个宽度（setpiece.LADDER 导出）。 */}
      {[-1, 1].map((side) => (
        <mesh
          key={`ladder-${side}`}
          position={[ladderX + side * LADDER.railHalf, start[1] / 2 - SLIDE.postLift, 0]}
        >
          <cylinderGeometry args={[LADDER.sidePostRadius, LADDER.sidePostRadius, Math.max(0.5, start[1] - SLIDE.ladderFoot), 8]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
      {rungYs.map((y, i) => (
        <mesh
          key={`rung-${i}`}
          position={[ladderX, y, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[LADDER.sideRungRadius, LADDER.sideRungRadius, LADDER.sideRungLength, 8]} />
          <meshStandardMaterial color={postColor} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
};

/* ------------------------------------------------------------------ *
 * 道具：球
 *
 * 缝线不是"套一个环"：torus 的管心落在球面上，就会有一半管子突出轮廓，
 * 从侧面看是一圈蓝边（之前那版 radius*0.99 + tube 0.05*radius 就是这个问题，
 * 视觉上像给红球描了个蓝边，而不是缝）。正确做法是让 torus 外缘正好等于
 * 球半径：major = r - tube，管子嵌进表面，只露出贴近表面的一段。
 * ------------------------------------------------------------------ */
const Ball: React.FC<{ position: Tri; radius: number; squash: number; spin: number }> = ({
  position,
  radius,
  squash,
  spin,
}) => (
  <group position={position} rotation={[spin, 0, 0]} scale={[1 / squash, squash, 1 / squash]}>
    <mesh>
      <sphereGeometry args={[radius, 32, 24]} />
      <meshStandardMaterial color="#ef5f58" roughness={0.55} />
    </mesh>
    {[0, Math.PI / 2].map((rot) => (
      <mesh key={rot} rotation={[rot, 0, 0]}>
        <torusGeometry args={[radius * 0.955, radius * 0.045, 8, 48]} />
        <meshStandardMaterial color="#b8382f" roughness={0.5} />
      </mesh>
    ))}
  </group>
);


/* ------------------------------------------------------------------ *
 * 舞台
 * ------------------------------------------------------------------ */
export const ThreeActionStage: React.FC<{
  scene: ThreeStageScene;
  /** 场景局部帧（由 GeneratedLesson 的 useLocalFrame 传入，不用 useCurrentFrame：
   *  收尾窗口里画面要被钉在冻结帧上，否则最后一秒会自己动起来） */
  frame: number;
  /** 景别覆盖。不给就按动作判定：slide → wide，dribble → medium */
  shot?: Shot;
  /**
   * 场地（与二维同源）。给了它，相机缩放就是整节课的基准缩放 × 景别变焦，
   * 而不是"这一幕装得下就多大"——三维幕和二维幕的熊才是同一个大小。
   */
  world?: unknown;
}> = ({ scene, frame, shot: shotOverride, world: rawWorld }) => {
  const { width, height } = useVideoConfig();
  const accent = scene.accent || "#4d96ff";
  const isSlide = scene.motion === "slide";
  const scale = scene.rig.scale || 1;

  /**
   * 滑梯的位置由**场地**说了算，不由分镜说了算。
   *
   * 分镜也可能带 start/end（模型偶尔照抄坐标，旧任务缓存的是上一版默认值）。
   * 它一旦和场地里的滑梯不一致，画面就成了"熊在这座滑梯上滑、背景里是另一座"。
   * 动作只表达"在滑梯上滑"，几何永远来自 world.slide。
   */
  const world = normalizeWorld(rawWorld);
  const slideGeom =
    isSlide && world && world.slide
      ? { start: world.slide.start, end: world.slide.end }
      : { start: scene.start, end: scene.end };
  const stageScene = isSlide
    ? {
        ...scene,
        start: slideGeom.start as [number, number, number],
        end: slideGeom.end as [number, number, number],
      }
    : scene;

  /**
   * 取景：观众要看到的是"这一幕占了世界上哪一块"，不是"某个动作该配哪个
   * 机位"。滑梯横跨数米、平台上的坐姿角色还比结构更高，两者都必须整块进画；
   * 而"角色该画多大"只看站立身高。
   *
   * 用包围盒而不是只报高度：横向范围决定 ppu 与平移。以前只报高度，
   * 滑梯的左端贴到 x=115px、右端空出 437px —— 看起来像左边被裁了，
   * 其实是画面没按内容中心对齐。
   */
  const subjectHeight = actorHeadTop(SPEC.standHipY, Math.max(1, scale));
  const content = isSlide
    ? slideBounds(slideGeom.start, slideGeom.end, Math.max(1, scale))
    : actorBounds(scene, Math.max(1, scale));
  const shot = shotOverride ?? shotForMotion(scene.motion);
  /**
   * 有世界时用世界镜头：缩放固定、只按内容中心平移。三维幕因此与同一节课的
   * 二维幕共用一个标尺——以前三维幕按"整条滑梯装得下"算，二维幕按"这一幕
   * 内容装得下"算，同一个角色在两类幕里大小不同，切换时像换了个人。
   */
  const worldCamera = world ? cameraForWorld(world, shot, content) : null;
  const view = worldCamera ? worldCamera.camera : framingFor({ bounds: content, subjectHeight }, shot).camera;

  const slide = isSlide ? slidePose(stageScene, frame) : null;
  const dribble = isSlide ? null : dribblePose(scene, frame);
  const pose = slide || dribble!.pose;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* 场地背景：与二维同一份世界。滑梯在这里不画——三维舞台自己用 mesh 建，
          这样它才能参与光照与前后遮挡，而不会被一张平面图压在后面。 */}
      {world && worldCamera ? <WorldLayer world={world} camera={worldCamera} frame={frame} withSlide={false} /> : null}
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0, view.z], fov: view.fov, near: 0.1, far: 100 }}
        style={{ position: "absolute", inset: 0, background: "transparent" }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[4, 7, 6]} intensity={1.15} />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} />

        {/* 世界整体下移 lookY、左移 lookX：相机留在原点方向，靠平移把地面压到
            STAGE.groundY、把内容中心对到画面中线。2D 用 originX 表达同一件事，
            两边算出的屏幕位置逐像素相同。 */}
        <group position={[-view.lookX, -view.lookY, 0]}>
          <ProceduralChar rig={scene.rig} pose={pose} />

          {isSlide ? <SlideRig start={slideGeom.start} end={slideGeom.end} /> : null}

          {dribble ? (
            <>
              <Ball
                position={dribble.ball}
                radius={BALL_RADIUS}
                squash={dribble.squash}
                spin={dribble.spin}
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
          贴在标题带下沿（不是写死 132）：角色名和标题是同一条信息带的
          两级，摆在不同来源的坐标上，改标题字号就会撞。 */}
      {scene.label ? (
        <div
          style={{
            position: "absolute",
            left: 64,
            top: STAGE.titleBandBottom + 8,
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
