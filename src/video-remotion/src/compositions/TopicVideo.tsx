import React from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide as slideTransition } from "@remotion/transitions/slide";
import { Audio } from "@remotion/media";
import {
  DEFAULT_SLIDE_DURATION,
  GENERIC_INTRO_DURATION,
  GENERIC_OUTRO_DURATION,
  GENERIC_TRANSITION_DURATION,
} from "../data/topic-video";
import type { TeachingVideoData } from "../data/topic-video";
import { GenericIntroScene } from "../scenes/GenericIntroScene";
import { SlideScene } from "../scenes/SlideScene";
import { GenericOutroScene } from "../scenes/GenericOutroScene";

const handleAudioError = () => "fallback" as const;

type TopicVideoProps = TeachingVideoData;

export const TopicVideo: React.FC<TopicVideoProps> = ({
  title,
  subtitle,
  introBg,
  outroBg,
  slides,
}) => {
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
      <Audio
        src={staticFile("bg-music.mp3")}
        loop
        volume={bgMusicVolume}
        onError={handleAudioError}
      />

      <TransitionSeries>
        {/* Intro */}
        <TransitionSeries.Sequence durationInFrames={GENERIC_INTRO_DURATION}>
          <GenericIntroScene title={title} subtitle={subtitle} bgColor={introBg} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: GENERIC_TRANSITION_DURATION })}
        />

        {/* Slides */}
        {slides.map((slide, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Sequence durationInFrames={DEFAULT_SLIDE_DURATION}>
              <SlideScene data={slide} index={i} />
            </TransitionSeries.Sequence>

            {i < slides.length - 1 && (
              <TransitionSeries.Transition
                presentation={slideTransition({ direction: "from-right" })}
                timing={linearTiming({ durationInFrames: GENERIC_TRANSITION_DURATION })}
              />
            )}
          </React.Fragment>
        ))}

        {/* Final transition to outro */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: GENERIC_TRANSITION_DURATION })}
        />

        {/* Outro */}
        <TransitionSeries.Sequence durationInFrames={GENERIC_OUTRO_DURATION}>
          <GenericOutroScene slides={slides} bgColor={outroBg} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
