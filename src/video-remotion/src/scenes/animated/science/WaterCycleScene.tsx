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

const STAGES = [
  { label: "蒸发", color: "#4FC3F7" },
  { label: "凝结", color: "#B0BEC5" },
  { label: "降雨", color: "#42A5F5" },
];

// SVG teardrop shape for water drops
const WaterDrop: React.FC<{
  x: number;
  y: number;
  size: number;
  opacity: number;
  color?: string;
}> = ({ x, y, size, opacity, color = "#4FC3F7" }) => (
  <svg
    style={{ position: "absolute", left: x, top: y, opacity, zIndex: 2 }}
    width={size}
    height={size * 1.4}
    viewBox="0 0 20 28"
    fill="none"
  >
    <defs>
      <linearGradient id={`drop-grad-${x}-${y}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.9} />
        <stop offset="100%" stopColor="#0288D1" stopOpacity={0.7} />
      </linearGradient>
    </defs>
    <path
      d="M10 0 C10 0 0 14 0 19 C0 24.5 4.5 28 10 28 C15.5 28 20 24.5 20 19 C20 14 10 0 10 0Z"
      fill={`url(#drop-grad-${x}-${y})`}
    />
    <ellipse cx="7" cy="18" rx="2.5" ry="3" fill="white" opacity={0.35} />
  </svg>
);

// SVG cloud with gradient
const CloudSVG: React.FC<{
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}> = ({ x, y, scale, width: svgW, height: svgH }) => (
  <svg
    style={{
      position: "absolute",
      left: x - svgW / 2,
      top: y - svgH / 2,
      transform: `scale(${scale})`,
      transformOrigin: "center center",
      zIndex: 3,
    }}
    width={svgW}
    height={svgH}
    viewBox="0 0 200 100"
    fill="none"
  >
    <defs>
      <linearGradient id="cloud-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FAFAFA" />
        <stop offset="100%" stopColor="#E0E0E0" />
      </linearGradient>
      <filter id="cloud-shadow">
        <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#90A4AE" floodOpacity={0.3} />
      </filter>
    </defs>
    <g filter="url(#cloud-shadow)">
      <ellipse cx="100" cy="60" rx="70" ry="30" fill="url(#cloud-grad)" />
      <ellipse cx="65" cy="50" rx="40" ry="35" fill="url(#cloud-grad)" />
      <ellipse cx="130" cy="48" rx="45" ry="33" fill="url(#cloud-grad)" />
      <ellipse cx="100" cy="40" rx="35" ry="30" fill="url(#cloud-grad)" />
    </g>
  </svg>
);

// Stage label badge
const StageBadge: React.FC<{
  label: string;
  color: string;
  active: boolean;
  x: number;
  y: number;
  opacity: number;
}> = ({ label, color, active, x, y, opacity }) => (
  <svg
    style={{ position: "absolute", left: x - 40, top: y, opacity, zIndex: 4 }}
    width={80}
    height={44}
    viewBox="0 0 80 44"
    fill="none"
  >
    <defs>
      <filter id={`badge-shadow-${label}`}>
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={color} floodOpacity={active ? 0.4 : 0.1} />
      </filter>
    </defs>
    <rect
      x="2"
      y="2"
      width={76}
      height={40}
      rx={20}
      fill={active ? color : PALETTE.white}
      stroke={active ? "transparent" : color}
      strokeWidth={2}
      filter={`url(#badge-shadow-${label})`}
    />
    <text
      x="40"
      y="28"
      textAnchor="middle"
      fontFamily={FONT_FAMILY}
      fontSize={active ? 20 : 16}
      fontWeight={active ? 900 : 700}
      fill={active ? PALETTE.white : PALETTE.dark}
    >
      {label}
    </text>
  </svg>
);

export const WaterCycleScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const speed = Math.max(0.5, Math.min(2, Number(params.speed) || 1));
  const showLabels = params.showLabels !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Layout
  const waterTop = height * 0.7;
  const skyTop = height * 0.15;
  const stageDuration = 75;
  const totalStages = 3;

  const adjustedStageDuration = Math.round(stageDuration / speed);
  const totalAnimFrames = adjustedStageDuration * totalStages;
  const currentStageFloat = Math.min(2.99, (frame - 20) / adjustedStageDuration);
  const currentStage = Math.max(0, Math.floor(currentStageFloat));
  const stageProgress = Math.max(0, currentStageFloat - currentStage);

  // Evaporation drops
  const dropCount = 6;
  const evapActive = currentStage >= 0;

  // Cloud
  const cloudX = width / 2;
  const cloudY = skyTop + 60;
  const condensationActive = currentStage >= 1;
  const cloudScale = condensationActive
    ? interpolate(stageProgress, [0, 1], [0.3, 1], { extrapolateRight: "clamp" })
    : (currentStage >= 2 ? 1 : 0.3);

  // Rain
  const rainActive = currentStage >= 2;
  const rainCount = 8;

  // Arrow indicators
  const arrowOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });

  // Stage labels
  const labelEntrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 10 });
  const labelOpacity = interpolate(labelEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  // Wavy water surface offset
  const waveOffset = interpolate(frame / fps, [0, Math.PI * 2], [0, Math.sin(frame / fps * 2) * 8]);

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* SVG Sky with gradient */}
      <svg
        style={{ position: "absolute", left: 0, top: skyTop, zIndex: 0 }}
        width={width}
        height={waterTop - skyTop}
        viewBox={`0 0 ${width} ${waterTop - skyTop}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#81D4FA" />
            <stop offset="50%" stopColor="#B3E5FC" />
            <stop offset="100%" stopColor="#E1F5FE" />
          </linearGradient>
        </defs>
        <rect width={width} height={waterTop - skyTop} fill="url(#sky-grad)" />
      </svg>

      {/* SVG Water body with wavy surface */}
      <svg
        style={{ position: "absolute", left: 0, top: waterTop - 20, zIndex: 0 }}
        width={width}
        height={height - waterTop + 20}
        viewBox={`0 0 ${width} ${height - waterTop + 20}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="water-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4FC3F7" stopOpacity={0.7} />
            <stop offset="40%" stopColor="#29B6F6" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#0277BD" stopOpacity={0.9} />
          </linearGradient>
          <filter id="water-shadow">
            <feDropShadow dx="0" dy="-3" stdDeviation="4" floodColor="#0288D1" floodOpacity={0.2} />
          </filter>
        </defs>
        {/* Wavy surface path */}
        <path
          d={(() => {
            const w = width;
            const h = 20 + waveOffset;
            const points: string[] = [];
            const segments = 20;
            for (let i = 0; i <= segments; i++) {
              const x = (i / segments) * w;
              const y = 20 + Math.sin((i / segments) * Math.PI * 4 + frame / fps * 2) * 6;
              if (i === 0) points.push(`M ${x} ${y}`);
              else points.push(`L ${x} ${y}`);
            }
            points.push(`L ${w} ${height - waterTop + 20}`);
            points.push(`L 0 ${height - waterTop + 20}`);
            points.push("Z");
            return points.join(" ");
          })()}
          fill="url(#water-grad)"
          filter="url(#water-shadow)"
        />
        {/* Water shimmer lines */}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={i}
            x1={width * 0.1 + i * width * 0.18}
            y1={40 + i * 15}
            x2={width * 0.1 + i * width * 0.18 + 30}
            y2={40 + i * 15}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* SVG Cycle arrows */}
      <svg
        style={{
          position: "absolute",
          left: width * 0.15,
          top: cloudY + 10,
          opacity: arrowOpacity * 0.6,
          zIndex: 1,
        }}
        width={width * 0.7}
        height={waterTop - cloudY - 30}
        viewBox={`0 0 ${width * 0.7} ${waterTop - cloudY - 30}`}
        fill="none"
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={`${data.accentColor}88`} />
          </marker>
        </defs>
        {/* Up arrow (evaporation) */}
        <path
          d={`M ${width * 0.15} ${waterTop - cloudY - 50} C ${width * 0.12} ${(waterTop - cloudY) * 0.4}, ${width * 0.18} ${(waterTop - cloudY) * 0.3}, ${width * 0.25} 30`}
          stroke={`${data.accentColor}55`}
          strokeWidth={3}
          strokeDasharray="8 4"
          markerEnd="url(#arrowhead)"
        />
        {/* Down arrow (rainfall) */}
        <path
          d={`M ${width * 0.55} 30 C ${width * 0.52} ${(waterTop - cloudY) * 0.3}, ${width * 0.58} ${(waterTop - cloudY) * 0.5}, ${width * 0.55} ${waterTop - cloudY - 50}`}
          stroke={`${data.accentColor}55`}
          strokeWidth={3}
          strokeDasharray="8 4"
          markerEnd="url(#arrowhead)"
        />
      </svg>

      {/* Evaporation drops (SVG teardrops) */}
      {evapActive && Array.from({ length: dropCount }).map((_, i) => {
        const baseX = width * 0.2 + (i / dropCount) * width * 0.6;
        const dropDelay = i * 5;
        const dropFrame = Math.max(0, frame - 20 - dropDelay);
        const cycleLen = adjustedStageDuration;
        const progress = (dropFrame % cycleLen) / cycleLen;

        const dropY = waterTop - progress * (waterTop - cloudY - 40);
        const dropOpacity = progress < 0.1 ? progress / 0.1 : progress > 0.9 ? (1 - progress) / 0.1 : 0.8;

        return (
          <WaterDrop
            key={`evap-${i}`}
            x={baseX + Math.sin(dropFrame / fps * 2 + i) * 8 - 6}
            y={dropY}
            size={12}
            opacity={currentStage === 0 ? dropOpacity : 0.3}
          />
        );
      })}

      {/* Cloud SVG */}
      <CloudSVG
        x={cloudX}
        y={cloudY}
        scale={cloudScale}
        width={160}
        height={80}
      />

      {/* Rain drops (SVG teardrops) */}
      {rainActive && Array.from({ length: rainCount }).map((_, i) => {
        const rainX = cloudX - 40 + i * 12;
        const rainDelay = i * 3;
        const rainFrame = Math.max(0, frame - 20 - adjustedStageDuration * 2 - rainDelay);
        const cycleLen = adjustedStageDuration;
        const progress = (rainFrame % cycleLen) / cycleLen;
        const rainY = cloudY + 30 + progress * (waterTop - cloudY - 30);
        const rainOpacity = progress > 0.85 ? (1 - progress) / 0.15 : 0.8;

        return (
          <WaterDrop
            key={`rain-${i}`}
            x={rainX + Math.sin(rainFrame / fps * 3 + i) * 4 - 4}
            y={rainY}
            size={10}
            opacity={rainOpacity}
            color="#42A5F5"
          />
        );
      })}

      {/* Stage labels as SVG badges */}
      {showLabels && (
        <div style={{
          position: "absolute",
          bottom: 30,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 50,
          zIndex: 4,
          opacity: labelOpacity,
        }}>
          {STAGES.map((stage, i) => (
            <div key={i} style={{ opacity: i <= currentStage ? 1 : 0.3 }}>
              <StageBadge
                label={stage.label}
                color={stage.color}
                active={i === currentStage}
                x={40}
                y={0}
                opacity={1}
              />
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};
