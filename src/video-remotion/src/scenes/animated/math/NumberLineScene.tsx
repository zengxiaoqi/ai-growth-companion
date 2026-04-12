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
import { hopArc } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

export const NumberLineScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const startNum = Number(params.startNum) || 0;
  const endNum = Math.max(startNum + 3, Number(params.endNum) || 10);
  const highlightNum = params.highlightNum != null ? Number(params.highlightNum) : Math.floor((startNum + endNum) / 2);

  const totalNumbers = endNum - startNum + 1;
  const lineY = height * 0.55;
  const lineStartX = 120;
  const lineEndX = width - 120;
  const lineLen = lineEndX - lineStartX;
  const stepWidth = lineLen / (totalNumbers - 1);

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Line entrance
  const lineEntrance = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const lineReveal = interpolate(lineEntrance, [0, 1], [0, lineLen], { extrapolateRight: "clamp" });

  // Number labels appear
  const labelDelay = 15;
  const perLabelDelay = 3;

  // Hop animation
  const hopStartFrame = 30 + totalNumbers * perLabelDelay;
  const hopSequence: number[] = [];
  for (let n = startNum; n <= endNum; n++) hopSequence.push(n);

  const hopsPerSecond = 1.5;
  const framesPerHop = fps / hopsPerSecond;

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Title */}
      <div style={{
        position: "absolute",
        top: 40,
        width: "100%",
        textAlign: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: data.accentColor,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          {data.title || "数字线"}
        </div>
      </div>

      {/* Number line */}
      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        {/* Horizontal line */}
        <div style={{
          position: "absolute",
          left: lineStartX,
          top: lineY,
          width: lineReveal,
          height: 4,
          backgroundColor: PALETTE.dark,
          borderRadius: 2,
          opacity: 0.4,
        }} />

        {/* Tick marks and labels */}
        {hopSequence.map((num, i) => {
          const x = lineStartX + i * stepWidth;
          const tickDelay = labelDelay + i * perLabelDelay;
          const tickSpring = spring({ frame: Math.max(0, frame - tickDelay), fps, config: SPRING_CONFIGS.snappy });
          const tickOpacity = interpolate(tickSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });

          const isHighlighted = num === highlightNum;

          return (
            <React.Fragment key={num}>
              {/* Tick */}
              <div style={{
                position: "absolute",
                left: x - 1.5,
                top: lineY - 8,
                width: 3,
                height: 20,
                backgroundColor: isHighlighted ? data.accentColor : PALETTE.dark,
                opacity: tickOpacity * (isHighlighted ? 1 : 0.5),
                borderRadius: 1,
              }} />

              {/* Number label */}
              <div style={{
                position: "absolute",
                left: x,
                top: lineY + 28,
                transform: "translateX(-50%)",
                fontFamily: FONT_FAMILY,
                fontSize: isHighlighted ? 32 : 24,
                fontWeight: isHighlighted ? 900 : 700,
                color: isHighlighted ? data.accentColor : PALETTE.dark,
                opacity: tickOpacity,
              }}>
                {num}
              </div>

              {/* Highlight circle */}
              {isHighlighted && (
                <div style={{
                  position: "absolute",
                  left: x - 18,
                  top: lineY - 18,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: `3px solid ${data.accentColor}`,
                  opacity: tickOpacity * 0.6,
                }} />
              )}
            </React.Fragment>
          );
        })}

        {/* Hopping ball */}
        {(() => {
          if (frame < hopStartFrame) return null;

          const hopFrame = frame - hopStartFrame;
          const currentHopIndex = Math.min(
            Math.floor(hopFrame / framesPerHop),
            hopSequence.length - 1,
          );
          const hopProgress = Math.min(
            (hopFrame - currentHopIndex * framesPerHop) / framesPerHop,
            1,
          );

          const fromX = lineStartX + currentHopIndex * stepWidth;
          const toX = lineStartX + Math.min(currentHopIndex + 1, hopSequence.length - 1) * stepWidth;
          const ballX = fromX + (toX - fromX) * hopProgress;
          const arcHeight = 50;
          const ballY = lineY - 30 + hopArc(hopProgress, arcHeight);

          return (
            <div style={{
              position: "absolute",
              left: ballX - 20,
              top: ballY - 20,
              fontSize: 40,
              lineHeight: 1,
              userSelect: "none",
              zIndex: 2,
            }}>
              🐸
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
