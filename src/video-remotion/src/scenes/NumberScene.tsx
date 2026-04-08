import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../components/BackgroundBubbles";
import { ChineseCharacter } from "../components/ChineseCharacter";
import { CountingObjects } from "../components/CountingObjects";
import { NarrationAudio } from "../components/NarrationAudio";
import { NumberDisplay } from "../components/NumberDisplay";
import { NUMBER_SCENE_DURATION, SPRING_CONFIGS } from "../theme/animations";
import { PALETTE } from "../theme/colors";
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";
import type { NumberData } from "../data/numbers";

type NumberSceneProps = {
  data: NumberData;
};

export const NumberScene: React.FC<NumberSceneProps> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(
    frame,
    [NUMBER_SCENE_DURATION - 20, NUMBER_SCENE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const count = parseInt(data.digit, 10);
  const itemsPerRow = 5;
  const staggerDelay = Math.floor(120 / Math.max(count, 1));

  const countingStartFrame = 30;
  const countingY = height * 0.62;
  const centerX = width / 2;

  const labelEntrance = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.smooth,
    delay: countingStartFrame - 5,
  });
  const labelOpacity = interpolate(labelEntrance, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data.bgColor,
        opacity: bgOpacity * fadeOut,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflow: "hidden",
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      {/* Per-number narration — place narration-{N}.mp3 in public/ */}
      <NarrationAudio digit={data.digit} />

      <div
        style={{
          position: "absolute",
          top: height * 0.12,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 1,
        }}
      >
        <NumberDisplay digit={data.digit} color={data.color} delay={0} />

        <Sequence from={60} premountFor={30} layout="none">
          <ChineseCharacter text={data.chinese} delay={0} />
        </Sequence>
      </div>

      <Sequence from={countingStartFrame} premountFor={30} layout="none">
        <CountingObjects
          emoji={data.emoji}
          count={count}
          staggerDelay={staggerDelay}
          startX={centerX}
          startY={countingY}
        />
      </Sequence>

      <div
        style={{
          position: "absolute",
          bottom: 60,
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.countingText,
          fontWeight: 700,
          color: data.color,
          opacity: labelOpacity,
          zIndex: 1,
          textShadow: `0 2px 8px ${data.color}33`,
        }}
      >
        {data.digit}个{data.label}
      </div>
    </AbsoluteFill>
  );
};
