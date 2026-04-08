import React from "react";
import { interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";

export const BackgroundMusicLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const volume = (f: number) =>
    interpolate(
      f,
      [0, fps * 1.5, durationInFrames - fps * 1, durationInFrames],
      [0, 0.25, 0.25, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

  return (
    <Audio
      src={staticFile("bg-music.mp3")}
      loop
      volume={volume}
    />
  );
};
