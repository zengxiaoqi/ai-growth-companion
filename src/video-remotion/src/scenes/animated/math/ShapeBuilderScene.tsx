import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../../../components/BackgroundBubbles";
import { SPRING_CONFIGS } from "../../../theme/animations";
import { PALETTE } from "../../../theme/colors";
import { FONT_FAMILY } from "../../../theme/fonts";
import type { TeachingSlide } from "../../../data/topic-video";

const SHAPE_LABELS: Record<string, string> = {
  circle: "圆形",
  square: "正方形",
  triangle: "三角形",
  diamond: "菱形",
  star: "五角星",
};

const DEFAULT_SHAPES = ["circle", "triangle", "square"];
const DEFAULT_COLORS: string[] = [...PALETTE.rainbow];

type ShapeDrawProps = {
  shape: string;
  color: string;
  delay: number;
  size: number;
  x: number;
  y: number;
};

const ShapeDraw: React.FC<ShapeDrawProps> = ({ shape, color, delay, size, x, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drawProgress = interpolate(
    frame,
    [delay, delay + 25],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const fillSpring = spring({
    frame: Math.max(0, frame - delay - 25),
    fps,
    config: SPRING_CONFIGS.smooth,
  });
  const fillOpacity = interpolate(fillSpring, [0, 1], [0, 0.3], { extrapolateRight: "clamp" });

  const labelSpring = spring({
    frame: Math.max(0, frame - delay - 35),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });
  const labelScale = interpolate(labelSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const labelOpacity = interpolate(labelSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const shapeStyle: React.CSSProperties = {
    position: "absolute",
    left: x - size / 2,
    top: y - size / 2,
    width: size,
    height: size,
    borderColor: color,
    borderWidth: 4,
    borderStyle: "solid",
  };

  if (shape === "circle") {
    shapeStyle.borderRadius = "50%";
  } else if (shape === "square") {
    shapeStyle.borderRadius = 4;
  }

  const clipPercent = Math.round(drawProgress * 100);

  return (
    <>
      <div style={{
        ...shapeStyle,
        opacity: drawProgress > 0 ? 1 : 0,
        clipPath: `inset(0 ${100 - clipPercent}% 0 0)`,
      }}>
        <div style={{
          width: "100%",
          height: "100%",
          backgroundColor: color,
          opacity: fillOpacity,
          borderRadius: shape === "circle" ? "50%" : shape === "square" ? 4 : 0,
        }} />
      </div>

      {shape === "triangle" && drawProgress > 0 && (
        <div style={{
          position: "absolute",
          left: x,
          top: y - size * 0.05,
          width: 0,
          height: 0,
          borderLeft: `${size / 2}px solid transparent`,
          borderRight: `${size / 2}px solid transparent`,
          borderBottom: `${size}px solid ${color}`,
          opacity: drawProgress > 0 ? 1 : 0,
          clipPath: `inset(0 ${100 - clipPercent}% 0 0)`,
        }}>
          <div style={{
            position: "absolute",
            top: size * 0.15,
            left: -size * 0.35,
            width: size * 0.7,
            height: size * 0.7,
            backgroundColor: color,
            opacity: fillOpacity,
          }} />
        </div>
      )}

      <div style={{
        position: "absolute",
        left: x,
        top: y + size / 2 + 12,
        transform: `translateX(-50%) scale(${labelScale})`,
        opacity: labelOpacity,
        fontFamily: FONT_FAMILY,
        fontSize: 24,
        fontWeight: 700,
        color: color,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}>
        {SHAPE_LABELS[shape] || shape}
      </div>
    </>
  );
};

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

export const ShapeBuilderScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const shapes: string[] = Array.isArray(params.shapes) && params.shapes.length > 0
    ? params.shapes.map(String)
    : DEFAULT_SHAPES;
  const shapeColors: string[] = Array.isArray(params.shapeColors) && params.shapeColors.length > 0
    ? params.shapeColors.map(String)
    : DEFAULT_COLORS;

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const spacing = width / (shapes.length + 1);
  const centerY = height * 0.48;
  const shapeSize = Math.min(120, (width - 200) / shapes.length - 40);
  const perShapeDelay = 30; // 1s per shape

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      <div style={{
        position: "absolute",
        top: 50,
        width: "100%",
        textAlign: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: data.accentColor,
          opacity: titleOpacity,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          认识图形
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        {shapes.map((shape, i) => (
          <ShapeDraw
            key={shape + i}
            shape={shape}
            color={shapeColors[i % shapeColors.length]}
            delay={15 + i * perShapeDelay}
            size={shapeSize}
            x={spacing * (i + 1)}
            y={centerY}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
