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
  { label: "白天", skyColor: "#87CEEB", groundColor: "#90EE90", body: "☀️", bodySize: 60, bodyArcY: 0.2 },
  { label: "黄昏", skyColor: "#FF8C42", groundColor: "#C8A96E", body: "☀️", bodySize: 50, bodyArcY: 0.35 },
  { label: "夜晚", skyColor: "#1A237E", groundColor: "#2E4053", body: "🌙", bodySize: 50, bodyArcY: 0.15 },
  { label: "黎明", skyColor: "#FFB74D", groundColor: "#A8C68F", body: "☀️", bodySize: 45, bodyArcY: 0.3 },
];

export const DayNightCycleScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const rotationSpeed = Math.max(0.5, Math.min(3, Number(params.rotationSpeed) || 1));
  const showLabels = params.showLabels !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Phase timing
  const framesPerPhase = Math.round(90 / rotationSpeed); // 3s per phase at speed=1
  const totalPhaseFrames = framesPerPhase * PHASES.length;
  const cycleFrame = frame % totalPhaseFrames;
  const phaseFloat = cycleFrame / framesPerPhase;
  const currentPhase = Math.floor(phaseFloat);
  const nextPhase = (currentPhase + 1) % PHASES.length;
  const crossfade = phaseFloat - currentPhase;

  const phase = PHASES[currentPhase];
  const nextPhaseData = PHASES[nextPhase];

  // Interpolate sky color
  const skyR = interpolateColor(crossfade, hexToRgb(phase.skyColor), hexToRgb(nextPhaseData.skyColor));
  const skyG = interpolateColor(crossfade, hexToRgb(phase.skyColor), hexToRgb(nextPhaseData.skyColor), 1);
  const skyB = interpolateColor(crossfade, hexToRgb(phase.skyColor), hexToRgb(nextPhaseData.skyColor), 2);
  const skyColor = `rgb(${skyR}, ${skyG}, ${skyB})`;

  const groundY = height * 0.75;

  // Celestial body position (arc across sky)
  const bodyArcProgress = crossfade;
  const bodyX = width * 0.2 + bodyArcProgress * width * 0.6;
  const arcHeight = height * phase.bodyArcY;
  const bodyY = groundY - 100 - Math.sin(bodyArcProgress * Math.PI) * arcHeight;

  // Stars (visible during night phase)
  const isNight = currentPhase === 2 || (currentPhase === 1 && crossfade > 0.5) || (currentPhase === 3 && crossfade < 0.5);
  const starOpacity = isNight
    ? interpolate(crossfade, [0.4, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  const stars = Array.from({ length: 8 }).map((_, i) => ({
    x: width * 0.1 + (i % 4) * width * 0.22 + Math.sin(i * 1.5) * 30,
    y: 50 + Math.floor(i / 4) * 80 + Math.cos(i * 2) * 20,
  }));

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      {/* Sky gradient */}
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: groundY,
        backgroundColor: skyColor,
        transition: "background-color 0.5s",
      }} />

      {/* Stars */}
      {stars.map((star, i) => (
        <div key={i} style={{
          position: "absolute",
          left: star.x,
          top: star.y,
          fontSize: 16 + (i % 3) * 8,
          opacity: starOpacity * (0.5 + Math.sin(frame / fps * 3 + i) * 0.3),
          zIndex: 1,
        }}>
          ⭐
        </div>
      ))}

      {/* Celestial body (sun or moon) */}
      <div style={{
        position: "absolute",
        left: bodyX - phase.bodySize / 2,
        top: bodyY,
        fontSize: phase.bodySize,
        lineHeight: 1,
        zIndex: 2,
      }}>
        {phase.body}
      </div>

      {/* Ground */}
      <div style={{
        position: "absolute",
        left: 0,
        top: groundY,
        width: "100%",
        height: height - groundY,
        backgroundColor: phase.groundColor,
        zIndex: 1,
      }} />

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
            }}>
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
