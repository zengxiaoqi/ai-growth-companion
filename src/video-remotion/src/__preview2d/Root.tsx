import { Composition } from "remotion";
import { PuppetPreview } from "./PuppetPreview";
import { WALK_PREVIEW, CLIMB_PREVIEW, SPEAK_PREVIEW, DRIBBLE_PREVIEW, POINT_PREVIEW } from "./fixtures";

/**
 * 2D 角色预览入口（仅本地抽帧验收用）。
 * 用法：REMOTION_ENTRY=src/__preview2d/index.ts npx remotion still PuppetWalkPreview out/walk-40.png --frame=40
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PuppetWalkPreview"
        component={PuppetPreview}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scene: WALK_PREVIEW }}
      />
      <Composition
        id="PuppetClimbPreview"
        component={PuppetPreview}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scene: CLIMB_PREVIEW }}
      />
      <Composition
        id="PuppetSpeakPreview"
        component={PuppetPreview}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scene: SPEAK_PREVIEW }}
      />
      <Composition
        id="PuppetDribblePreview"
        component={PuppetPreview}
        durationInFrames={96}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scene: DRIBBLE_PREVIEW }}
      />
      <Composition
        id="PuppetPointPreview"
        component={PuppetPreview}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scene: POINT_PREVIEW, withPointProp: true }}
      />
    </>
  );
};
