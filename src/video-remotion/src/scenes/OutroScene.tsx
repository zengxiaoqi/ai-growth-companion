import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../components/BackgroundBubbles";
import { OUTRO_DURATION, SPRING_CONFIGS } from "../theme/animations";
import { OUTRO_BG, PALETTE } from "../theme/colors";
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";
import { NUMBERS } from "../data/numbers";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleEntrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.bouncy,
    delay: 5,
  });
  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], {
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(titleEntrance, [0, 0.3, 1], [0, 0.5, 1], {
    extrapolateRight: "clamp",
  });

  const gridEntrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.smooth,
    delay: 25,
  });
  const gridOpacity = interpolate(gridEntrance, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(
    frame,
    [OUTRO_DURATION - 20, OUTRO_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: OUTRO_BG,
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
          fontSize: 52,
          fontWeight: 900,
          color: PALETTE.white,
          transform: `scale(${titleScale})`,
          opacity: titleOpacity,
          textShadow: "0 4px 16px rgba(0,0,0,0.2)",
          zIndex: 1,
          marginBottom: 32,
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
        {NUMBERS.map((n, i) => {
          const itemEntrance = spring({
            frame,
            fps,
            config: SPRING_CONFIGS.bouncy,
            delay: 30 + i * 3,
          });
          const itemScale = interpolate(itemEntrance, [0, 1], [0, 1], {
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={n.digit}
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                backgroundColor: `${n.color}22`,
                border: `2px solid ${n.color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_FAMILY,
                fontSize: 28,
                fontWeight: 900,
                color: n.color,
                transform: `scale(${itemScale})`,
              }}
            >
              {n.digit}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
