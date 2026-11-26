import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { WhiteboardStoryScene } from "../scenes/animated/language/WhiteboardStoryScene";
import type { TeachingSlide } from "../data/topic-video";

export const WhiteboardDemo: React.FC<{ data: TeachingSlide }> = ({ data }) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      <WhiteboardStoryScene data={data} width={width} height={height} />
    </AbsoluteFill>
  );
};
