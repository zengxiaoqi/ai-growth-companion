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
        <h2 className="text-2xl font-bold">任务管理</h2>
        <button
          onClick={() => setShowAssignPanel(!showAssignPanel)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm hover:scale-105 transition-transform"
          aria-expanded={showAssignPanel}
          aria-controls="assign-panel"
        >
          <Plus className="w-4 h-4" />
          布置任务
        </button>
      </div>

      {/* Create Assignment Panel */}
      {showAssignPanel && (
        <motion.div
          id="assign-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15 space-y-5"
        >
          <h3 className="font-bold text-lg">布置新任务</h3>

          {/* Topic Input */}
          <div>
            <label htmlFor="assign-topic" className="text-sm font-bold text-on-surface-variant block mb-1">题目主题</label>
            <input
              id="assign-topic"
              type="text"
              placeholder="例：认识数字 1-10、动物名称..."
              value={assignTopic}
              onChange={(e) => setAssignTopic(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:border-primary bg-background"
            />
          </div>

          {/* Activity Type */}
          <div>
            <span className="text-sm font-bold text-on-surface-variant block mb-2">活动类型</span>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setAssignType(t.value)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-bold transition-all",
                    assignType === t.value
                      ? "bg-primary text-on-primary shadow-sm"
                      : "bg-surface-container border border-outline-variant/30 hover:border-primary/50"
                  )}
                  aria-pressed={assignType === t.value}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Domain */}
          <div>
            <span className="text-sm font-bold text-on-surface-variant block mb-2">学习领域</span>
            <div className="flex flex-wrap gap-2">
              {['language', 'math', 'science', 'art', 'social'].map(domain => {
                const config = DOMAIN_CONFIG[domain];
                return (
                  <button
                    key={domain}
                    onClick={() => setAssignDomain(domain)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5",
                      assignDomain === domain
                        ? "bg-on-secondary-container text-white"
                        : "bg-surface-container border border-outline-variant/30"
                    )}
                    aria-pressed={assignDomain === domain}
                  >
                    <span className={cn(
                      "w-5 h-5 rounded text-white text-[10px] font-black flex items-center justify-center",
                      assignDomain === domain ? config.color : "bg-outline-variant/30"
                    )}>
                      {config.label[0]}
                    </span>
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <span className="text-sm font-bold text-on-surface-variant block mb-2">难度等级</span>
            <div className="flex gap-2">
              {[
                { level: 1, label: '简单' },
                { level: 2, label: '中等' },
                { level: 3, label: '困难' },
              ].map(d => (
                <button
                  key={d.level}
                  onClick={() => setAssignDifficulty(d.level)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    assignDifficulty === d.level
                      ? "bg-tertiary text-on-tertiary"
                      : "bg-surface-container border border-outline-variant/30 hover:border-primary/50"
                  )}
                  aria-pressed={assignDifficulty === d.level}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={isAssigning || !assignTopic.trim() || !selectedChildId}
            className={cn(
              "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all",
              isAssigning || !assignTopic.trim() || !selectedChildId
                ? "bg-outline-variant/30 text-on-surface-variant cursor-not-allowed"
                : "bg-primary text-on-primary hover:scale-[1.02] active:scale-[0.98]"
            )}
          >
            {isAssigning ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ClipboardList className="w-5 h-5" />
            )}
            {isAssigning ? '生成中...' : '布置任务'}
          </button>
        </motion.div>
      )}

      {/* Assignment List */}
      {assignments.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-bold text-on-surface-variant">已布置的任务</h3>
          {assignments.map(assignment => {
            const domainConfig = DOMAIN_CONFIG[assignment.domain || ''];
            const isCompleted = assignment.status === 'completed';
            const isPending = assignment.status === 'pending';
            return (
              <div
                key={assignment.id}
                className={cn(
                  "bg-surface-container-lowest rounded-2xl p-4 border flex items-center gap-4",
                  isCompleted ? "border-[#4caf50]/30" : "border-outline-variant/15"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  isCompleted ? "bg-[#e8f5e9]" : isPending ? "bg-primary-container/30" : "bg-tertiary-container/30"
                )}>
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-[#2e7d32]" />
                  ) : isPending ? (
                    <Clock className="w-5 h-5 text-primary" />
                  ) : (
                    <Play className="w-5 h-5 text-on-tertiary-container" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm truncate">
                      {assignment.activityData?.topic || assignment.activityType}
                    </span>
                    {domainConfig && (
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", domainConfig.containerColor, domainConfig.textColor)}>
                        {domainConfig.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-on-surface-variant">
                    <span>{ACTIVITY_TYPES.find(t => t.value === assignment.activityType)?.label || assignment.activityType}</span>
                    {isCompleted && assignment.score != null && (
                      <span className="text-[#2e7d32] font-bold">得分: {assignment.score}</span>
                    )}
                    {assignment.createdAt && (
                      <span>{new Date(assignment.createdAt).toLocaleDateString('zh-CN')}</span>
                    )}
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold shrink-0",
                  isCompleted ? "bg-[#e8f5e9] text-[#2e7d32]" : "bg-primary-container text-on-primary-container"
                )}>
                  {isCompleted ? '已完成' : '待完成'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Bug fix: empty state */
        <div className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 text-center">
          <Inbox className="w-12 h-12 mx-auto text-on-surface-variant opacity-30" />
          <p className="mt-3 text-on-surface-variant font-medium">还没有布置任务</p>
          <p className="mt-1 text-sm text-on-surface-variant opacity-60">点击上方"布置任务"按钮为孩子创建学习任务</p>
        </div>
      )}
    </section>
  );
}
