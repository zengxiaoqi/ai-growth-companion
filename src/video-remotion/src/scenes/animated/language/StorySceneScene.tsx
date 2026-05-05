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
import { FONT_FAMILY, FONT_SIZES } from "../../../theme/fonts";
import {
  staggerDelay,
  resolveSvgItem,
} from "../../../utils/animation-helpers";
import type { SvgItemDescriptor } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type StorySceneParams = {
  bgType?: "day" | "night" | "indoor";
  characters?: string[];
  items?: string[];
};

type BgConfig = {
  skyColor: string;
  groundColor: string;
  groundY: number;
  celestialType?: "sun" | "moon";
  celestialX: number;
  celestialY: number;
};

const BG_CONFIGS: Record<string, BgConfig> = {
  day: {
    skyColor: "#87CEEB",
    groundColor: "#7BC67E",
    groundY: 0.72,
    celestialType: "sun",
    celestialX: 0.85,
    celestialY: 0.12,
  },
  night: {
    skyColor: "#1B2838",
    groundColor: "#2D4A2D",
    groundY: 0.72,
    celestialType: "moon",
    celestialX: 0.82,
    celestialY: 0.1,
  },
  indoor: {
    skyColor: "#FFF3E0",
    groundColor: "#D7CCC8",
    groundY: 0.78,
    celestialX: 0.8,
    celestialY: 0.1,
  },
};

// ---------------------------------------------------------------------------
// Inline SVG renderers
// ---------------------------------------------------------------------------

/** SVG sun with triangle rays and radial gradient */
const SunSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFF176" />
        <stop offset="100%" stopColor="#FFB300" />
      </radialGradient>
    </defs>
    {/* Triangle rays */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
      <polygon
        key={`ray-${angle}`}
        points="46,4 54,4 50,22"
        fill="#FFD54F"
        transform={`rotate(${angle} 50 50)`}
      />
    ))}
    <circle cx="50" cy="50" r="22" fill="url(#sunGrad)" />
  </svg>
);

/** SVG crescent moon with craters */
const MoonSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="moonGrad" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#FFF9C4" />
        <stop offset="100%" stopColor="#F9A825" />
      </radialGradient>
    </defs>
    {/* Crescent via two overlapping circles */}
    <clipPath id="crescentClip">
      <rect x="0" y="0" width="100" height="100" />
    </clipPath>
    <circle cx="50" cy="50" r="32" fill="url(#moonGrad)" />
    <circle cx="64" cy="42" r="26" fill="#1B2838" />
    {/* Craters */}
    <circle cx="36" cy="44" r="4" fill="#FBC02D" opacity={0.35} />
    <circle cx="44" cy="62" r="3" fill="#FBC02D" opacity={0.3} />
    <circle cx="30" cy="58" r="2.5" fill="#FBC02D" opacity={0.25} />
  </svg>
);

/** SVG star polygon with gradient */
const StarSvg: React.FC<{ size: number; opacity?: number }> = ({
  size,
  opacity = 1,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    style={{ opacity }}
  >
    <defs>
      <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF176" />
        <stop offset="100%" stopColor="#FFC107" />
      </linearGradient>
    </defs>
    <polygon
      points="50,5 61,35 95,35 68,57 79,90 50,70 21,90 32,57 5,35 39,35"
      fill="url(#starGrad)"
    />
  </svg>
);

/** Render a character as a simple cartoon circle with face + label */
const CharacterSvg: React.FC<{
  descriptor: SvgItemDescriptor;
  size: number;
}> = ({ descriptor, size }) => {
  const { primaryColor, secondaryColor, label } = descriptor;
  return (
    <svg
      width={size}
      height={size + 22}
      viewBox="0 0 80 102"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Body circle */}
      <circle cx="40" cy="40" r="36" fill={primaryColor} />
      <circle cx="40" cy="40" r="36" fill="none" stroke={secondaryColor} strokeWidth="3" />
      {/* Eyes */}
      <circle cx="28" cy="34" r="5" fill="#FFFFFF" />
      <circle cx="52" cy="34" r="5" fill="#FFFFFF" />
      <circle cx="29" cy="34" r="2.8" fill="#333333" />
      <circle cx="53" cy="34" r="2.8" fill="#333333" />
      {/* Smile */}
      <path
        d="M 28 48 Q 40 60 52 48"
        fill="none"
        stroke="#333333"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Label */}
      {label && (
        <text
          x="40"
          y="90"
          textAnchor="middle"
          fontSize="14"
          fontFamily={FONT_FAMILY}
          fontWeight={700}
          fill="#333333"
        >
          {label}
        </text>
      )}
    </svg>
  );
};

