import React from "react";
import { staticFile } from "remotion";
import { Audio } from "@remotion/media";

type NarrationAudioProps = {
  digit: string;
};

const handleAudioError = () => "fallback" as const;

export const NarrationAudio: React.FC<NarrationAudioProps> = ({ digit }) => {
  return (
    <Audio
      src={staticFile(`narration-${digit}.mp3`)}
      volume={0.8}
      onError={handleAudioError}
    />
  );
};
