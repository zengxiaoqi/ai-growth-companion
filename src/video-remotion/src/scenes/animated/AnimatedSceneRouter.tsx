import React from "react";
import { useVideoConfig } from "remotion";
import type { TeachingSlide, AnimationTemplateId } from "../../data/topic-video";
import { CountingObjectsScene } from "../animated/math/CountingObjectsScene";
import { ShapeBuilderScene } from "../animated/math/ShapeBuilderScene";
import { NumberLineScene } from "../animated/math/NumberLineScene";
import { AbacusScene } from "../animated/math/AbacusScene";
import { CharacterStrokeScene } from "../animated/language/CharacterStrokeScene";
import { WordRevealScene } from "../animated/language/WordRevealScene";
import { StorySceneScene } from "../animated/language/StorySceneScene";
import { SeasonsCycleScene } from "../animated/science/SeasonsCycleScene";
import { WaterCycleScene } from "../animated/science/WaterCycleScene";
import { PlantGrowthScene } from "../animated/science/PlantGrowthScene";
import { DayNightCycleScene } from "../animated/science/DayNightCycleScene";
import { ColorMixingScene } from "../animated/art/ColorMixingScene";
import { DrawingStepsScene } from "../animated/art/DrawingStepsScene";
import { EmotionFacesScene } from "../animated/social/EmotionFacesScene";
import { DailyRoutineScene } from "../animated/social/DailyRoutineScene";
import { HeroLayout } from "../SlideScene";

type RouterProps = {
  data: TeachingSlide;
};

const SCENE_MAP: Record<AnimationTemplateId, React.FC<{ data: TeachingSlide; width: number; height: number }>> = {
  "math.counting-objects": CountingObjectsScene,
  "math.shape-builder": ShapeBuilderScene,
  "math.number-line": NumberLineScene,
  "math.abacus": AbacusScene,
  "language.character-stroke": CharacterStrokeScene,
  "language.word-reveal": WordRevealScene,
  "language.story-scene": StorySceneScene,
  "science.water-cycle": WaterCycleScene,
  "science.day-night-cycle": DayNightCycleScene,
  "science.plant-growth": PlantGrowthScene,
  "science.seasons-cycle": SeasonsCycleScene,
  "art.color-mixing": ColorMixingScene,
  "art.drawing-steps": DrawingStepsScene,
  "social.emotion-faces": EmotionFacesScene,
  "social.daily-routine": DailyRoutineScene,
};

export const AnimatedSceneRouter: React.FC<RouterProps> = ({ data }) => {
  const { width, height } = useVideoConfig();
  const templateId = data.animationTemplate?.id;

  if (!templateId || !SCENE_MAP[templateId]) {
    return <HeroLayout data={data} />;
  }

  const SceneComponent = SCENE_MAP[templateId];
  return <SceneComponent data={data} width={width} height={height} />;
};
