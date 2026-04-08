import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

type Bubble = {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
};

const BUBBLES: Bubble[] = [
  { x: 0.1, y: 0.2, size: 80, color: "rgba(255,107,107,0.12)", speedX: 0.3, speedY: 0.5 },
  { x: 0.85, y: 0.15, size: 60, color: "rgba(255,217,61,0.10)", speedX: 0.4, speedY: 0.35 },
  { x: 0.2, y: 0.75, size: 100, color: "rgba(107,203,119,0.10)", speedX: 0.25, speedY: 0.45 },
  { x: 0.75, y: 0.65, size: 70, color: "rgba(77,150,255,0.12)", speedX: 0.35, speedY: 0.55 },
  { x: 0.5, y: 0.85, size: 90, color: "rgba(255,107,157,0.08)", speedX: 0.45, speedY: 0.3 },
  { x: 0.35, y: 0.4, size: 50, color: "rgba(155,89,182,0.08)", speedX: 0.5, speedY: 0.4 },
];

type BackgroundBubblesProps = {
  width: number;
  height: number;
};

export const BackgroundBubbles: React.FC<BackgroundBubblesProps> = ({
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {BUBBLES.map((b, i) => {
        const offsetX = interpolate(
          (frame / fps) * b.speedX,
          [0, Math.PI * 2],
          [0, Math.sin(((frame / fps) * b.speedX + i) * Math.PI * 2) * 30],
        );
        const offsetY = interpolate(
          (frame / fps) * b.speedY,
          [0, Math.PI * 2],
          [0, Math.cos(((frame / fps) * b.speedY + i * 0.7) * Math.PI * 2) * 20],
        );

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.x * width - b.size / 2 + offsetX,
              top: b.y * height - b.size / 2 + offsetY,
              width: b.size,
              height: b.size,
              borderRadius: "50%",
              backgroundColor: b.color,
            }}
          />
        );
      })}
    </div>
  );
};
