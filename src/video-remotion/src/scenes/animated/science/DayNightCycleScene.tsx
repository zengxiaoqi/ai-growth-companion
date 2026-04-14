import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../../../components/BackgroundBubbles";
import { PALETTE } from "../../../theme/colors";
import { FONT_FAMILY } from "../../../theme/fonts";
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

const PHASES = [
  { label: "白天", skyTop: "#4DA6FF", skyBottom: "#87CEEB", groundColor: "#90EE90", groundDark: "#6BBF6B", bodyType: "sun" as const, bodyArcY: 0.2 },
  { label: "黄昏", skyTop: "#FF6B35", skyBottom: "#FF8C42", groundColor: "#C8A96E", groundDark: "#A08050", bodyType: "sun" as const, bodyArcY: 0.35 },
  { label: "夜晚", skyTop: "#0D1B3E", skyBottom: "#1A237E", groundColor: "#2E4053", groundDark: "#1C2A38", bodyType: "moon" as const, bodyArcY: 0.15 },
  { label: "黎明", skyTop: "#FFB74D", skyBottom: "#FF9800", groundColor: "#A8C68F", groundDark: "#8BA670", bodyType: "sun" as const, bodyArcY: 0.3 },
];

/* ---------- SVG Sub-components ---------- */

const SunSVG: React.FC<{
  cx: number;
  cy: number;
  radius: number;
  frame: number;
  fps: number;
  color: string;
}> = ({ cx, cy, radius, frame, fps, color }) => (
  <g>
    {/* Outer glow */}
    <circle cx={cx} cy={cy} r={radius * 1.6} fill={color} opacity={0.15} />
    <circle cx={cx} cy={cy} r={radius * 1.3} fill={color} opacity={0.2} />
    {/* Rotating rays */}
    {Array.from({ length: 12 }).map((_, i) => {
      const angle = (i / 12) * Math.PI * 2 + frame / fps * 0.4;
      const innerR = radius * 1.1;
      const outerR = radius * 1.5 + Math.sin(frame / fps * 2 + i) * 4;
      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;
      return (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      );
    })}
    {/* Sun body */}
    <circle cx={cx} cy={cy} r={radius} fill={color} />
    <circle cx={cx - radius * 0.25} cy={cy - radius * 0.15} r={radius * 0.12} fill="rgba(255,255,255,0.5)" />
  </g>
);

const MoonSVG: React.FC<{
  cx: number;
  cy: number;
  radius: number;
  frame: number;
  fps: number;
}> = ({ cx, cy, radius, frame, fps }) => (
  <g>
    {/* Moon glow */}
    <circle cx={cx} cy={cy} r={radius * 1.5} fill="#E8E8FF" opacity={0.1} />
    {/* Moon body */}
    <circle cx={cx} cy={cy} r={radius} fill="#FFFACD" />
    {/* Crescent shadow */}
    <circle cx={cx + radius * 0.35} cy={cy - radius * 0.1} r={radius * 0.8} fill="#E8DFC0" opacity={0.3} />
    {/* Craters */}
    <circle cx={cx - radius * 0.3} cy={cy - radius * 0.2} r={radius * 0.12} fill="#E0D8B0" opacity={0.4} />
    <circle cx={cx + radius * 0.15} cy={cy + radius * 0.3} r={radius * 0.08} fill="#E0D8B0" opacity={0.35} />
    <circle cx={cx - radius * 0.1} cy={cy + radius * 0.15} r={radius * 0.06} fill="#E0D8B0" opacity={0.3} />
    <circle cx={cx + radius * 0.3} cy={cy - radius * 0.25} r={radius * 0.05} fill="#E0D8B0" opacity={0.25} />
  </g>
);

