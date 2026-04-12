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
import { staggerDelay, getGridPosition, resolveEmoji } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

const CHINESE_NUMERALS: Record<number, string> = {
  1: "一", 2: "二", 3: "三", 4: "四", 5: "五",
  6: "六", 7: "七", 8: "八", 9: "九", 10: "十",
};

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

export const CountingObjectsScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const targetCount = Math.max(1, Math.min(10, Number(params.targetCount) || 5));
  const objectType = String(params.objectType || "apple");
  const objectEmoji = resolveEmoji(objectType, "🍎");

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const numberEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 5 });
  const numberScale = interpolate(numberEntrance, [0, 1], [0, 1.2], { extrapolateRight: "clamp" });
  const numberOpacity = interpolate(numberEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const perItemDelay = 15; // 0.5s per item
  const countingStartFrame = 25;
  const centerY = height * 0.55;
  const centerX = width / 2;

  const visibleCount = Math.min(
    targetCount,
    Math.max(0, Math.floor((frame - countingStartFrame) / perItemDelay) + 1),
  );

  const doneFrame = countingStartFrame + targetCount * perItemDelay;
  const pulseActive = frame > doneFrame;
  const pulseScaleVal = pulseActive
    ? interpolate(
        Math.sin((frame - doneFrame) / fps * 3 * Math.PI * 2),
        [-1, 1],
        [1, 1.15],
      )
    : 1;

  const chineseNumeral = CHINESE_NUMERALS[targetCount] || String(targetCount);
  const chineseEntrance = spring({
    frame, fps, config: SPRING_CONFIGS.smooth, delay: doneFrame + 5,
  });
  const chineseOpacity = interpolate(chineseEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const chineseY = interpolate(chineseEntrance, [0, 1], [20, 0], { extrapolateRight: "clamp" });

  const countLabelEntrance = spring({
    frame, fps, config: SPRING_CONFIGS.snappy, delay: countingStartFrame - 5,
  });
  const countLabelOpacity = interpolate(countLabelEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Big number */}
      <div style={{
        position: "absolute",
        top: height * 0.08,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 180,
          fontWeight: 900,
          color: data.accentColor,
          transform: `scale(${numberScale * pulseScaleVal})`,
          opacity: numberOpacity,
          textShadow: `0 6px 24px ${data.accentColor}44`,
          lineHeight: 1,
        }}>
          {visibleCount}
        </div>

        {/* Running count label */}
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.label,
          fontWeight: 700,
          color: PALETTE.dark,
          opacity: countLabelOpacity * 0.7,
          marginTop: 8,
        }}>
          {objectEmoji} × {visibleCount}
        </div>
      </div>

      {/* Counting objects grid */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 1 }}>
        {Array.from({ length: visibleCount }).map((_, i) => {
          const pos = getGridPosition(i, targetCount, centerX, centerY);
          const itemFrame = Math.max(0, frame - countingStartFrame - i * perItemDelay);
          const itemSpring = spring({ frame: itemFrame, fps, config: SPRING_CONFIGS.bouncy });
          const itemScale = interpolate(itemSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          const itemRotate = interpolate(itemSpring, [0, 1], [-30, 0], { extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              position: "absolute",
              left: pos.x - pos.size / 2,
              top: pos.y - pos.size / 2,
              fontSize: pos.size * 0.8,
              lineHeight: 1,
              transform: `scale(${itemScale}) rotate(${itemRotate}deg)`,
              userSelect: "none",
            }}>
              {objectEmoji}
            </div>
          );
        })}
      </div>

      {/* Chinese numeral at bottom */}
      <div style={{
        position: "absolute",
        bottom: 60,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 56,
          fontWeight: 900,
          color: data.accentColor,
          opacity: chineseOpacity,
          transform: `translateY(${chineseY}px) scale(${pulseScaleVal})`,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          {chineseNumeral}
        </div>
      </div>
    </AbsoluteFill>
  );
};
