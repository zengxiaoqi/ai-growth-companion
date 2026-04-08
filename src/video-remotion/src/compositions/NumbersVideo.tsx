import React from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Audio } from "@remotion/media";
import { NUMBERS } from "../data/numbers";
import {
  INTRO_DURATION,
  NUMBER_SCENE_DURATION,
  OUTRO_DURATION,
  TRANSITION_DURATION,
} from "../theme/animations";
import { IntroScene } from "../scenes/IntroScene";
import { NumberScene } from "../scenes/NumberScene";
import { OutroScene } from "../scenes/OutroScene";

const handleAudioError = () => "fallback" as const;

export const NumbersVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const bgMusicVolume = (f: number) => {
    const fadeInEnd = fps * 1.5;
    const fadeOutStart = durationInFrames - fps;
    if (f < fadeInEnd) return (f / fadeInEnd) * 0.25;
    if (f > fadeOutStart) return ((durationInFrames - f) / fps) * 0.25;
    return 0.25;
  };

  return (
    <AbsoluteFill>
      {/* Background music — place bg-music.mp3 in public/ to enable */}
      <Audio
        src={staticFile("bg-music.mp3")}
        loop
        volume={bgMusicVolume}
        onError={handleAudioError}
      />

      <TransitionSeries>
        {/* Intro */}
        <TransitionSeries.Sequence durationInFrames={INTRO_DURATION}>
          <IntroScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Number scenes 1-10 */}
        {NUMBERS.map((num, i) => (
          <React.Fragment key={num.digit}>
            <TransitionSeries.Sequence
              durationInFrames={NUMBER_SCENE_DURATION}
            >
              <NumberScene data={num} />
            </TransitionSeries.Sequence>

            {/* Transition between numbers (skip after the last number) */}
            {i < NUMBERS.length - 1 && (
              <TransitionSeries.Transition
                presentation={slide({ direction: "from-right" })}
                timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
              />
            )}
          </React.Fragment>
        ))}

        {/* Final transition to outro */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Outro */}
        <TransitionSeries.Sequence durationInFrames={OUTRO_DURATION}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
