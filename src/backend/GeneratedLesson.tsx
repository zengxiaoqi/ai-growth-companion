import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";

type VisualAssets = {
  characterAssetSrc?: string;
  backgroundAssetSrc?: string;
  hasCharacterAsset?: boolean;
  hasBackgroundAsset?: boolean;
};

type GeneratedScene = {
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
  durationFrames: number;
  action?: string;
  habitat?: string;
  assetKey?: string;
  assetTags?: string[];
  audioSrc: string;
  visualAssets: VisualAssets;
};

type GeneratedLessonProps = {
  title: string;
  topic: string;
  scenes: GeneratedScene[];
  durationFrames: number;
};

export const GeneratedLesson: React.FC<GeneratedLessonProps> = ({
  title,
  topic,
  scenes,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#E0F7FA" }}>
      {scenes.map((scene, index) => {
        const startFrame = index * scene.durationFrames;
        return (
          <Sequence
            key={scene.id}
            from={startFrame}
            durationInFrames={scene.durationFrames}
            premountFor={1 * fps}
          >
            {/* Audio for each scene */}
            {scene.audioSrc && <Audio src={staticFile(scene.audioSrc)} volume={0.94} />}
            
            {/* Scene content */}
            <SceneComponent scene={scene} frame={frame} fps={fps} width={width} height={height} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const SceneComponent: React.FC<{
  scene: GeneratedScene;
  frame: number;
  fps: number;
  width: number;
  height: number;
}> = ({ scene, frame, fps, width, height }) => {
  const localFrame = frame % scene.durationFrames;
  const opacity = interpolate(localFrame, [0, 0.5 * fps, scene.durationFrames - 0.5 * fps, scene.durationFrames], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Scene-specific animations and visuals
  const renderSceneContent = () => {
    switch (scene.sequence) {
      case 1:
        return <Scene1Introduction frame={localFrame} fps={fps} />;
      case 2:
        return <Scene2TailFeathers frame={localFrame} fps={fps} />;
      case 3:
        return <Scene3DisplayFeathers frame={localFrame} fps={fps} />;
      case 4:
        return <Scene4Food frame={localFrame} fps={fps} />;
      case 5:
        return <Scene5Summary frame={localFrame} fps={fps} />;
      default:
        return null;
    }
  };

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Background */}
      <BackgroundSVG scene={scene} frame={localFrame} fps={fps} />
      
      {/* Scene content */}
      <AbsoluteFill>{renderSceneContent()}</AbsoluteFill>
      
      {/* Scene title */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 72,
          fontWeight: "bold",
          color: "#00695C",
          fontFamily: "Arial, sans-serif",
          textShadow: "2px 2px 8px rgba(255,255,255,0.8)",
        }}
      >
        {scene.title}
      </div>
      
      {/* On-screen text */}
      {scene.onScreenText && (
        <div
          style={{
            position: "absolute",
            bottom: 200,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 56,
            fontWeight: "bold",
            color: "#D81B60",
            backgroundColor: "rgba(255,255,255,0.9)",
            padding: "20px 40px",
            borderRadius: 20,
            maxWidth: "80%",
            margin: "0 auto",
            fontFamily: "Arial, sans-serif",
          }}
        >
          {scene.onScreenText}
        </div>
      )}
      
      {/* Narration text bar */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 80,
          right: 80,
          backgroundColor: "rgba(0,105,92,0.85)",
          padding: "20px 40px",
          borderRadius: 15,
          color: "white",
          fontSize: 32,
          fontFamily: "Arial, sans-serif",
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {scene.narration}
      </div>
    </AbsoluteFill>
  );
};

const BackgroundSVG: React.FC<{ scene: GeneratedScene; frame: number; fps: number }> = ({ scene, frame, fps }) => {
  const bgColor = interpolate(frame, [0, 1 * fps], ["#E0F7FA", scene.accentColor || "#E0F7FA"], {
    extrapolateRight: "clamp",
  }) as string;

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="skyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#87CEEB" />
          <stop offset="100%" stopColor="#E0F7FA" />
        </linearGradient>
        <linearGradient id="grassGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#81C784" />
          <stop offset="100%" stopColor="#4CAF50" />
        </linearGradient>
      </defs>
      
      {/* Sky */}
      <rect width="1920" height="1080" fill="url(#skyGradient)" />
      
      {/* Sun */}
      <circle cx={1600} cy={150} r={80} fill="#FFD54F" />
      
      {/* Trees in background */}
      <g>
        <path d="M150,500 L250,300 L350,500 Z" fill="#2E7D32" />
        <rect x={225} y={500} width={50} height={200} fill="#795548" />
        
        <path d="M1600,550 L1750,250 L1900,550 Z" fill="#388E3C" />
        <rect x={1725} y={550} width={50} height={250} fill="#5D4037" />
        
        <path d="M800,520 L900,350 L1000,520 Z" fill="#2E7D32" />
        <rect x={875} y={520} width={50} height={180} fill="#6D4C41" />
      </g>
      
      {/* Grass */}
      <rect x="0" y="700" width="1920" height="380" fill="url(#grassGradient)" />
      
      {/* Grass blades */}
      {Array.from({ length: 30 }, (_, i) => {
        const x = 50 + i * 65;
        const sway = interpolate(frame, [0, fps * 2], [0, Math.sin(i) * 20], {
          extrapolateRight: "wrap",
          extrapolateLeft: "wrap",
        });
        return (
          <path
            key={i}
            d={`M${x},700 L${x + sway},630`}
            stroke="#388E3C"
            strokeWidth="4"
            strokeLinecap="round"
          />
        );
      })}
      
      {/* Flowers */}
      {Array.from({ length: 12 }, (_, i) => {
        const x = 100 + i * 150;
        const y = 750 + (i % 3) * 100;
        const flowerBloom = interpolate(frame, [i * 5, i * 5 + 15], [0, 1], {
          extrapolateRight: "clamp",
        });
        const scale = flowerBloom;
        return (
          <g key={i} transform={`translate(${x}, ${y}) scale(${scale})`}>
            <circle cx="0" cy="0" r={15} fill="#FF4081" />
            <circle cx="-10" cy="-10" r={10} fill="#FF4081" />
            <circle cx="10" cy="-10" r={10} fill="#FF4081" />
            <circle cx="-10" cy="10" r={10} fill="#FF4081" />
            <circle cx="10" cy="10" r={10} fill="#FF4081" />
            <circle cx="0" cy="0" r={8} fill="#FFEB3B" />
          </g>
        );
      })}
    </svg>
  );
};

// Scene 1: Introduction - Peacock walks out
const Scene1Introduction: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const walkCycle = frame % 60;
  const x = interpolate(frame, [0, 4 * fps], [1920, 960], { extrapolateRight: "clamp" });
  const legAngle = Math.sin(walkCycle * 0.1) * 15;
  const headBob = Math.sin(walkCycle * 0.15) * 8;
  const crestWave = Math.sin(walkCycle * 0.2) * 5;

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      {/* Peacock body */}
      <g transform={`translate(${x}, 650)`}>
        {/* Body */}
        <ellipse cx="0" cy="0" rx={90} ry={60} fill="#1565C0" />
        <ellipse cx="0" cy="10" rx={70} ry={45} fill="#1976D2" />
        
        {/* Neck */}
        <path
          d={`M50,${-10 + headBob} Q80,${-60 + headBob} 70,${-120 + headBob}`}
          stroke="#1565C0"
          strokeWidth="35"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Head */}
        <circle cx={70 + headBob * 0.3} cy={-125 + headBob} r={35} fill="#1565C0" />
        
        {/* Eye */}
        <circle cx={80 + headBob * 0.3} cy={-128 + headBob} r={8} fill="white" />
        <circle cx={82 + headBob * 0.3} cy={-128 + headBob} r={5} fill="black" />
        
        {/* Beak */}
        <path d={`M${100 + headBob * 0.3},${-125 + headBob} L${120 + headBob * 0.3},${-122 + headBob} L${100 + headBob * 0.3},${-118 + headBob}`} fill="#FFA000" />
        
        {/* Crest (crown feathers) */}
        <g transform={`translate(${70 + headBob * 0.3}, ${-160 + headBob})`}>
          {Array.from({ length: 5 }, (_, i) => {
            const angle = (i - 2) * 15 + crestWave;
            const featherX = Math.sin(angle * Math.PI / 180) * 25;
            const featherY = -Math.cos(angle * Math.PI / 180) * 25 - 5;
            return (
              <line
                key={i}
                x1="0"
                y1="0"
                x2={featherX}
                y2={featherY}
                stroke="#00BCD4"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
          {/* Crest tips */}
          {Array.from({ length: 5 }, (_, i) => {
            const angle = (i - 2) * 15 + crestWave;
            const featherX = Math.sin(angle * Math.PI / 180) * 25;
            const featherY = -Math.cos(angle * Math.PI / 180) * 25 - 5;
            return (
              <circle key={i} cx={featherX} cy={featherY} r={5} fill="#00BCD4" />
            );
          })}
        </g>
        
        {/* Tail feathers (closed) */}
        <path d="M-80,-30 Q-120,-80 -140,-40 L-130,-20 Z" fill="#1565C0" />
        <path d="M-85,-35 Q-130,-90 -155,-50 L-145,-30 Z" fill="#0D47A1" />
        <path d="M-90,-40 Q-140,-100 -170,-60 L-160,-40 Z" fill="#1565C0" />
        
        {/* Legs */}
        <line x1="-30" y1="50" x2={-30 + Math.sin(legAngle * Math.PI / 180) * 10} y2="150" stroke="#FFA000" strokeWidth="8" strokeLinecap="round" />
        <line x1="30" y1="50" x2={30 - Math.sin(legAngle * Math.PI / 180) * 10} y2="150" stroke="#FFA000" strokeWidth="8" strokeLinecap="round" />
        
        {/* Feet */}
        <g transform={`translate(${Math.round(-30 + Math.sin(legAngle * Math.PI / 180) * 10)}, 150)`}>
          <line x1="0" y1="0" x2="-15" y2="20" stroke="#FFA000" strokeWidth="6" strokeLinecap="round" />
          <line x1="0" y1="0" x2="0" y2="25" stroke="#FFA000" strokeWidth="6" strokeLinecap="round" />
          <line x1="0" y1="0" x2="15" y2="20" stroke="#FFA000" strokeWidth="6" strokeLinecap="round" />
        </g>
        <g transform={`translate(${Math.round(30 - Math.sin(legAngle * Math.PI / 180) * 10)}, 150)`}>
          <line x1="0" y1="0" x2="-15" y2="20" stroke="#FFA000" strokeWidth="6" strokeLinecap="round" />
          <line x1="0" y1="0" x2="0" y2="25" stroke="#FFA000" strokeWidth="6" strokeLinecap="round" />
          <line x1="0" y1="0" x2="15" y2="20" stroke="#FFA000" strokeWidth="6" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
};

// Scene 2: Tail feathers with eye spots
const Scene2TailFeathers: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const highlightIndex = Math.floor(frame / (fps * 2)) % 3;
  const pulse = Math.sin(frame * 0.1) * 5;

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      {/* Peacock body (facing right) */}
      <g transform="translate(960, 500)">
        {/* Body */}
        <ellipse cx="0" cy="0" rx={100} ry={70} fill="#1565C0" />
        <ellipse cx="0" cy="10" rx={80} ry={50} fill="#1976D2" />
        
        {/* Neck */}
        <path d="M60,-10 Q100,-60 90,-130" stroke="#1565C0" strokeWidth="40" strokeLinecap="round" fill="none" />
        
        {/* Head */}
        <circle cx="90" cy="-135" r={40} fill="#1565C0" />
        
        {/* Eye */}
        <circle cx="100" cy="-138" r={10} fill="white" />
        <circle cx="103" cy="-138" r={6} fill="black" />
        
        {/* Beak */}
        <path d="M120,-135 L145,-130 L120,-125" fill="#FFA000" />
        
        {/* Crest */}
        <g transform="translate(90, -175)">
          {Array.from({ length: 5 }, (_, i) => {
            const angle = (i - 2) * 12;
            return <line key={i} x1="0" y1="0" x2={Math.sin(angle * Math.PI / 180) * 30} y2={-Math.cos(angle * Math.PI / 180) * 30} stroke="#00BCD4" strokeWidth="4" strokeLinecap="round" />;
          })}
        </g>
        
        {/* Tail feathers with eye spots */}
        {Array.from({ length: 8 }, (_, i) => {
          const baseY = 50;
          const featherLength = 200 + i * 15;
          const angle = (i - 3.5) * 8;
          const isHighlighted = i < 3 && i === highlightIndex;
          const featherOpacity = isHighlighted ? 1 : 0.7;
          const eyeScale = isHighlighted ? 1.3 : 1;
          
          const tipX = Math.sin(angle * Math.PI / 180) * 120;
          const tipY = baseY + featherLength;
          
          return (
            <g key={i} style={{ opacity: featherOpacity }}>
              {/* Feather shaft */}
              <line x1="-50 + i * 15" y1={baseY} x2={-50 + i * 15 + tipX * 0.3} y2={tipY} stroke="#1565C0" strokeWidth={6 - i * 0.3} />
              
              {/* Eye spot at tip */}
              <g transform={`translate(${-50 + i * 15 + tipX * 0.3}, ${tipY}) scale(${eyeScale})`}>
                {/* Outer circle */}
                <circle cx="0" cy="0" r={30 + pulse * 0.1} fill="none" stroke="#4A148C" strokeWidth={4} />
                <circle cx="0" cy="0" r={25 + pulse * 0.1} fill="#7B1FA2" />
                {/* Middle circle */}
                <circle cx="0" cy="0" r={18 + pulse * 0.08} fill="#9C27B0" />
                {/* Inner circle (eye) */}
                <circle cx="0" cy="0" r={10 + pulse * 0.05} fill="#1A237E" />
                {/* Shine */}
                <circle cx="-4" cy="-4" r={4} fill="rgba(255,255,255,0.6)" />
              </g>
            </g>
          );
        })}
        
        {/* Number badges */}
        {Array.from({ length: 3 }, (_, i) => {
          const isActive = i === highlightIndex;
          const scale = isActive ? 1.5 : 1;
          const badgeY = 280 + i * 80;
          const badgeX = -100 + i * 100;
          
          return (
            <g key={i} transform={`translate(${badgeX}, ${badgeY}) scale(${scale})`} style={{ transition: "transform 0.3s" }}>
              <circle cx="0" cy="0" r={30} fill={isActive ? "#FF4081" : "#FF80AB"} />
              <text x="0" y="12" textAnchor="middle" fontSize="36" fontWeight="bold" fill="white">{i + 1}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// Scene 3: Peacock displaying feathers
const Scene3DisplayFeathers: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const displayProgress = interpolate(frame, [0, 2 * fps], [0, 1], { extrapolateRight: "clamp" });
  const tailSpread = displayProgress * Math.PI * 0.8;
  const shimmer = Math.sin(frame * 0.15) * 0.1 + 1;

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      {/* Rock */}
      <ellipse cx="960" cy="850" rx={200} ry={60} fill="#78909C" />
      <ellipse cx="960" cy="840" rx={180} ry={50} fill="#90A4AE" />
      
      {/* Male peacock on rock */}
      <g transform="translate(960, 750)">
        {/* Body */}
        <ellipse cx="0" cy="0" rx={90} ry={65} fill="#1565C0" />
        <ellipse cx="0" cy="8" rx={70} ry={45} fill="#1976D2" />
        
        {/* Neck */}
        <path d="M50,-15 Q80,-70 70,-140" stroke="#1565C0" strokeWidth="38" strokeLinecap="round" fill="none" />
        
        {/* Head */}
        <circle cx="70" cy="-145" r={38} fill="#1565C0" />
        
        {/* Eye */}
        <circle cx="80" cy="-148" r={9} fill="white" />
        <circle cx="82" cy="-148" r={6} fill="black" />
        
        {/* Beak */}
        <path d="M100,-145 L125,-140 L100,-135" fill="#FFA000" />
        
        {/* Crest */}
        <g transform="translate(70, -185)">
          {Array.from({ length: 5 }, (_, i) => {
            const angle = (i - 2) * 12;
            return <line key={i} x1="0" y1="0" x2={Math.sin(angle * Math.PI / 180) * 28} y2={-Math.cos(angle * Math.PI / 180) * 28} stroke="#00BCD4" strokeWidth="4" strokeLinecap="round" />;
          })}
        </g>
        
        {/* Legs */}
        <line x1="-30" y1="55" x2="-30" y2="100" stroke="#FFA000" strokeWidth="7" strokeLinecap="round" />
        <line x1="30" y1="55" x2="30" y2="100" stroke="#FFA000" strokeWidth="7" strokeLinecap="round" />
      </g>
      
      {/* Displayed tail feathers (fan shape) */}
      <g transform="translate(960, 750)">
        {Array.from({ length: 16 }, (_, i) => {
          const angle = -Math.PI / 2 + (i - 7.5) * 0.12 * displayProgress;
          const featherLength = 350 * displayProgress + Math.sin(frame * 0.05 + i * 0.3) * 10;
          const featherX = Math.sin(angle) * featherLength;
          const featherY = Math.cos(angle) * featherLength;
          const eyeScale = shimmer * (1 + Math.sin(frame * 0.08 + i) * 0.1);
          
          return (
            <g key={i} style={{ opacity: displayProgress }}>
              {/* Feather */}
              <line x1="0" y1="-30" x2={featherX} y2={featherY - 30} stroke="#1565C0" strokeWidth={8} />
              
              {/* Eye spot */}
              <g transform={`translate(${featherX}, ${featherY - 30}) scale(${eyeScale})`}>
                <circle cx="0" cy="0" r={35} fill="none" stroke="#4A148C" strokeWidth={5} />
                <circle cx="0" cy="0" r={28} fill="#7B1FA2" />
                <circle cx="0" cy="0" r={20} fill="#9C27B0" />
                <circle cx="0" cy="0" r={12} fill="#1A237E" />
                <circle cx="-5" cy="-5" r={5} fill="rgba(255,255,255,0.5)" />
              </g>
            </g>
          );
        })}
      </g>
      
      {/* Female peacock watching */}
      <g transform="translate(400, 720)">
        {/* Body */}
        <ellipse cx="0" cy="0" rx={60} ry={45} fill="#8D6E63" />
        
        {/* Neck */}
        <path d="M35,-10 Q55,-45 45,-90" stroke="#8D6E63" strokeWidth="28" strokeLinecap="round" fill="none" />
        
        {/* Head */}
        <circle cx="45" cy="-95" r={28} fill="#8D6E63" />
        
        {/* Eye */}
        <circle cx="52" cy="-97" r={7} fill="white" />
        <circle cx="54" cy="-97" r={4} fill="black" />
        
        {/* Beak */}
        <path d="M65,-95 L82,-92 L65,-89" fill="#FFA000" />
        
        {/* Simple crest */}
        <g transform="translate(45, -120)">
          {Array.from({ length: 3 }, (_, i) => {
            const angle = (i - 1) * 10;
            return <line key={i} x1="0" y1="0" x2={Math.sin(angle * Math.PI / 180) * 20} y2={-Math.cos(angle * Math.PI / 180) * 20} stroke="#8D6E63" strokeWidth="3" strokeLinecap="round" />;
          })}
        </g>
        
        {/* Legs */}
        <line x1="-20" y1="40" x2="-20" y2="80" stroke="#FFA000" strokeWidth="5" strokeLinecap="round" />
        <line x1="20" y1="40" x2="20" y2="80" stroke="#FFA000" strokeWidth="5" strokeLinecap="round" />
        
        {/* Heart animation */}
        <g transform={`translate(80, -80) scale(${1 + Math.sin(frame * 0.1) * 0.2})`}>
          <path d="M0,10 C-10,0 -15,-10 0,-20 C15,-10 10,0 0,10" fill="#E91E63" opacity="0.8" />
        </g>
      </g>
    </svg>
  );
};

// Scene 4: Peacock eating food
const Scene4Food: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const peckCycle = frame % 40;
  const headDown = peckCycle < 20 ? interpolate(peckCycle, [0, 15], [0, 40], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }) : interpolate(peckCycle, [20, 35], [40, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  const word1Visible = frame > fps * 1.5;
  const word2Visible = frame > fps * 3;

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      {/* Ground with grass */}
      <rect x="0" y="750" width="1920" height="330" fill="#81C784" />
      
      {/* Corn kernels */}
      {Array.from({ length: 8 }, (_, i) => {
        const x = 700 + i * 60;
        const y = 850 + (i % 2) * 30;
        return (
          <g key={i}>
            <ellipse cx={x} cy={y} rx={12} ry={8} fill="#FFEB3B" />
            <ellipse cx={x + 4} cy={y + 2} rx={5} ry={4} fill="#FFC107" />
          </g>
        );
      })}
      
      {/* Insects */}
      {Array.from({ length: 5 }, (_, i) => {
        const x = 1100 + i * 70;
        const y = 820 + (i % 2) * 40;
        const crawlX = Math.sin(frame * 0.05 + i) * 5;
        
        return (
          <g key={i} transform={`translate(${x + crawlX}, ${y})`}>
            {/* Body */}
            <ellipse cx="0" cy="0" rx={15} ry={10} fill="#4CAF50" />
            {/* Head */}
            <circle cx="15" cy="0" r={8} fill="#66BB6A" />
            {/* Eyes */}
            <circle cx="18" cy="-3" r={2} fill="black" />
            <circle cx="18" cy="3" r={2} fill="black" />
            {/* Antennae */}
            <line x1="18" y1="-6" x2="25" y2="-15" stroke="#4CAF50" strokeWidth="2" />
            <line x1="18" y1="6" x2="25" y2="15" stroke="#4CAF50" strokeWidth="2" />
            {/* Legs */}
            {Array.from({ length: 3 }, (_, j) => (
              <line key={j} x1={-5 + j * 8} y1="8" x2={-5 + j * 8} y2="18" stroke="#4CAF50" strokeWidth="2" />
            ))}
          </g>
        );
      })}
      
      {/* Peacock pecking */}
      <g transform="translate(960, 680)">
        {/* Body */}
        <ellipse cx="0" cy="0" rx={85} ry={60} fill="#1565C0" />
        <ellipse cx="0" cy="8" rx={65} ry={42} fill="#1976D2" />
        
        {/* Neck and head (animated) */}
        <g transform={`translate(0, ${headDown})`}>
          <path d="M45,-10 Q75,-50 65,-110" stroke="#1565C0" strokeWidth="35" strokeLinecap="round" fill="none" />
          
          {/* Head */}
          <circle cx="65" cy="-115" r={35} fill="#1565C0" />
          
          {/* Eye */}
          <circle cx="75" cy="-118" r={9} fill="white" />
          <circle cx="77" cy="-118" r={5} fill="black" />
          
          {/* Beak (pointing down when pecking) */}
          <path d="M95,-115 L118,-110 L95,-105" fill="#FFA000" />
          
          {/* Crest */}
          <g transform="translate(65, -150)">
            {Array.from({ length: 5 }, (_, i) => {
              const angle = (i - 2) * 12;
              return <line key={i} x1="0" y1="0" x2={Math.sin(angle * Math.PI / 180) * 26} y2={-Math.cos(angle * Math.PI / 180) * 26} stroke="#00BCD4" strokeWidth="3" strokeLinecap="round" />;
            })}
          </g>
        </g>
        
        {/* Tail */}
        <path d="M-70,-25 Q-105,-70 -125,-35 L-115,-18 Z" fill="#1565C0" />
        <path d="M-75,-30 Q-115,-80 -140,-45 L-130,-28 Z" fill="#0D47A1" />
        
        {/* Legs */}
        <line x1="-25" y1="50" x2="-25" y2="120" stroke="#FFA000" strokeWidth="7" strokeLinecap="round" />
        <line x1="25" y1="50" x2="25" y2="120" stroke="#FFA000" strokeWidth="7" strokeLinecap="round" />
      </g>
      
      {/* Word labels */}
      {word1Visible && (
        <g transform="translate(720, 780)" style={{ opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], { extrapolateRight: "clamp" }) }}>
          <rect x="-50" y="-40" width="100" height="50" rx="10" fill="rgba(255,235,59,0.9)" />
          <text x="0" y="-8" textAnchor="middle" fontSize="28" fontWeight="bold" fill="#E65100">玉米</text>
        </g>
      )}
      
      {word2Visible && (
        <g transform="translate(1180, 750)" style={{ opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], { extrapolateRight: "clamp" }) }}>
          <rect x="-50" y="-40" width="100" height="50" rx="10" fill="rgba(76,175,80,0.9)" />
          <text x="0" y="-8" textAnchor="middle" fontSize="28" fontWeight="bold" fill="white">昆虫</text>
        </g>
      )}
    </svg>
  );
};

// Scene 5: Summary with character writing
const Scene5Summary: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  // Stroke animation for "孔雀" characters
  const peacockStrokes = [
    "M 100 100 L 200 100", // Top horizontal
    "M 150 50 L 150 150", // Middle vertical
    "M 100 150 L 200 150", // Bottom horizontal
  ];
  
  const kongStrokes = [
    "M 300 80 L 380 80",
    "M 340 40 L 340 120",
    "M 300 120 L 380 120",
    "M 320 120 L 300 160",
    "M 360 120 L 380 160",
  ];
  
  const getStrokeProgress = (strokeIndex: number, startFrame: number) => {
    return interpolate(frame, [startFrame + strokeIndex * 8, startFrame + strokeIndex * 8 + 15], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });
  };

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      {/* Background - gradient with peacock silhouette */}
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E0F7FA" />
          <stop offset="100%" stopColor="#B2EBF2" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bgGradient)" />
      
      {/* Peacock silhouette in background */}
      <g opacity="0.15">
        <ellipse cx="960" cy="700" rx={120} ry={80} fill="#00695C" />
        <path d="M1020,680 Q1070,620 1060,540" stroke="#00695C" strokeWidth="50" strokeLinecap="round" fill="none" />
        <circle cx="1060" cy="530" r={50} fill="#00695C" />
        
        {/* Fan of tail feathers */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = -Math.PI / 2 + (i - 5.5) * 0.15;
          const length = 280;
          const x = Math.sin(angle) * length;
          const y = Math.cos(angle) * length;
          return <line key={i} x1="960" y1="700" x2={960 + x} y2={700 + y} stroke="#00695C" strokeWidth={6} />;
        })}
      </g>
      
      {/* Large character "孔雀" */}
      <g transform="translate(760, 440)">
        {/* 孔 */}
        <g stroke="#00695C" strokeWidth={12} fill="none" strokeLinecap="round">
          {peacockStrokes.map((d, i) => {
            const progress = getStrokeProgress(i, 0);
            if (progress <= 0) return null;
            
            const length = 100;
            const currentLength = length * progress;
            
            return <path key={i} d={d} strokeDasharray={`${currentLength} ${length}`} />;
          })}
        </g>
        
        {/* 雀 */}
        <g transform="translate(200, 0)" stroke="#00695C" strokeWidth={12} fill="none" strokeLinecap="round">
          {kongStrokes.map((d, i) => {
            const progress = getStrokeProgress(i, 30);
            if (progress <= 0) return null;
            
            const length = 120;
            const currentLength = length * progress;
            
            return <path key={i} d={d} strokeDasharray={`${currentLength} ${length}`} />;
          })}
        </g>
      </g>
      
      {/* Decorative feathers around the characters */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 250;
        const x = 960 + Math.cos(angle) * radius;
        const y = 480 + Math.sin(angle) * radius;
        const rotation = angle * 180 / Math.PI;
        const featherScale = 0.8 + Math.sin(frame * 0.05 + i) * 0.1;
        
        return (
          <g key={i} transform={`translate(${x}, ${y}) rotate(${rotation}) scale(${featherScale})`}>
            {/* Feather */}
            <path d="M0,-40 Q10,0 0,40 Q-10,0 0,-40" fill="#00BCD4" opacity="0.6" />
            <circle cx="0" cy="0" r={12} fill="#9C27B0" opacity="0.6" />
            <circle cx="0" cy="0" r={6} fill="#7B1FA2" opacity="0.6" />
          </g>
        );
      })}
      
      {/* Sparkle effects */}
      {Array.from({ length: 12 }, (_, i) => {
        const sparkleProgress = interpolate(frame, [i * 5, i * 5 + 20], [0, 1], { extrapolateRight: "clamp" });
        const x = 200 + (i % 4) * 500;
        const y = 200 + Math.floor(i / 4) * 300;
        const scale = sparkleProgress * (1 - sparkleProgress) * 4;
        
        return (
          <g key={i} transform={`translate(${x}, ${y}) scale(${scale})`}>
            <path d="M0,-20 L5,0 L0,20 L-5,0 Z" fill="#FFD54F" />
            <path d="M-20,0 L0,5 L20,0 L0,-5 Z" fill="#FFD54F" />
          </g>
        );
      })}
    </svg>
  );
};