const StarFieldSVG: React.FC<{
  width: number;
  height: number;
  groundY: number;
  opacity: number;
  frame: number;
  fps: number;
}> = ({ width, height, groundY, opacity, frame, fps }) => {
  const stars = Array.from({ length: 12 }).map((_, i) => ({
    x: width * 0.08 + (i % 4) * width * 0.24 + Math.sin(i * 1.5) * 25,
    y: 40 + Math.floor(i / 4) * 70 + Math.cos(i * 2) * 18,
    size: 2 + (i % 3) * 1.5,
    twinkleSpeed: 2 + (i % 3),
  }));

  return (
    <g opacity={opacity}>
      {stars.map((star, i) => {
        const twinkle = 0.4 + Math.sin(frame / fps * star.twinkleSpeed + i * 1.7) * 0.4;
        return (
          <g key={i} transform={`translate(${star.x}, ${star.y})`} opacity={twinkle}>
            {/* 4-point star shape */}
            <path
              d={`M0,${-star.size} C${star.size * 0.15},${-star.size * 0.15} ${star.size * 0.15},${-star.size * 0.15} ${star.size},0 C${star.size * 0.15},${star.size * 0.15} ${star.size * 0.15},${star.size * 0.15} 0,${star.size} C${-star.size * 0.15},${star.size * 0.15} ${-star.size * 0.15},${star.size * 0.15} ${-star.size},0 C${-star.size * 0.15},${-star.size * 0.15} ${-star.size * 0.15},${-star.size * 0.15} 0,${-star.size} Z`}
              fill="#FFFACD"
            />
          </g>
        );
      })}
    </g>
  );
};

const CloudSVG: React.FC<{
  cx: number;
  cy: number;
  scale: number;
  opacity: number;
}> = ({ cx, cy, scale, opacity }) => (
  <g transform={`translate(${cx}, ${cy}) scale(${scale})`} opacity={opacity}>
    <ellipse cx={0} cy={0} rx={35} ry={20} fill="white" />
    <ellipse cx={-25} cy={5} rx={22} ry={15} fill="white" opacity={0.85} />
    <ellipse cx={25} cy={5} rx={26} ry={17} fill="white" opacity={0.85} />
    <ellipse cx={-10} cy={-10} rx={18} ry={14} fill="white" opacity={0.9} />
    <ellipse cx={12} cy={-8} rx={20} ry={14} fill="white" opacity={0.9} />
  </g>
);

const OwlSVG: React.FC<{
  x: number;
  y: number;
  scale: number;
  opacity: number;
  frame: number;
  fps: number;
}> = ({ x, y, scale, opacity, frame, fps }) => {
  const blinkCycle = Math.sin(frame / fps * 0.5);
  const eyeOpen = blinkCycle > -0.9 ? 1 : 0.1;

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={opacity}>
      {/* Body */}
      <ellipse cx={0} cy={0} rx={16} ry={20} fill="#8B6914" />
      {/* Belly */}
      <ellipse cx={0} cy={6} rx={10} ry={12} fill="#D2B48C" />
      {/* Ear tufts */}
      <path d="M-10,-18 L-14,-28 L-4,-20" fill="#8B6914" />
      <path d="M10,-18 L14,-28 L4,-20" fill="#8B6914" />
      {/* Eyes */}
      <circle cx={-6} cy={-6} r={6} fill="white" />
      <circle cx={6} cy={-6} r={6} fill="white" />
      <ellipse cx={-6} cy={-6} rx={3} ry={3 * eyeOpen} fill="#333" />
      <ellipse cx={6} cy={-6} rx={3} ry={3 * eyeOpen} fill="#333" />
      <circle cx={-5} cy={-7} r={1} fill="white" />
      <circle cx={7} cy={-7} r={1} fill="white" />
      {/* Beak */}
      <path d="M-2,-1 L0,3 L2,-1" fill="#FF8C00" />
      {/* Wing */}
      <path d="M-16,0 C-20,8 -14,16 -8,14 L-8,4 Z" fill="#6B4E0A" opacity={0.7} />
      <path d="M16,0 C20,8 14,16 8,14 L8,4 Z" fill="#6B4E0A" opacity={0.7} />
      {/* Feet */}
      <path d="M-6,18 L-10,22 M-6,18 L-6,23 M-6,18 L-2,22" stroke="#FF8C00" strokeWidth={1.5} fill="none" />
      <path d="M6,18 L2,22 M6,18 L6,23 M6,18 L10,22" stroke="#FF8C00" strokeWidth={1.5} fill="none" />
    </g>
  );
};

