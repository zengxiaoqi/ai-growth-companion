import { useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from '@/icons';
import { motion } from 'motion/react';
import api from '@/services/api';
import type { LearningHistoryRecord, LearningInteractionData } from '@/types';
import { ACTIVITY_TYPES } from './constants';
import { Card, EmptyState } from '../ui';

const MAX_RECORDS = 8;

/** 只有这 6 种参数化题型的 interactionData 含过程数据。 */
const PARAMETERIZED_TYPES = [
  'drag_sort',
  'memory_flip',
  'pattern_next',
  'trace_path',
  'color_fill',
  'tap_target',
] as const;

function typeLabel(activityType: string): string {
  return ACTIVITY_TYPES.find((t) => t.value === activityType)?.label ?? activityType;
}

/** 把一条记录的 interactionData 翻译成一句家长能读懂的过程摘要。 */
export function summarizeInteraction(data: LearningInteractionData): string | null {
  switch (data.activityType) {
    case 'drag_sort': {
      const placements = data.placements ?? [];
      if (placements.length === 0) return null;
      const firstTry = placements.filter((p) => p.correctOnFirstTry).length;
      return `放错 ${data.totalErrors ?? 0} 次 · ${firstTry}/${placements.length} 个物品首次放对`;
    }
    case 'memory_flip': {
      if (typeof data.moves !== 'number') return null;
      return `${data.moves} 步完成全部配对 · 翻错 ${data.mismatches ?? 0} 次`;
    }
    case 'pattern_next': {
      if (typeof data.attempts !== 'number') return null;
      return data.firstTryCorrect
        ? '每个规律一次接对'
        : `共尝试 ${data.attempts} 次后接对全部规律`;
    }
    case 'trace_path': {
      const perTarget = data.perTarget ?? [];
      if (perTarget.length === 0) return null;
      const firstTry = perTarget.filter((t) => t.firstTry).length;
      const coverage = Math.round((data.minCoverage ?? 0.7) * 100);
      return `描红 ${perTarget.length} 个字（达标线 ${coverage}% 覆盖）· ${firstTry}/${perTarget.length} 个字一次完成`;
    }
    case 'color_fill': {
      const regionResults = data.regionResults ?? [];
      if (regionResults.length === 0) return null;
      const firstTry = regionResults.filter((r) => r.firstTry).length;
      return `${firstTry}/${regionResults.length} 个区域一次涂对`;
    }
    case 'tap_target': {
      const roundResults = data.roundResults ?? [];
      if (roundResults.length === 0) return null;
      const firstTry = roundResults.filter((r) => r.firstTry).length;
      return `${firstTry}/${roundResults.length} 轮一次听对指令`;
    }
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
}

/**
 * 家长端「活动过程明细」：展示最近若干次参数化题型学习记录的过程数据
 * （interactionData，learning_records.simple-json 列，经
 * GET /learning/history/:userId 返回）。数据早已入库，此组件只是读侧展示。
 */
export default function ActivityProcessDetails({ userId }: { userId: number }) {
  const [records, setRecords] = useState<LearningHistoryRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const history = await api
          .getLearningHistory(userId, 20)
          .catch(() => [] as LearningHistoryRecord[]);
        if (cancelled) return;
        setRecords(
          history
            .filter((r) =>
              (PARAMETERIZED_TYPES as readonly string[]).includes(
                r.interactionData?.activityType ?? '',
              ),
            )
            .slice(0, MAX_RECORDS),
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm font-medium text-on-surface-variant">活动明细加载中...</span>
      </Card>
    );
  }

  if (!records || records.length === 0) {
    return (
      <Card className="p-6 md:p-8">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          <h3 className="text-xl font-medium text-on-surface">活动过程明细</h3>
        </div>
        <EmptyState
          title="暂无互动游戏记录"
          description="孩子完成互动小游戏后，这里会展示每局的作答过程。"
        />
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-8">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-6 w-6 text-primary" />
        <h3 className="text-xl font-medium text-on-surface">活动过程明细</h3>
        <p className="ml-auto text-xs text-on-surface-variant">{`最近 ${records.length} 次`}</p>
      </div>

      <div className="space-y-3">
        {records.map((record, i) => {
          const interaction = record.interactionData!;
          const summary = summarizeInteraction(interaction);
          const duration = formatDuration(record.durationSeconds);
          return (
            <motion.div
              key={record.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-container/40 px-2.5 py-0.5 text-xs font-bold text-primary">
                  {typeLabel(interaction.activityType!)}
                </span>
                {record.content?.title ? (
                  <span className="truncate text-sm font-bold text-on-surface">
                    {record.content.title}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-on-surface-variant">
                  {formatDate(record.startedAt)}
                  {duration ? ` · ${duration}` : ''}
                </span>
                {typeof record.score === 'number' ? (
                  <span className="text-sm font-bold text-on-secondary-container">
                    {record.score}分
                  </span>
                ) : null}
              </div>
              {summary ? (
                <p className="mt-2 text-sm text-on-surface-variant">{summary}</p>
              ) : null}
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
