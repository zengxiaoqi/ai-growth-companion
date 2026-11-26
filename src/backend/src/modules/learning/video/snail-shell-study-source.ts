/**
 * Source for the generated character/SnailShellStudyStage.tsx.
 *
 * This stage is selected from explicit scene semantics, not from the topic alone.
 * It turns shell-study narration into visible teaching objects: a traced spiral,
 * a real magnified stripe view, the shell opening, a tree-ring comparison, eggs,
 * and a numbered shell close-up. Keeping the source as data makes the generated
 * Remotion task self-contained and deterministic.
 */
export const SNAIL_SHELL_STUDY_STAGE_SOURCE = String.raw`import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile } from "remotion";

export type SnailShellStudyMode =
  | "spiral"
  | "magnifier"
  | "growth"
  | "tree-rings"
  | "chirality"
  | "hatch"
  | "count";

type StageProps = {
  mode: SnailShellStudyMode;
  frame: number;
  duration: number;
  accent: string;
  concept: string;
  badgeVisible?: boolean;
  comparison?: boolean;
  treeRingComparison?: boolean;
  houseAnalogy?: boolean;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const spiralPath = (turns: number, radius: number, offset = 0, cx = 200, cy = 205): string => {
  const points: string[] = [];
  for (let i = 0; i <= 100; i += 1) {
    const t = i / 100;
    const r = 7 + radius * t;
    const angle = offset + t * Math.PI * 2 * turns - Math.PI / 2;
    points.push((cx + Math.cos(angle) * r).toFixed(2) + "," + (cy + Math.sin(angle) * r).toFixed(2));
  }
  return "M " + points.join(" L ");
};

const SHELL_SPIRAL = spiralPath(3.15, 150);

const Label: React.FC<{ x: number; y: number; text: string; color?: string; width?: number }> = ({
  x,
  y,
  text,
  color = "#12303a",
  width,
}) => {
  const w = width || Math.max(150, Array.from(text).length * 32 + 48);
  return (
    <g transform={"translate(" + x + " " + y + ")"}>
      <rect x={-w / 2} y={-34} width={w} height={58} rx={20} fill="rgba(255,255,255,0.96)" stroke="#DCE7E4" strokeWidth={3} />
      <text x={0} y={7} textAnchor="middle" fontSize={29} fontWeight={900} fill={color}>
        {text}
      </text>
    </g>
  );
};

const ShellDiagram: React.FC<{
  x: number;
  y: number;
  r: number;
  id: string;
  striped?: boolean;
  trace?: number;
  rim?: number;
  numbered?: boolean;
}> = ({ x, y, r, id, striped = false, trace = 1, rim = 0, numbered = false }) => {
  const scale = r / 200;
  const rings = [48, 77, 106, 135, 162];
  return (
    <g transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
      <defs>
        <clipPath id={id + "-clip"}>
          <circle cx={200} cy={205} r={174} />
        </clipPath>
      </defs>
      <circle cx={200} cy={205} r={181} fill="rgba(255,255,255,0.96)" stroke="#8D6E63" strokeWidth={8} />
      <circle cx={200} cy={205} r={171} fill={striped ? "#F4D99B" : "#D9A66C"} />
      <g clipPath={"url(#" + id + "-clip)"}>
        {striped ? (
          <g fill="none" strokeLinecap="round">
            <path d="M20 105 C95 55 250 72 390 118" stroke="#8B542F" strokeWidth={48} />
            <path d="M15 182 C105 126 260 142 393 194" stroke="#FFF7DF" strokeWidth={38} />
            <path d="M20 260 C110 208 270 226 392 274" stroke="#C58A3D" strokeWidth={52} />
            <path d="M35 330 C130 286 280 300 380 334" stroke="#7A482C" strokeWidth={34} />
          </g>
        ) : (
          <g fill="none" stroke="#B67B45" strokeWidth={9} opacity={0.34}>
            <circle cx={200} cy={205} r={62} />
            <circle cx={200} cy={205} r={104} />
            <circle cx={200} cy={205} r={145} />
          </g>
        )}
        <path
          d={SHELL_SPIRAL}
          fill="none"
          stroke={striped ? "#6F4328" : "#7C4B2A"}
          strokeWidth={13}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - clamp(trace)}
        />
        <circle cx={200} cy={205} r={174} fill="none" stroke="#F6B94A" strokeWidth={18} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp(rim)} />
      </g>
      {numbered ? (
        <g>
          {rings.map((radius, index) => (
            <g key={radius}>
              <circle cx={200 + radius * 0.7} cy={205 - radius * 0.7} r={20} fill={index === rings.length - 1 ? "#F6B94A" : "#FFFFFF"} stroke="#6F4328" strokeWidth={3} />
              <text x={200 + radius * 0.7} y={213 - radius * 0.7} textAnchor="middle" fontSize={24} fontWeight={900} fill="#402A20">
                {index + 1}
              </text>
            </g>
          ))}
        </g>
      ) : null}
    </g>
  );
};

const TreeRings: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => {
  const rings = [34, 66, 99, 132, 164];
  return (
    <g transform={"translate(" + x + " " + y + ") scale(" + r / 200 + ")"}>
      <circle cx={200} cy={205} r={181} fill="#B98450" stroke="#7A4E2C" strokeWidth={9} />
      <circle cx={200} cy={205} r={169} fill="#E7BE83" />
      {rings.map((radius, index) => (
        <circle key={radius} cx={200} cy={205} r={radius} fill="none" stroke={index % 2 ? "#9A663A" : "#C28B50"} strokeWidth={9} />
      ))}
      <path d="M196 18 L214 62 M170 30 L182 74 M232 30 L220 74" stroke="#765038" strokeWidth={5} opacity={0.6} />
    </g>
  );
};

const Lollipop: React.FC<{ x: number; y: number; r: number; trace: number }> = ({ x, y, r, trace }) => (
  <g transform={"translate(" + x + " " + y + ") scale(" + r / 150 + ")"}>
    <rect x={137} y={126} width={22} height={180} rx={11} fill="#F4F1E8" stroke="#C9C3B6" strokeWidth={5} />
    <circle cx={148} cy={105} r={124} fill="#FFF8EC" stroke="#E8899D" strokeWidth={12} />
    <path d={spiralPath(3.1, 101, 0.35, 148, 105)} fill="none" stroke="#E76F8B" strokeWidth={18} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp(trace)} />
    <circle cx={108} cy={62} r={18} fill="rgba(255,255,255,0.7)" />
  </g>
);

const HouseExtension: React.FC<{ x: number; y: number; progress: number }> = ({ x, y, progress }) => (
  <g transform={"translate(" + x + " " + y + ")"}>
    <path d="M-150 60 L-150 -65 L-20 -145 L110 -65 L110 60 Z" fill="#FFE7BA" stroke="#8D6E63" strokeWidth={7} />
    <path d="M-165 -58 L-20 -155 L125 -58" fill="none" stroke="#D46C4E" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
    <rect x={-105} y={-40} width={58} height={66} rx={7} fill="#9FD8F2" stroke="#6C7C89" strokeWidth={5} />
    <rect x={-27} y={-18} width={58} height={78} rx={7} fill="#B9825B" />
    <rect x={110} y={-15} width={125} height={75} rx={8} fill="rgba(255,255,255,0.28)" stroke="#3E9B72" strokeWidth={7} strokeDasharray={12 + progress * 42} />
    <path d="M110 -18 L170 -75 L242 -18" fill="none" stroke="#3E9B72" strokeWidth={7} strokeDasharray={12 + progress * 42} />
    <path d="M-5 105 L285 105" stroke="#8D6E63" strokeWidth={7} strokeLinecap="round" />
  </g>
);

const Egg: React.FC<{ x: number; y: number; r: number; cracked?: boolean }> = ({ x, y, r, cracked = false }) => (
  <g transform={"translate(" + x + " " + y + ") scale(" + r / 70 + ")"}>
    <ellipse cx={0} cy={62} rx={65} ry={17} fill="rgba(52,67,54,0.14)" />
    <path d={cracked ? "M-54 28 L-36 -18 L-16 -51 L5 -69 L30 -53 L49 -22 L58 23 L47 52 L20 67 L-20 64 Z" : "M0 -76 C-48 -76 -66 -15 -60 28 C-54 69 -28 78 0 78 C31 78 55 67 60 28 C67 -16 47 -76 0 -76 Z"} fill="#F8F2DE" stroke="#B8AA8D" strokeWidth={6} />
    {cracked ? <path d="M-38 -8 L-13 7 L-29 26 L2 39 L18 19 L43 30" fill="none" stroke="#8D765B" strokeWidth={8} strokeLinejoin="round" /> : null}
  </g>
);

const SnailImage: React.FC<{ x: number; y: number; width: number; variant?: string; opacity?: number }> = ({
  x,
  y,
  width,
  variant = "generic",
  opacity = 1,
}) => (
  <foreignObject x={x - width / 2} y={y - width / 2} width={width} height={width}>
    <div style={{ width: "100%", height: "100%" }}>
      <Img
        src={staticFile("assets/lesson/animals/snail-" + variant + ".svg")}
        style={{ width: "100%", height: "100%", objectFit: "contain", opacity, filter: "drop-shadow(0 18px 18px rgba(40,55,35,0.18))" }}
      />
    </div>
  </foreignObject>
);

export const SnailShellStudyStage: React.FC<StageProps> = ({ mode, frame, duration, accent, concept, badgeVisible = false, comparison = false, treeRingComparison = false, houseAnalogy = true }) => {
  const fps = 30;
  const enter = spring({ frame, fps, config: { damping: 17, stiffness: 120 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const progress = interpolate(frame, [14, Math.max(40, duration - 24)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathe = 1 + Math.sin(frame / 25) * 0.008;
  const titleY = interpolate(enter, [0, 1], [24, 0]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <g transform={"translate(0 " + titleY + ")"}>
          {concept ? (
            <Label x={960} y={188} text={concept} color={accent} width={Math.max(440, Array.from(concept).length * 35 + 70)} />
          ) : null}
        </g>
        <g transform={"translate(960 500) scale(" + breathe + ") translate(-960 -500)"}>
          {mode === "spiral" ? (
            <g>
              <ShellDiagram x={665} y={485} r={245} id="spiral-main" trace={progress} rim={progress} />
              <Label x={655} y={778} text="从中间向外绕的螺旋线" color="#8A542C" width={460} />
              <circle cx={665} cy={485} r={13 + Math.sin(frame / 8) * 3} fill="#FFD166" />
              <path d="M914 330 C1060 265 1172 302 1235 392" fill="none" stroke="#F6B94A" strokeWidth={8} strokeLinecap="round" strokeDasharray={14 + progress * 50} />
              <Lollipop x={1460} y={493} r={205} trace={progress} />
              <Label x={1460} y={778} text="棒棒糖也有螺旋花纹" color="#C94F73" width={410} />
            </g>
          ) : null}
          {mode === "magnifier" ? (
            <g>
              {comparison ? (
                <g>
                  <SnailImage x={230} y={525} width={300} variant="generic" />
                  <SnailImage x={600} y={525} width={300} variant="striped" />
                  <SnailImage x={970} y={525} width={300} variant="white" />
                  <Label x={600} y={790} text="每只蜗牛的花纹都不一样" color="#267655" width={590} />
                </g>
              ) : (
                <g>
                  <SnailImage x={520} y={535} width={590} variant="striped" />
                  <Label x={520} y={790} text="小蜗牛" color="#8A542C" width={230} />
                </g>
              )}
              <path d="M1090 464 C1160 402 1210 382 1260 400" fill="none" stroke="#D7A33E" strokeWidth={8} strokeLinecap="round" strokeDasharray={15 + Math.sin(frame / 10) * 4} />
              <defs><clipPath id="magnifier-lens-clip" clipPathUnits="userSpaceOnUse"><circle cx={1390} cy={476} r={215} /></clipPath></defs>
              <g transform={"translate(" + interpolate(frame, [10, 68], [110, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) + " 0)"}>
                <g clipPath="url(#magnifier-lens-clip)">
                  <circle cx={1390} cy={476} r={226} fill="#F4D99B" />
                  <g transform="translate(1390 476)" fill="none" strokeLinecap="round">
                    <path d="M-300 -125 C-120 -205 120 -190 310 -100" stroke="#8B542F" strokeWidth={62} />
                    <path d="M-300 -25 C-110 -95 140 -85 310 -5" stroke="#F6D77A" strokeWidth={52} />
                    <path d="M-300 80 C-100 5 130 15 310 95" stroke="#2F2A28" strokeWidth={64} />
                    <path d="M-280 180 C-90 110 120 125 290 190" stroke="#7A482C" strokeWidth={46} />
                    <circle cx={0} cy={0} r={181} fill="none" stroke="#8D6E63" strokeWidth={12} />
                    <path d={spiralPath(3.15, 150, 0, 0, 0)} stroke="#6F4328" strokeWidth={14} />
                  </g>
                </g>
                <circle cx={1390} cy={476} r={237} fill="rgba(224,247,255,0.10)" stroke="#375A66" strokeWidth={22} />
                <rect x={1560} y={651} width={55} height={225} rx={25} transform="rotate(-42 1560 651)" fill="#F6B94A" stroke="#375A66" strokeWidth={13} />
                <path d="M1267 329 C1302 287 1360 267 1420 274" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={17} strokeLinecap="round" />
              </g>
              <Label x={1390} y={790} text="镜片里：棕色、黄色、黑色条纹" color="#8A542C" width={610} />
            </g>
          ) : null}
          {mode === "growth" ? (
            <g>
              <g transform={"translate(590 475) scale(" + interpolate(frame, [24, duration * 0.72], [0.86, 1.06], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) + ") translate(-590 -475)"}>
                <circle cx={590} cy={475} r={238} fill="none" stroke="#668274" strokeWidth={7} strokeDasharray={14} opacity={0.72} />
                <ShellDiagram x={590} y={475} r={218} id="growth-shell" trace={1} rim={progress} />
                <ellipse cx={772} cy={523} rx={58} ry={104} fill="#F7E6C6" stroke="#F6B94A" strokeWidth={13} />
                <ellipse cx={782} cy={523} rx={29} ry={73} fill="#72513B" />
              </g>
              <path d="M804 520 C860 480 902 482 948 520" fill="none" stroke="#F6B94A" strokeWidth={9} strokeLinecap="round" />
              <path d="M933 499 L960 522 L931 542" fill="none" stroke="#F6B94A" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
              <Label x={590} y={805} text="新壳从壳口边缘加上去" color="#267655" width={480} />
              {treeRingComparison ? (
                <g>
                  <text x={1010} y={470} textAnchor="middle" fontSize={126} fontWeight={900} fill="#D46C4E">≠</text>
                  <TreeRings x={1480} y={465} r={190} />
                  <Label x={1480} y={805} text="花纹不是年轮，不能猜年龄" color="#8A542C" width={540} />
                </g>
              ) : houseAnalogy ? (
                <g>
                  <HouseExtension x={1505} y={510} progress={progress} />
                  <Label x={1505} y={785} text="像给房子加盖新房间" color="#267655" width={430} />
                </g>
              ) : (
                <g>
                  <circle cx={1480} cy={475} r={176} fill="rgba(255,255,255,0.72)" stroke="#D7A33E" strokeWidth={7} />
                  {[52, 98, 144].map((radius, index) => {
                    const ringProgress = interpolate(
                      frame,
                      [duration * (0.12 + index * 0.1), duration * (0.28 + index * 0.1)],
                      [0, 1],
                      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                    );
                    const badgeX = 1480 + radius * 0.7;
                    const badgeY = 475 - radius * 0.7;
                    return (
                      <g key={radius} opacity={0.35 + ringProgress * 0.65}>
                        <circle
                          cx={1480}
                          cy={475}
                          r={radius}
                          fill="none"
                          stroke={index === 2 ? "#F6B94A" : "#D46C4E"}
                          strokeWidth={index === 2 ? 18 : 14}
                          strokeLinecap="round"
                          pathLength={1}
                          strokeDasharray={1}
                          strokeDashoffset={1 - ringProgress}
                        />
                        <g transform={"translate(" + badgeX + " " + badgeY + ") scale(" + (0.82 + ringProgress * 0.18) + ")"} opacity={ringProgress}>
                          <circle r={25} fill={index === 2 ? "#F6B94A" : "#FFFFFF"} stroke="#8A542C" strokeWidth={4} />
                          <text y={9} textAnchor="middle" fontSize={27} fontWeight={900} fill="#402A20">{index + 1}</text>
                        </g>
                      </g>
                    );
                  })}
                  <path d="M1480 475 L1600 355" fill="none" stroke="#267655" strokeWidth={9} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
                  <path d="M1575 365 L1603 350 L1608 382" fill="none" stroke="#267655" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
                  <Label x={1480} y={805} text="一圈比一圈大" color="#267655" width={430} />
                </g>
              )}
            </g>
          ) : null}
          {mode === "chirality" ? (
            <g>
              <rect x={245} y={265} width={570} height={500} rx={38} fill="rgba(255,255,255,0.82)" stroke="#7C6BD6" strokeWidth={7} />
              <rect x={1105} y={265} width={570} height={500} rx={38} fill="rgba(255,255,255,0.82)" stroke="#E58A2E" strokeWidth={7} />
              <ShellDiagram x={530} y={500} r={205} id="chirality-left" striped trace={1} />
              <g transform="translate(1390 0) scale(-1 1)">
                <ShellDiagram x={0} y={500} r={205} id="chirality-right" striped trace={1} />
              </g>
              <path d="M405 352 A150 150 0 0 1 642 352" fill="none" stroke="#7C6BD6" strokeWidth={12} strokeLinecap="round" />
              <path d="M617 329 L646 354 L611 361" fill="none" stroke="#7C6BD6" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1515 648 A150 150 0 0 1 1278 648" fill="none" stroke="#E58A2E" strokeWidth={12} strokeLinecap="round" />
              <path d="M1303 671 L1274 646 L1309 639" fill="none" stroke="#E58A2E" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
              <text x={960} y={525} textAnchor="middle" fontSize={92} fontWeight={900} fill="#267655">↔</text>
              <Label x={530} y={825} text="左旋：向左绕" color="#6654B8" width={360} />
              <Label x={1390} y={825} text="右旋：向右绕" color="#B66520" width={360} />
            </g>
          ) : null}
          {mode === "tree-rings" ? (
            <g>
              <TreeRings x={505} y={455} r={200} />
              <ShellDiagram x={1405} y={455} r={200} id="tree-compare-shell" striped trace={1} />
              <text x={960} y={455} textAnchor="middle" fontSize={126} fontWeight={900} fill="#D46C4E">≠</text>
              <Label x={505} y={805} text="大树年轮：通常一年一圈" color="#8A542C" width={510} />
              <Label x={1405} y={805} text="蜗牛花纹：不是年轮" color="#267655" width={450} />
            </g>
          ) : null}
          {mode === "hatch" ? (
            <g>
              <Egg x={410} y={505} r={115} />
              <Egg x={595} y={555} r={83} cracked />
              <SnailImage x={655} y={427} width={245} variant="generic" opacity={interpolate(frame, [18, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
              <Label x={480} y={745} text="从卵里孵出来" color="#8A542C" width={390} />
              <path d="M800 490 C905 432 1000 432 1085 490" fill="none" stroke="#F6B94A" strokeWidth={9} strokeLinecap="round" />
              <path d="M1062 464 L1090 491 L1057 515" fill="none" stroke="#F6B94A" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
              <SnailImage x={1230} y={525} width={265} />
              <SnailImage x={1580} y={480} width={455} />
              <Label x={1225} y={755} text="小蜗牛" width={230} />
              <Label x={1580} y={755} text="长大后（大小示意）" color="#267655" width={390} />
            </g>
          ) : null}
          {mode === "count" ? (
            <g>
              <SnailImage x={505} y={530} width={570} variant="striped" />
              <Label x={505} y={790} text={badgeVisible ? "做个小小科学家！" : "轻轻看，别碰它"} color="#267655" width={390} />
              <ShellDiagram x={1380} y={475} r={246} id="count-shell" striped trace={1} rim={1} numbered />
              <circle cx={1380} cy={475} r={269} fill="none" stroke="#F6B94A" strokeWidth={10 + Math.sin(frame / 9) * 3} />
              <path d="M1115 331 C1040 286 957 292 908 342" fill="none" stroke="#3E9B72" strokeWidth={8} strokeLinecap="round" />
              <Label x={1110} y={265} text="最外面是较新的一圈" color="#267655" width={450} />
              <Label x={1380} y={790} text="从外向内数一圈" color="#8A542C" width={370} />
              {badgeVisible ? (
                <g transform={"translate(845 365) scale(" + interpolate(frame, [duration * 0.65, duration * 0.65 + 20], [0.7, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) + ")"}>
                  <circle cx={0} cy={0} r={55} fill="#FFD166" stroke="#FFFFFF" strokeWidth={8} />
                  <path d="M-21 2 L-4 20 L26 -20" fill="none" stroke="#267655" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ) : null}
            </g>
          ) : null}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
`;
