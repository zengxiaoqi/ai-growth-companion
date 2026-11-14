import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../../../components/BackgroundBubbles";
import { SPRING_CONFIGS } from "../../../theme/animations";
import { PALETTE } from "../../../theme/colors";
import { FONT_FAMILY } from "../../../theme/fonts";
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

const COLORS = [
  { name: "红", hex: "#F44336" },
  { name: "橙", hex: "#FF9800" },
  { name: "黄", hex: "#FFEB3B" },
  { name: "绿", hex: "#4CAF50" },
  { name: "青", hex: "#00BCD4" },
  { name: "蓝", hex: "#2196F3" },
  { name: "紫", hex: "#9C27B0" },
];

export const LightRefractionScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const speed = Math.max(0.5, Math.min(2, Number(params.speed) || 1));
  const showLabels = params.showLabels !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const entrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 5 });

  const sunX = width * 0.12;
  const sunY = height * 0.3;
  const dropX = width * 0.46;
  const dropY = height * 0.45;
  const rightX = width * 0.92;

  const rayAngle = (frame / fps) * 24;
  const dropBob = Math.sin(frame / 12) * 5;
  const beamProg = interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // photon traveling along the white beam (loops)
  const beamT = ((frame * speed) % 60) / 60;
  const beamX = sunX + (dropX - sunX) * beamT;
  const beamY = sunY + (dropY - sunY) * beamT;

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      <svg style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lr-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B3E5FC" />
            <stop offset="100%" stopColor="#E1F5FE" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill="url(#lr-sky)" />
      </svg>

      {/* Sun */}
      <svg style={{ position: "absolute", left: sunX - 60, top: sunY - 60, zIndex: 2 }} width={120} height={120} viewBox="0 0 120 120">
        <g transform={`rotate(${rayAngle} 60 60)`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={i} x1={60} y1={6} x2={60} y2={20} stroke="#FFD54F" strokeWidth={5} strokeLinecap="round" transform={`rotate(${i * 45} 60 60)`} />
          ))}
        </g>
        <circle cx={60} cy={60} r={26} fill="#FFCA28" />
      </svg>

      {/* White beam sun -> droplet */}
      <svg style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={sunX} y1={sunY} x2={sunX + (dropX - sunX) * beamProg} y2={sunY + (dropY - sunY) * beamProg} stroke="#FFFFFF" strokeWidth={10} strokeLinecap="round" opacity={0.9} />
        <circle cx={beamX} cy={beamY} r={7} fill="#FFF59D" opacity={beamProg} />
      </svg>

      {/* Droplet */}
      <svg style={{ position: "absolute", left: dropX - 50, top: dropY - 60 + dropBob, zIndex: 3, transform: `scale(${0.7 + 0.3 * entrance})`, transformOrigin: "center center" }} width={100} height={120} viewBox="0 0 100 120">
        <defs>
          <linearGradient id="lr-drop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#81D4FA" />
            <stop offset="100%" stopColor="#0288D1" />
          </linearGradient>
        </defs>
        <path d="M50 4 C50 4 12 56 12 80 C12 102 29 116 50 116 C71 116 88 102 88 80 C88 56 50 4 50 4Z" fill="url(#lr-drop)" opacity={0.9} />
        <ellipse cx={36} cy={78} rx={9} ry={13} fill="#FFFFFF" opacity={0.4} />
      </svg>

      {/* Seven refracted rays droplet -> right */}
      <svg style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {COLORS.map((c, i) => {
          const spread = (i - 3) / 3; // -1..1
          const endY = dropY + spread * height * 0.3;
          const start = 40 + i * 6;
          const prog = interpolate(frame, [start, start + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const ex = dropX + (rightX - dropX) * prog;
          const ey = dropY + (endY - dropY) * prog;
          const t = (((frame * speed) + i * 7) % 50) / 50;
          const px = dropX + (rightX - dropX) * t;
          const py = dropY + (endY - dropY) * t;
          return (
            <g key={c.name}>
              <line x1={dropX} y1={dropY} x2={ex} y2={ey} stroke={c.hex} strokeWidth={6} strokeLinecap="round" opacity={0.9} />
              {prog > 0.9 && <circle cx={px} cy={py} r={5} fill={c.hex} />}
              {prog > 0.9 && (
                <text x={rightX + 4} y={endY + 8} fontFamily={FONT_FAMILY} fontSize={24} fontWeight={900} fill={c.hex}>{c.name}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* labels */}
      {showLabels && (
        <>
          <div style={{ position: "absolute", left: sunX - 40, top: sunY + 70, zIndex: 4, fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 28, color: PALETTE.dark }}>阳光</div>
          <div style={{ position: "absolute", left: dropX - 44, top: dropY + 70, zIndex: 4, fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 28, color: PALETTE.dark }}>小水珠</div>
          <div style={{ position: "absolute", right: width * 0.04, top: height * 0.04, zIndex: 4, fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 28, color: PALETTE.dark }}>七色光</div>
        </>
      )}
    </AbsoluteFill>
  );
};