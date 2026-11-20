import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle, Microscope, Palette, RotateCcw, Volume2 } from '@/icons';
import { Button, Card } from './ui';
import { withAuthToken } from './games/ChildGameUI';
import type {
  DrawingModuleData,
  ExperimentModuleData,
  RoleplayModuleData,
} from '@/types';

type CompleteFn = (score?: number, data?: Record<string, any>) => void;

const DEFAULT_COLORS = [
  '#FF6B6B',
  '#FFA94D',
  '#FFD43B',
  '#69DB7C',
  '#4DABF7',
  '#9775FA',
  '#F783AC',
  '#495057',
];

function speak(text: string) {
  if (!text || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function CompletedBanner({ emoji, text }: { emoji: string; text: string }) {
  return (
    <Card className="flex items-center gap-3 bg-green-50 p-4">
      <span className="text-2xl">{emoji}</span>
      <p className="flex-1 text-sm font-semibold text-on-surface">{text}</p>
      <CheckCircle className="h-5 w-5 text-green-600" />
    </Card>
  );
}

// ─── Draw Step (art) ───────────────────────────────────────────────────

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  isEraser: boolean;
}

export function DrawStep({
  module: m,
  onComplete,
  isCompleted,
}: {
  module: any;
  onComplete: CompleteFn;
  isCompleted: boolean;
}) {
  const data: DrawingModuleData = m.drawing || {};
  const prompt = data.prompt || '画出你心里的样子吧！';
  const reference = data.reference || '';
  const minStrokes = Math.max(1, Math.min(30, data.minStrokes ?? 6));
  const checklist = data.checklist || [];
  const palette = useMemo(() => {
    const colors = (data.suggestedColors || []).filter((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c));
    return colors.length > 0 ? colors : DEFAULT_COLORS;
  }, [data.suggestedColors]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const colorsUsedRef = useRef<Set<string>>(new Set());
  const [strokeCount, setStrokeCount] = useState(0);
  const [color, setColor] = useState(palette[0]);
  const [brushWidth, setBrushWidth] = useState(8);
  const [eraserOn, setEraserOn] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokesRef.current) {
      if (stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer may already be inactive (e.g. synthetic event); drawing still works without capture
    }
    const stroke: Stroke = {
      points: [canvasPoint(e)],
      color: eraserOn ? '#ffffff' : color,
      width: eraserOn ? brushWidth * 3 : brushWidth,
      isEraser: eraserOn,
    };
    strokesRef.current.push(stroke);
    currentRef.current = stroke;
    if (!eraserOn) colorsUsedRef.current.add(color);
    redraw();
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentRef.current) return;
    currentRef.current.points.push(canvasPoint(e));
    redraw();
  };

  const handleUp = () => {
    if (currentRef.current && !currentRef.current.isEraser && currentRef.current.points.length > 1) {
      setStrokeCount((c) => c + 1);
    }
    currentRef.current = null;
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    colorsUsedRef.current = new Set();
    currentRef.current = null;
    setStrokeCount(0);
    setShowChecklist(false);
    redraw();
  };

  const finish = () => {
    onComplete(85, { strokes: strokeCount, colorsUsed: colorsUsedRef.current.size });
  };

  if (isCompleted) return <CompletedBanner emoji="🎨" text="画得真棒！" />;

  const canComplete = strokeCount >= minStrokes;

  return (
    <div className="space-y-3">
      <Card className="bg-pink-50 p-4">
        <p className="text-sm font-semibold text-on-surface">{prompt}</p>
        {reference && <p className="mt-1 text-xs text-on-surface-variant">小提示：{reference}</p>}
      </Card>

      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        className="w-full touch-none rounded-2xl border-2 border-outline-variant/30 bg-white"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      />

      <div className="flex flex-wrap items-center gap-2">
        {palette.map((c) => (
          <button
            key={c}
            aria-label={`颜色 ${c}`}
            onClick={() => {
              setColor(c);
              setEraserOn(false);
            }}
            className={`h-8 w-8 rounded-full border-2 ${
              !eraserOn && color === c ? 'border-on-surface' : 'border-white'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          onClick={() => {
            setBrushWidth(5);
            setEraserOn(false);
          }}
          className={`rounded-full border px-3 py-1 text-xs ${
            !eraserOn && brushWidth === 5 ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant'
          }`}
        >
          细笔
        </button>
        <button
          onClick={() => {
            setBrushWidth(12);
            setEraserOn(false);
          }}
          className={`rounded-full border px-3 py-1 text-xs ${
            !eraserOn && brushWidth === 12 ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant'
          }`}
        >
          粗笔
        </button>
        <button
          onClick={() => setEraserOn((v) => !v)}
          className={`rounded-full border px-3 py-1 text-xs ${
            eraserOn ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant'
          }`}
        >
          橡皮
        </button>
        <button
          onClick={clearCanvas}
          className="flex items-center gap-1 rounded-full border border-outline-variant/40 px-3 py-1 text-xs text-on-surface-variant"
        >
          <RotateCcw className="h-3 w-3" /> 清空
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-medium ${canComplete ? 'text-green-600' : 'text-on-surface-variant'}`}>
          已画 {strokeCount} 笔{canComplete ? '，画好啦！' : `，目标 ${minStrokes} 笔`}
        </p>
        <Button
          disabled={!canComplete}
          onClick={() => (checklist.length > 0 ? setShowChecklist(true) : finish())}
        >
          <Palette className="mr-2 h-4 w-4" /> 我画好了
        </Button>
      </div>

      {showChecklist && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold text-on-surface">看看你的画里有没有这些？</p>
          {checklist.map((item, i) => (
            <p key={i} className="text-sm text-on-surface-variant">🌟 {item}</p>
          ))}
          <Button className="w-full" onClick={finish}>
            <Check className="mr-2 h-4 w-4" /> 都有啦，完成！
          </Button>
        </Card>
      )}
    </div>
  );
}

// ─── Roleplay Step (social) ────────────────────────────────────────────

export function RoleplayStep({
  module: m,
  onComplete,
  isCompleted,
}: {
  module: any;
  onComplete: CompleteFn;
  isCompleted: boolean;
}) {
  const data: RoleplayModuleData = m.roleplay || {};
  const turns = useMemo(() => (data.turns || []).filter((t) => t?.text), [data.turns]);
  const minTurns = Math.max(1, Math.min(10, data.minTurns ?? 3));
  const roleNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of data.roles || []) {
      if (r?.id && r?.name) map[r.id] = r.name;
    }
    return map;
  }, [data.roles]);

  const [turnIndex, setTurnIndex] = useState(0);
  const [turnsCompleted, setTurnsCompleted] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [allDone, setAllDone] = useState(false);

  const turn = turns[turnIndex];

  const playTurn = useCallback(() => {
    if (!turn) return;
    const name = roleNames[turn.speaker] || turn.speaker;
    speak(name ? `${name}说：${turn.text}` : turn.text);
  }, [turn, roleNames]);

  useEffect(() => {
    if (!isCompleted && turn) playTurn();
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [turnIndex, isCompleted, turn, playTurn]);

  if (isCompleted) return <CompletedBanner emoji="🎭" text="演得真棒！" />;
  if (turns.length === 0) return <CompletedBanner emoji="🎭" text="这一步暂时没有对话内容" />;

  const isCorrectOption = (option: string) => {
    if (option === turn.childLine) return true;
    return (turn.keywords || []).some((kw) => kw && option.includes(kw));
  };

  const succeedTurn = () => {
    const completed = turnsCompleted + 1;
    setTurnsCompleted(completed);
    setFeedback('说得真好！');
    window.setTimeout(() => {
      if (completed >= minTurns || turnIndex >= turns.length - 1) {
        setAllDone(true);
      } else {
        setTurnIndex((i) => i + 1);
        setFeedback('');
      }
    }, 900);
  };

  const pickOption = (option: string) => {
    const anyCorrect = (turn.options || []).some(isCorrectOption);
    const correct = isCorrectOption(option) || (!anyCorrect && option === (turn.options || [])[0]);
    if (correct) {
      succeedTurn();
    } else {
      setFeedback('再想想，小伙伴在等你的回答哦');
    }
  };

  if (allDone) {
    return (
      <div className="space-y-3">
        <CompletedBanner emoji="🎭" text={`对话完成啦！你演了 ${turnsCompleted} 轮`} />
        <Button className="w-full" onClick={() => onComplete(85, { turnsCompleted, viaVoice: false })}>
          <Check className="mr-2 h-4 w-4" /> 完成表演
        </Button>
      </div>
    );
  }

  const name = roleNames[turn.speaker] || turn.speaker || '小伙伴';

  return (
    <div className="space-y-3">
      {data.scenario && (
        <Card className="bg-amber-50 p-3">
          <p className="text-sm text-on-surface">{data.scenario}</p>
        </Card>
      )}
      <p className="text-xs text-on-surface-variant">
        第 {turnIndex + 1} / {turns.length} 轮
      </p>

      <Card className="max-w-[85%] p-3">
        <p className="text-xs font-semibold text-on-surface-variant">{name}</p>
        <p className="mt-1 text-base text-on-surface">{turn.text}</p>
      </Card>

      {turn.childLine && (
        <Card className="ml-auto max-w-[85%] bg-primary/10 p-3">
          <p className="text-xs font-semibold text-on-surface-variant">你</p>
          <p className="mt-1 text-base text-on-surface">{turn.childLine}</p>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={playTurn}>
          <Volume2 className="mr-2 h-4 w-4" /> 再听一次
        </Button>
        {feedback && <p className="text-sm text-primary">{feedback}</p>}
      </div>

      <div className="space-y-2">
        {(turn.options || []).map((option, i) => (
          <button
            key={i}
            onClick={() => pickOption(option)}
            className="w-full rounded-xl border border-outline-variant/40 px-4 py-3 text-left text-sm text-on-surface transition hover:border-primary hover:bg-primary/5"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Old lessons have no URL field: derive the same URL from the label. */
function experimentPictureUrl(label: string): string | null {
  const subject = label.trim().replace(/(?:卡片|图片|插画|卡|图)$/u, '');
  if (!subject || subject.length > 12 || /[\\/\x00-\x1f<>]/.test(subject)) return null;
  return `/api/learning/activity-image/${encodeURIComponent(subject)}`;
}

function experimentPictureUrls(value: unknown, labels: string[]): Array<string | null> {
  return labels.map((label, i) => {
    if (Array.isArray(value) && typeof value[i] === 'string' && value[i]) {
      return value[i] as string;
    }
    return experimentPictureUrl(label);
  });
}

function ExperimentPicture({ url, className }: { url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return <span className={className} aria-hidden>🔬</span>;
  }
  return (
    <img
      src={withAuthToken(url)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

// ─── Experiment Step (science) ─────────────────────────────────────────

export function ExperimentStep({
  module: m,
  onComplete,
  isCompleted,
}: {
  module: any;
  onComplete: CompleteFn;
  isCompleted: boolean;
}) {
  const data: ExperimentModuleData = m.experiment || {};
  const steps = useMemo(() => (data.steps || []).filter((s) => s?.instruction), [data.steps]);

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'act' | 'reveal' | 'observe'>('act');
  const [tappedTarget, setTappedTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [allDone, setAllDone] = useState(false);
  const observeAnswersRef = useRef<number[]>([]);
  const firstTryRef = useRef(0);
  const currentFirstTryRef = useRef(true);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!isCompleted && step && phase === 'act') speak(step.instruction);
  }, [stepIndex, isCompleted, step, phase]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  if (isCompleted) return <CompletedBanner emoji="🔬" text="小实验完成啦！" />;
  if (steps.length === 0) return <CompletedBanner emoji="🔬" text="这一步暂时没有实验内容" />;

  const tapTarget = (target: string) => {
    if (phase !== 'act') return;
    setTappedTarget(target);
    setPhase('reveal');
    setFeedback('');
    if (step.reveal) speak(step.reveal);
  };

  const goObserve = () => {
    const options = step.observe?.options || [];
    if (options.length === 0) {
      advanceStep();
      return;
    }
    setPhase('observe');
    if (step.observe?.question) speak(step.observe.question);
  };

  const advanceStep = () => {
    window.setTimeout(() => {
      if (stepIndex >= steps.length - 1) {
        setAllDone(true);
        if (data.conclusion) speak(data.conclusion);
        return;
      }
      setStepIndex((i) => i + 1);
      setPhase('act');
      setTappedTarget(null);
      setFeedback('');
      currentFirstTryRef.current = true;
    }, 900);
  };

  const pickObserve = (index: number) => {
    if (phase !== 'observe') return;
    const correctIndex = step.observe?.correctIndex ?? 0;
    if (index === correctIndex) {
      observeAnswersRef.current.push(index);
      if (currentFirstTryRef.current) firstTryRef.current += 1;
      setFeedback('观察得真仔细！');
      advanceStep();
    } else {
      currentFirstTryRef.current = false;
      setFeedback('再看看刚才发生了什么？');
    }
  };

  const finish = () => {
    const total = steps.length;
    const score = total === 0 ? 85 : 70 + Math.round((30 * firstTryRef.current) / total);
    onComplete(score, {
      stepsCompleted: observeAnswersRef.current.length,
      observeAnswers: observeAnswersRef.current,
    });
  };

  if (allDone) {
    return (
      <div className="space-y-3">
        {data.conclusion && (
          <Card className="bg-sky-50 p-4">
            <p className="text-xs font-semibold text-sky-700">实验小发现</p>
            <p className="mt-1 text-base text-on-surface">{data.conclusion}</p>
          </Card>
        )}
        <CompletedBanner emoji="🔬" text={`完成了 ${steps.length} 步实验，真像小科学家！`} />
        <Button className="w-full" onClick={finish}>
          <Microscope className="mr-2 h-4 w-4" /> 完成实验
        </Button>
      </div>
    );
  }

  const targets = step.targets && step.targets.length > 0 ? step.targets : ['点一点'];
  const targetImageUrls = experimentPictureUrls(step?.targetImageUrls, targets);
  const materialImageUrls = experimentPictureUrls(
    data.materialImageUrls,
    data.materials || [],
  );
  const observeOptions = step.observe?.options || [];

  return (
    <div className="space-y-3">
      {data.question && (
        <Card className="bg-sky-50 p-3">
          <p className="text-sm font-semibold text-on-surface">❓ {data.question}</p>
        </Card>
      )}
      {(data.materials || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-on-surface-variant">材料：</span>
          {(data.materials || []).map((mat, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full border border-outline-variant/40 px-3 py-1 text-xs text-on-surface">
              {materialImageUrls[i] && (
                <ExperimentPicture url={materialImageUrls[i]} className="h-4 w-4 object-contain" />
              )}
              {mat}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-on-surface-variant">
        第 {stepIndex + 1} / {steps.length} 步
      </p>

      <Card className="flex items-start gap-2 p-4">
        <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <p className="text-base text-on-surface">{step.instruction}</p>
      </Card>

      {phase === 'act' && (
        <div className="flex flex-wrap gap-3">
          {targets.map((target, i) => (
            <button
              key={`${target}-${i}`}
              onClick={() => tapTarget(target)}
              className={`flex w-28 flex-col items-center gap-2 rounded-2xl border-2 px-3 py-3 text-base font-semibold text-on-surface transition ${
                tappedTarget === target
                  ? 'border-primary bg-primary/10'
                  : 'border-sky-300 bg-sky-50 hover:border-sky-500'
              }`}
            >
              <ExperimentPicture
                url={targetImageUrls[i]}
                className="h-16 w-16 object-contain text-4xl text-center leading-[4rem]"
              />
              <span className="text-center text-sm leading-tight">{target}</span>
            </button>
          ))}
        </div>
      )}

      {phase === 'reveal' && (
        <div className="space-y-3">
          <Card className="animate-pulse bg-amber-50 p-4">
            <p className="text-base font-semibold text-on-surface">
              ✨ {step.reveal || '发生神奇的变化啦！'}
            </p>
          </Card>
          <Button className="w-full" onClick={goObserve}>
            {observeOptions.length === 0 ? '下一步' : '我来回答观察题'}
          </Button>
        </div>
      )}

      {phase === 'observe' && (
        <div className="space-y-2">
          <p className="text-base font-semibold text-on-surface">
            {step.observe?.question || '你看到了什么？'}
          </p>
          {observeOptions.map((option, i) => (
            <button
              key={i}
              onClick={() => pickObserve(i)}
              className="w-full rounded-xl border border-outline-variant/40 px-4 py-3 text-left text-sm text-on-surface transition hover:border-primary hover:bg-primary/5"
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {feedback && <p className="text-sm font-medium text-sky-700">{feedback}</p>}
    </div>
  );
}