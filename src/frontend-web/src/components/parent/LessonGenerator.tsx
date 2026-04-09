import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Check, RotateCcw, Play, XCircle } from '@/icons';
import api from '@/services/api';
import type { Content, StructuredLessonContent, StructuredLessonStep } from '@/types';
import LessonScenePlayer from '@/scenes/LessonScenePlayer';
import { resolveLessonSceneDocument } from '@/scenes/scene-helpers';
import { Button, Card } from '../ui';
import { cn } from '@/lib/utils';

interface LessonGeneratorProps {
  selectedChildId: number | null;
  childAgeGroup?: '3-4' | '5-6';
  draftLessonId?: number | null;
  onDraftLessonLoaded?: () => void;
  onDraftLessonUpdated?: () => void | Promise<void>;
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

const STEP_QUICK_EDITS: Record<string, Array<{ label: string; prompt: string }>> = {
  watch: [
    { label: '更贴主题', prompt: '把这一部分的动画讲解改得更贴合当前主题，避免只出现泛化的字词展示。' },
    { label: '丰富讲解', prompt: '把这一部分的动画讲解内容再丰富一些，增加更具体的观察点和讲解细节。' },
    { label: '放慢节奏', prompt: '把这一部分的动画讲解节奏放慢一些，每个场景多给一点停留和说明。' },
  ],
  listen: [
    { label: '更口语化', prompt: '把这一部分的听力内容改得更口语化、更适合孩子听懂。' },
    { label: '增加互动', prompt: '在这一部分的听力内容里加入更多提问和停顿提示。' },
    { label: '缩短难度', prompt: '把这一部分的听力内容再短一点、简单一点。' },
  ],
  read: [
    { label: '更短更清楚', prompt: '把这一部分的阅读内容缩短一点，并让句子更清楚。' },
    { label: '突出关键词', prompt: '把这一部分的阅读重点改成更突出关键词和核心句。' },
    { label: '加强理解题', prompt: '给这一部分增加更贴合内容的理解问题。' },
  ],
  write: [
    { label: '降低描红难度', prompt: '把这一部分的描红和书写要求调简单一点，路径更清楚、更容易完成。' },
    { label: '增加鼓励', prompt: '把这一部分的书写提示改得更鼓励式、更适合孩子跟着描。' },
    { label: '更贴主题', prompt: '把这一部分的书写内容改得更贴合当前主题，不要太泛化。' },
  ],
  practice: [
    { label: '规则更清楚', prompt: '把这一部分的练习规则说明改得更清楚，让孩子一开始就知道怎么做。' },
    { label: '提示更多', prompt: '给这一部分的练习加入更多过程提示和鼓励反馈。' },
    { label: '降低难度', prompt: '把这一部分的练习难度调低一点，步骤更少、更直接。' },
  ],
  assess: [
    { label: '题目更简单', prompt: '把这一部分的测评题再简单一点，题干更短一些。' },
    { label: '更贴主题', prompt: '把这一部分的测评题改得更贴合本节课主题。' },
    { label: '减少题量', prompt: '把这一部分的测评题量减少一点，但保留核心考点。' },
  ],
};

const GLOBAL_QUICK_EDITS: Array<{ label: string; prompt: string }> = [
  { label: '整体更简单', prompt: '把整节课整体调简单一点，更适合孩子独立完成。' },
  { label: '更贴主题', prompt: '把整节课所有内容都再检查一遍，确保每一步都更贴合当前主题。' },
  { label: '增强趣味性', prompt: '把整节课改得更有趣一点，增加鼓励语和互动感。' },
];

function buildModificationDraft(
  prompt: string,
  scope: 'selected' | 'all',
  selectedStep: StructuredLessonStep | null,
): string {
  if (scope === 'selected' && selectedStep) {
    return [
      `请只修改“${selectedStep.label} · ${getStepTitle(selectedStep)}”这一步，其他步骤尽量保持不变。`,
      `重点修改方向：${prompt}`,
      '请同时同步更新这一步的 scene 预览内容，让家长端预览和学生端展示保持一致。',
      '修改后继续保持内容贴合主题、年龄合适、表达自然。',
    ].join('\n');
  }

  return [
    '请基于整节课做一次整体优化。',
    `重点修改方向：${prompt}`,
    '如果某一步内容发生变化，请同步更新对应的 scene 预览内容。',
    '修改后继续保持内容贴合主题、年龄合适、表达自然。',
  ].join('\n');
}

export default function LessonGenerator({
  selectedChildId,
  childAgeGroup,
  draftLessonId = null,
  onDraftLessonLoaded,
  onDraftLessonUpdated,
}: LessonGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [focus, setFocus] = useState<(typeof FOCUS_OPTIONS)[number]['value']>('mixed');
  const [domain, setDomain] = useState<(typeof DOMAIN_OPTIONS)[number]['value']>('language');
  const [domainTouched, setDomainTouched] = useState(false);
  const [ageGroup, setAgeGroup] = useState<'3-4' | '5-6'>(childAgeGroup || '5-6');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<Content | null>(null);
  const [lessonData, setLessonData] = useState<StructuredLessonContent | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [modificationText, setModificationText] = useState('');
  const [editScope, setEditScope] = useState<'selected' | 'all'>('selected');
  const [isModifying, setIsModifying] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [generationProgress, setGenerationProgress] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Video approval state
  const [videoTaskId, setVideoTaskId] = useState<number | null>(null);
  const [videoStatus, setVideoStatus] = useState<'idle' | 'polling' | 'completed' | 'failed'>('idle');
  const [videoProgress, setVideoProgress] = useState(0);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedStep = lessonData?.steps.find((step) => step.id === expandedStep) || lessonData?.steps[0] || null;
  const quickEditOptions = editScope === 'selected' && selectedStep
    ? (STEP_QUICK_EDITS[selectedStep.id] || GLOBAL_QUICK_EDITS)
    : GLOBAL_QUICK_EDITS;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (videoPollRef.current) clearInterval(videoPollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!lessonData?.steps?.length) {
      if (expandedStep !== null) setExpandedStep(null);
      return;
    }
    const hasSelectedStep = lessonData.steps.some((step) => step.id === expandedStep);
    if (!hasSelectedStep) {
      setExpandedStep(lessonData.steps[0].id);
    }
  }, [lessonData, expandedStep]);

  useEffect(() => {
    if (!selectedStep && editScope === 'selected') {
      setEditScope('all');
    }
  }, [selectedStep, editScope]);

  useEffect(() => {
    if (!draftLessonId) return;

    let cancelled = false;

    const loadDraftLesson = async () => {
      try {
        const content = await api.getContent(draftLessonId);
        if (cancelled) return;
        setGeneratedContent(content);
        const lesson = typeof content.content === 'string' ? JSON.parse(content.content) : content.content;
        setLessonData(lesson);
        setTopic(content.topic || content.title || '');
        setError(null);
        resetVideoPreviewState();
        onDraftLessonLoaded?.();
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || '加载草稿课程失败');
      }
    };

    loadDraftLesson();

    return () => {
      cancelled = true;
    };
  }, [draftLessonId, onDraftLessonLoaded]);

  const resetVideoPreviewState = () => {
    if (videoPollRef.current) {
      clearInterval(videoPollRef.current);
      videoPollRef.current = null;
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoTaskId(null);
    setVideoStatus('idle');
    setVideoProgress(0);
    setApprovalStatus(null);
    setVideoUrl(null);
    setIsApproving(false);
  };

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
        domain: domainTouched ? domain : undefined,
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
              // Auto-enqueue video generation
              setTimeout(() => startVideoGeneration(), 500);
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
        // Auto-enqueue video generation
        setTimeout(() => startVideoGeneration(), 500);
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
      const updated = await api.modifyLesson(generatedContent.id, modificationText.trim(), {
        stepId: editScope === 'selected' ? selectedStep?.id : undefined,
      });
      setGeneratedContent(updated);
      const lesson = typeof updated.content === 'string'
        ? JSON.parse(updated.content)
        : updated.content;
      setLessonData(lesson);
      setModificationText('');
      resetVideoPreviewState();
      await onDraftLessonUpdated?.();
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
    setDomainTouched(false);
    setGeneratedContent(null);
    setLessonData(null);
    setModificationText('');
    setError(null);
    setExpandedStep(null);
    resetVideoPreviewState();
  };

  // ── Video generation + approval ─────────────────────────────────
  const startVideoGeneration = async () => {
    if (!generatedContent || !selectedChildId) return;
    try {
      const task = await api.createLessonTeachingVideoTask(generatedContent.id, selectedChildId);
      setVideoTaskId(task.taskId);
      setVideoStatus('polling');
      setVideoProgress(task.progress || 0);
      pollVideoStatus(task.taskId);
    } catch (err: any) {
      // Video generation failed silently — lesson can still be published without video
      console.warn('Video task enqueue failed:', err?.message);
    }
  };

  const pollVideoStatus = (taskId: number) => {
    if (videoPollRef.current) clearInterval(videoPollRef.current);
    videoPollRef.current = setInterval(async () => {
      try {
        const result = await api.getLessonVideoStatus(generatedContent!.id, selectedChildId!, taskId);
        if (!result.exists) return;

        setVideoProgress(result.progress || 0);

        if (result.status === 'completed') {
          if (videoPollRef.current) clearInterval(videoPollRef.current);
          videoPollRef.current = null;
          setVideoStatus('completed');
          setApprovalStatus(result.approvalStatus || 'pending_approval');

          // Fetch video blob for preview
          try {
            const blob = await api.downloadLessonTeachingVideo(generatedContent!.id, selectedChildId!, taskId);
            const url = URL.createObjectURL(blob);
            if (videoUrl) URL.revokeObjectURL(videoUrl);
            setVideoUrl(url);
          } catch {
            // Preview unavailable — parent can still approve by status
          }
        } else if (result.status === 'failed') {
          if (videoPollRef.current) clearInterval(videoPollRef.current);
          videoPollRef.current = null;
          setVideoStatus('failed');
        }
      } catch {
        // Polling error — keep trying
      }
    }, 3000);

    // Safety timeout: 5 minutes
    setTimeout(() => {
      if (videoPollRef.current) {
        clearInterval(videoPollRef.current);
        videoPollRef.current = null;
        if (videoStatus === 'polling') setVideoStatus('failed');
      }
    }, 300000);
  };

  const handleApproveVideo = async (approved: boolean) => {
    if (!generatedContent || !selectedChildId) return;
    setIsApproving(true);
    try {
      const result = await api.approveLessonVideo(
        generatedContent.id,
        selectedChildId,
        approved,
        undefined,
        videoTaskId || undefined,
      );
      setApprovalStatus(result.approvalStatus);
    } catch (err: any) {
      setError(err?.message || '视频审批失败');
    } finally {
      setIsApproving(false);
    }
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
                onChange={(e) => {
                  setDomain(e.target.value as any);
                  setDomainTouched(true);
                }}
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

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-4">
          {/* Six Steps Preview */}
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-on-surface-variant">课程六步预览</h5>
            {lessonData.steps.map((step: StructuredLessonStep) => (
              <Card
                key={step.id}
                className={cn(
                  'p-3 transition',
                  expandedStep === step.id && 'border-primary/35 bg-primary-container/10',
                )}
              >
                <button
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setExpandedStep(step.id)}
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
                  <div className="mt-3 rounded-lg bg-surface-container-low p-3 text-xs text-on-surface-variant xl:hidden">
                    <StepPreview step={step} />
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Modification Input */}
          {generatedContent.status === 'draft' && (
            <Card className="space-y-3 p-4">
              <label className="mb-2 block text-sm font-medium text-on-surface">修改意见</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditScope('selected')}
                  disabled={!selectedStep}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    editScope === 'selected'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  只改当前步骤
                  {selectedStep ? ` · ${selectedStep.label}` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setEditScope('all')}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    editScope === 'all'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  改整个课程
                </button>
              </div>
              <p className="text-xs text-on-surface-variant">
                {editScope === 'selected' && selectedStep
                  ? `这次修改会优先聚焦在“${selectedStep.label} · ${getStepTitle(selectedStep)}”这一步。`
                  : '这次修改会作为整节课的全局编辑请求处理。'}
              </p>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-on-surface-variant">快捷修改模板</p>
                <div className="flex flex-wrap gap-2">
                  {quickEditOptions.map((option) => (
                    <button
                      key={`${selectedStep?.id || 'all'}-${option.label}`}
                      type="button"
                      onClick={() => setModificationText(buildModificationDraft(option.prompt, editScope, selectedStep))}
                      className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  点击模板后会自动填入一份可继续编辑的草稿，你可以直接补充细节再提交。
                </p>
              </div>
              <div className="flex gap-2">
                <textarea
                  rows={5}
                  value={modificationText}
                  onChange={(e) => setModificationText(e.target.value)}
                  placeholder={'例如：\n请只修改“写 · 书写练习”这一步，其他步骤尽量保持不变。\n把描红路径再清楚一点，并同步更新 scene 预览。'}
                  className="min-h-[132px] flex-1 resize-y rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isModifying}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
              <p className="text-[11px] text-on-surface-variant">
                可直接编辑这份草稿，使用 Ctrl+Enter 或 Cmd+Enter 可快速提交。
              </p>
            </Card>
          )}

          {/* Video Generation & Approval Section */}
          {generatedContent.status === 'draft' && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" />
                {videoStatus !== 'polling' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      resetVideoPreviewState();
                      startVideoGeneration();
                    }}
                  >
                    重新生成预览
                  </Button>
                )}
                <h5 className="text-sm font-semibold text-on-surface">教学动画视频</h5>
              </div>

              {/* Polling / Generating */}
              {videoStatus === 'polling' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-on-surface-variant">
                    <span>正在生成教学动画...</span>
                    <span>{Math.round(videoProgress)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.max(5, videoProgress)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Generation Failed */}
              {videoStatus === 'failed' && (
                <div className="flex items-center gap-2 rounded-lg bg-error-container/10 px-3 py-2 text-xs text-error">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>视频生成失败，课程仍可正常发布（无视频预览）</span>
                </div>
              )}

              {/* Video completed — show preview + approval */}
              {videoStatus === 'completed' && (
                <div className="space-y-3">
                  {videoUrl && (
                    <video
                      src={videoUrl}
                      controls
                      className="w-full rounded-lg bg-black"
                      style={{ maxHeight: 280 }}
                    />
                  )}

                  {approvalStatus === 'pending_approval' && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApproveVideo(true)}
                        disabled={isApproving}
                        className="flex-1"
                        size="sm"
                      >
                        {isApproving ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-3 w-3" />
                        )}
                        通过视频
                      </Button>
                      <Button
                        onClick={() => handleApproveVideo(false)}
                        disabled={isApproving}
                        variant="secondary"
                        size="sm"
                      >
                        <XCircle className="mr-1 h-3 w-3" />
                        重新生成
                      </Button>
                    </div>
                  )}

                  {approvalStatus === 'approved' && (
                    <div className="flex items-center gap-2 rounded-lg bg-primary-container/10 px-3 py-2 text-xs font-medium text-primary">
                      <Check className="h-4 w-4" />
                      视频已通过审批
                    </div>
                  )}

                  {approvalStatus === 'rejected' && (
                    <div className="flex items-center gap-2 rounded-lg bg-error-container/10 px-3 py-2 text-xs text-error">
                      <XCircle className="h-4 w-4" />
                      视频已驳回，将重新生成
                    </div>
                  )}
                </div>
              )}

              {/* No video task yet (idle) */}
              {videoStatus === 'idle' && (
                <p className="text-xs text-on-surface-variant">课程修改后，场景预览会立即同步；如需新的教学视频预览，请点击“重新生成预览”。</p>
              )}
            </Card>
          )}

          {/* Confirm / Published Status */}
          <div className="flex items-center gap-3">
            {generatedContent.status === 'draft' ? (
              <Button
                onClick={handleConfirm}
                disabled={isConfirming || isApproving}
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

            <div className="hidden xl:block">
              <Card className="space-y-3 p-4 xl:sticky xl:top-24">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Live Preview</p>
                    <h5 className="mt-1 text-lg font-bold text-on-surface">
                      {selectedStep ? `${selectedStep.label} · ${getStepTitle(selectedStep)}` : '请选择一个步骤'}
                    </h5>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      右侧固定显示当前步骤的实时预览，方便一边修改一边对照学生端效果。
                    </p>
                  </div>
                  {selectedStep && (
                    <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">
                      {selectedStep.module.type}
                    </span>
                  )}
                </div>

                {selectedStep ? (
                  <StepPreview step={selectedStep} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low px-4 py-10 text-center text-sm text-on-surface-variant">
                    请选择左侧步骤开始预览。
                  </div>
                )}
              </Card>
            </div>
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
  const sceneStepType = step.id === 'watch'
    ? 'watch'
    : step.id === 'write'
      ? 'write'
      : step.id === 'practice'
        ? 'practice'
        : null;
  const sceneDocument = sceneStepType ? resolveLessonSceneDocument(sceneStepType, m) : null;

  if (sceneDocument) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-primary/10 bg-surface px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Scene Preview</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            这里显示学生端会实际看到的场景运行效果，修改课程后会随最新内容同步。
          </p>
        </div>
        <LessonScenePlayer
          document={sceneDocument}
          isCompleted={false}
          previewMode
          onComplete={() => undefined}
        />
      </div>
    );
  }

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
