import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { Audio } from "@remotion/media";

// Types
type GeneratedScene = {
  id: string;
  title: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  accentColor: string;
  durationFrames: number;
  action: string;
  habitat: string;
  audioSrc?: string;
  visualAssets?: {
    characterAssetSrc?: string;
    backgroundAssetSrc?: string;
    hasCharacterAsset?: boolean;
  };
};

type GeneratedLessonProps = {
  title: string;
  topic: string;
  scenes: GeneratedScene[];
  durationFrames: number;
};

// Helper function to draw lion SVG
const LionSVG: React.FC<{ frame: number; action: string; scale?: number }> = ({ frame, action, scale = 1 }) => {
  const { fps } = useVideoConfig();
  
  // Action-based animations
  const headBob = action === "吼叫" ? Math.sin(frame * 0.1) * 5 : 0;
  const tailWag = action === "捕猎" ? Math.sin(frame * 0.3) * 20 : Math.sin(frame * 0.05) * 10;
  const bodyMove = action === "捕猎" ? Math.sin(frame * 0.15) * 15 : 0;
  
  return (
    <svg viewBox="0 0 400 400" style={{ width: 400 * scale, height: 400 * scale }}>
      {/* Body */}
      <ellipse 
        cx={200 + bodyMove} 
        cy={280} 
        rx={80} 
        ry={60} 
        fill="#D4A574" 
      />
      
      {/* Back legs */}
      <ellipse cx={150 + bodyMove} cy={320} rx={25} ry={40} fill="#C49A6C" />
      <ellipse cx={250 + bodyMove} cy={320} rx={25} ry={40} fill="#C49A6C" />
      
      {/* Front legs */}
      <ellipse cx={160 + bodyMove} cy={330} rx={20} ry={35} fill="#C49A6C" />
      <ellipse cx={240 + bodyMove} cy={330} rx={20} ry={35} fill="#C49A6C" />
      
      {/* Paws */}
      <ellipse cx={150 + bodyMove} cy={355} rx={18} ry={10} fill="#B8956A" />
      <ellipse cx={250 + bodyMove} cy={355} rx={18} ry={10} fill="#B8956A" />
      <ellipse cx={160 + bodyMove} cy={358} rx={15} ry={8} fill="#B8956A" />
      <ellipse cx={240 + bodyMove} cy={358} rx={15} ry={8} fill="#B8956A" />
      
      {/* Tail */}
      <path
        d={`M ${250 + bodyMove},260 Q ${280 + tailWag},220 ${270 + tailWag},180`}
        stroke="#D4A574"
        strokeWidth={12}
        fill="none"
        strokeLinecap="round"
      />
      {/* Tail tuft */}
      <ellipse cx={270 + tailWag} cy={175} rx={15} ry={20} fill="#8B4513" />
      
      {/* Mane (鬃毛) */}
      <circle cx={200 + bodyMove} cy={180} r={75} fill="#8B4513" />
      <circle cx={150 + bodyMove} cy={170} r={40} fill="#8B4513" />
      <circle cx={250 + bodyMove} cy={170} r={40} fill="#8B4513" />
      <circle cx={140 + bodyMove} cy={200} r={35} fill="#8B4513" />
      <circle cx={260 + bodyMove} cy={200} r={35} fill="#8B4513" />
      <circle cx={160 + bodyMove} cy={150} r={30} fill="#A0522D" />
      <circle cx={240 + bodyMove} cy={150} r={30} fill="#A0522D" />
      
      {/* Head */}
      <ellipse cx={200 + bodyMove} cy={180 + headBob} rx={55} ry={50} fill="#D4A574" />
      
      {/* Ears */}
      <ellipse cx={160 + bodyMove} cy={145 + headBob} rx={15} ry={20} fill="#D4A574" />
      <ellipse cx={240 + bodyMove} cy={145 + headBob} rx={15} ry={20} fill="#D4A574" />
      <ellipse cx={160 + bodyMove} cy={145 + headBob} rx={8} ry={12} fill="#C49A6C" />
      <ellipse cx={240 + bodyMove} cy={145 + headBob} rx={8} ry={12} fill="#C49A6C" />
      
      {/* Eyes */}
      <ellipse cx={180 + bodyMove} cy={170 + headBob} rx={12} ry={14} fill="white" />
      <ellipse cx={220 + bodyMove} cy={170 + headBob} rx={12} ry={14} fill="white" />
      <ellipse cx={182 + bodyMove} cy={172 + headBob} rx={7} ry={9} fill="#4A3728" />
      <ellipse cx={222 + bodyMove} cy={172 + headBob} rx={7} ry={9} fill="#4A3728" />
      <ellipse cx={184 + bodyMove} cy={170 + headBob} rx={3} ry={4} fill="white" />
      <ellipse cx={224 + bodyMove} cy={170 + headBob} rx={3} ry={4} fill="white" />
      
      {/* Nose */}
      <ellipse cx={200 + bodyMove} cy={195 + headBob} rx={12} ry={8} fill="#4A3728" />
      
      {/* Mouth */}
      <path
        d={`M ${190 + bodyMove},210 Q ${200 + bodyMove},220 ${210 + bodyMove},210`}
        stroke="#4A3728"
        strokeWidth={3}
        fill="none"
      />
      
      {/* Whiskers */}
      <line x1={170 + bodyMove} y1={195 + headBob} x2={140} y2={185} stroke="#8B7355" strokeWidth={1.5} />
      <line x1={170 + bodyMove} y1={200 + headBob} x2={135} y2={200} stroke="#8B7355" strokeWidth={1.5} />
      <line x1={170 + bodyMove} y1={205 + headBob} x2={140} y2={215} stroke="#8B7355" strokeWidth={1.5} />
      <line x1={230 + bodyMove} y1={195 + headBob} x2={260} y2={185} stroke="#8B7355" strokeWidth={1.5} />
      <line x1={230 + bodyMove} y1={200 + headBob} x2={265} y2={200} stroke="#8B7355" strokeWidth={1.5} />
      <line x1={230 + bodyMove} y1={205 + headBob} x2={260} y2={215} stroke="#8B7355" strokeWidth={1.5} />
    </svg>
  );
};

