import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Check, RotateCcw } from '@/icons';
import api from '@/services/api';
import type { Content, StructuredLessonContent, StructuredLessonStep } from '@/types';
import { Button, Card } from '../ui';

interface LessonGeneratorProps {
  selectedChildId: number | null;
  childAgeGroup?: '3-4' | '5-6';
}

const FOCUS_OPTIONS = [
  { value: 'mixed', label: '综合' },
  { value: 'literacy', label: '语文' },
  { value: 'math', label: '数学' },
  { value: 'science', label: '科学' },
] as const;

const DOMAIN_OPTIONS = [
  { value: 'language', label: '语言' },
  { value: 'math', label: '数学' },
  { value: 'science', label: '科学' },
  { value: 'art', label: '艺术' },
  { value: 'social', label: '社交' },
] as const;

const STEP_ICONS: Record<string, string> = {
  watch: '\u{1F441}',
  listen: '\u{1F442}',
  read: '\u{1F4D6}',
  write: '\u{270D}',
  practice: '\u{1F3AE}',
  assess: '\u{1F4CB}',
};

export default function LessonGenerator({ selectedChildId, childAgeGroup }: LessonGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [focus, setFocus] = useState<(typeof FOCUS_OPTIONS)[number]['value']>('mixed');
  const [domain, setDomain] = useState<(typeof DOMAIN_OPTIONS)[number]['value']>('language');
  const [ageGroup, setAgeGroup] = useState<'3-4' | '5-6'>(childAgeGroup || '5-6');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<Content | null>(null);
  const [lessonData, setLessonData] = useState<StructuredLessonContent | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [modificationText, setModificationText] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [generationProgress, setGenerationProgress] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim() || !selectedChildId) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);
    setLessonData(null);
    setGenerationProgress('正在提交生成请求...');

    try {
      const content = await api.generateLesson({
        topic: topic.trim(),
        childId: selectedChildId,
        ageGroup,
        focus,
        durationMinutes: 20,
      } as any);

      // If status is 'generating', poll until done
      if (content.status === 'generating') {
        setGenerationProgress('AI 正在生成课程，请稍候...');
        setGeneratedContent(content);

        pollRef.current = setInterval(async () => {
          try {
            const latest = await api.getContent(content.id);
            if (!latest) return;

            if (latest.status === 'draft') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setGeneratedContent(latest);
              const lesson = typeof latest.content === 'string'
                ? JSON.parse(latest.content)
                : latest.content;
              setLessonData(lesson);
              setIsGenerating(false);
              setGenerationProgress('');
            } else if (latest.status === 'generation_failed') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setIsGenerating(false);
              setGenerationProgress('');
              setError(latest.subtitle || '生成课程失败，请重试');
              setGeneratedContent(null);
            } else {
              setGenerationProgress(`正在生成... (${latest.status})`);
            }
          } catch {
            // Polling error — keep trying
          }
        }, 3000);

        // Safety timeout: stop polling after 5 minutes
        setTimeout(() => {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setIsGenerating(false);
            setGenerationProgress('');
            setError('生成超时，请重试');
            setGeneratedContent(null);
          }
        }, 300000);
      } else if (content.status === 'draft') {
        // Already completed (fast LLM or cached)
        setGeneratedContent(content);
        const lesson = typeof content.content === 'string'
          ? JSON.parse(content.content)
          : content.content;
        setLessonData(lesson);
        setIsGenerating(false);
        setGenerationProgress('');
      }
    } catch (err: any) {
      setError(err?.message || '生成课程失败');
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  const handleModify = async () => {
    if (!modificationText.trim() || !generatedContent) return;

    setIsModifying(true);
    setError(null);

    try {
      const updated = await api.modifyLesson(generatedContent.id, modificationText.trim());
      setGeneratedContent(updated);
      const lesson = typeof updated.content === 'string'
        ? JSON.parse(updated.content)
        : updated.content;
      setLessonData(lesson);
      setModificationText('');
    } catch (err: any) {
      setError(err?.message || '修改课程失败');
    } finally {
      setIsModifying(false);
    }
  };

  const handleConfirm = async () => {
    if (!generatedContent || !selectedChildId) return;

    setIsConfirming(true);
    setError(null);

    try {
      const confirmed = await api.confirmLesson(generatedContent.id, selectedChildId);
      setGeneratedContent(confirmed);
    } catch (err: any) {
      setError(err?.message || '确认发布失败');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReset = () => {
    setTopic('');
    setGeneratedContent(null);
    setLessonData(null);
    setModificationText('');
    setError(null);
    setExpandedStep(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-on-surface">一键生成学习课程</h3>
      </div>
      <p className="text-sm text-on-surface-variant">
        输入学习主题，AI 自动生成包含"看、听、读、写、练、评"六步的完整课程
      </p>

      {/* Input Form */}
      {!generatedContent && (
        <Card className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">学习主题</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：认识动物、数字1-10、四季变化"
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={isGenerating}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">年龄组</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as '3-4' | '5-6')}
                className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-2 py-2 text-sm text-on-surface"
                disabled={isGenerating}
              >
                <option value="3-4">3-4岁</option>
                <option value="5-6">5-6岁</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">领域</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as any)}
                className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-2 py-2 text-sm text-on-surface"
                disabled={isGenerating}
              >
                {DOMAIN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">重点</label>
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as any)}
                className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-2 py-2 text-sm text-on-surface"
                disabled={isGenerating}
              >
                {FOCUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!topic.trim() || !selectedChildId || isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {generationProgress || 'AI 正在生成课程...'}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                生成学习课程
              </>
            )}
          </Button>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-error-container/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* Preview */}
      {generatedContent && lessonData && (
        <div className="space-y-4">
          {/* Lesson Info */}
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-bold text-on-surface">{generatedContent.title}</h4>
                <p className="mt-1 text-sm text-on-surface-variant">{lessonData.summary}</p>
                {lessonData.outcomes?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {lessonData.outcomes.map((outcome, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-primary-container/20 px-2 py-0.5 text-xs text-primary"
                      >
                        {outcome}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleReset}
                className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-high"
                title="重新生成"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </Card>

          {/* Six Steps Preview */}
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-on-surface-variant">课程六步预览</h5>
            {lessonData.steps.map((step: StructuredLessonStep) => (
              <Card key={step.id} className="p-3">
                <button
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                >
                  <span className="text-xl">{STEP_ICONS[step.id] || '\u{1F4DD}'}</span>
                  <div className="flex-1">
                    <span className="font-medium text-on-surface">
                      {step.label} — {getStepTitle(step)}
                    </span>
                  </div>
                  <span className="text-xs text-on-surface-variant">{step.module.type}</span>
                </button>

                {expandedStep === step.id && (
                  <div className="mt-3 rounded-lg bg-surface-container-low p-3 text-xs text-on-surface-variant">
                    <StepPreview step={step} />
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Modification Input */}
          {generatedContent.status === 'draft' && (
            <Card className="p-4">
              <label className="mb-2 block text-sm font-medium text-on-surface">修改意见</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={modificationText}
                  onChange={(e) => setModificationText(e.target.value)}
                  placeholder="例如：阅读部分加长一些，练习题再简单一点"
                  className="flex-1 rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isModifying}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleModify();
                    }
                  }}
                />
                <Button
                  onClick={handleModify}
                  disabled={!modificationText.trim() || isModifying}
                  variant="secondary"
                >
                  {isModifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    '修改'
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* Confirm / Published Status */}
          <div className="flex items-center gap-3">
            {generatedContent.status === 'draft' ? (
              <Button
                onClick={handleConfirm}
                disabled={isConfirming}
                className="flex-1"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在发布...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    确认内容，发布到学生端
                  </>
                )}
              </Button>
            ) : (
              <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container/10 py-3 text-sm font-medium text-primary">
                <Check className="h-5 w-5" />
                课程已发布，学生可以在学习页面看到此课程
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getStepTitle(step: StructuredLessonStep): string {
  const m = step.module;
  if (m.type === 'video') return '观看动画讲解';
  if (m.type === 'audio') return m.listening?.goal || '听力理解';
  if (m.type === 'reading') return m.reading?.goal || '阅读理解';
  if (m.type === 'writing') return m.writing?.goal || '书写练习';
  if (m.type === 'game') return '互动练习';
  if (m.type === 'quiz') return '学习测评';
  return step.module.type;
}

function StepPreview({ step }: { step: StructuredLessonStep }) {
  const m = step.module;

  if (m.type === 'video') {
    const scenes = m.visualStory?.scenes || m.videoLesson?.shots || [];
    return (
      <div className="space-y-1">
        <p className="font-medium">动画场景 ({scenes.length} 个场景)</p>
        {scenes.slice(0, 3).map((scene: any, i: number) => (
          <p key={i} className="text-on-surface-variant">
            {i + 1}. {scene.narration || scene.caption || scene.scene || `场景 ${i + 1}`}
          </p>
        ))}
        {scenes.length > 3 && <p className="text-on-surface-variant">...共 {scenes.length} 个场景</p>}
      </div>
    );
  }

  if (m.type === 'audio') {
    const script = m.listening?.audioScript || [];
    return (
      <div className="space-y-1">
        <p className="font-medium">听力内容 ({script.length} 段)</p>
        {script.slice(0, 2).map((seg: any, i: number) => (
          <p key={i} className="text-on-surface-variant">{seg.narration || `段落 ${i + 1}`}</p>
        ))}
        {m.listening?.questions?.length > 0 && (
          <p className="text-on-surface-variant">听后问题: {m.listening.questions.join('; ')}</p>
        )}
      </div>
    );
  }

  if (m.type === 'reading') {
    return (
      <div className="space-y-1">
        <p className="font-medium">阅读内容</p>
        <p className="line-clamp-3 text-on-surface-variant">{m.reading?.text || '阅读材料'}</p>
        {m.reading?.keywords?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.reading.keywords.map((kw: string, i: number) => (
              <span key={i} className="rounded bg-secondary-container/20 px-1.5 py-0.5 text-xs">{kw}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (m.type === 'writing') {
    return (
      <div className="space-y-1">
        <p className="font-medium">书写练习</p>
        {m.writing?.tracingItems?.length > 0 && (
          <p>描红: {m.writing.tracingItems.join(', ')}</p>
        )}
        {m.writing?.practiceTasks?.length > 0 && (
          <p>练习: {m.writing.practiceTasks.join('; ')}</p>
        )}
      </div>
    );
  }

  if (m.type === 'game') {
    const gameData = m.game?.activityData || m.game;
    return (
      <div className="space-y-1">
        <p className="font-medium">互动游戏 ({m.game?.activityType || 'quiz'})</p>
        {gameData?.questions?.length > 0 && (
          <p>共 {gameData.questions.length} 道题</p>
        )}
        {gameData?.pairs?.length > 0 && (
          <p>共 {gameData.pairs.length} 组配对</p>
        )}
      </div>
    );
  }

  if (m.type === 'quiz') {
    const quiz = m.quiz;
    return (
      <div className="space-y-1">
        <p className="font-medium">学习测评</p>
        {quiz?.questions?.length > 0 && (
          <p>共 {quiz.questions.length} 道题</p>
        )}
      </div>
    );
  }

  return <p>{JSON.stringify(m).slice(0, 200)}</p>;
}
