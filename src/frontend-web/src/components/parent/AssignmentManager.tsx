import { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle,
  ClipboardList,
  Clock,
  Inbox,
  Loader2,
  Play,
  Plus,
} from '@/icons';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { ACTIVITY_TYPES, DOMAIN_CONFIG } from './constants';
import type { Assignment } from '@/types';
import { Button, Card, EmptyState } from '../ui';

interface AssignmentManagerProps {
  assignments: Assignment[];
  parentId: number;
  selectedChildId: number | null;
  onCreateAssignment: (data: {
    activityType: string;
    domain: string;
    difficulty: number;
    topic: string;
  }) => Promise<void>;
}

export default function AssignmentManager({
  assignments,
  parentId,
  selectedChildId,
  onCreateAssignment,
}: AssignmentManagerProps) {
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [assignTopic, setAssignTopic] = useState('');
  const [assignDomain, setAssignDomain] = useState('language');
  const [assignDifficulty, setAssignDifficulty] = useState(1);
  const [assignType, setAssignType] = useState<string>('quiz');
  const [isAssigning, setIsAssigning] = useState(false);

  const sortedAssignments = useMemo(
    () => [...assignments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [assignments],
  );

  const handleCreate = useCallback(async () => {
    if (!parentId || !selectedChildId || !assignTopic.trim()) return;

    setIsAssigning(true);
    try {
      await onCreateAssignment({
        activityType: assignType,
        domain: assignDomain,
        difficulty: assignDifficulty,
        topic: assignTopic.trim(),
      });
      setAssignTopic('');
      setShowAssignPanel(false);
    } catch (error) {
      console.error('Failed to create assignment:', error);
    } finally {
      setIsAssigning(false);
    }
  }, [assignDifficulty, assignDomain, assignTopic, assignType, onCreateAssignment, parentId, selectedChildId]);

  return (
    <section className="space-y-5" aria-label="作业管理">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-on-surface">作业管理</h2>
        <Button
          variant={showAssignPanel ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => setShowAssignPanel((prev) => !prev)}
          aria-expanded={showAssignPanel}
          aria-controls="assignment-form"
        >
          <Plus className="h-4 w-4" />
          {showAssignPanel ? '收起面板' : '布置作业'}
        </Button>
      </div>

      {showAssignPanel ? (
        <motion.div
          id="assignment-form"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel-card space-y-5 p-5"
        >
          <h3 className="text-lg font-black text-on-surface">创建新作业</h3>

          <div>
            <label htmlFor="assign-topic" className="mb-1.5 block text-sm font-bold text-on-surface">作业主题</label>
            <input
              id="assign-topic"
              type="text"
              placeholder="例如：认识数字 1-10"
              value={assignTopic}
              onChange={(event) => setAssignTopic(event.target.value)}
              className="h-11 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm outline-none transition focus:border-primary"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-on-surface">活动类型</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setAssignType(type.value)}
                  className={cn(
                    'touch-target rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                    assignType === type.value
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant/30 bg-surface hover:border-primary/45',
                  )}
                  aria-pressed={assignType === type.value}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-on-surface">学习领域</p>
            <div className="flex flex-wrap gap-2">
              {['language', 'math', 'science', 'art', 'social'].map((domain) => {
                const config = DOMAIN_CONFIG[domain];
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => setAssignDomain(domain)}
                    className={cn(
                      'touch-target rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                      assignDomain === domain
                        ? 'bg-on-secondary-container text-white'
                        : 'border border-outline-variant/30 bg-surface',
                    )}
                    aria-pressed={assignDomain === domain}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-on-surface">难度等级</p>
            <div className="flex gap-2">
              {[
                { level: 1, label: '简单' },
                { level: 2, label: '中等' },
                { level: 3, label: '挑战' },
              ].map((item) => (
                <button
                  key={item.level}
                  type="button"
                  onClick={() => setAssignDifficulty(item.level)}
                  className={cn(
                    'touch-target rounded-lg px-4 py-2 text-sm font-bold transition-colors',
                    assignDifficulty === item.level
                      ? 'bg-tertiary text-on-tertiary'
                      : 'border border-outline-variant/30 bg-surface hover:border-primary/45',
                  )}
                  aria-pressed={assignDifficulty === item.level}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleCreate}
            disabled={isAssigning || !assignTopic.trim() || !selectedChildId}
          >
            {isAssigning ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <ClipboardList className="h-5 w-5" />
                确认布置
              </>
            )}
          </Button>
        </motion.div>
      ) : null}

      {sortedAssignments.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">已布置作业</h3>

          {sortedAssignments.map((assignment) => {
            const domainConfig = DOMAIN_CONFIG[assignment.domain || ''];
            const isCompleted = assignment.status === 'completed';
            const isPending = assignment.status === 'pending';

            return (
              <Card key={assignment.id} className="flex items-center gap-4 p-4">
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    isCompleted
                      ? 'bg-success-container'
                      : isPending
                      ? 'bg-primary-container/30'
                      : 'bg-tertiary-container/30',
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5 text-on-success-container" />
                  ) : isPending ? (
                    <Clock className="h-5 w-5 text-primary" />
                  ) : (
                    <Play className="h-5 w-5 text-on-tertiary-container" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-black text-on-surface">
                      {assignment.activityData?.topic || assignment.activityType}
                    </span>
                    {domainConfig ? (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', domainConfig.containerColor, domainConfig.textColor)}>
                        {domainConfig.label}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                    <span>{ACTIVITY_TYPES.find((item) => item.value === assignment.activityType)?.label || assignment.activityType}</span>
                    {isCompleted && assignment.score != null ? <span className="font-semibold text-success">得分 {assignment.score}</span> : null}
                    {assignment.createdAt ? <span>{new Date(assignment.createdAt).toLocaleDateString('zh-CN')}</span> : null}
                  </div>
                </div>

                <span
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-black',
                    isCompleted
                      ? 'bg-success-container text-on-success-container'
                      : 'bg-primary-container text-on-primary-container',
                  )}
                >
                  {isCompleted ? '已完成' : '待完成'}
                </span>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="暂未布置作业"
          description="点击上方“布置作业”按钮，为孩子创建本周任务。"
          icon={<Inbox className="h-6 w-6 text-primary" />}
        />
      )}
    </section>
  );
}