const SilhouetteSVG: React.FC<{
  width: number;
  groundY: number;
}> = ({ width, groundY }) => (
  <g opacity={0.3}>
    {/* Buildings */}
    <rect x={width * 0.05} y={groundY - 50} width={30} height={50} rx={2} fill="#333" />
    <rect x={width * 0.08} y={groundY - 70} width={25} height={70} rx={2} fill="#333" />
    <rect x={width * 0.11} y={groundY - 40} width={35} height={40} rx={2} fill="#333" />
    {/* Tree */}
    <rect x={width * 0.85} y={groundY - 50} width={8} height={50} fill="#333" />
    <circle cx={width * 0.85 + 4} cy={groundY - 60} r={20} fill="#333" />
    {/* House */}
    <rect x={width * 0.7} y={groundY - 35} width={40} height={35} fill="#333" />
    <polygon points={`${width * 0.7},${groundY - 35} ${width * 0.72 + 20},${groundY - 55} ${width * 0.7 + 40},${groundY - 35}`} fill="#333" />
    {/* Fence */}
    {Array.from({ length: 5 }).map((_, i) => (
      <rect key={i} x={width * 0.5 + i * 15} y={groundY - 20} width={4} height={20} fill="#333" />
    ))}
    <rect x={width * 0.5} y={groundY - 16} width={64} height={3} fill="#333" />
    <rect x={width * 0.5} y={groundY - 8} width={64} height={3} fill="#333" />
  </g>
);

/* ---------- Main Scene ---------- */

