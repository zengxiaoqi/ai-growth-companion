/**
 * Emotion faces animation template.
 * Animated face that morphs between different emotional expressions.
 */
import type p5 from 'p5';
import { registerTemplate } from '../../registry';
import { registerP5Sketch } from '../../renderers/sketch-registry';

// ── Template registration ──

registerTemplate({
  id: 'social.emotion-faces',
  domain: 'social',
  subcategory: 'emotions',
  engine: 'p5',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'emotions',
      type: 'string[]',
      required: false,
      defaultValue: ['happy', 'sad', 'angry', 'surprised'],
      label: '表情列表',
    },
    {
      name: 'transitionSpeed',
      type: 'number',
      required: false,
      defaultValue: 2,
      label: '切换速度',
    },
  ],
  defaultDurationSec: 14,
  description: '表情变化动画：展示不同情绪表情的平滑变化过程',
});

// ── Sketch registration ──

registerP5Sketch('social.emotion-faces', (p: p5, params: Record<string, unknown>) => {
  const emotions = (params.emotions as string[]) || ['happy', 'sad', 'angry', 'surprised'];
  const transitionSpeed = (params.transitionSpeed as number) || 2;

  // Each emotion has: eyebrow angle, eye openness, mouth curve, mouth openness, face color tint
  interface EmotionState {
    eyebrowAngle: number; // radians, positive = raised
    eyebrowHeight: number; // offset from eye
    eyeOpenness: number; // 0-1
    eyeShape: 'round' | 'wide' | 'squint';
    mouthCurve: number; // positive = smile, negative = frown
    mouthOpenness: number; // 0-1
    mouthWidth: number;
    blushAlpha: number;
    faceHue: number; // subtle tint shift
  }

  const emotionPresets: Record<string, EmotionState> = {
    happy: {
      eyebrowAngle: 0.1,
      eyebrowHeight: 10,
      eyeOpenness: 0.8,
      eyeShape: 'round',
      mouthCurve: 0.8,
      mouthOpenness: 0.3,
      mouthWidth: 40,
      blushAlpha: 60,
      faceHue: 40,
    },
    sad: {
      eyebrowAngle: -0.3,
      eyebrowHeight: 8,
      eyeOpenness: 0.5,
      eyeShape: 'round',
      mouthCurve: -0.6,
      mouthOpenness: 0.1,
      mouthWidth: 30,
      blushAlpha: 0,
      faceHue: 210,
    },
    angry: {
      eyebrowAngle: -0.5,
      eyebrowHeight: 5,
      eyeOpenness: 0.9,
      eyeShape: 'squint',
      mouthCurve: -0.3,
      mouthOpenness: 0.2,
      mouthWidth: 35,
      blushAlpha: 80,
      faceHue: 0,
    },
    surprised: {
      eyebrowAngle: 0.4,
      eyebrowHeight: 15,
      eyeOpenness: 1,
      eyeShape: 'wide',
      mouthCurve: 0,
      mouthOpenness: 0.8,
      mouthWidth: 25,
      blushAlpha: 20,
      faceHue: 30,
    },
    scared: {
      eyebrowAngle: 0.3,
      eyebrowHeight: 14,
      eyeOpenness: 1,
      eyeShape: 'wide',
      mouthCurve: -0.2,
      mouthOpenness: 0.5,
      mouthWidth: 20,
      blushAlpha: 10,
      faceHue: 200,
    },
    disgusted: {
      eyebrowAngle: -0.15,
      eyebrowHeight: 7,
      eyeOpenness: 0.4,
      eyeShape: 'squint',
      mouthCurve: -0.4,
      mouthOpenness: 0.15,
      mouthWidth: 28,
      blushAlpha: 30,
      faceHue: 120,
    },
  };

  const defaultState: EmotionState = {
    eyebrowAngle: 0,
    eyebrowHeight: 10,
    eyeOpenness: 0.7,
    eyeShape: 'round',
    mouthCurve: 0,
    mouthOpenness: 0,
    mouthWidth: 30,
    blushAlpha: 0,
    faceHue: 40,
  };

  let currentState = { ...defaultState };
  let targetState: EmotionState;
  let currentEmotionIdx = 0;
  let transitionT = 0;
  let holdTimer = 0;
  let isTransitioning = false;

  // Layout
  const faceRadius = 90;
  let faceCX = 0;
  let faceCY = 0;

  const emotionLabels: Record<string, string> = {
    happy: '开心',
    sad: '伤心',
    angry: '生气',
    surprised: '惊讶',
    scared: '害怕',
    disgusted: '厌恶',
  };

  p.setup = () => {
    p.createCanvas(640, 400);
    p.textAlign(p.CENTER, p.CENTER);
    faceCX = p.width / 2;
    faceCY = p.height * 0.42;

    targetState = getEmotionState(emotions[0]);
    currentState = { ...targetState };
  };

  p.draw = () => {
    const dt = p.deltaTime / 1000;

    updateState(dt);
    drawBackground();
    drawFace();
    drawLabel();
    drawEmotionDots();
  };

  function getEmotionState(emotion: string): EmotionState {
    return emotionPresets[emotion] || emotionPresets.happy;
  }

  function updateState(dt: number) {
    if (isTransitioning) {
      transitionT += dt * transitionSpeed * 0.5;
      if (transitionT >= 1) {
        transitionT = 1;
        isTransitioning = false;
        holdTimer = 0;
        currentState = { ...targetState };
      } else {
        const eased = easeInOutCubic(transitionT);
        lerpState(currentState, currentState, targetState, eased);
      }
    } else {
      holdTimer += dt;
      if (holdTimer >= 2.0) {
        // Move to next emotion
        currentEmotionIdx = (currentEmotionIdx + 1) % emotions.length;
        targetState = getEmotionState(emotions[currentEmotionIdx]);
        isTransitioning = true;
        transitionT = 0;
      }
    }
  }

  function lerpState(
    out: EmotionState,
    from: EmotionState,
    to: EmotionState,
    t: number,
  ): void {
    out.eyebrowAngle = p.lerp(from.eyebrowAngle, to.eyebrowAngle, t);
    out.eyebrowHeight = p.lerp(from.eyebrowHeight, to.eyebrowHeight, t);
    out.eyeOpenness = p.lerp(from.eyeOpenness, to.eyeOpenness, t);
    out.mouthCurve = p.lerp(from.mouthCurve, to.mouthCurve, t);
    out.mouthOpenness = p.lerp(from.mouthOpenness, to.mouthOpenness, t);
    out.mouthWidth = p.lerp(from.mouthWidth, to.mouthWidth, t);
    out.blushAlpha = p.lerp(from.blushAlpha, to.blushAlpha, t);
    out.faceHue = p.lerp(from.faceHue, to.faceHue, t);
  }

  function drawBackground() {
    p.background(248, 246, 243);

    // Subtle radial gradient behind face
    p.noStroke();
    for (let r = 200; r > 0; r -= 5) {
      const alpha = p.map(r, 0, 200, 20, 0);
      p.fill(currentState.faceHue, 10, 95, alpha);
      p.ellipse(faceCX, faceCY, r * 2, r * 2);
    }
  }

  function drawFace() {
    const x = faceCX;
    const y = faceCY;
    const r = faceRadius;

    // Face shadow
    p.noStroke();
    p.fill(0, 0, 0, 15);
    p.ellipse(x + 4, y + 6, r * 2 + 4, r * 2 + 4);

    // Face circle
    p.fill(255, 220, 160);
    p.stroke(220, 185, 130);
    p.strokeWeight(2);
    p.ellipse(x, y, r * 2, r * 2);

    // Blush
    if (currentState.blushAlpha > 0) {
      p.noStroke();
      p.fill(255, 150, 150, currentState.blushAlpha);
      p.ellipse(x - r * 0.5, y + r * 0.2, r * 0.35, r * 0.2);
      p.ellipse(x + r * 0.5, y + r * 0.2, r * 0.35, r * 0.2);
    }

    // Eyes
    drawEyes(x, y, r);

    // Eyebrows
    drawEyebrows(x, y, r);

    // Mouth
    drawMouth(x, y, r);
  }

  function drawEyes(x: number, y: number, r: number) {
    const eyeOffsetX = r * 0.3;
    const eyeY = y - r * 0.1;
    const eyeW = r * 0.22;
    const eyeH = r * 0.25 * currentState.eyeOpenness;

    p.noStroke();
    // White
    p.fill(255);
    if (currentState.eyeShape === 'wide') {
      p.ellipse(x - eyeOffsetX, eyeY, eyeW * 1.3, eyeH * 1.5);
      p.ellipse(x + eyeOffsetX, eyeY, eyeW * 1.3, eyeH * 1.5);
    } else if (currentState.eyeShape === 'squint') {
      p.ellipse(x - eyeOffsetX, eyeY, eyeW, eyeH * 0.6);
      p.ellipse(x + eyeOffsetX, eyeY, eyeW, eyeH * 0.6);
    } else {
      p.ellipse(x - eyeOffsetX, eyeY, eyeW, eyeH);
      p.ellipse(x + eyeOffsetX, eyeY, eyeW, eyeH);
    }

    // Pupil
    const pupilSize = eyeW * 0.5;
    p.fill(40, 30, 30);
    p.ellipse(x - eyeOffsetX, eyeY, pupilSize, pupilSize);
    p.ellipse(x + eyeOffsetX, eyeY, pupilSize, pupilSize);

    // Highlight
    p.fill(255, 255, 255, 200);
    p.ellipse(x - eyeOffsetX + pupilSize * 0.2, eyeY - pupilSize * 0.2, pupilSize * 0.3, pupilSize * 0.3);
    p.ellipse(x + eyeOffsetX + pupilSize * 0.2, eyeY - pupilSize * 0.2, pupilSize * 0.3, pupilSize * 0.3);
  }

  function drawEyebrows(x: number, y: number, r: number) {
    const eyeOffsetX = r * 0.3;
    const browY = y - r * 0.1 - r * 0.25 - currentState.eyebrowHeight;
    const browLen = r * 0.25;
    const angle = currentState.eyebrowAngle;

    p.stroke(100, 70, 50);
    p.strokeWeight(3);
    p.strokeCap(p.ROUND);
    // Left eyebrow
    p.line(
      x - eyeOffsetX - browLen * p.cos(angle),
      browY + browLen * p.sin(angle),
      x - eyeOffsetX + browLen * p.cos(angle),
      browY - browLen * p.sin(angle),
    );
    // Right eyebrow (mirrored)
    p.line(
      x + eyeOffsetX - browLen * p.cos(-angle),
      browY - browLen * p.sin(-angle),
      x + eyeOffsetX + browLen * p.cos(-angle),
      browY + browLen * p.sin(-angle),
    );
    p.noStroke();
  }

  function drawMouth(x: number, y: number, r: number) {
    const mouthY = y + r * 0.35;
    const mouthW = currentState.mouthWidth;

    p.stroke(180, 80, 80);
    p.strokeWeight(3);
    p.noFill();
    p.strokeCap(p.ROUND);

    if (currentState.mouthOpenness > 0.3) {
      // Open mouth
      p.beginShape();
      p.vertex(x - mouthW / 2, mouthY);
      // @ts-ignore - quadraticVertexTo doesn't exist, convert to bezierVertex
      p.quadraticVertexTo(
        x,
        mouthY + currentState.mouthCurve * 30 + currentState.mouthOpenness * 25,
        x + mouthW / 2,
        mouthY,
      );
      p.endShape();

      // Fill mouth interior
      p.noStroke();
      p.fill(120, 40, 40);
      p.beginShape();
      p.vertex(x - mouthW / 2 + 2, mouthY);
      // @ts-ignore
      p.quadraticVertexTo(
        x,
        mouthY + currentState.mouthCurve * 25 + currentState.mouthOpenness * 20,
        x + mouthW / 2 - 2,
        mouthY,
      );
      p.endShape(p.CLOSE);
    } else {
      // Closed/slight smile
      p.beginShape();
      p.vertex(x - mouthW / 2, mouthY);
      // @ts-ignore
      p.quadraticVertexTo(
        x,
        mouthY + currentState.mouthCurve * 30,
        x + mouthW / 2,
        mouthY,
      );
      p.endShape();
    }
    p.noStroke();
  }

  function drawLabel() {
    const emotion = emotions[currentEmotionIdx];
    const label = emotionLabels[emotion] || emotion;

    // Label background
    p.noStroke();
    p.fill(60, 60, 80, 220);
    p.rectMode(p.CENTER);
    p.rect(p.width / 2, faceCY + faceRadius + 55, 120, 36, 18);
    p.rectMode(p.CORNER);

    // Label text
    p.fill(255);
    p.textSize(20);
    p.textStyle(p.BOLD);
    p.text(label, p.width / 2, faceCY + faceRadius + 55);

    // Instruction
    p.fill(150, 150, 165);
    p.textSize(12);
    p.textStyle(p.NORMAL);
    p.text('表情变化', p.width / 2, p.height - 20);
  }

  function drawEmotionDots() {
    const dotSize = 12;
    const spacing = 28;
    const startX = p.width / 2 - ((emotions.length - 1) * spacing) / 2;
    const dotY = p.height - 45;

    for (let i = 0; i < emotions.length; i++) {
      if (i === currentEmotionIdx) {
        // Active dot with glow
        p.noStroke();
        p.fill(255, 180, 50, 60);
        p.ellipse(startX + i * spacing, dotY, dotSize + 8, dotSize + 8);
        p.fill(255, 180, 50);
        p.ellipse(startX + i * spacing, dotY, dotSize, dotSize);
      } else if (i < currentEmotionIdx) {
        p.fill(180, 180, 190);
        p.noStroke();
        p.ellipse(startX + i * spacing, dotY, dotSize, dotSize);
      } else {
        p.fill(210, 210, 220);
        p.noStroke();
        p.ellipse(startX + i * spacing, dotY, dotSize, dotSize);
      }
    }
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
});
