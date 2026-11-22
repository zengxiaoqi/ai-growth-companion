import { Composition } from "remotion";
import { ThreeStagePreview } from "./ThreeStagePreview";
import { SLIDE_PREVIEW, DRIBBLE_PREVIEW } from "./fixtures";

/**
 * 3D 舞台预览入口（仅本地抽帧验收用，不参与线上渲染）。
 * 用法：REMOTION_ENTRY=src/__preview3d/index.ts npx remotion still ThreeSlidePreview out/slide-30.png --frame=30
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ThreeSlidePreview"
        component={ThreeStagePreview}
        durationInFrames={96}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scene: SLIDE_PREVIEW }}
      />
      <Composition
        id="ThreeDribblePreview"
        component={ThreeStagePreview}
        durationInFrames={96}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scene: DRIBBLE_PREVIEW }}
      />
    </>
  );
};

export default RemotionRoot;