// Baby lion SVG (for growth scene)
const BabyLionSVG: React.FC<{ frame: number; scale?: number }> = ({ frame, scale = 0.6 }) => {
  const { fps } = useVideoConfig();
  const bounce = Math.sin(frame * 0.1) * 3;
  
  return (
    <svg viewBox="0 0 300 300" style={{ width: 300 * scale, height: 300 * scale }}>
      {/* Body */}
      <ellipse cx={150} cy={200} rx={50} ry={40} fill="#E8C9A0" />
      
      {/* Spots (baby lion特征) */}
      <circle cx={130} cy={190} r={5} fill="#C9A86C" opacity={0.6} />
      <circle cx={170} cy={185} r={4} fill="#C9A86C" opacity={0.6} />
      <circle cx={150} cy={210} r={4} fill="#C9A86C" opacity={0.6} />
      <circle cx={120} cy={205} r={3} fill="#C9A86C" opacity={0.6} />
      <circle cx={180} cy={200} r={3} fill="#C9A86C" opacity={0.6} />
      
      {/* Legs */}
      <ellipse cx={120} cy={235} rx={15} ry={25} fill="#E0C090" />
      <ellipse cx={180} cy={235} rx={15} ry={25} fill="#E0C090" />
      
      {/* Tail */}
      <path d="M 180,180 Q 200,150 195,130" stroke="#E8C9A0" strokeWidth={8} fill="none" strokeLinecap="round" />
      <ellipse cx={195} cy={125} rx={10} ry={14} fill="#A0522D" />
      
      {/* Small mane (baby has little mane) */}
      <circle cx={150} cy={130} r={35} fill="#D4A574" opacity={0.7} />
      <circle cx={120} cy={135} r={20} fill="#D4A574" opacity={0.6} />
      <circle cx={180} cy={135} r={20} fill="#D4A574" opacity={0.6} />
      
      {/* Head */}
      <ellipse cx={150} cy={135} rx={40} ry={38} fill="#E8C9A0" />
      
      {/* Ears */}
      <ellipse cx={125} cy={110} rx={12} ry={16} fill="#E8C9A0" />
      <ellipse cx={175} cy={110} rx={12} ry={16} fill="#E8C9A0" />
      <ellipse cx={125} cy={110} rx={6} ry={10} fill="#D4C090" />
      <ellipse cx={175} cy={110} rx={6} ry={10} fill="#D4C090" />
      
      {/* Eyes */}
      <ellipse cx={135} cy={130} rx={10} ry={12} fill="white" />
      <ellipse cx={165} cy={130} rx={10} ry={12} fill="white" />
      <ellipse cx={137} cy={132} rx={5} ry={7} fill="#4A3728" />
      <ellipse cx={167} cy={132} rx={5} ry={7} fill="#4A3728" />
      <ellipse cx={138} cy={130} rx={2} ry={3} fill="white" />
      <ellipse cx={168} cy={130} rx={2} ry={3} fill="white" />
      
      {/* Nose */}
      <ellipse cx={150} cy={148} rx={8} ry={6} fill="#4A3728" />
      
      {/* Mouth - cute smile */}
      <path d="M 142,158 Q 150,165 158,158" stroke="#4A3728" strokeWidth={2} fill="none" />
    </svg>
  );
};

