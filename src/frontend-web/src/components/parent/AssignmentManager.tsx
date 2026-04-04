import { useState, useCallback } from 'react';
import { Plus, Play, Clock, CheckCircle, ClipboardList, Loader2, Inbox } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { DOMAIN_CONFIG, ACTIVITY_TYPES } from './constants';
import type { Assignment } from '@/types';

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
    } catch (err) {
      console.error('Failed to create assignment:', err);
    } finally {
      setIsAssigning(false);
    }
  }, [parentId, selectedChildId, assignType, assignDomain, assignDifficulty, assignTopic, onCreateAssignment]);

  return (
    <section className="space-y-6" aria-label="任务管理">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">任务管理</h2>
        <button
          onClick={() => setShowAssignPanel((prev) => !prev)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-transform hover:scale-105"
          aria-expanded={showAssignPanel}
          aria-controls="assign-panel"
        >
          <Plus className="h-4 w-4" />
          布置任务
        </button>
      </div>

      {showAssignPanel && (
        <motion.div
          id="assign-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="panel-card space-y-5 p-6"
        >
          <h3 className="text-lg font-black">创建新任务</h3>

          <div>
            <label htmlFor="assign-topic" className="mb-1 block text-sm font-bold text-on-surface-variant">主题</label>
            <input
              id="assign-topic"
              type="text"
              placeholder="例如：认识数字 1-10、动物名称"
              value={assignTopic}
              onChange={(e) => setAssignTopic(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/30 bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold text-on-surface-variant">活动类型</span>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setAssignType(t.value)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-bold transition-all',
                    assignType === t.value
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'border border-outline-variant/30 bg-surface-container hover:border-primary/50',
                  )}
                  aria-pressed={assignType === t.value}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold text-on-surface-variant">学习领域</span>
            <div className="flex flex-wrap gap-2">
              {['language', 'math', 'science', 'art', 'social'].map((domain) => {
                const config = DOMAIN_CONFIG[domain];
                return (
                  <button
                    key={domain}
                    onClick={() => setAssignDomain(domain)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-all',
                      assignDomain === domain
                        ? 'bg-on-secondary-container text-white'
                        : 'border border-outline-variant/30 bg-surface-container',
                    )}
                    aria-pressed={assignDomain === domain}
                  >
                    <span className={cn(
                      'flex h-5 w-5 items-center justify-center rounded text-[10px] font-black text-white',
                      assignDomain === domain ? config.color : 'bg-outline-variant/30',
                    )}
                    >
                      {config.label[0]}
                    </span>
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold text-on-surface-variant">难度等级</span>
            <div className="flex gap-2">
              {[
                { level: 1, label: '简单' },
                { level: 2, label: '中等' },
                { level: 3, label: '困难' },
              ].map((d) => (
                <button
                  key={d.level}
                  onClick={() => setAssignDifficulty(d.level)}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-bold transition-all',
                    assignDifficulty === d.level
                      ? 'bg-tertiary text-on-tertiary'
                      : 'border border-outline-variant/30 bg-surface-container hover:border-primary/50',
                  )}
                  aria-pressed={assignDifficulty === d.level}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={isAssigning || !assignTopic.trim() || !selectedChildId}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-all',
              isAssigning || !assignTopic.trim() || !selectedChildId
                ? 'cursor-not-allowed bg-outline-variant/30 text-on-surface-variant'
                : 'bg-primary text-on-primary hover:scale-[1.01] active:scale-[0.99]',
            )}
          >
            {isAssigning ? <Loader2 className="h-5 w-5 animate-spin" /> : <ClipboardList className="h-5 w-5" />}
            {isAssigning ? '创建中...' : '确认布置'}
          </button>
        </motion.div>
      )}

      {assignments.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-bold text-on-surface-variant">已布置任务</h3>
          {assignments.map((assignment) => {
            const domainConfig = DOMAIN_CONFIG[assignment.domain || ''];
            const isCompleted = assignment.status === 'completed';
            const isPending = assignment.status === 'pending';
            return (
              <div
                key={assignment.id}
                className={cn(
                  'panel-card flex items-center gap-4 border p-4',
                  isCompleted ? 'border-success/30' : 'border-outline-variant/15',
                )}
              >
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  isCompleted ? 'bg-success-container' : isPending ? 'bg-primary-container/30' : 'bg-tertiary-container/30',
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
                    <span className="truncate text-sm font-bold">{assignment.activityData?.topic || assignment.activityType}</span>
                    {domainConfig && (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', domainConfig.containerColor, domainConfig.textColor)}>
                        {domainConfig.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-on-surface-variant">
                    <span>{ACTIVITY_TYPES.find((t) => t.value === assignment.activityType)?.label || assignment.activityType}</span>
                    {isCompleted && assignment.score != null && (
                      <span className="font-bold text-on-success-container">得分: {assignment.score}</span>
                    )}
                    {assignment.createdAt && (
                      <span>{new Date(assignment.createdAt).toLocaleDateString('zh-CN')}</span>
                    )}
                  </div>
                </div>

                <div className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-bold',
                  isCompleted ? 'bg-success-container text-on-success-container' : 'bg-primary-container text-on-primary-container',
                )}
                >
                  {isCompleted ? '已完成' : '待完成'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel-card p-8 text-center">
          <Inbox className="mx-auto h-12 w-12 text-on-surface-variant opacity-30" />
          <p className="mt-3 font-medium text-on-surface-variant">还没有布置任务</p>
          <p className="mt-1 text-sm text-on-surface-variant/70">点击上方“布置任务”按钮为孩子创建学习任务</p>
        </div>
      )}
    </section>
  );
}