/** Render an item as an SVG mini-illustration based on its shape */
const ItemSvg: React.FC<{
  descriptor: SvgItemDescriptor;
  size: number;
}> = ({ descriptor, size }) => {
  const { shape, primaryColor, secondaryColor, label } = descriptor;

  const viewBoxW = 80;
  const viewBoxH = label ? 100 : 78;

  switch (shape) {
    case "tree":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Trunk */}
          <rect x="34" y="46" width="12" height="24" rx="2" fill={secondaryColor} />
          {/* Canopy */}
          <ellipse cx="40" cy="34" rx="28" ry="24" fill={primaryColor} />
          <ellipse cx="40" cy="30" rx="22" ry="18" fill={primaryColor} opacity={0.8} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "house":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Roof */}
          <polygon points="40,8 8,42 72,42" fill={secondaryColor} />
          {/* Walls */}
          <rect x="14" y="42" width="52" height="30" rx="2" fill={primaryColor} />
          {/* Door */}
          <rect x="32" y="52" width="16" height="20" rx="2" fill={secondaryColor} opacity={0.6} />
          {/* Window */}
          <rect x="20" y="48" width="10" height="10" rx="1" fill="#E3F2FD" stroke={secondaryColor} strokeWidth="1" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "flower":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Stem */}
          <line x1="40" y1="70" x2="40" y2="38" stroke={secondaryColor} strokeWidth="4" strokeLinecap="round" />
          {/* Leaf */}
          <ellipse cx="50" cy="56" rx="10" ry="5" fill={secondaryColor} transform="rotate(-30 50 56)" />
          {/* Petals */}
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <circle
              key={`petal-${angle}`}
              cx={40 + 12 * Math.cos((angle * Math.PI) / 180)}
              cy={28 + 12 * Math.sin((angle * Math.PI) / 180)}
              r="9"
              fill={primaryColor}
            />
          ))}
          {/* Center */}
          <circle cx="40" cy="28" r="7" fill="#FFF176" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "bird":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="40" rx="22" ry="16" fill={primaryColor} />
          {/* Head */}
          <circle cx="58" cy="32" r="10" fill={primaryColor} />
          {/* Beak */}
          <polygon points="68,30 76,33 68,36" fill="#FF8F00" />
          {/* Eye */}
          <circle cx="60" cy="30" r="2.5" fill="#333333" />
          {/* Wing */}
          <ellipse cx="34" cy="36" rx="14" ry="8" fill={secondaryColor} />
          {/* Tail */}
          <polygon points="18,36 8,28 10,44" fill={secondaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "fish":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="42" cy="38" rx="24" ry="14" fill={primaryColor} />
          {/* Tail */}
          <polygon points="18,38 4,26 4,50" fill={secondaryColor} />
          {/* Eye */}
          <circle cx="54" cy="35" r="4" fill="#FFFFFF" />
          <circle cx="55" cy="35" r="2" fill="#333333" />
          {/* Fin */}
          <ellipse cx="36" cy="28" rx="8" ry="5" fill={secondaryColor} opacity={0.6} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "cat":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="48" rx="20" ry="16" fill={primaryColor} />
          {/* Head */}
          <circle cx="40" cy="28" r="18" fill={primaryColor} />
          {/* Ears */}
          <polygon points="26,16 22,2 34,12" fill={primaryColor} stroke={secondaryColor} strokeWidth="1" />
          <polygon points="54,16 58,2 46,12" fill={primaryColor} stroke={secondaryColor} strokeWidth="1" />
          {/* Inner ears */}
          <polygon points="27,15 24,6 33,13" fill="#FFAB91" />
          <polygon points="53,15 56,6 47,13" fill="#FFAB91" />
          {/* Eyes */}
          <circle cx="33" cy="26" r="4" fill="#FFFFFF" />
          <circle cx="47" cy="26" r="4" fill="#FFFFFF" />
          <circle cx="34" cy="26" r="2" fill="#333333" />
          <circle cx="48" cy="26" r="2" fill="#333333" />
          {/* Nose */}
          <polygon points="40,31 38,33 42,33" fill="#FF8A65" />
          {/* Whiskers */}
          <line x1="20" y1="30" x2="32" y2="32" stroke={secondaryColor} strokeWidth="1" />
          <line x1="20" y1="34" x2="32" y2="34" stroke={secondaryColor} strokeWidth="1" />
          <line x1="48" y1="32" x2="60" y2="30" stroke={secondaryColor} strokeWidth="1" />
          <line x1="48" y1="34" x2="60" y2="34" stroke={secondaryColor} strokeWidth="1" />
          {/* Tail */}
          <path d="M 58 50 Q 72 36 66 26" fill="none" stroke={primaryColor} strokeWidth="4" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "dog":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="50" rx="22" ry="16" fill={primaryColor} />
          {/* Head */}
          <circle cx="40" cy="28" r="18" fill={primaryColor} />
          {/* Floppy ears */}
          <ellipse cx="20" cy="30" rx="10" ry="16" fill={secondaryColor} transform="rotate(-15 20 30)" />
          <ellipse cx="60" cy="30" rx="10" ry="16" fill={secondaryColor} transform="rotate(15 60 30)" />
          {/* Eyes */}
          <circle cx="33" cy="25" r="4" fill="#FFFFFF" />
          <circle cx="47" cy="25" r="4" fill="#FFFFFF" />
          <circle cx="34" cy="25" r="2.2" fill="#333333" />
          <circle cx="48" cy="25" r="2.2" fill="#333333" />
          {/* Nose */}
          <ellipse cx="40" cy="33" rx="4" ry="3" fill="#333333" />
          {/* Mouth */}
          <path d="M 36 36 Q 40 40 44 36" fill="none" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          {/* Tail */}
          <path d="M 60 48 Q 72 38 68 28" fill="none" stroke={primaryColor} strokeWidth="4" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "cloud":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <circle cx="30" cy="40" r="16" fill={primaryColor} />
          <circle cx="48" cy="36" r="20" fill={primaryColor} />
          <circle cx="64" cy="42" r="14" fill={primaryColor} />
          <rect x="20" y="40" width="52" height="16" rx="4" fill={primaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "mountain":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <polygon points="40,8 8,68 72,68" fill={primaryColor} />
          <polygon points="40,8 32,24 48,24" fill="#FFFFFF" opacity={0.7} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "river":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <path d="M 8 30 Q 24 20 40 30 Q 56 40 72 30" fill="none" stroke={primaryColor} strokeWidth="8" strokeLinecap="round" />
          <path d="M 8 50 Q 24 40 40 50 Q 56 60 72 50" fill="none" stroke={secondaryColor} strokeWidth="6" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "book":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Left page */}
          <rect x="10" y="14" width="28" height="44" rx="2" fill={primaryColor} />
          {/* Right page */}
          <rect x="42" y="14" width="28" height="44" rx="2" fill="#FFFFFF" stroke={primaryColor} strokeWidth="2" />
          {/* Spine */}
          <line x1="40" y1="12" x2="40" y2="60" stroke={secondaryColor} strokeWidth="3" />
          {/* Page lines */}
          <line x1="18" y1="26" x2="32" y2="26" stroke={secondaryColor} strokeWidth="1.5" opacity={0.4} />
          <line x1="18" y1="34" x2="32" y2="34" stroke={secondaryColor} strokeWidth="1.5" opacity={0.4} />
          <line x1="18" y1="42" x2="32" y2="42" stroke={secondaryColor} strokeWidth="1.5" opacity={0.4} />
          <line x1="50" y1="26" x2="64" y2="26" stroke="#B0BEC5" strokeWidth="1.5" opacity={0.4} />
          <line x1="50" y1="34" x2="64" y2="34" stroke="#B0BEC5" strokeWidth="1.5" opacity={0.4} />
          <line x1="50" y1="42" x2="64" y2="42" stroke="#B0BEC5" strokeWidth="1.5" opacity={0.4} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "sun":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="itemSunGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF176" />
              <stop offset="100%" stopColor="#FFB300" />
            </radialGradient>
          </defs>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <polygon
              key={`item-ray-${angle}`}
              points="37,6 43,6 40,16"
              fill="#FFD54F"
              transform={`rotate(${angle} 40 40)`}
            />
          ))}
          <circle cx="40" cy="40" r="18" fill="url(#itemSunGrad)" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "moon":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="itemMoonGrad" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#FFF9C4" />
              <stop offset="100%" stopColor="#F9A825" />
            </radialGradient>
          </defs>
          <circle cx="40" cy="38" r="24" fill="url(#itemMoonGrad)" />
          <circle cx="52" cy="32" r="20" fill={viewBoxH > 80 ? "#FFF3E0" : "#1B2838"} />
          <circle cx="30" cy="34" r="3" fill="#FBC02D" opacity={0.35} />
          <circle cx="36" cy="48" r="2" fill="#FBC02D" opacity={0.3} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "star":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="itemStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF176" />
              <stop offset="100%" stopColor="#FFC107" />
            </linearGradient>
          </defs>
          <polygon
            points="40,6 47,28 70,28 52,42 58,64 40,50 22,64 28,42 10,28 33,28"
            fill="url(#itemStarGrad)"
          />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "monkey":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ears */}
          <circle cx="16" cy="28" r="10" fill={secondaryColor} />
          <circle cx="64" cy="28" r="10" fill={secondaryColor} />
          <circle cx="16" cy="28" r="6" fill="#FFCCBC" />
          <circle cx="64" cy="28" r="6" fill="#FFCCBC" />
          {/* Head */}
          <circle cx="40" cy="34" r="24" fill={primaryColor} />
          {/* Face */}
          <ellipse cx="40" cy="40" rx="16" ry="14" fill="#FFCCBC" />
          {/* Eyes */}
          <circle cx="32" cy="32" r="4" fill="#FFFFFF" />
          <circle cx="48" cy="32" r="4" fill="#FFFFFF" />
          <circle cx="33" cy="32" r="2.2" fill="#333333" />
          <circle cx="49" cy="32" r="2.2" fill="#333333" />
          {/* Nose */}
          <ellipse cx="40" cy="40" rx="3" ry="2" fill={secondaryColor} />
          {/* Smile */}
          <path d="M 34 45 Q 40 52 46 45" fill="none" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "rabbit":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ears */}
          <ellipse cx="30" cy="12" rx="7" ry="18" fill={primaryColor} />
          <ellipse cx="50" cy="12" rx="7" ry="18" fill={primaryColor} />
          <ellipse cx="30" cy="12" rx="4" ry="14" fill="#F8BBD0" />
          <ellipse cx="50" cy="12" rx="4" ry="14" fill="#F8BBD0" />
          {/* Head */}
          <circle cx="40" cy="40" r="22" fill={primaryColor} />
          {/* Eyes */}
          <circle cx="32" cy="36" r="4" fill="#FFFFFF" />
          <circle cx="48" cy="36" r="4" fill="#FFFFFF" />
          <circle cx="33" cy="36" r="2.2" fill="#E91E63" />
          <circle cx="49" cy="36" r="2.2" fill="#E91E63" />
          {/* Nose */}
          <ellipse cx="40" cy="43" rx="2.5" ry="2" fill="#F8BBD0" />
          {/* Whiskers */}
          <line x1="22" y1="42" x2="32" y2="44" stroke="#BDBDBD" strokeWidth="1" />
          <line x1="22" y1="46" x2="32" y2="45" stroke="#BDBDBD" strokeWidth="1" />
          <line x1="58" y1="42" x2="48" y2="44" stroke="#BDBDBD" strokeWidth="1" />
          <line x1="58" y1="46" x2="48" y2="45" stroke="#BDBDBD" strokeWidth="1" />
          {/* Mouth */}
          <path d="M 37 47 Q 40 50 43 47" fill="none" stroke="#BDBDBD" strokeWidth="1" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "bear":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ears */}
          <circle cx="18" cy="22" r="10" fill={primaryColor} />
          <circle cx="62" cy="22" r="10" fill={primaryColor} />
          <circle cx="18" cy="22" r="6" fill={secondaryColor} />
          <circle cx="62" cy="22" r="6" fill={secondaryColor} />
          {/* Head */}
          <circle cx="40" cy="38" r="24" fill={primaryColor} />
          {/* Muzzle */}
          <ellipse cx="40" cy="46" rx="12" ry="9" fill="#BCAAA4" />
          {/* Eyes */}
          <circle cx="32" cy="34" r="3.5" fill="#FFFFFF" />
          <circle cx="48" cy="34" r="3.5" fill="#FFFFFF" />
          <circle cx="33" cy="34" r="2" fill="#333333" />
          <circle cx="49" cy="34" r="2" fill="#333333" />
          {/* Nose */}
          <ellipse cx="40" cy="43" rx="4" ry="3" fill={secondaryColor} />
          {/* Mouth */}
          <path d="M 36 49 Q 40 53 44 49" fill="none" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "panda":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ears */}
          <circle cx="18" cy="22" r="10" fill={secondaryColor} />
          <circle cx="62" cy="22" r="10" fill={secondaryColor} />
          {/* Head */}
          <circle cx="40" cy="38" r="24" fill={primaryColor} />
          {/* Eye patches */}
          <ellipse cx="30" cy="34" rx="9" ry="7" fill={secondaryColor} />
          <ellipse cx="50" cy="34" rx="9" ry="7" fill={secondaryColor} />
          {/* Eyes */}
          <circle cx="30" cy="34" r="4" fill="#FFFFFF" />
          <circle cx="50" cy="34" r="4" fill="#FFFFFF" />
          <circle cx="31" cy="34" r="2.2" fill="#333333" />
          <circle cx="51" cy="34" r="2.2" fill="#333333" />
          {/* Nose */}
          <ellipse cx="40" cy="43" rx="4" ry="3" fill={secondaryColor} />
          {/* Mouth */}
          <path d="M 36 48 Q 40 52 44 48" fill="none" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "penguin":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="46" rx="22" ry="26" fill={primaryColor} />
          {/* Belly */}
          <ellipse cx="40" cy="50" rx="14" ry="18" fill="#FFFFFF" />
          {/* Flippers */}
          <ellipse cx="16" cy="46" rx="6" ry="14" fill={primaryColor} transform="rotate(15 16 46)" />
          <ellipse cx="64" cy="46" rx="6" ry="14" fill={primaryColor} transform="rotate(-15 64 46)" />
          {/* Eyes */}
          <circle cx="32" cy="30" r="4" fill="#FFFFFF" />
          <circle cx="48" cy="30" r="4" fill="#FFFFFF" />
          <circle cx="33" cy="30" r="2.2" fill="#333333" />
          <circle cx="49" cy="30" r="2.2" fill="#333333" />
          {/* Beak */}
          <polygon points="37,38 43,38 40,44" fill={secondaryColor} />
          {/* Feet */}
          <ellipse cx="32" cy="70" rx="8" ry="3" fill={secondaryColor} />
          <ellipse cx="48" cy="70" rx="8" ry="3" fill={secondaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "elephant":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ears */}
          <ellipse cx="16" cy="32" rx="14" ry="18" fill={secondaryColor} />
          <ellipse cx="64" cy="32" rx="14" ry="18" fill={secondaryColor} />
          {/* Head */}
          <circle cx="40" cy="34" r="22" fill={primaryColor} />
          {/* Trunk */}
          <path d="M 40 44 Q 38 54 34 62 Q 32 66 36 66 Q 40 66 42 62 Q 44 54 42 44" fill={primaryColor} stroke={secondaryColor} strokeWidth="1" />
          {/* Eyes */}
          <circle cx="32" cy="30" r="3.5" fill="#FFFFFF" />
          <circle cx="48" cy="30" r="3.5" fill="#FFFFFF" />
          <circle cx="33" cy="30" r="2" fill="#333333" />
          <circle cx="49" cy="30" r="2" fill="#333333" />
          {/* Tusks */}
          <path d="M 34 48 Q 30 54 32 56" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 46 48 Q 50 54 48 56" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "lion":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Mane */}
          {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((angle) => (
            <circle
              key={`mane-${angle}`}
              cx={40 + 22 * Math.cos((angle * Math.PI) / 180)}
              cy={36 + 22 * Math.sin((angle * Math.PI) / 180)}
              r="10"
              fill={secondaryColor}
            />
          ))}
          {/* Head */}
          <circle cx="40" cy="36" r="20" fill={primaryColor} />
          {/* Eyes */}
          <circle cx="33" cy="32" r="3.5" fill="#FFFFFF" />
          <circle cx="47" cy="32" r="3.5" fill="#FFFFFF" />
          <circle cx="34" cy="32" r="2" fill="#333333" />
          <circle cx="48" cy="32" r="2" fill="#333333" />
          {/* Nose */}
          <ellipse cx="40" cy="40" rx="4" ry="3" fill={secondaryColor} />
          {/* Mouth */}
          <path d="M 36 45 Q 40 49 44 45" fill="none" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "giraffe":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Neck */}
          <rect x="34" y="24" width="12" height="36" rx="4" fill={primaryColor} />
          {/* Spots on neck */}
          <circle cx="38" cy="34" r="3" fill={secondaryColor} opacity={0.6} />
          <circle cx="42" cy="44" r="2.5" fill={secondaryColor} opacity={0.6} />
          <circle cx="37" cy="52" r="2" fill={secondaryColor} opacity={0.6} />
          {/* Head */}
          <ellipse cx="40" cy="18" rx="12" ry="10" fill={primaryColor} />
          {/* Ossicones (horns) */}
          <line x1="34" y1="10" x2="34" y2="4" stroke={secondaryColor} strokeWidth="3" strokeLinecap="round" />
          <line x1="46" y1="10" x2="46" y2="4" stroke={secondaryColor} strokeWidth="3" strokeLinecap="round" />
          <circle cx="34" cy="4" r="2.5" fill={secondaryColor} />
          <circle cx="46" cy="4" r="2.5" fill={secondaryColor} />
          {/* Eyes */}
          <circle cx="35" cy="17" r="3" fill="#FFFFFF" />
          <circle cx="45" cy="17" r="3" fill="#FFFFFF" />
          <circle cx="36" cy="17" r="1.8" fill="#333333" />
          <circle cx="46" cy="17" r="1.8" fill="#333333" />
          {/* Mouth */}
          <path d="M 37 23 Q 40 26 43 23" fill="none" stroke="#333333" strokeWidth="1.2" strokeLinecap="round" />
          {/* Body */}
          <ellipse cx="40" cy="68" rx="18" ry="10" fill={primaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "frog":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="50" rx="24" ry="18" fill={primaryColor} />
          {/* Belly */}
          <ellipse cx="40" cy="54" rx="16" ry="12" fill="#A5D6A7" />
          {/* Head */}
          <ellipse cx="40" cy="32" rx="20" ry="14" fill={primaryColor} />
          {/* Eye bumps */}
          <circle cx="28" cy="24" r="10" fill={primaryColor} />
          <circle cx="52" cy="24" r="10" fill={primaryColor} />
          {/* Eyes */}
          <circle cx="28" cy="24" r="6" fill="#FFFFFF" />
          <circle cx="52" cy="24" r="6" fill="#FFFFFF" />
          <circle cx="29" cy="24" r="3" fill="#333333" />
          <circle cx="53" cy="24" r="3" fill="#333333" />
          {/* Mouth */}
          <path d="M 26 38 Q 40 46 54 38" fill="none" stroke={secondaryColor} strokeWidth="2" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "butterfly":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Left wings */}
          <ellipse cx="22" cy="30" rx="16" ry="12" fill={primaryColor} />
          <ellipse cx="24" cy="50" rx="12" ry="10" fill={primaryColor} opacity={0.8} />
          {/* Right wings */}
          <ellipse cx="58" cy="30" rx="16" ry="12" fill={primaryColor} />
          <ellipse cx="56" cy="50" rx="12" ry="10" fill={primaryColor} opacity={0.8} />
          {/* Wing patterns */}
          <circle cx="22" cy="30" r="5" fill={secondaryColor} opacity={0.6} />
          <circle cx="58" cy="30" r="5" fill={secondaryColor} opacity={0.6} />
          <circle cx="24" cy="50" r="3.5" fill={secondaryColor} opacity={0.6} />
          <circle cx="56" cy="50" r="3.5" fill={secondaryColor} opacity={0.6} />
          {/* Body */}
          <ellipse cx="40" cy="40" rx="4" ry="18" fill="#333333" />
          {/* Antennae */}
          <line x1="38" y1="24" x2="32" y2="14" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="42" y1="24" x2="48" y2="14" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="32" cy="14" r="2" fill="#333333" />
          <circle cx="48" cy="14" r="2" fill="#333333" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "bee":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Wings */}
          <ellipse cx="28" cy="24" rx="14" ry="10" fill="#E3F2FD" opacity={0.7} />
          <ellipse cx="52" cy="24" rx="14" ry="10" fill="#E3F2FD" opacity={0.7} />
          {/* Body */}
          <ellipse cx="40" cy="38" rx="18" ry="16" fill={primaryColor} />
          {/* Stripes */}
          <rect x="24" y="32" width="32" height="4" rx="2" fill={secondaryColor} />
          <rect x="26" y="40" width="28" height="4" rx="2" fill={secondaryColor} />
          <rect x="28" y="48" width="24" height="3" rx="1.5" fill={secondaryColor} />
          {/* Eyes */}
          <circle cx="34" cy="30" r="3" fill="#FFFFFF" />
          <circle cx="46" cy="30" r="3" fill="#FFFFFF" />
          <circle cx="35" cy="30" r="1.8" fill="#333333" />
          <circle cx="47" cy="30" r="1.8" fill="#333333" />
          {/* Antennae */}
          <line x1="36" y1="22" x2="30" y2="12" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="44" y1="22" x2="50" y2="12" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="30" cy="12" r="2" fill="#333333" />
          <circle cx="50" cy="12" r="2" fill="#333333" />
          {/* Stinger */}
          <polygon points="38,54 42,54 40,60" fill={secondaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "snake":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body coil */}
          <path d="M 20 20 Q 60 20 60 36 Q 60 52 20 52 Q 20 68 60 68" fill="none" stroke={primaryColor} strokeWidth="10" strokeLinecap="round" />
          {/* Belly highlight */}
          <path d="M 20 20 Q 60 20 60 36 Q 60 52 20 52 Q 20 68 60 68" fill="none" stroke="#A5D6A7" strokeWidth="4" strokeLinecap="round" />
          {/* Head */}
          <ellipse cx="20" cy="16" rx="8" ry="6" fill={primaryColor} />
          {/* Eyes */}
          <circle cx="17" cy="14" r="2.5" fill="#FFFFFF" />
          <circle cx="24" cy="14" r="2.5" fill="#FFFFFF" />
          <circle cx="17" cy="14" r="1.3" fill="#333333" />
          <circle cx="24" cy="14" r="1.3" fill="#333333" />
          {/* Tongue */}
          <line x1="12" y1="18" x2="6" y2="16" stroke="#E53935" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="18" x2="6" y2="20" stroke="#E53935" strokeWidth="1.5" strokeLinecap="round" />
          {/* Pattern dots */}
          <circle cx="40" cy="28" r="3" fill={secondaryColor} opacity={0.5} />
          <circle cx="40" cy="44" r="3" fill={secondaryColor} opacity={0.5} />
          <circle cx="40" cy="60" r="3" fill={secondaryColor} opacity={0.5} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "turtle":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Shell */}
          <ellipse cx="40" cy="42" rx="24" ry="18" fill={primaryColor} />
          {/* Shell pattern */}
          <path d="M 28 42 Q 40 30 52 42" fill="none" stroke="#388E3C" strokeWidth="1.5" />
          <path d="M 24 42 Q 40 50 56 42" fill="none" stroke="#388E3C" strokeWidth="1.5" />
          <line x1="40" y1="26" x2="40" y2="58" stroke="#388E3C" strokeWidth="1" />
          {/* Head */}
          <circle cx="16" cy="38" r="8" fill="#66BB6A" />
          {/* Eyes */}
          <circle cx="13" cy="36" r="2.5" fill="#FFFFFF" />
          <circle cx="14" cy="36" r="1.5" fill="#333333" />
          {/* Legs */}
          <ellipse cx="26" cy="58" rx="5" ry="4" fill="#66BB6A" />
          <ellipse cx="54" cy="58" rx="5" ry="4" fill="#66BB6A" />
          {/* Tail */}
          <polygon points="64,44 70,42 64,46" fill="#66BB6A" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "owl":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ear tufts */}
          <polygon points="24,18 20,4 30,14" fill={primaryColor} />
          <polygon points="56,18 60,4 50,14" fill={primaryColor} />
          {/* Body */}
          <ellipse cx="40" cy="48" rx="22" ry="22" fill={primaryColor} />
          {/* Belly */}
          <ellipse cx="40" cy="54" rx="14" ry="14" fill="#D7CCC8" />
          {/* Belly pattern */}
          <path d="M 32 48 Q 36 52 32 56" fill="none" stroke={primaryColor} strokeWidth="1" opacity={0.4} />
          <path d="M 40 46 Q 44 50 40 54" fill="none" stroke={primaryColor} strokeWidth="1" opacity={0.4} />
          <path d="M 48 48 Q 52 52 48 56" fill="none" stroke={primaryColor} strokeWidth="1" opacity={0.4} />
          {/* Eye circles */}
          <circle cx="30" cy="32" r="10" fill="#FFFFFF" />
          <circle cx="50" cy="32" r="10" fill="#FFFFFF" />
          {/* Eyes */}
          <circle cx="30" cy="32" r="5" fill={secondaryColor} />
          <circle cx="50" cy="32" r="5" fill={secondaryColor} />
          <circle cx="30" cy="32" r="2.5" fill="#333333" />
          <circle cx="50" cy="32" r="2.5" fill="#333333" />
          {/* Beak */}
          <polygon points="37,40 43,40 40,46" fill="#FF8F00" />
          {/* Wings */}
          <path d="M 16 44 Q 10 36 16 30 Q 18 38 20 44" fill={secondaryColor} opacity={0.3} />
          <path d="M 64 44 Q 70 36 64 30 Q 62 38 60 44" fill={secondaryColor} opacity={0.3} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "horse":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Neck */}
          <path d="M 30 38 Q 28 24 34 14 L 46 14 Q 52 24 50 38 Z" fill={primaryColor} />
          {/* Head */}
          <ellipse cx="40" cy="14" rx="14" ry="10" fill={primaryColor} />
          {/* Mane */}
          <path d="M 32 14 Q 28 20 30 28 Q 32 20 34 14" fill={secondaryColor} />
          <path d="M 34 12 Q 30 18 32 26 Q 34 18 36 12" fill={secondaryColor} />
          {/* Eyes */}
          <circle cx="34" cy="12" r="3" fill="#FFFFFF" />
          <circle cx="46" cy="12" r="3" fill="#FFFFFF" />
          <circle cx="35" cy="12" r="1.8" fill="#333333" />
          <circle cx="47" cy="12" r="1.8" fill="#333333" />
          {/* Nostrils */}
          <circle cx="30" cy="18" r="1.5" fill={secondaryColor} />
          <circle cx="36" cy="18" r="1.5" fill={secondaryColor} />
          {/* Body */}
          <ellipse cx="40" cy="56" rx="22" ry="14" fill={primaryColor} />
          {/* Legs */}
          <rect x="24" y="66" width="5" height="10" rx="2" fill={primaryColor} />
          <rect x="35" y="66" width="5" height="10" rx="2" fill={primaryColor} />
          <rect x="46" y="66" width="5" height="10" rx="2" fill={primaryColor} />
          <rect x="55" y="66" width="5" height="10" rx="2" fill={primaryColor} />
          {/* Hooves */}
          <rect x="23" y="74" width="7" height="3" rx="1" fill={secondaryColor} />
          <rect x="34" y="74" width="7" height="3" rx="1" fill={secondaryColor} />
          <rect x="45" y="74" width="7" height="3" rx="1" fill={secondaryColor} />
          <rect x="54" y="74" width="7" height="3" rx="1" fill={secondaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "cow":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ears */}
          <ellipse cx="18" cy="22" rx="8" ry="5" fill={primaryColor} transform="rotate(-30 18 22)" />
          <ellipse cx="62" cy="22" rx="8" ry="5" fill={primaryColor} transform="rotate(30 62 22)" />
          {/* Head */}
          <circle cx="40" cy="30" r="20" fill={primaryColor} />
          {/* Spots */}
          <circle cx="32" cy="24" r="6" fill={secondaryColor} />
          <circle cx="50" cy="28" r="5" fill={secondaryColor} />
          {/* Eyes */}
          <circle cx="32" cy="30" r="3.5" fill="#FFFFFF" />
          <circle cx="48" cy="30" r="3.5" fill="#FFFFFF" />
          <circle cx="33" cy="30" r="2" fill="#333333" />
          <circle cx="49" cy="30" r="2" fill="#333333" />
          {/* Muzzle */}
          <ellipse cx="40" cy="42" rx="10" ry="7" fill="#FFCCBC" />
          {/* Nostrils */}
          <circle cx="36" cy="42" r="2" fill="#BCAAA4" />
          <circle cx="44" cy="42" r="2" fill="#BCAAA4" />
          {/* Horns */}
          <path d="M 30 14 Q 28 6 24 4" fill="none" stroke="#BCAAA4" strokeWidth="3" strokeLinecap="round" />
          <path d="M 50 14 Q 52 6 56 4" fill="none" stroke="#BCAAA4" strokeWidth="3" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "pig":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Ears */}
          <polygon points="20,20 14,8 28,14" fill={primaryColor} />
          <polygon points="60,20 66,8 52,14" fill={primaryColor} />
          {/* Head */}
          <circle cx="40" cy="34" r="22" fill={primaryColor} />
          {/* Snout */}
          <ellipse cx="40" cy="42" rx="10" ry="7" fill={secondaryColor} />
          {/* Nostrils */}
          <circle cx="36" cy="42" r="2.5" fill="#C2185B" />
          <circle cx="44" cy="42" r="2.5" fill="#C2185B" />
          {/* Eyes */}
          <circle cx="32" cy="30" r="4" fill="#FFFFFF" />
          <circle cx="48" cy="30" r="4" fill="#FFFFFF" />
          <circle cx="33" cy="30" r="2.2" fill="#333333" />
          <circle cx="49" cy="30" r="2.2" fill="#333333" />
          {/* Smile */}
          <path d="M 34 46 Q 40 50 46 46" fill="none" stroke="#C2185B" strokeWidth="1.2" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "chicken":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Comb */}
          <path d="M 36 12 Q 34 6 38 8 Q 40 4 42 8 Q 46 6 44 12" fill="#E53935" />
          {/* Head */}
          <circle cx="40" cy="24" r="14" fill={primaryColor} />
          {/* Body */}
          <ellipse cx="40" cy="50" rx="20" ry="16" fill="#FFF9C4" />
          {/* Wing */}
          <ellipse cx="54" cy="48" rx="10" ry="12" fill={secondaryColor} opacity={0.3} />
          {/* Eyes */}
          <circle cx="34" cy="22" r="3" fill="#FFFFFF" />
          <circle cx="46" cy="22" r="3" fill="#FFFFFF" />
          <circle cx="35" cy="22" r="1.8" fill="#333333" />
          <circle cx="47" cy="22" r="1.8" fill="#333333" />
          {/* Beak */}
          <polygon points="44,28 52,26 44,32" fill="#FF8F00" />
          {/* Wattle */}
          <ellipse cx="42" cy="34" rx="3" ry="4" fill="#E53935" />
          {/* Tail */}
          <path d="M 58 44 Q 66 36 68 42 Q 64 38 62 46" fill={secondaryColor} />
          {/* Legs */}
          <line x1="34" y1="64" x2="30" y2="74" stroke="#FF8F00" strokeWidth="2" strokeLinecap="round" />
          <line x1="46" y1="64" x2="50" y2="74" stroke="#FF8F00" strokeWidth="2" strokeLinecap="round" />
          {/* Feet */}
          <path d="M 26 74 L 30 74 L 34 74" fill="none" stroke="#FF8F00" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 46 74 L 50 74 L 54 74" fill="none" stroke="#FF8F00" strokeWidth="1.5" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "banana":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Banana body */}
          <path d="M 20 56 Q 10 30 34 14 Q 42 10 48 16 Q 30 20 28 54 Z" fill={primaryColor} />
          <path d="M 20 56 Q 10 30 34 14 Q 42 10 48 16 Q 30 20 28 54 Z" fill="none" stroke={secondaryColor} strokeWidth="1.5" />
          {/* Second banana */}
          <path d="M 28 56 Q 18 34 38 18 Q 46 14 52 20 Q 36 24 34 54 Z" fill={primaryColor} opacity={0.85} />
          <path d="M 28 56 Q 18 34 38 18 Q 46 14 52 20 Q 36 24 34 54 Z" fill="none" stroke={secondaryColor} strokeWidth="1" />
          {/* Tip */}
          <circle cx="50" cy="16" r="3" fill="#8D6E63" />
          {/* Stem */}
          <rect x="18" y="54" width="18" height="4" rx="2" fill="#8D6E63" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    // circle, generic, and anything else fall through to the generic circle
    default:
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="36" r="30" fill={primaryColor} />
          <circle cx="40" cy="36" r="30" fill="none" stroke={secondaryColor} strokeWidth="2" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );
  }
};

