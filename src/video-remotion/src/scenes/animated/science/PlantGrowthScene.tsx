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

const STAGE_LABELS = ["种子", "发芽", "长叶", "开花"];
const STAGE_EMOJI = ["🌰", "🌱", "🍃", "🌸"];

export const PlantGrowthScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const stages = Math.max(2, Math.min(5, Number(params.stages) || 4));

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Layout
  const soilTop = height * 0.75;
  const soilHeight = height * 0.15;
  const plantBaseY = soilTop;
  const centerX = width / 2;

  // Stage timing
  const stageDuration = 60; // 2s per stage
  const currentStageFloat = Math.min(stages - 0.01, Math.max(0, (frame - 20) / stageDuration));
  const currentStage = Math.floor(currentStageFloat);
  const stageProgress = currentStageFloat - currentStage;

  // Sun
  const sunX = width * 0.8;
  const sunY = 80;
  const sunScale = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });

  // Rain drops
  const rainDrops = 4;

  // Stem height based on stage
  const maxStemH = 250;
  const stemProgress = Math.min(1, currentStageFloat / (stages - 1));
  const stemH = stemProgress * maxStemH;

  // Stage label
  const labelIdx = Math.min(stages - 1, currentStage);

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Sun */}
      <div style={{
        position: "absolute",
        left: sunX - 30,
        top: sunY,
        fontSize: 60,
        lineHeight: 1,
        transform: `scale(${sunScale})`,
        zIndex: 2,
      }}>
        ☀️
      </div>

      {/* Rain drops */}
      {Array.from({ length: rainDrops }).map((_, i) => {
        const rx = centerX - 60 + i * 35;
        const ry = 60 + ((frame * 2 + i * 30) % (soilTop - 80));
        return (
          <div key={i} style={{
            position: "absolute",
            left: rx + Math.sin(frame / fps + i) * 5,
            top: ry,
            fontSize: 16,
            opacity: 0.5,
            zIndex: 1,
          }}>
            💧
          </div>
        );
      })}

      {/* Soil */}
      <div style={{
        position: "absolute",
        left: 0,
        top: soilTop,
        width: "100%",
        height: soilHeight,
        backgroundColor: "#8B6914",
        borderRadius: "20px 20px 0 0",
        zIndex: 2,
      }} />

      {/* Seed (stage 0) */}
      {currentStage >= 0 && (
        <div style={{
          position: "absolute",
          left: centerX - 15,
          top: soilTop - 10,
          fontSize: 30,
          opacity: currentStage < 1 ? interpolate(stageProgress, [0, 0.5], [0, 1]) : 0.3,
          zIndex: 3,
        }}>
          🌰
        </div>
      )}

      {/* Stem */}
      {currentStage >= 1 && (
        <div style={{
          position: "absolute",
          left: centerX - 4,
          top: plantBaseY - stemH,
          width: 8,
          height: stemH,
          backgroundColor: "#4CAF50",
          borderRadius: 4,
          zIndex: 3,
        }} />
      )}

      {/* Leaves (stage 2+) */}
      {currentStage >= 2 && Array.from({ length: Math.min(4, Math.floor(currentStageFloat - 1)) }).map((_, i) => {
        const leafY = plantBaseY - stemH * (0.3 + i * 0.2);
        const side = i % 2 === 0 ? -1 : 1;
        const leafX = centerX + side * 25;
        const leafScale = interpolate(
          Math.max(0, currentStageFloat - 2),
          [0, 1],
          [0, 1],
          { extrapolateRight: "clamp" },
        );

        return (
          <div key={`leaf-${i}`} style={{
            position: "absolute",
            left: leafX - 15,
            top: leafY - 10,
            fontSize: 30,
            transform: `scale(${leafScale}) scaleX(${side})`,
            opacity: leafScale,
            zIndex: 3,
          }}>
            🍃
          </div>
        );
      })}

      {/* Flower (stage 3+) */}
      {currentStage >= 3 && (
        <div style={{
          position: "absolute",
          left: centerX - 25,
          top: plantBaseY - stemH - 40,
          fontSize: 50,
          lineHeight: 1,
          zIndex: 4,
        }}>
          <span style={{
            display: "inline-block",
            transform: `scale(${interpolate(stageProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" })})`,
          }}>
            🌸
          </span>
        </div>
      )}

      {/* Stage labels at bottom */}
      <div style={{
        position: "absolute",
        bottom: 25,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        gap: 30,
        zIndex: 5,
      }}>
        {STAGE_LABELS.slice(0, stages).map((label, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            opacity: i <= labelIdx ? 1 : 0.3,
          }}>
            <span style={{ fontSize: 24, lineHeight: 1 }}>{STAGE_EMOJI[i]}</span>
            <span style={{
              fontFamily: FONT_FAMILY,
              fontSize: 18,
              fontWeight: 800,
              color: i === labelIdx ? data.accentColor : PALETTE.dark,
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
