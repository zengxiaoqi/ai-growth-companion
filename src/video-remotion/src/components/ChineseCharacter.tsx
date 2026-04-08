import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_CONFIGS } from "../theme/animations";
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";

type ChineseCharacterProps = {
  text: string;
  delay?: number;
};

export const ChineseCharacter: React.FC<ChineseCharacterProps> = ({
  text,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.snappy,
    delay,
  });

  const opacity = interpolate(entrance, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(entrance, [0, 1], [40, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZES.chineseChar,
        fontWeight: 700,
        color: "#2D3436",
        opacity,
        transform: `translateY(${translateY}px)`,
        textAlign: "center",
        userSelect: "none",
      }}
    >
      {text}
    </div>
  );
};