// Background component
const Background: React.FC<{ habitat: string; frame: number }> = ({ habitat, frame }) => {
  const skyGradient = "linear-gradient(to bottom, #87CEEB 0%, #B0E0E6 50%, #FFF8DC 100%)";
  
  return (
    <div style={{ position: "absolute", inset: 0, background: skyGradient }}>
      {/* Sun */}
      <div style={{
        position: "absolute",
        top: 60,
        right: 100,
        width: 80,
        height: 80,
        borderRadius: "50%",
        background: "radial-gradient(circle, #FFD700 0%, #FFA500 100%)",
        boxShadow: "0 0 60px 30px rgba(255, 215, 0, 0.4)"
      }} />
      
      {/* Clouds */}
      <div style={{ position: "absolute", top: 80, left: 150 }}>
        <Cloud frame={frame} delay={0} />
      </div>
      <div style={{ position: "absolute", top: 120, left: 600 }}>
        <Cloud frame={frame} delay={50} />
      </div>
      
      {/* Grass/Ground */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 350,
        background: "linear-gradient(to bottom, #90EE90 0%, #228B22 100%)"
      }}>
        {/* Grass blades */}
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: Math.random() * 50,
              left: `${i * 3.5}%`,
              width: 4,
              height: 30 + Math.random() * 40,
              background: `hsl(${100 + Math.random() * 30}, 70%, ${30 + Math.random() * 15}%)`,
              borderRadius: "50% 50% 0 0",
              transform: `rotate(${-10 + Math.random() * 20}deg)`,
            }}
          />
        ))}
      </div>
      
      {/* Acacia tree (稀树草原特征) */}
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", bottom: 280, left: 100, width: 300, height: 200 }}>
        {/* Trunk */}
        <path d="M 130,200 Q 140,150 130,100 Q 125,80 130,60" stroke="#8B4513" strokeWidth={20} fill="none" />
        {/* Branches */}
        <path d="M 130,100 Q 80,80 60,90" stroke="#8B4513" strokeWidth={12} fill="none" />
        <path d="M 130,90 Q 180,70 200,80" stroke="#8B4513" strokeWidth={10} fill="none" />
        {/* Foliage (flat top - acacia特征) */}
        <ellipse cx={60} cy={85} rx={50} ry={15} fill="#228B22" />
        <ellipse cx={200} cy={75} rx={45} ry={12} fill="#2E8B57" />
        <ellipse cx={130} cy={55} rx={60} ry={18} fill="#32CD32" />
      </svg>
      
      {/* Distant hills */}
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", bottom: 300, left: 0, width: "100%", height: 150 }}>
        <path d="M 0,150 Q 300,80 600,120 Q 900,60 1200,100 Q 1500,70 1920,110 L 1920,150 Z" fill="#3CB371" opacity={0.6} />
        <path d="M 0,150 Q 400,100 800,130 Q 1200,90 1600,120 Q 1800,100 1920,130 L 1920,150 Z" fill="#2E8B57" opacity={0.5} />
      </svg>
    </div>
  );
};

// Cloud component
const Cloud: React.FC<{ frame: number; delay?: number }> = ({ frame, delay = 0 }) => {
  const x = interpolate((frame - delay) % 300, [0, 300], [0, 200]);
  
  return (
    <svg width={120} height={60} style={{ transform: `translateX(${x}px)` }}>
      <ellipse cx={30} cy={30} rx={25} ry={20} fill="white" opacity={0.9} />
      <ellipse cx={55} cy={25} rx={30} ry={22} fill="white" opacity={0.9} />
      <ellipse cx={80} cy={30} rx={25} ry={18} fill="white" opacity={0.9} />
      <ellipse cx={50} cy={35} rx={20} ry={15} fill="white" opacity={0.8} />
    </svg>
  );
};

