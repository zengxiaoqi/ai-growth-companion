import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_CONFIGS } from "../theme/animations";
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";

type NumberDisplayProps = {
  digit: string;
  color: string;
  delay?: number;
};

export const NumberDisplay: React.FC<NumberDisplayProps> = ({
  digit,
  color,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.bouncy,
    delay,
  });

  const scale = interpolate(entrance, [0, 1], [0, 1]);

  const pulsePhase = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.smooth,
    delay: durationInFrames - 45,
    durationInFrames: 30,
  });

  const pulse = interpolate(pulsePhase, [0, 0.5, 1], [1, 1.06, 1]);

  const finalScale = scale * (scale >= 0.99 ? pulse : 1);

  const opacity = interpolate(entrance, [0, 0.3, 1], [0, 0.5, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZES.heroNumber,
        fontWeight: 900,
        color,
        lineHeight: 1,
        transform: `scale(${finalScale})`,
        opacity,
        textShadow: `0 8px 24px ${color}44, 0 2px 8px ${color}22`,
        userSelect: "none",
      }}
    >
      {digit}
    </div>
  );
};
