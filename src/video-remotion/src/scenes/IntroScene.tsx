import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../components/BackgroundBubbles";
import { INTRO_DURATION, SPRING_CONFIGS } from "../theme/animations";
import { INTRO_BG, PALETTE } from "../theme/colors";
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleEntrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.bouncy,
    delay: 10,
  });

  const subtitleEntrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.snappy,
    delay: 30,
  });

  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], {
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(titleEntrance, [0, 0.4, 1], [0, 0.6, 1], {
    extrapolateRight: "clamp",
  });

  const subtitleY = interpolate(subtitleEntrance, [0, 1], [30, 0], {
    extrapolateRight: "clamp",
  });
  const subtitleOpacity = interpolate(subtitleEntrance, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });

  const numberRowEntrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.smooth,
    delay: 50,
  });
  const numberRowOpacity = interpolate(numberRowEntrance, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(
    frame,
    [INTRO_DURATION - 20, INTRO_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: INTRO_BG,
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
          fontSize: FONT_SIZES.title,
          fontWeight: 900,
          color: PALETTE.white,
          transform: `scale(${titleScale})`,
          opacity: titleOpacity,
          textShadow: "0 4px 16px rgba(0,0,0,0.2)",
          zIndex: 1,
        }}
      >
        认识数字
      </div>

      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.subtitle,
          fontWeight: 700,
          color: PALETTE.white,
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          marginTop: 12,
          zIndex: 1,
        }}
      >
        1 - 10
      </div>

      <div
        style={{
          marginTop: 32,
          fontSize: 48,
          opacity: numberRowOpacity,
          zIndex: 1,
          letterSpacing: 8,
        }}
      >
        {"1 2 3 4 5 6 7 8 9 10".split(" ").map((n, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              margin: "0 4px",
              color: PALETTE.rainbow[i % PALETTE.rainbow.length],
              fontWeight: 900,
              fontFamily: FONT_FAMILY,
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
