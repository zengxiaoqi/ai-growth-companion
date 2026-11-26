import React, { useId } from "react";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_FAMILY } from "../../../theme/fonts";
import type {
  ResolvedWhiteboardConfig,
  ResolvedWhiteboardRegion,
  TeachingSlide,
  WhiteboardRect,
} from "../../../data/topic-video";

type WhiteboardStorySceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type Point = { x: number; y: number };
type RevealDirection = NonNullable<ResolvedWhiteboardRegion["reveal"]>["direction"];

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const rowCountFor = (region: WhiteboardRect) =>
  Math.max(2, Math.min(18, Math.round(region.height / 34)));

const padRect = (
  rect: WhiteboardRect,
  padding: number,
  canvas: ResolvedWhiteboardConfig["canvas"],
): WhiteboardRect => {
  const x = Math.max(0, Math.floor(rect.x - padding));
  const y = Math.max(0, Math.floor(rect.y - padding));
  return {
    x,
    y,
    width: Math.min(canvas.width, Math.ceil(rect.x + rect.width + padding)) - x,
    height: Math.min(canvas.height, Math.ceil(rect.y + rect.height + padding)) - y,
  };
};

const cleanSubtitleText = (text: string) => text.replace(/\s+/g, "");

const chunkSubtitle = (text: string, maxTokens = 12): string[] => {
  const tokens = Array.from(cleanSubtitleText(text));
  const chunks: string[] = [];
  let current = "";
  for (const token of tokens) {
    current += token;
    if (current.length >= maxTokens || /[。！？!?；;]/.test(token)) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

const buildFallbackSubtitlePages = (
  data: TeachingSlide,
  durationFrames: number,
): NonNullable<TeachingSlide["subtitlePages"]> => {
  const regions = data.whiteboard?.regions || [];
  const authoredRegions = regions.filter((region) =>
    cleanSubtitleText(region.subtitle || "").length > 0,
  );
  const toPage = (text: string, startFrame: number, endFrame: number) => {
    const tokens = Array.from(cleanSubtitleText(text));
    return {
      tokens,
      starts: tokens.map((_, index) =>
        Math.round(startFrame + ((endFrame - startFrame) * index) / tokens.length),
      ),
    };
  };

  if (authoredRegions.length > 0) {
    return authoredRegions.flatMap((region) =>
      chunkSubtitle(region.subtitle || "").map((chunk, index, chunks) => {
        const chunkStart = region.startFrame + (region.durationFrames * index) / chunks.length;
        const chunkEnd = region.startFrame + (region.durationFrames * (index + 1)) / chunks.length;
        return toPage(chunk, Math.round(chunkStart), Math.round(chunkEnd));
      }),
    );
  }

  const chunks = chunkSubtitle(data.narration || "");
  if (chunks.length === 0) return [];
  const drawingEnd = regions.length > 0
    ? Math.max(...regions.map((region) => region.startFrame + region.durationFrames))
    : durationFrames;
  const totalTokens = chunks.reduce((sum, chunk) => sum + Array.from(chunk).length, 0);
  let consumedTokens = 0;
  return chunks.map((chunk) => {
    const tokenCount = Array.from(chunk).length;
    const startFrame = Math.round((consumedTokens / totalTokens) * drawingEnd);
    consumedTokens += tokenCount;
    const endFrame = Math.round((consumedTokens / totalTokens) * drawingEnd);
    return toPage(chunk, startFrame, endFrame);
  });
};

/** A continuous serpentine path whose thick stroke sweeps the whole region. */
const snakeGeometry = (
  region: WhiteboardRect,
  direction: RevealDirection = "left_to_right",
) => {
  const rows = rowCountFor(region);
  const spacing = region.height / rows;
  const points: Point[] = [];
  const startsRight = direction === "right_to_left";
  const reverseRows = direction === "bottom_to_top";
  for (let row = 0; row < rows; row += 1) {
    const rowIndex = reverseRows ? rows - 1 - row : row;
    const leftToRight = startsRight ? rowIndex % 2 !== 0 : rowIndex % 2 === 0;
    points.push({
      x: leftToRight ? region.x : region.x + region.width,
      y: region.y + spacing * (rowIndex + 0.5),
    });
    points.push({
      x: leftToRight ? region.x + region.width : region.x,
      y: region.y + spacing * (rowIndex + 0.5),
    });
  }
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const segmentLengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  return { d, points, segmentLengths, spacing, rows };
};

const pointAlongSnake = (
  geometry: ReturnType<typeof snakeGeometry>,
  progress: number,
): Point => {
  const total = geometry.segmentLengths.reduce((sum, length) => sum + length, 0);
  let remaining = clamp(progress) * total;
  for (let index = 0; index < geometry.segmentLengths.length; index += 1) {
    const length = geometry.segmentLengths[index];
    if (remaining <= length || index === geometry.segmentLengths.length - 1) {
      const t = length > 0 ? clamp(remaining / length) : 1;
      const from = geometry.points[index];
      const to = geometry.points[index + 1];
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
    }
    remaining -= length;
  }
  return geometry.points[geometry.points.length - 1];
};

const penAngleAlongSnake = (
  geometry: ReturnType<typeof snakeGeometry>,
  progress: number,
) => {
  const from = pointAlongSnake(geometry, clamp(progress - 0.002));
  const to = pointAlongSnake(geometry, clamp(progress + 0.002));
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
};

const MarkerTip: React.FC<{ point: Point; angle: number; coloring: boolean }> = ({
  point,
  angle,
  coloring,
}) => (
  <g transform={`translate(${point.x} ${point.y}) rotate(${angle})`}>
    <ellipse cx="0" cy="2" rx="13" ry="6" fill="#2F2A24" opacity="0.14" />
    <path
      d="M 0 0 L -10 -7 L -49 -7 L -59 0 L -49 7 L -10 7 Z"
      fill={coloring ? "#E9794A" : "#E8B44C"}
      stroke="#6B5434"
      strokeWidth="1.5"
    />
    <path d="M -10 -7 L -17 0 L -10 7 Z" fill="#FFF7E6" />
    <path d="M -42 -7 L -42 7" stroke="#FFF7E6" strokeWidth="3" opacity="0.7" />
  </g>
);

const WhiteboardSubtitles: React.FC<{
  data: TeachingSlide;
  durationFrames: number;
  bottom: number;
}> = ({ data, durationFrames, bottom }) => {
  const frame = useCurrentFrame();
  const pages = data.subtitlePages?.length
    ? data.subtitlePages
    : buildFallbackSubtitlePages(data, durationFrames);

  if (pages.length === 0 || frame < (pages[0].starts[0] || 0)) return null;
  let pageIndex = 0;
  for (let index = 0; index < pages.length; index += 1) {
    if (frame >= (pages[index].starts[0] || 0)) pageIndex = index;
  }
  const tokens = pages[pageIndex]?.tokens || [];
  const starts = pages[pageIndex]?.starts || [];

  if (tokens.length === 0) return null;
  const fontSize = tokens.length > 13 ? 27 : tokens.length > 9 ? 31 : 35;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        height: 102,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 48px",
        background: "linear-gradient(to top, rgba(246,241,227,1) 30%, rgba(246,241,227,0.92) 75%, rgba(246,241,227,0))",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1060,
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 800,
          lineHeight: 1.45,
          letterSpacing: "0.02em",
          color: "#2F2A24",
        }}
      >
        {tokens.map((token, index) => {
          const active = frame >= (starts[index] || 0);
          return (
            <span
              key={`${index}-${token}`}
              style={{
                opacity: active ? 1 : 0.36,
                color: active ? "#2F2A24" : "#81796D",
                transform: active ? "translateY(-1px)" : "none",
              }}
            >
              {token}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const WhiteboardStoryScene: React.FC<WhiteboardStorySceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const idPrefix = `wb-${instanceId}`;
  const config = data.whiteboard;
  if (!config) return null;

  const top = 62;
  const bottom = 102;
  const side = Math.max(32, width * 0.055);
  const availableWidth = width - side * 2;
  const availableHeight = height - top - bottom - 18;
  const scale = Math.min(availableWidth / config.canvas.width, availableHeight / config.canvas.height);
  const boardWidth = config.canvas.width * scale;
  const boardHeight = config.canvas.height * scale;
  const boardLeft = (width - boardWidth) / 2;
  const boardTop = top + (availableHeight - boardHeight) / 2;
  const image = staticFile(config.sourceImage);
  const totalDuration = durationInFrames || data.durationFrames || 180;
  const allComplete = config.regions.every(
    (region) => frame >= region.startFrame + region.durationFrames,
  );
  const activeRegion = config.regions.find(
    (region) => frame >= region.startFrame && frame < region.startFrame + region.durationFrames,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: config.paper, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: Math.max(27, width * 0.027),
          fontWeight: 900,
          color: "#3B342B",
          letterSpacing: "0.06em",
        }}
      >
        {data.title}
      </div>

      <svg
        width={boardWidth}
        height={boardHeight}
        viewBox={`0 0 ${config.canvas.width} ${config.canvas.height}`}
        style={{
          position: "absolute",
          left: boardLeft,
          top: boardTop,
          overflow: "visible",
          filter: "drop-shadow(0 10px 18px rgba(72,58,35,0.12))",
        }}
      >
        <defs>
          <filter id={`${idPrefix}-ink`} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="linear" slope="1.05" intercept="-0.025" />
              <feFuncG type="linear" slope="1.05" intercept="-0.025" />
              <feFuncB type="linear" slope="1.05" intercept="-0.025" />
            </feComponentTransfer>
            <feComponentTransfer>
              <feFuncA type="table" tableValues="1 0.94" />
            </feComponentTransfer>
          </filter>

          {config.regions.map((region, index) => {
            const futureRegions = config.regions
              .filter((candidate) => candidate.sequence > region.sequence)
              .map((candidate) => candidate.region);
            const protectedRegions = region.protectedRegions || region.reveal?.protectedRegions || [];
            const padding = region.reveal?.maskPaddingPx || 0;
            return (
              <React.Fragment key={region.id}>
                <mask id={`${idPrefix}-region-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={config.canvas.width} height={config.canvas.height}>
                  <rect x="0" y="0" width={config.canvas.width} height={config.canvas.height} fill="black" />
                  <rect {...padRect(region.region, padding, config.canvas)} fill="white" />
                  {[...futureRegions, ...protectedRegions].map((rect, rectIndex) => (
                    <rect key={rectIndex} {...padRect(rect, padding, config.canvas)} fill="black" />
                  ))}
                </mask>
              </React.Fragment>
            );
          })}
        </defs>

        <rect x="0" y="0" width={config.canvas.width} height={config.canvas.height} fill="#FFFCF4" />

        {!allComplete && config.regions.map((region, index) => {
          const local = frame - region.startFrame;
          if (local < 0) return null;
          const inkProgress = clamp(interpolate(local, [0, region.inkFrames], [0, 1]));
          const colorProgress = clamp(interpolate(local, [region.inkFrames, region.durationFrames], [0, 1]));
          const direction = region.reveal?.direction || "left_to_right";
          const geometry = snakeGeometry(region.region, direction);
          const colorRect =
            direction === "right_to_left"
              ? { x: region.region.x + region.region.width * (1 - colorProgress), width: region.region.width * colorProgress }
              : direction === "bottom_to_top"
                ? { y: region.region.y + region.region.height * (1 - colorProgress), height: region.region.height * colorProgress }
                : direction === "top_to_bottom"
                  ? { height: region.region.height * colorProgress }
                  : { width: region.region.width * colorProgress };
          const brushCenter = {
            x: direction === "right_to_left"
              ? region.region.x + region.region.width * (1 - colorProgress)
              : region.region.x + region.region.width * colorProgress,
            y: direction === "bottom_to_top"
              ? region.region.y + region.region.height * (1 - colorProgress)
              : direction === "top_to_bottom"
                ? region.region.y + region.region.height * colorProgress
                : region.region.y + region.region.height * 0.5,
          };
          const brushRadius = Math.max(region.region.width, region.region.height) * 1.5 * colorProgress;
          const inkPoint = pointAlongSnake(geometry, inkProgress);
          const inkAngle = penAngleAlongSnake(geometry, inkProgress);
          const colorAngle =
            direction === "right_to_left"
              ? 180
              : direction === "bottom_to_top"
                ? -90
                : direction === "top_to_bottom"
                  ? 90
                  : 0;

          return (
            <g key={region.id}>
              <defs>
                <mask id={`${idPrefix}-reveal-live-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={config.canvas.width} height={config.canvas.height}>
                  <rect x="0" y="0" width={config.canvas.width} height={config.canvas.height} fill="black" />
                  <path
                    d={geometry.d}
                    fill="none"
                    stroke="white"
                    strokeWidth={geometry.spacing + 2}
                    strokeLinecap="butt"
                    strokeLinejoin="round"
                    pathLength="1"
                    strokeDasharray="1"
                    strokeDashoffset={1 - inkProgress}
                  />
                </mask>
                <clipPath id={`${idPrefix}-color-live-${index}`} clipPathUnits="userSpaceOnUse">
                  <rect {...region.region} {...colorRect} />
                </clipPath>
                <radialGradient
                  id={`${idPrefix}-brush-live-${index}`}
                  gradientUnits="userSpaceOnUse"
                  cx={brushCenter.x}
                  cy={brushCenter.y}
                  r={Math.max(0.01, brushRadius)}
                >
                  <stop offset="0%" stopColor="white" />
                  <stop offset="72%" stopColor="white" />
                  <stop offset="100%" stopColor="black" />
                </radialGradient>
                <mask id={`${idPrefix}-brush-mask-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={config.canvas.width} height={config.canvas.height}>
                  <rect x="0" y="0" width={config.canvas.width} height={config.canvas.height} fill="black" />
                  <circle
                    cx={brushCenter.x}
                    cy={brushCenter.y}
                    r={Math.max(0.01, brushRadius)}
                    fill={`url(#${idPrefix}-brush-live-${index})`}
                  />
                </mask>
              </defs>
              <g mask={`url(#${idPrefix}-region-${index})`}>
                <g mask={`url(#${idPrefix}-reveal-live-${index})`}>
                  <image href={image} width={config.canvas.width} height={config.canvas.height} filter={`url(#${idPrefix}-ink)`} />
                </g>
                {colorProgress > 0 && (
                  config.colorFill === "brush" ? (
                    <g mask={`url(#${idPrefix}-brush-mask-${index})`}>
                      <image href={image} width={config.canvas.width} height={config.canvas.height} />
                    </g>
                  ) : (
                    <g clipPath={`url(#${idPrefix}-color-live-${index})`}>
                      <image href={image} width={config.canvas.width} height={config.canvas.height} />
                    </g>
                  )
                )}
              </g>
              {local < region.inkFrames && inkProgress > 0 && inkProgress < 1 && (
                <MarkerTip point={inkPoint} angle={inkAngle} coloring={false} />
              )}
              {local >= region.inkFrames && colorProgress > 0 && colorProgress < 1 && (
                <MarkerTip point={brushCenter} angle={colorAngle} coloring />
              )}
            </g>
          );
        })}

        {allComplete && (
          <image href={image} width={config.canvas.width} height={config.canvas.height} />
        )}
      </svg>

      {activeRegion && (
        <div
          style={{
            position: "absolute",
            right: side,
            top: 22,
            fontFamily: FONT_FAMILY,
            fontSize: 18,
            fontWeight: 700,
            color: "#7A6D5B",
          }}
        >
          {activeRegion.label || activeRegion.narrativeRole || `画一画 · ${activeRegion.sequence}/${config.regions.length}`}
        </div>
      )}

      <WhiteboardSubtitles data={data} durationFrames={totalDuration} bottom={0} />
    </AbsoluteFill>
  );
};
