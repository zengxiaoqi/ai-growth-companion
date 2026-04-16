import React from "react";
import { staticFile } from "remotion";
import { Audio } from "@remotion/media";

type SlideNarrationAudioProps = {
  narrationSrc?: string;
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
const handleAudioError = () => {};

export const SlideNarrationAudio: React.FC<SlideNarrationAudioProps> = ({
  narrationSrc,
}) => {
  if (!narrationSrc) return null;

  return (
    <Audio
      src={staticFile(narrationSrc)}
      volume={0.9}
      onError={handleAudioError}
    />
  );
};