// Scene component
const SceneComponent: React.FC<{
  scene: GeneratedScene;
  sceneIndex: number;
}> = ({ scene, sceneIndex }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Calculate scene timing
  const sceneStartFrame = sceneIndex * 6 * fps;
  const localFrame = frame - sceneStartFrame;
  
  // Fade in animation
  const opacity = interpolate(localFrame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  
  // Title animation
  const titleScale = spring({
    frame: localFrame,
    fps,
    config: { damping: 200 },
  });
  
  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Background */}
      <Background habitat={scene.habitat} frame={frame} />
      
      {/* Main content based on scene */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {scene.id === "scene-1" && (
          // Scene 1: 认识狮子 - Lion on rock
          <div style={{ position: "absolute", bottom: 200, left: "50%", transform: "translateX(-50%)" }}>
            <LionSVG frame={frame} action="roar" scale={1.2} />
          </div>
        )}
        
        {scene.id === "scene-2" && (
          // Scene 2: 狮子的样子 - Drawing animation
          <div style={{ position: "absolute", bottom: 180, left: "50%", transform: "translateX(-50%)" }}>
            <LionSVG frame={frame} action="standing" scale={1.1} />
          </div>
        )}
        
        {scene.id === "scene-3" && (
          // Scene 3: 狮子的家庭 - Lion family
          <div style={{ position: "absolute", bottom: 180, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", gap: 20 }}>
            <BabyLionSVG frame={frame} scale={0.4} />
            <div style={{ transform: "translateY(30px)" }}>
              <LionSVG frame={frame} action="roar" scale={0.7} />
            </div>
            <BabyLionSVG frame={frame} scale={0.35} />
          </div>
        )}
        
        {scene.id === "scene-4" && (
          // Scene 4: 捕猎 - Hunting
          <div style={{ position: "absolute", bottom: 180, left: "50%", transform: "translateX(-50%)" }}>
            <LionSVG frame={frame} action="hunting" scale={1} />
          </div>
        )}
        
        {scene.id === "scene-5" && (
          // Scene 5: 小狮子长大 - Growth stages
          <div style={{ position: "absolute", bottom: 150, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", gap: 40 }}>
            <div style={{ textAlign: "center" }}>
              <BabyLionSVG frame={frame} scale={0.45} />
              <div style={{ fontSize: 24, color: "#4A3728", marginTop: 10 }}>小狮子</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <BabyLionSVG frame={frame} scale={0.55} />
              <div style={{ fontSize: 24, color: "#4A3728", marginTop: 10 }}>半大狮子</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <LionSVG frame={frame} action="standing" scale={0.65} />
              <div style={{ fontSize: 24, color: "#4A3728", marginTop: 10 }}>成年狮子</div>
            </div>
          </div>
        )}
        
        {scene.id === "scene-6" && (
          // Scene 6: 总结 - Summary
          <div style={{ position: "absolute", bottom: 200, left: "50%", transform: "translateX(-50%)" }}>
            <LionSVG frame={frame} action="standing" scale={1.3} />
          </div>
        )}
      </div>
      
      {/* Title */}
      <div style={{
        position: "absolute",
        top: 80,
        left: "50%",
        transform: `translateX(-50%) scale(${titleScale})`,
        fontSize: 56,
        fontWeight: "bold",
        color: "#8B4513",
        textShadow: "2px 2px 4px rgba(0,0,0,0.2)",
        fontFamily: "Microsoft YaHei, sans-serif",
      }}>
        {scene.title}
      </div>
      
      {/* Narration bar */}
      <div style={{
        position: "absolute",
        bottom: 40,
        left: "50%",
        transform: "translateX(-50%)",
        width: "80%",
        maxWidth: 1000,
        background: "rgba(0, 0, 0, 0.6)",
        borderRadius: 20,
        padding: "20px 30px",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{
          fontSize: 28,
          color: "white",
          textAlign: "center",
          lineHeight: 1.6,
          fontFamily: "Microsoft YaHei, sans-serif",
        }}>
          {scene.narration}
        </div>
      </div>
      
      {/* On-screen text */}
      <div style={{
        position: "absolute",
        top: 160,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: 36,
        color: "#FF8C00",
        fontWeight: "bold",
        fontFamily: "Microsoft YaHei, sans-serif",
        textShadow: "1px 1px 2px rgba(0,0,0,0.3)",
      }}>
        {scene.onScreenText}
      </div>
      
      {/* Audio for this scene */}
      {scene.audioSrc ? (
        <Audio src={staticFile(scene.audioSrc)} volume={0.94} />
      ) : null}
    </AbsoluteFill>
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
  
  return (
    <AbsoluteFill style={{ background: "#FFF5E6" }}>
      {/* Title card */}
      <Sequence from={0} durationInFrames={fps * 2}>
        <AbsoluteFill style={{ background: "linear-gradient(135deg, #FFF5E6 0%, #FFE4B5 100%)" }}>
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: 72,
              fontWeight: "bold",
              color: "#8B4513",
              marginBottom: 20,
              fontFamily: "Microsoft YaHei, sans-serif",
            }}>
              {title}
            </div>
            <div style={{
              fontSize: 36,
              color: "#FF8C00",
              fontFamily: "Microsoft YaHei, sans-serif",
            }}>
              {topic}
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
      
      {/* Scenes */}
      {scenes.map((scene, index) => (
        <Sequence
          key={scene.id}
          from={index * 6 * fps}
          durationInFrames={scene.durationFrames || 6 * fps}
        >
          <SceneComponent scene={scene} sceneIndex={index} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export default GeneratedLesson;
