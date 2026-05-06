import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

// Types for the component props
interface GeneratedScene {
  id: string;
  sequence: number;
  title: string;
  concept: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  durationSec: number;
  transitionToNext: string;
  emphasis: string;
  accentColor: string;
  action?: string;
  habitat?: string;
  assetKey?: string;
  assetTags?: string[];
  durationFrames: number;
}

interface GeneratedLessonProps {
  title: string;
  topic: string;
  scenes: GeneratedScene[];
  durationFrames: number;
}

// Peacock SVG component with rich visual details
const PeacockSVG: React.FC<{
  frame: number;
  showTail?: boolean;
  showCrest?: boolean;
  eyeSpots?: number;
  isDancing?: boolean;
}> = ({ frame, showTail = true, showCrest = true, eyeSpots = 3, isDancing = false }) => {
  const { fps } = useVideoConfig();
  
  // Animations driven by frame
  const headBob = interpolate(frame, [0, 1 * fps, 2 * fps], [0, 5, 0], {
    extrapolateRight: "clamp",
  });
  
  const neckScale = interpolate(frame, [0, 0.5 * fps], [1, 1.05], {
    extrapolateRight: "clamp",
  });
  
  const tailFan = spring({
    frame,
    fps,
    config: { damping: 200 },
  });
  
  const danceShake = isDancing ? Math.sin(frame * 0.1) * 3 : 0;
  
  const crestWave = showCrest ? Math.sin(frame * 0.05) * 2 : 0;

  return (
    <svg width="600" height="500" viewBox="0 0 600 500" style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) scale(${tailFan * 0.5 + 0.5})` }}>
      {/* Tail feathers (fan shape) */}
      {showTail && (
        <g transform={`translate(${300 + danceShake}, 380)`}>
          {/* Main tail fan */}
          <ellipse cx="0" cy="0" rx="200" ry="120" fill="url(#tailGradient)" opacity={tailFan * 0.8} />
          
          {/* Individual tail feathers */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i - 5.5) * 15;
            const featherLength = 180 + Math.sin(angle * 0.1) * 20;
            const r = (i / 12) * 360;
            return (
              <g key={i} transform={`rotate(${angle})`}>
                <path
                  d={`M 0,0 Q ${featherLength * 0.3},${-featherLength * 0.5} ${featherLength},${-featherLength}`}
                  fill="url(#featherGradient)"
                  opacity={tailFan * 0.9}
                />
                
                {/* Eye spots on specific feathers */}
                {i >= 3 && i <= 5 && (
                  <g transform={`translate(${featherLength * 0.7}, ${-featherLength * 0.65})`}>
                    <circle cx="0" cy="0" r="25" fill="#8B4513" />
                    <circle cx="0" cy="0" r="20" fill="#00CED1" />
                    <circle cx="0" cy="0" r="12" fill="#4169E1" />
                    <circle cx="0" cy="0" r="5" fill="#000080" />
                    {/* Number indicator for counting */}
                    {i === 3 && <text x="0" y="40" fontSize="24" fill="#FF6B6B" textAnchor="middle" fontWeight="bold">1</text>}
                    {i === 4 && <text x="0" y="40" fontSize="24" fill="#FF6B6B" textAnchor="middle" fontWeight="bold">2</text>}
                    {i === 5 && <text x="0" y="40" fontSize="24" fill="#FF6B6B" textAnchor="middle" fontWeight="bold">3</text>}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      )}
      
      {/* Body */}
      <ellipse cx="300" cy="380" rx="50" ry="60" fill="url(#bodyGradient)" transform={`scale(${neckScale})`} />
      
      {/* Neck */}
      <path
        d={`M 300,320 Q 300,250 ${300 + headBob},200`}
        stroke="url(#neckGradient)"
        strokeWidth="25"
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Head */}
      <circle cx={300 + headBob} cy="190" r="35" fill="#00CED1" />
      
      {/* Beak */}
      <path d={`M ${320 + headBob},190 L 340 + headBob,195 L 320 + headBob},200 Z`} fill="#FFD700" />
      
      {/* Eye */}
      <circle cx={310 + headBob} cy="185" r="6" fill="#000000" />
      <circle cx={312 + headBob} cy="183" r="2" fill="#FFFFFF" />
      
      {/* Crest (crown feathers) */}
      {showCrest && (
        <g transform={`translate(${300 + headBob}, 160)`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <path
              key={i}
              d={`M ${(i - 2) * 8},0 Q ${(i - 2) * 8},${-25 + crestWave} ${(i - 2) * 8 + crestWave},${-35}`}
              stroke="#00CED1"
              strokeWidth="3"
              fill="none"
            />
          ))}
          {/* Small circles on crest tips */}
          {Array.from({ length: 5 }).map((_, i) => (
            <circle
              key={`tip-${i}`}
              cx={(i - 2) * 8 + crestWave}
              cy={-35}
              r="3"
              fill="#4169E1"
            />
          ))}
        </g>
      )}
      
      {/* Legs */}
      <g>
        <path d="M 285,440 L 280,480" stroke="#FFA500" strokeWidth="6" strokeLinecap="round" />
        <path d="M 315,440 L 320,480" stroke="#FFA500" strokeWidth="6" strokeLinecap="round" />
      </g>
      
      {/* Gradients */}
      <defs>
        <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00CED1" />
          <stop offset="50%" stopColor="#20B2AA" />
          <stop offset="100%" stopColor="#008B8B" />
        </linearGradient>
        
        <linearGradient id="neckGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#008B8B" />
          <stop offset="50%" stopColor="#00CED1" />
          <stop offset="100%" stopColor="#48D1CC" />
        </linearGradient>
        
        <linearGradient id="tailGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#20B2AA" />
          <stop offset="50%" stopColor="#00CED1" />
          <stop offset="100%" stopColor="#48D1CC" />
        </linearGradient>
        
        <linearGradient id="featherGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#006666" />
          <stop offset="30%" stopColor="#00CED1" />
          <stop offset="70%" stopColor="#40E0D0" />
          <stop offset="100%" stopColor="#00CED1" />
        </linearGradient>
      </defs>
    </svg>
  );
};

// Female peacock (peahen) - simpler without ornate tail
const PeahenSVG: React.FC<{ frame: number }> = ({ frame }) => {
  const walkCycle = Math.sin(frame * 0.1) * 2;
  
  return (
    <svg width="200" height="250" viewBox="0 0 200 250" style={{ position: 'absolute', right: '15%', bottom: '25%' }}>
      {/* Body */}
      <ellipse cx="100" cy="180" rx="35" ry="45" fill="#8B7355" />
      
      {/* Simple tail */}
      <path d="M 70,180 Q 50,250 30,280" stroke="#A0522D" strokeWidth="8" fill="none" />
      <path d="M 130,180 Q 150,250 170,280" stroke="#A0522D" strokeWidth="8" fill="none" />
      
      {/* Neck */}
      <path d="M 100,140 Q 100,100 100,70" stroke="#8B7355" strokeWidth="18" fill="none" strokeLinecap="round" />
      
      {/* Head */}
      <circle cx="100" cy="60" r="25" fill="#8B7355" />
      
      {/* Beak */}
      <path d="M 115,60 L 130,62 L 115,65 Z" fill="#D2691E" />
      
      {/* Eye */}
      <circle cx="108" cy="58" r="4" fill="#000000" />
      <circle cx="109" cy="57" r="1.5" fill="#FFFFFF" />
      
      {/* Simple crest */}
      <g transform="translate(100, 40)">
        <path d="M -5,0 L -5,-15" stroke="#8B7355" strokeWidth="2" />
        <path d="M 0,0 L 0,-18" stroke="#8B7355" strokeWidth="2" />
        <path d="M 5,0 L 5,-15" stroke="#8B7355" strokeWidth="2" />
      </g>
      
      {/* Legs with walking animation */}
      <g>
        <path d="M 85,220 L 80 + walkCycle,260" stroke="#D2691E" strokeWidth="4" strokeLinecap="round" />
        <path d="M 115,220 L 120 - walkCycle,260" stroke="#D2691E" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
};

// Background component
const Background: React.FC<{ habitat?: string; frame: number }> = ({ habitat = "forest", frame }) => {
  const bgPulse = Math.sin(frame * 0.02) * 0.05 + 0.95;
  
  return (
    <div
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        background: `linear-gradient(180deg, 
          ${habitat === "forest" ? "#87CEEB 0%, #98FB98 50%, #228B22 100%" : 
            habitat === "grass" ? "#87CEEB 0%, #90EE90 60%, #32CD32 100%" :
            "#B0E0E6 0%, #E0FFFF 100%"})`,
        opacity: bgPulse,
      }}
    >
      {/* Sun */}
      <div
        style={{
          position: "absolute",
          top: "8%",
          right: "10%",
          width: "80px",
          height: "80px",
          borderRadius: "50%",
          background: "radial-gradient(circle, #FFD700 0%, #FFA500 100%)",
          boxShadow: "0 0 60px #FFD700",
        }}
      />
      
      {/* Trees in background */}
      {habitat === "forest" && (
        <>
          <svg width="100%" height="100%" style={{ position: 'absolute' }}>
            <ellipse cx="100" cy="400" rx="60" ry="80" fill="#006400" opacity="0.6" />
            <ellipse cx="180" cy="420" rx="50" ry="70" fill="#228B22" opacity="0.7" />
            <ellipse cx="1700" cy="410" rx="70" ry="90" fill="#006400" opacity="0.6" />
            <ellipse cx="1820" cy="430" rx="55" ry="75" fill="#228B22" opacity="0.7" />
          </svg>
        </>
      )}
      
      {/* Grass blades */}
      <svg width="100%" height="150" style={{ position: 'absolute', bottom: 0 }}>
        {Array.from({ length: 30 }).map((_, i) => (
          <path
            key={i}
            d={`M ${i * 70},150 Q ${i * 70 + 10},${100 + Math.sin(i + frame * 0.05) * 10} ${i * 70 + 5},50`}
            stroke={i % 2 === 0 ? "#228B22" : "#32CD32"}
            strokeWidth="4"
            fill="none"
            opacity="0.8"
          />
        ))}
      </svg>
      
      {/* Flowers */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: `${10 + (i % 3) * 5}%`,
            left: `${10 + i * 12}%`,
            width: "20px",
            height: "20px",
            background: `radial-gradient(circle, ${i % 2 === 0 ? "#FF69B4" : "#FFD700"} 40%, transparent 70%)`,
            borderRadius: "50%",
            opacity: 0.8,
          }}
        />
      ))}
    </div>
  );
};

// Caption/narration bar
const CaptionBar: React.FC<{ text: string; accentColor: string }> = ({ text, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const opacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  
  const translateY = interpolate(frame, [0, 0.5 * fps], [30, 0], {
    extrapolateRight: "clamp",
  });
  
  return (
    <div
      style={{
        position: "absolute",
        bottom: "5%",
        left: "10%",
        right: "10%",
        backgroundColor: `${accentColor}20`,
        borderRadius: "20px",
        padding: "20px 40px",
        opacity,
        transform: `translateY(${translateY}px)`,
        backdropFilter: "blur(10px)",
        border: `2px solid ${accentColor}60`,
      }}
    >
      <p
        style={{
          fontSize: "32px",
          color: "#FFFFFF",
          textAlign: "center",
          margin: 0,
          fontFamily: "Arial, sans-serif",
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
          fontWeight: "bold",
        }}
      >
        {text}
      </p>
    </div>
  );
};

// Scene title
const SceneTitle: React.FC<{ title: string; frame: number }> = ({ title, frame }) => {
  const { fps } = useVideoConfig();
  
  const scale = spring({
    frame,
    fps,
    config: { damping: 200 },
  });
  
  const opacity = interpolate(frame, [0, 0.3 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  
  return (
    <div
      style={{
        position: "absolute",
        top: "8%",
        left: "50%",
        transform: `translateX(-50%) scale(${scale})`,
        opacity,
      }}
    >
      <h1
        style={{
          fontSize: "56px",
          color: "#FFFFFF",
          margin: 0,
          fontFamily: "Arial, sans-serif",
          textShadow: "3px 3px 6px rgba(0,0,0,0.7)",
          fontWeight: "bold",
          textAlign: "center",
        }}
      >
        {title}
      </h1>
    </div>
  );
};

// On-screen text highlight
const OnScreenText: React.FC<{ text: string; frame: number }> = ({ text, frame }) => {
  const { fps } = useVideoConfig();
  
  const opacity = interpolate(frame, [0.5 * fps, 1 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  
  const scale = interpolate(frame, [0.5 * fps, 1 * fps], [0.8, 1], {
    extrapolateRight: "clamp",
  });
  
  return (
    <div
      style={{
        position: "absolute",
        top: "20%",
        left: "50%",
        transform: `translateX(-50%) scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: "#FF6B6B",
          color: "#FFFFFF",
          padding: "15px 40px",
          borderRadius: "30px",
          fontSize: "36px",
          fontWeight: "bold",
          fontFamily: "Arial, sans-serif",
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
          boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// Main component
