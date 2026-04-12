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
  { label: "蒸发", emoji: "💧", color: "#4FC3F7" },
  { label: "凝结", emoji: "☁️", color: "#B0BEC5" },
  { label: "降雨", emoji: "🌧️", color: "#42A5F5" },
];

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
  const stageDuration = 75; // 2.5s per stage
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

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Sky */}
      <div style={{
        position: "absolute",
        left: 0,
        top: skyTop,
        width: "100%",
        height: waterTop - skyTop,
        background: "linear-gradient(180deg, #B3E5FC 0%, #E1F5FE 100%)",
        zIndex: 0,
      }} />

      {/* Water body */}
      <div style={{
        position: "absolute",
        left: 0,
        top: waterTop,
        width: "100%",
        height: height - waterTop,
        background: "linear-gradient(180deg, #4FC3F7 0%, #0288D1 100%)",
        opacity: 0.6,
        zIndex: 0,
      }} />

      {/* Evaporation drops */}
      {evapActive && Array.from({ length: dropCount }).map((_, i) => {
        const baseX = width * 0.2 + (i / dropCount) * width * 0.6;
        const dropDelay = i * 5;
        const dropFrame = Math.max(0, frame - 20 - dropDelay);
        const cycleLen = adjustedStageDuration;
        const progress = (dropFrame % cycleLen) / cycleLen;

        const dropY = waterTop - progress * (waterTop - cloudY - 40);
        const dropOpacity = progress < 0.1 ? progress / 0.1 : progress > 0.9 ? (1 - progress) / 0.1 : 0.8;

        return (
          <div key={`evap-${i}`} style={{
            position: "absolute",
            left: baseX + Math.sin(dropFrame / fps * 2 + i) * 8,
            top: dropY,
            fontSize: 20,
            opacity: currentStage === 0 ? dropOpacity : 0.3,
            zIndex: 2,
          }}>
            💧
          </div>
        );
      })}

      {/* Cloud */}
      <div style={{
        position: "absolute",
        left: cloudX - 60,
        top: cloudY - 30,
        transform: `scale(${cloudScale})`,
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ fontSize: 80, lineHeight: 1 }}>☁️</span>
      </div>

      {/* Rain drops */}
      {rainActive && Array.from({ length: rainCount }).map((_, i) => {
        const rainX = cloudX - 40 + i * 12;
        const rainDelay = i * 3;
        const rainFrame = Math.max(0, frame - 20 - adjustedStageDuration * 2 - rainDelay);
        const cycleLen = adjustedStageDuration;
        const progress = (rainFrame % cycleLen) / cycleLen;
        const rainY = cloudY + 30 + progress * (waterTop - cloudY - 30);
        const rainOpacity = progress > 0.85 ? (1 - progress) / 0.15 : 0.8;

        return (
          <div key={`rain-${i}`} style={{
            position: "absolute",
            left: rainX + Math.sin(rainFrame / fps * 3 + i) * 4,
            top: rainY,
            fontSize: 16,
            opacity: rainOpacity,
            zIndex: 2,
          }}>
            💧
          </div>
        );
      })}

      {/* Cycle arrows (curved lines simulated with CSS) */}
      <div style={{
        position: "absolute",
        left: width * 0.15,
        top: cloudY + 10,
        width: width * 0.7,
        height: waterTop - cloudY - 30,
        border: `3px dashed ${data.accentColor}44`,
        borderRadius: "50%",
        opacity: arrowOpacity * 0.5,
        zIndex: 1,
      }} />

      {/* Stage labels */}
      {showLabels && (
        <div style={{
          position: "absolute",
          bottom: 30,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 40,
          zIndex: 3,
          opacity: labelOpacity,
        }}>
          {STAGES.map((stage, i) => (
            <div key={i} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              opacity: i <= currentStage ? 1 : 0.3,
            }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{stage.emoji}</span>
              <span style={{
                fontFamily: FONT_FAMILY,
                fontSize: 22,
                fontWeight: 800,
                color: i === currentStage ? data.accentColor : PALETTE.dark,
              }}>
                {stage.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};
