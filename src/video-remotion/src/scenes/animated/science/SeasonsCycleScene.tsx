import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../../../components/BackgroundBubbles";
import { PALETTE } from "../../../theme/colors";
import { FONT_FAMILY } from "../../../theme/fonts";
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type SeasonConfig = {
  label: string;
  crownColor: string;
  groundColor: string;
  skyEmoji: string;
  decorEmoji: string[];
};

const SEASONS: SeasonConfig[] = [
  { label: "春", crownColor: "#FFB7C5", groundColor: "#90EE90", skyEmoji: "☀️", decorEmoji: ["🌸", "🌷", "🌸"] },
  { label: "夏", crownColor: "#228B22", groundColor: "#3CB371", skyEmoji: "☀️", decorEmoji: ["🌻", "🦋", "🌻"] },
  { label: "秋", crownColor: "#FF8C00", groundColor: "#DAA520", skyEmoji: "🌤️", decorEmoji: ["🍂", "🍁", "🍂"] },
  { label: "冬", crownColor: "transparent", groundColor: "#F0F0F0", skyEmoji: "☁️", decorEmoji: ["❄️", "⛄", "❄️"] },
];

export const SeasonsCycleScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const seasonNames: string[] = Array.isArray(params.seasonNames) && params.seasonNames.length > 0
    ? params.seasonNames.map(String)
    : SEASONS.map(s => s.label);
  const focusSeason = params.focusSeason != null ? Number(params.focusSeason) : -1;
  const showLabels = params.showLabels !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Determine current season
  const numSeasons = seasonNames.length;
  const isFocus = focusSeason >= 0 && focusSeason < numSeasons;
  const framesPerSeason = isFocus ? 999 : 90; // ~3s each if cycling
  const transitionFrames = 15;

  const currentSeasonFloat = isFocus
    ? focusSeason
    : Math.min(numSeasons - 1, frame / (framesPerSeason + transitionFrames));
  const currentIdx = Math.floor(currentSeasonFloat) % numSeasons;
  const nextIdx = (currentIdx + 1) % numSeasons;
  const crossfade = currentSeasonFloat - Math.floor(currentSeasonFloat);

  const season = SEASONS[currentIdx % SEASONS.length];
  const nextSeason = SEASONS[nextIdx % SEASONS.length];

  // Tree position
  const treeX = width / 2;
  const groundY = height * 0.72;
  const trunkW = 30;
  const trunkH = 120;
  const crownR = 80;

  // Falling leaves for autumn
  const isAutumn = currentIdx % 4 === 2;

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Sky emoji */}
      <div style={{
        position: "absolute",
        top: 30,
        right: 80,
        fontSize: 50,
        lineHeight: 1,
        zIndex: 1,
        opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        {season.skyEmoji}
      </div>

      {/* Decor emoji scattered */}
      {season.decorEmoji.map((emoji, i) => (
        <div key={i} style={{
          position: "absolute",
          left: treeX - 140 + i * 120 + Math.sin(frame / fps + i) * 10,
          top: groundY - 100 - Math.abs(Math.sin(frame / fps * 0.5 + i * 2)) * 30,
          fontSize: 36,
          lineHeight: 1,
          zIndex: 2,
        }}>
          {emoji}
        </div>
      ))}

      {/* Falling leaves for autumn */}
      {isAutumn && Array.from({ length: 5 }).map((_, i) => {
        const leafX = treeX - 100 + i * 50;
        const leafY = groundY - 150 + ((frame * 2 + i * 40) % 200);
        const leafOpacity = leafY > groundY - 20 ? interpolate(leafY, [groundY - 20, groundY], [1, 0]) : 0.7;
        return (
          <div key={`leaf-${i}`} style={{
            position: "absolute",
            left: leafX + Math.sin(frame / fps * 2 + i) * 15,
            top: leafY,
            fontSize: 24,
            opacity: leafOpacity,
            zIndex: 2,
          }}>
            🍂
          </div>
        );
      })}

      {/* Ground */}
      <div style={{
        position: "absolute",
        left: 0,
        top: groundY,
        width: "100%",
        height: height - groundY,
        backgroundColor: season.groundColor,
        zIndex: 1,
      }} />

      {/* Tree trunk */}
      <div style={{
        position: "absolute",
        left: treeX - trunkW / 2,
        top: groundY - trunkH,
        width: trunkW,
        height: trunkH,
        backgroundColor: "#8B6914",
        borderRadius: 4,
        zIndex: 2,
      }} />

      {/* Tree crown */}
      <div style={{
        position: "absolute",
        left: treeX - crownR,
        top: groundY - trunkH - crownR * 1.4,
        width: crownR * 2,
        height: crownR * 2,
        borderRadius: "50%",
        backgroundColor: season.crownColor,
        border: season.crownColor === "transparent" ? "none" : `3px solid ${season.crownColor}`,
        zIndex: 2,
      }} />

      {/* Next season crossfade crown */}
      {crossfade > 0.5 && nextSeason.crownColor !== "transparent" && (
        <div style={{
          position: "absolute",
          left: treeX - crownR,
          top: groundY - trunkH - crownR * 1.4,
          width: crownR * 2,
          height: crownR * 2,
          borderRadius: "50%",
          backgroundColor: nextSeason.crownColor,
          opacity: (crossfade - 0.5) * 2,
          zIndex: 2,
        }} />
      )}

      {/* Season label */}
      {showLabels && (
        <div style={{
          position: "absolute",
          bottom: 40,
          width: "100%",
          textAlign: "center",
          zIndex: 3,
        }}>
          <div style={{
            fontFamily: FONT_FAMILY,
            fontSize: 56,
            fontWeight: 900,
            color: data.accentColor,
            textShadow: `0 3px 16px ${data.accentColor}44`,
            display: "flex",
            justifyContent: "center",
            gap: 20,
          }}>
            {seasonNames.map((name, i) => (
              <span key={i} style={{
                opacity: i === currentIdx ? 1 : 0.35,
                transform: `scale(${i === currentIdx ? 1.2 : 1})`,
                transition: "all 0.3s",
              }}>
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