export const GeneratedLesson: React.FC<GeneratedLessonProps> = ({
  title,
  topic,
  scenes,
  durationFrames,
}) => {
  const { fps } = useVideoConfig();
  
  // Updated narration for scene 3 to be more scientifically accurate
  const updatedScenes = scenes.map(scene => {
    if (scene.id === "scene-3") {
      return {
        ...scene,
        narration: "孔雀长长的尾巴上有很多圆形的图案，看起来像一只只大眼睛。让我们来数数看这部分尾巴上，有多少漂亮的眼斑图案呢？"
      };
    }
    return scene;
  });
  
  return (
    <AbsoluteFill style={{ backgroundColor: "#87CEEB" }}>
      {updatedScenes.map((scene, index) => {
        const sceneStartFrame = scenes.slice(0, index).reduce((acc, s) => acc + s.durationFrames, 0);
        
        return (
          <Sequence
            key={scene.id}
            from={sceneStartFrame}
            durationInFrames={scene.durationFrames}
          >
            <AbsoluteFill>
              {/* Background */}
              <Background habitat={scene.habitat} frame={useCurrentFrame()} />
              
              {/* Scene Title */}
              <SceneTitle title={scene.title} frame={useCurrentFrame()} />
              
              {/* On-screen text */}
              {scene.onScreenText && <OnScreenText text={scene.onScreenText} frame={useCurrentFrame()} />}
              
              {/* Peacock visualization */}
              {scene.id === "scene-1" && (
                <PeacockSVG frame={useCurrentFrame()} showTail={true} showCrest={true} eyeSpots={0} />
              )}
              
              {scene.id === "scene-2" && (
                <PeacockSVG frame={useCurrentFrame()} showTail={false} showCrest={true} eyeSpots={0} />
              )}
              
              {scene.id === "scene-3" && (
                <PeacockSVG frame={useCurrentFrame()} showTail={true} showCrest={false} eyeSpots={3} />
              )}
              
              {scene.id === "scene-4" && (
                <>
                  <PeacockSVG 
                    frame={useCurrentFrame()} 
                    showTail={true} 
                    showCrest={true} 
                    eyeSpots={3} 
                    isDancing={true} 
                  />
                  <PeahenSVG frame={useCurrentFrame()} />
                </>
              )}
              
              {scene.id === "scene-5" && (
                <>
                  <PeacockSVG 
                    frame={useCurrentFrame()} 
                    showTail={true} 
                    showCrest={true} 
                    eyeSpots={3} 
                  />
                  {/* Summary words floating */}
                  {["冠羽", "眼斑", "开屏"].map((word, i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        top: `${15 + i * 12}%`,
                        left: `${20 + i * 25}%`,
                        backgroundColor: "#00CED1",
                        color: "#FFFFFF",
                        padding: "10px 25px",
                        borderRadius: "20px",
                        fontSize: "28px",
                        fontWeight: "bold",
                        fontFamily: "Arial, sans-serif",
                        opacity: interpolate(
                          useCurrentFrame(),
                          [i * 20, i * 20 + 15],
                          [0, 1],
                          { extrapolateRight: "clamp" }
                        ),
                        transform: `scale(${interpolate(
                          useCurrentFrame(),
                          [i * 20, i * 20 + 15],
                          [0.8, 1],
                          { extrapolateRight: "clamp" }
                        )})`,
                      }}
                    >
                      {word}
                    </div>
                  ))}
                </>
              )}
              
              {/* Caption/Narration */}
              <CaptionBar text={scene.narration} accentColor={scene.accentColor || "#00B4D8"} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
