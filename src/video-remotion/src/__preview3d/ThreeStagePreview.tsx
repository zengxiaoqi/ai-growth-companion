import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ThreeActionStage, type ThreeStageScene } from "../three/ThreeActionStage";

/**
 * 预览壳：复刻课程分镜的背景（天空 + 草地 + 标题条），
 * 这样抽帧看到的就是真实出片里的样子，而不是透明底。
 */
export const ThreeStagePreview: React.FC<{ scene: ThreeStageScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#f7fff9" }}>
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, #a7e8ff 0%, #d8f6e0 62%, #bfe8a8 62.2%, #a8dc8e 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 42,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            borderRadius: 999,
            background: "rgba(255,255,255,0.88)",
            padding: "12px 36px",
            fontSize: 42,
            fontWeight: 900,
            color: "#12303a",
          }}
        >
          {scene.motion === "slide" ? "小熊滑滑梯" : "小熊拍球"}
        </div>
      </div>
      <ThreeActionStage scene={scene} frame={frame} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 60,
          textAlign: "center",
          fontSize: 44,
          fontWeight: 800,
          color: "#12303a",
        }}
      >
        从上面滑下来，慢慢就停住啦
      </div>
    </AbsoluteFill>
  );
};
