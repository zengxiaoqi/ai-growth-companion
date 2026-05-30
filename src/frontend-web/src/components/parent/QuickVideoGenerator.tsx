import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Play, Sparkles, Loader2, Check, RotateCcw, XCircle } from '@/icons';
import api from '@/services/api';
import type { QuickVideoGenerateResponse } from '@/types';
import { Button, Card } from '../ui';
import { cn } from '@/lib/utils';

interface QuickVideoGeneratorProps {
  selectedChildId: number | null;
  childAgeGroup?: '3-4' | '5-6';
}

type GeneratorState = 'idle' | 'generating' | 'enqueued' | 'polling' | 'completed' | 'failed';

const STYLE_OPTIONS = [
  { value: '', label: '自动选择' },
  { value: 'story', label: '📖 故事' },
  { value: 'science', label: '🔬 科普' },
  { value: 'song', label: '🎵 儿歌' },
] as const;

export default function QuickVideoGenerator({
  selectedChildId,
  childAgeGroup,
}: QuickVideoGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [ageGroup, setAgeGroup] = useState<'3-4' | '5-6'>(childAgeGroup || '5-6');
  const [style, setStyle] = useState<'story' | 'science' | 'song' | ''>('');

  const [state, setState] = useState<GeneratorState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const [result, setResult] = useState<QuickVideoGenerateResponse | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync ageGroup with parent prop
  useEffect(() => {
    if (childAgeGroup) setAgeGroup(childAgeGroup);
  }, [childAgeGroup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, []);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleSubmit = async () => {
    if (!topic.trim() || !selectedChildId) return;

    setState('generating');
    setError(null);
    setResult(null);
    setVideoProgress(0);
    setVideoUrl(null);
    setStatusMessage('正在提交请求...');

    try {
      const res = await api.quickGenerateVideo({
        topic: topic.trim(),
        ageGroup,
        childId: selectedChildId,
        style: style || undefined,
      });

      setResult(res);
      setStatusMessage('视频任务已创建，开始生成...');

      if (res.status === 'completed') {
        // Already done (reused from cache)
        setState('completed');
        setVideoProgress(100);
        setStatusMessage('视频生成完成！');
      } else {
        // Start polling
        setState('polling');
        startPolling(res.contentId, res.taskId);
      }
    } catch (err: any) {
      setError(err?.message || '请求失败');
      setState('failed');
    }
  };

  const startPolling = (contentId: number, taskId: number) => {
    cleanup();
    pollRef.current = setInterval(async () => {
      try {
        const task = await api.getLessonTeachingVideoTask(contentId, taskId);
        setVideoProgress(task.progress || 0);

        if (task.status === 'completed') {
          cleanup();
          setState('completed');
          setVideoProgress(100);
          setStatusMessage('视频生成完成！');

          // Fetch video blob for preview
          try {
            const blob = await api.downloadLessonTeachingVideo(contentId);
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
          } catch {
            // Preview may not be available
          }
        } else if (task.status === 'failed') {
          cleanup();
          setState('failed');
          setError(task.errorMessage || '视频生成失败');
        }
      } catch {
        // Polling error — keep trying
      }
    }, 3000);

    // Safety timeout: 10 minutes
    timeoutRef.current = setTimeout(() => {
      cleanup();
      if (state === 'polling') {
        setState('failed');
        setError('生成超时，请重试');
      }
    }, 600000);
  };

  const handleRetry = () => {
    cleanup();
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    setState('idle');
    setResult(null);
    setVideoProgress(0);
    setError(null);
    setStatusMessage('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Play className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-on-surface">快速生成教学视频</h3>
      </div>
      <p className="text-sm text-on-surface-variant">输入学习主题，AI 自动生成教学内容并制作视频</p>

      {/* Input Form */}
      {(state === 'idle' || state === 'failed') && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-4 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">课程主题</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：海洋动物、认识数字、四季变化"
                className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                  年龄组
                </label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value as '3-4' | '5-6')}
                  className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-2 py-2 text-sm text-on-surface"
                >
                  <option value="3-4">3-4 岁</option>
                  <option value="5-6">5-6 岁</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                  风格
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as 'story' | 'science' | 'song' | '')}
                  className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-2 py-2 text-sm text-on-surface"
                >
                  {STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!topic.trim() || !selectedChildId}
              className="w-full"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              生成教学视频
            </Button>
          </Card>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-error-container/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      {/* Progress — generating / polling */}
      {(state === 'generating' || state === 'polling') && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {statusMessage || '正在生成...'}
            </div>

            {/* Progress bar */}
            {state === 'polling' && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <motion.div
                    className={cn(
                      'h-full rounded-full',
                      videoProgress < 100 ? 'bg-primary' : 'bg-success',
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${videoProgress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-xs text-on-surface-variant">{videoProgress}%</p>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Completed */}
      {state === 'completed' && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-success" />
              <span className="font-medium text-on-surface">{statusMessage}</span>
            </div>

            {/* Video preview */}
            {videoUrl && (
              <div className="overflow-hidden rounded-lg bg-black">
                <video src={videoUrl} controls className="w-full" style={{ maxHeight: 320 }}>
                  您的浏览器不支持视频播放
                </video>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleRetry} variant="secondary" size="sm">
                <RotateCcw className="mr-1 h-4 w-4" />
                重新生成
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Failed */}
      {state === 'failed' && !result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 rounded-lg bg-error-container/10 px-4 py-3">
            <XCircle className="h-4 w-4 text-error" />
            <span className="text-sm text-error">{error || '生成失败，请重试'}</span>
          </div>
        </motion.div>
      )}

      {/* Failed with retry */}
      {state === 'failed' && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-error" />
              <span className="font-medium text-on-surface">{error || '生成失败'}</span>
            </div>
            <Button onClick={handleRetry} variant="secondary" size="sm">
              <RotateCcw className="mr-1 h-4 w-4" />
              重试
            </Button>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
