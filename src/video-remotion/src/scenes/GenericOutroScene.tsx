import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../components/BackgroundBubbles";
import { SPRING_CONFIGS } from "../theme/animations";
import { PALETTE } from "../theme/colors";
import { FONT_FAMILY } from "../theme/fonts";
import { GENERIC_OUTRO_DURATION } from "../data/topic-video";
import type { TeachingSlide } from "../data/topic-video";

type GenericOutroProps = {
  slides: TeachingSlide[];
  bgColor: string;
};

export const GenericOutroScene: React.FC<GenericOutroProps> = ({ slides, bgColor }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 5 });
  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titleEntrance, [0, 0.3, 1], [0, 0.5, 1], { extrapolateRight: "clamp" });

  const gridEntrance = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 20 });
  const gridOpacity = interpolate(gridEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const fadeOut = interpolate(
    frame,
    [GENERIC_OUTRO_DURATION - 20, GENERIC_OUTRO_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: PALETTE.white,
          transform: `scale(${titleScale})`,
          opacity: titleOpacity,
          textShadow: "0 4px 16px rgba(0,0,0,0.2)",
          zIndex: 1,
          marginBottom: 28,
        }}
      >
        太棒了！你学会了！
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 12,
          maxWidth: 600,
          opacity: gridOpacity,
          zIndex: 1,
        }}
      >
        {slides.map((slide, i) => {
          const itemEntrance = spring({
            frame,
            fps,
            config: SPRING_CONFIGS.bouncy,
            delay: 25 + i * 4,
          });
          const itemScale = interpolate(itemEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

          return (
            <div
              key={i}
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                backgroundColor: `${slide.accentColor}22`,
                border: `2px solid ${slide.accentColor}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                transform: `scale(${itemScale})`,
              }}
            >
              {slide.emoji && <div style={{ fontSize: 24, lineHeight: 1 }}>{slide.emoji}</div>}
              <div
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 14,
                  fontWeight: 800,
                  color: slide.accentColor,
                  lineHeight: 1,
                }}
              >
                {slide.title.length > 3 ? slide.title.slice(0, 3) : slide.title}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
