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
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";
import { GENERIC_INTRO_DURATION } from "../data/topic-video";

type GenericIntroProps = {
  title: string;
  subtitle: string;
  bgColor: string;
};

export const GenericIntroScene: React.FC<GenericIntroProps> = ({
  title,
  subtitle,
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 5 });
  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titleEntrance, [0, 0.3, 1], [0, 0.5, 1], { extrapolateRight: "clamp" });

  const subtitleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 20 });
  const subtitleY = interpolate(subtitleEntrance, [0, 1], [20, 0], { extrapolateRight: "clamp" });
  const subtitleOpacity = interpolate(subtitleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const fadeOut = interpolate(
    frame,
    [GENERIC_INTRO_DURATION - 20, GENERIC_INTRO_DURATION],
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
          fontSize: FONT_SIZES.title,
          fontWeight: 900,
          color: PALETTE.white,
          transform: `scale(${titleScale})`,
          opacity: titleOpacity,
          textShadow: "0 4px 16px rgba(0,0,0,0.2)",
          zIndex: 1,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.subtitle,
          fontWeight: 700,
          color: PALETTE.white,
          opacity: subtitleOpacity * 0.8,
          transform: `translateY(${subtitleY}px)`,
          marginTop: 12,
          zIndex: 1,
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};