export const DayNightCycleScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const rotationSpeed = Math.max(0.5, Math.min(3, Number(params.rotationSpeed) || 1));
  const showLabels = params.showLabels !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Phase timing
  const framesPerPhase = Math.round(90 / rotationSpeed);
  const totalPhaseFrames = framesPerPhase * PHASES.length;
  const cycleFrame = frame % totalPhaseFrames;
  const phaseFloat = cycleFrame / framesPerPhase;
  const currentPhase = Math.floor(phaseFloat);
  const nextPhase = (currentPhase + 1) % PHASES.length;
  const crossfade = phaseFloat - currentPhase;

  const phase = PHASES[currentPhase];
  const nextPhaseData = PHASES[nextPhase];

  // Interpolate sky color
  const skyRTop = interpolateColor(crossfade, hexToRgb(phase.skyTop), hexToRgb(nextPhaseData.skyTop), 0);
  const skyGTop = interpolateColor(crossfade, hexToRgb(phase.skyTop), hexToRgb(nextPhaseData.skyTop), 1);
  const skyBTop = interpolateColor(crossfade, hexToRgb(phase.skyTop), hexToRgb(nextPhaseData.skyTop), 2);
  const skyRBot = interpolateColor(crossfade, hexToRgb(phase.skyBottom), hexToRgb(nextPhaseData.skyBottom), 0);
  const skyGBot = interpolateColor(crossfade, hexToRgb(phase.skyBottom), hexToRgb(nextPhaseData.skyBottom), 1);
  const skyBBot = interpolateColor(crossfade, hexToRgb(phase.skyBottom), hexToRgb(nextPhaseData.skyBottom), 2);

  const skyTopColor = `rgb(${skyRTop}, ${skyGTop}, ${skyBTop})`;
  const skyBottomColor = `rgb(${skyRBot}, ${skyGBot}, ${skyBBot})`;

  const groundR = interpolateColor(crossfade, hexToRgb(phase.groundColor), hexToRgb(nextPhaseData.groundColor), 0);
  const groundG = interpolateColor(crossfade, hexToRgb(phase.groundColor), hexToRgb(nextPhaseData.groundColor), 1);
  const groundB = interpolateColor(crossfade, hexToRgb(phase.groundColor), hexToRgb(nextPhaseData.groundColor), 2);
  const groundColor = `rgb(${groundR}, ${groundG}, ${groundB})`;

  const groundY = height * 0.75;

  // Celestial body position (arc across sky)
  const bodyArcProgress = crossfade;
  const bodyX = width * 0.2 + bodyArcProgress * width * 0.6;
  const arcHeight = height * phase.bodyArcY;
  const bodyY = groundY - 120 - Math.sin(bodyArcProgress * Math.PI) * arcHeight;

  // Stars visibility
  const isNight = currentPhase === 2 || (currentPhase === 1 && crossfade > 0.5) || (currentPhase === 3 && crossfade < 0.5);
  const starOpacity = isNight
    ? interpolate(crossfade, [0.4, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  // Cloud drifts during day
  const isDaytime = currentPhase === 0 || currentPhase === 3;
  const cloudOpacity = isDaytime ? interpolate(crossfade, [0, 0.3, 0.7, 1], [0, 0.7, 0.7, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const cloudX = width * 0.3 + Math.sin(frame / fps * 0.15) * width * 0.15;

  // Owl at night
  const owlOpacity = currentPhase === 2 ? interpolate(crossfade, [0, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;

  // Sun color changes at dusk/dawn
  const sunColor = currentPhase === 1 ? "#FF6B35" : currentPhase === 3 ? "#FFB347" : "#FFD700";

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}>
        <defs>
          <linearGradient id="daynight-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTopColor} />
            <stop offset="100%" stopColor={skyBottomColor} />
          </linearGradient>
          <linearGradient id="daynight-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={groundColor} />
            <stop offset="100%" stopColor={darkenColor(groundColor, 25)} />
          </linearGradient>
          <filter id="celestial-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={6} />
          </filter>
        </defs>

        {/* Sky gradient */}
        <rect x={0} y={0} width={width} height={groundY} fill="url(#daynight-sky)" />

        {/* Stars */}
        <StarFieldSVG width={width} height={height} groundY={groundY} opacity={starOpacity} frame={frame} fps={fps} />

        {/* Silhouettes on horizon */}
        <SilhouetteSVG width={width} groundY={groundY} />

        {/* Celestial body */}
        {phase.bodyType === "sun" ? (
          <SunSVG cx={bodyX} cy={bodyY} radius={28} frame={frame} fps={fps} color={sunColor} />
        ) : (
          <MoonSVG cx={bodyX} cy={bodyY} radius={26} frame={frame} fps={fps} />
        )}

        {/* Cloud */}
        <CloudSVG cx={cloudX} cy={groundY - 160} scale={1.2} opacity={cloudOpacity} />

        {/* Owl */}
        <OwlSVG
          x={width * 0.85 + 4}
          y={groundY - 80}
          scale={0.9}
          opacity={owlOpacity}
          frame={frame}
          fps={fps}
        />

        {/* Ground */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill="url(#daynight-ground)" />
      </svg>

      <BackgroundBubbles width={width} height={height} />

      {/* Phase labels */}
      {showLabels && (
        <div style={{
          position: "absolute",
          bottom: 30,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 20,
          zIndex: 5,
        }}>
          {PHASES.map((p, i) => (
            <div key={i} style={{
              fontFamily: FONT_FAMILY,
              fontSize: 24,
              fontWeight: i === currentPhase ? 900 : 700,
              color: i === currentPhase ? data.accentColor : PALETTE.dark,
              opacity: i === currentPhase ? 1 : 0.35,
              padding: "4px 16px",
              borderRadius: 8,
              backgroundColor: i === currentPhase ? `${data.accentColor}15` : "transparent",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <svg width={20} height={20} viewBox="0 0 20 20">
                {p.bodyType === "sun" ? (
                  <>
                    <circle cx={10} cy={10} r={6} fill="#FFD700" />
                    {Array.from({ length: 6 }).map((_, j) => {
                      const a = (j / 6) * Math.PI * 2;
                      return <line key={j} x1={10 + Math.cos(a) * 8} y1={10 + Math.sin(a) * 8} x2={10 + Math.cos(a) * 10} y2={10 + Math.sin(a) * 10} stroke="#FFD700" strokeWidth={1.5} strokeLinecap="round" />;
                    })}
                  </>
                ) : (
                  <>
                    <circle cx={10} cy={10} r={7} fill="#FFFACD" />
                    <circle cx={13} cy={8} r={5.5} fill="#0D1B3E" />
                  </>
                )}
              </svg>
              {p.label}
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function interpolateColor(
  t: number,
  from: [number, number, number],
  to: [number, number, number],
  channel: 0 | 1 | 2 = 0,
): number {
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(from[channel] + (to[channel] - from[channel]) * clamped);
}

function darkenColor(colorStr: string, amount: number): string {
  const match = colorStr.match(/\d+/g);
  if (!match || match.length < 3) return colorStr;
  const r = Math.max(0, parseInt(match[0]) - amount);
  const g = Math.max(0, parseInt(match[1]) - amount);
  const b = Math.max(0, parseInt(match[2]) - amount);
  return `rgb(${r}, ${g}, ${b})`;
}
