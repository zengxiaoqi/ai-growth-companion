import { Composition } from "remotion";
import { NumbersVideo } from "./compositions/NumbersVideo";
import { TopicVideo } from "./compositions/TopicVideo";
import { INTRO_DURATION, NUMBER_SCENE_DURATION, OUTRO_DURATION, TRANSITION_DURATION } from "./theme/animations";
import {
  DEFAULT_SLIDE_DURATION,
  GENERIC_INTRO_DURATION,
  GENERIC_OUTRO_DURATION,
  GENERIC_TRANSITION_DURATION,
  DEFAULT_TOPIC_VIDEO,
} from "./data/topic-video";
import type { TeachingVideoData } from "./data/topic-video";

// NumbersVideo: intro + 10*scene + outro - 11 transitions
// = 90 + 10*210 + 90 - 11*12 = 2148
const NUMBERS_TOTAL_FRAMES =
  INTRO_DURATION +
  10 * NUMBER_SCENE_DURATION +
  OUTRO_DURATION -
  11 * TRANSITION_DURATION;

function calcTopicVideoFrames(props: TeachingVideoData): number {
  const slideCount = props.slides.length;
  const slideFrames = props.slides.reduce(
    (sum, slide) => sum + (slide.durationFrames || DEFAULT_SLIDE_DURATION),
    0,
  );
  const transitionCount = slideCount + 1;
  return (
    GENERIC_INTRO_DURATION +
    slideFrames +
    GENERIC_OUTRO_DURATION -
    transitionCount * GENERIC_TRANSITION_DURATION
  );
}

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="TopicVideo"
        component={TopicVideo}
        fps={30}
        width={1280}
        height={720}
        defaultProps={DEFAULT_TOPIC_VIDEO}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: calcTopicVideoFrames(props),
          props,
        })}
      />

      <Composition
        id="NumbersVideo"
        component={NumbersVideo}
        durationInFrames={NUMBERS_TOTAL_FRAMES}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{}}
      />
    </>
  );
};
