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
import { FONT_FAMILY, FONT_SIZES } from "../../../theme/fonts";
import { pulseScale } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type ColorMixingParams = {
  color1?: string;
  color2?: string;
  resultLabel?: string;
};

// Merge duplicate case-insensitive hex entries via normalization
const COLOR_NAMES: Record<string, string> = {
  red: "红", yellow: "黄", blue: "蓝", green: "绿",
};

const MIXING_TABLE: Record<string, string> = {
  "red+yellow": "#FF9800",
  "yellow+red": "#FF9800",
  "blue+yellow": "#4CAF50",
  "yellow+blue": "#4CAF50",
  "red+blue": "#9C27B0",
  "blue+red": "#9C27B0",
  "red+green": "#795548",
  "green+red": "#795548",
  "blue+green": "#009688",
  "green+blue": "#009688",
};

const MIXED_NAMES: Record<string, string> = {
  "#FF9800": "橙",
  "#4CAF50": "绿",
  "#9C27B0": "紫",
  "#795548": "棕",
  "#009688": "青",
};

function normalizeColorKey(hex: string): string {
  const map: Record<string, string> = {
    "#FF0000": "red", "#ff0000": "red",
    "#FFFF00": "yellow", "#ffff00": "yellow",
    "#0000FF": "blue", "#0000ff": "blue",
    "#00FF00": "green", "#00ff00": "green",
  };
  return map[hex.toUpperCase()] ?? map[hex] ?? hex.toLowerCase();
}

function getMixedColor(c1: string, c2: string): string {
  const key = `${normalizeColorKey(c1)}+${normalizeColorKey(c2)}`;
  return MIXING_TABLE[key] ?? "#888888";
}

export const ColorMixingScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: ColorMixingParams = data.animationTemplate?.params ?? {};
  const color1 = params.color1 ?? "#FF0000";
  const color2 = params.color2 ?? "#0000FF";
  const resultLabel = params.resultLabel;

  const mixedColor = getMixedColor(color1, color2);
  const mixedName = resultLabel ?? MIXED_NAMES[mixedColor] ?? "混合色";
  const name1 = COLOR_NAMES[normalizeColorKey(color1)] ?? "色1";
  const name2 = COLOR_NAMES[normalizeColorKey(color2)] ?? "色2";

  const centerX = width / 2;
  const circleY = height * 0.38;
  const circleSize = 100;

  // Slide-in progress: 0→0.6 of total frames
  const slideProgress = interpolate(frame, [15, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const leftX = interpolate(slideProgress, [0, 1], [centerX - 240, centerX - 30]);
  const rightX = interpolate(slideProgress, [0, 1], [centerX + 240, centerX + 30]);

  // Result circle appears at ~60% through
  const resultAppear = interpolate(frame, [75, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const resultScale = spring({
    frame: Math.max(0, frame - 75),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  // Sparkle burst
  const sparkleOpacity = interpolate(frame, [85, 95, 120], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  const sparklePositions = [
    { x: centerX - 60, y: circleY - 60 },
    { x: centerX + 70, y: circleY - 50 },
    { x: centerX - 50, y: circleY + 70 },
    { x: centerX + 55, y: circleY + 65 },
    { x: centerX, y: circleY - 80 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data.bgColor,
        overflow: "hidden",
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: height * 0.08,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.subtitle,
          fontWeight: 900,
          color: data.accentColor,
          opacity: titleOpacity,
          zIndex: 2,
          textShadow: `0 2px 8px ${data.accentColor}33`,
        }}
      >
        {data.title}
      </div>

      {/* Left circle */}
      <div
        style={{
          position: "absolute",
          left: leftX - circleSize / 2,
          top: circleY - circleSize / 2,
          width: circleSize,
          height: circleSize,
          borderRadius: "50%",
          backgroundColor: color1,
          boxShadow: `0 4px 20px ${color1}66`,
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: leftX - circleSize / 2,
          top: circleY + circleSize / 2 + 12,
          width: circleSize,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 700,
          color: PALETTE.dark,
          zIndex: 2,
        }}
      >
        {name1}
      </div>

      {/* Right circle */}
      <div
        style={{
          position: "absolute",
          left: rightX - circleSize / 2,
          top: circleY - circleSize / 2,
          width: circleSize,
          height: circleSize,
          borderRadius: "50%",
          backgroundColor: color2,
          boxShadow: `0 4px 20px ${color2}66`,
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: rightX - circleSize / 2,
          top: circleY + circleSize / 2 + 12,
          width: circleSize,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 700,
          color: PALETTE.dark,
          zIndex: 2,
        }}
      >
        {name2}
      </div>

      {/* Mixed result circle */}
      {resultAppear > 0 && (
        <div
          style={{
            position: "absolute",
            left: centerX - circleSize / 2 - 30,
            top: circleY - circleSize / 2 + 80,
            width: circleSize,
            height: circleSize,
            borderRadius: "50%",
            backgroundColor: mixedColor,
            boxShadow: `0 4px 24px ${mixedColor}88`,
            transform: `scale(${resultScale})`,
            zIndex: 3,
          }}
        />
      )}
      {resultAppear > 0 && (
        <div
          style={{
            position: "absolute",
            left: centerX - circleSize / 2 - 30,
            top: circleY + circleSize / 2 + 92,
            width: circleSize,
            textAlign: "center",
            fontFamily: FONT_FAMILY,
            fontSize: 32,
            fontWeight: 900,
            color: mixedColor,
            transform: `scale(${resultScale})`,
            zIndex: 3,
          }}
        >
          {mixedName}
        </div>
      )}

      {/* Sparkle burst */}
      {sparkleOpacity > 0 &&
        sparklePositions.map((pos, i) => {
          const scale = pulseScale(frame + i * 5, fps, 3, 0.15, 0.8);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                fontSize: 36,
                opacity: sparkleOpacity,
                transform: `scale(${scale})`,
                zIndex: 4,
                userSelect: "none",
              }}
            >
              ✨
            </div>
          );
        })}

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.1,
            width: "100%",
            textAlign: "center",
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZES.label,
            fontWeight: 700,
            color: PALETTE.dark,
            opacity: interpolate(
              spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 30 }),
              [0, 1],
              [0, 0.7],
            ),
            zIndex: 2,
          }}
        >
          {data.subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