/** Render a character descriptor — characters always use the face-circle style */
const renderCharacter = (name: string, size: number) => {
  const descriptor = resolveSvgItem(name);
  return <CharacterSvg descriptor={descriptor} size={size} />;
};

/** Render an item descriptor — uses shape-specific SVG */
const renderItem = (name: string, size: number) => {
  const descriptor = resolveSvgItem(name);
  return <ItemSvg descriptor={descriptor} size={size} />;
};

/** SVG background: wavy ground edge */
const WavyGroundSvg: React.FC<{
  width: number;
  height: number;
  groundY: number;
  color: string;
}> = ({ width, height, groundY, color }) => {
  const groundTop = groundY * height;
  const groundH = height - groundTop;
  // Create wavy top edge using a sine-like path
  const waveAmplitude = 8;
  const segments = 12;
  const segW = width / segments;
  let d = `M 0 ${groundTop}`;
  for (let i = 0; i < segments; i++) {
    const x1 = i * segW + segW / 4;
    const x2 = i * segW + (segW * 3) / 4;
    const x3 = (i + 1) * segW;
    const yOff =
      i % 2 === 0 ? -waveAmplitude : waveAmplitude;
    d += ` Q ${x1} ${groundTop + yOff} ${x2} ${groundTop}`;
    d += ` Q ${(x2 + x3) / 2} ${groundTop - yOff} ${x3} ${groundTop}`;
  }
  d += ` L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={groundH + waveAmplitude}
      viewBox={`0 0 ${width} ${groundH + waveAmplitude}`}
      style={{
        position: "absolute",
        left: 0,
        top: groundTop - waveAmplitude,
        zIndex: 1,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={d} fill={color} />
    </svg>
  );
};

/** SVG indoor room background */
const IndoorRoomSvg: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => (
  <svg
    width={width}
    height={height}
    style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Back wall */}
    <rect x="0" y="0" width={width} height={height * 0.78} fill="#FFF3E0" />
    {/* Floor */}
    <rect
      x="0"
      y={height * 0.78}
      width={width}
      height={height * 0.22}
      fill="#D7CCC8"
    />
    {/* Wall-floor border */}
    <line
      x1="0"
      y1={height * 0.78}
      x2={width}
      y2={height * 0.78}
      stroke="#BCAAA4"
      strokeWidth="2"
    />
    {/* Window */}
    <rect
      x={width * 0.6}
      y={height * 0.12}
      width={width * 0.22}
      height={height * 0.3}
      rx="4"
      fill="#B3E5FC"
      stroke="#90A4AE"
      strokeWidth="2"
    />
    <line
      x1={width * 0.6 + width * 0.11}
      y1={height * 0.12}
      x2={width * 0.6 + width * 0.11}
      y2={height * 0.42}
      stroke="#90A4AE"
      strokeWidth="1.5"
    />
    <line
      x1={width * 0.6}
      y1={height * 0.27}
      x2={width * 0.6 + width * 0.22}
      y2={height * 0.27}
      stroke="#90A4AE"
      strokeWidth="1.5"
    />
    {/* Roof triangle */}
    <polygon
      points={`${width * 0.15},0 ${width * 0.5},${-60 + 10} ${width * 0.85},0`}
      fill="#A1887F"
    />
  </svg>
);

/** SVG gradient sky */
const SkyGradientSvg: React.FC<{
  width: number;
  height: number;
  isNight: boolean;
}> = ({ width, height, isNight }) => (
  <svg
    width={width}
    height={height}
    style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id={isNight ? "nightSky" : "daySky"} x1="0" y1="0" x2="0" y2="1">
        {isNight ? (
          <>
            <stop offset="0%" stopColor="#0D1B2A" />
            <stop offset="100%" stopColor="#1B2838" />
          </>
        ) : (
          <>
            <stop offset="0%" stopColor="#64B5F6" />
            <stop offset="100%" stopColor="#87CEEB" />
          </>
        )}
      </linearGradient>
    </defs>
    <rect x="0" y="0" width={width} height={height} fill={`url(#${isNight ? "nightSky" : "daySky"})`} />
  </svg>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const StorySceneScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: StorySceneParams = data.animationTemplate?.params ?? {};
  const bgType = params.bgType || "day";
  const characters = params.characters?.length
    ? params.characters
    : [data.emoji || "boy"];
  const items = params.items?.length ? params.items : ["tree", "house"];

  const bgConfig = BG_CONFIGS[bgType] || BG_CONFIGS["day"];

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Character movement: slide left and right
  const charBaseX = width * 0.35;
  const charSlideX = interpolate(
    frame,
    [0, 90, 180],
    [0, 80, 0],
    { extrapolateRight: "clamp" },
  );

  // Speech bubble text (first 20 chars of narration)
  const speechText = (data.narration || "").slice(0, 20);
  const speechOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const speechScale = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  // Stars for night mode
  const nightStars =
    bgType === "night"
      ? Array.from({ length: 8 }).map((_, i) => ({
          x: 0.05 + ((i * 0.12) % 0.9),
          y: 0.05 + (((i * 0.17 + 0.03) % 0.55)),
          size: 14 + (i % 3) * 6,
        }))
      : [];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgConfig.skyColor,
        overflow: "hidden",
      }}
    >
      {/* Sky gradient background */}
      <SkyGradientSvg
        width={width}
        height={height}
        isNight={bgType === "night"}
      />

      <BackgroundBubbles width={width} height={height} />

      {/* Celestial body (sun or moon) */}
      {bgConfig.celestialType === "sun" && (
        <div
          style={{
            position: "absolute",
            left: bgConfig.celestialX * width - 30,
            top: bgConfig.celestialY * height - 30,
            zIndex: 1,
            userSelect: "none",
          }}
        >
          <SunSvg size={60} />
        </div>
      )}
      {bgConfig.celestialType === "moon" && (
        <div
          style={{
            position: "absolute",
            left: bgConfig.celestialX * width - 30,
            top: bgConfig.celestialY * height - 30,
            zIndex: 1,
            userSelect: "none",
          }}
        >
          <MoonSvg size={60} />
        </div>
      )}

      {/* Night stars */}
      {nightStars.map((star, i) => {
        const twinkle = interpolate(
          (Math.sin((frame / fps) * 2 + i * 1.5) + 1) / 2,
          [0, 1],
          [0.3, 1],
        );
        return (
          <div
            key={`star-${i}`}
            style={{
              position: "absolute",
              left: star.x * width,
              top: star.y * height,
              zIndex: 1,
              userSelect: "none",
            }}
          >
            <StarSvg size={star.size} opacity={twinkle} />
          </div>
        );
      })}

      {/* Indoor room */}
      {bgType === "indoor" && <IndoorRoomSvg width={width} height={height} />}

      {/* Ground with wavy top edge */}
      {bgType !== "indoor" ? (
        <WavyGroundSvg
          width={width}
          height={height}
          groundY={bgConfig.groundY}
          color={bgConfig.groundColor}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: bgConfig.groundY * height,
            width: "100%",
            height: height * (1 - bgConfig.groundY),
            backgroundColor: bgConfig.groundColor,
            zIndex: 1,
          }}
        />
      )}

      {/* Scene items with staggered entrance */}
      {items.map((item, i) => {
        const itemX = width * (0.15 + i * 0.25);
        const itemY = bgConfig.groundY * height - 56;
        const entranceDelay = staggerDelay(i, 20, 10);
        const itemSpring = spring({
          frame: Math.max(0, frame - entranceDelay),
          fps,
          config: SPRING_CONFIGS.bouncy,
        });
        const itemYOffset = interpolate(itemSpring, [0, 1], [40, 0]);

        return (
          <div
            key={`item-${i}`}
            style={{
              position: "absolute",
              left: itemX,
              top: itemY + itemYOffset,
              opacity: itemSpring,
              transform: `scale(${itemSpring})`,
              zIndex: 2,
              userSelect: "none",
            }}
          >
            {renderItem(item, 56)}
          </div>
        );
      })}

      {/* Characters on ground */}
      {characters.map((char, i) => {
        const baseX = charBaseX + i * 70 + charSlideX;
        const charY = bgConfig.groundY * height - 60;
        const charEntrance = spring({
          frame: Math.max(0, frame - 10),
          fps,
          config: SPRING_CONFIGS.bouncy,
        });

        return (
          <div
            key={`char-${i}`}
            style={{
              position: "absolute",
              left: baseX,
              top: charY,
              opacity: charEntrance,
              transform: `scale(${charEntrance})`,
              zIndex: 3,
              userSelect: "none",
            }}
          >
            {renderCharacter(char, 60)}
          </div>
        );
      })}

      {/* Speech bubble */}
      {speechText && speechOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            left: charBaseX + charSlideX + 20,
            top: bgConfig.groundY * height - 110,
            zIndex: 4,
            opacity: speechOpacity,
            transform: `scale(${speechScale})`,
          }}
        >
          {/* Bubble body */}
          <div
            style={{
              backgroundColor: PALETTE.white,
              borderRadius: 16,
              padding: "8px 16px",
              fontFamily: FONT_FAMILY,
              fontSize: 20,
              fontWeight: 700,
              color: PALETTE.dark,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
            }}
          >
            {speechText}
          </div>
          {/* Bubble tail */}
          <div
            style={{
              position: "absolute",
              left: 16,
              bottom: -8,
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: `8px solid ${PALETTE.white}`,
            }}
          />
        </div>
      )}

      {/* Title overlay */}
      <div
        style={{
          position: "absolute",
          top: height * 0.06,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.subtitle,
          fontWeight: 900,
          color: data.accentColor,
          opacity: titleOpacity,
          zIndex: 5,
          textShadow: `0 2px 8px ${data.accentColor}33`,
        }}
      >
        {data.title}
      </div>

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.04,
            width: "100%",
            textAlign: "center",
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZES.label,
            fontWeight: 700,
            color: PALETTE.white,
            opacity: interpolate(
              spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 30 }),
              [0, 1],
              [0, 0.8],
            ),
            zIndex: 5,
            textShadow: "0 1px 6px rgba(0,0,0,0.3)",
          }}
        >
          {data.subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
