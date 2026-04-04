import { useState, useCallback } from 'react';
import { Timer, ShieldCheck, Eye, BookOpen, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { DOMAIN_CONFIG, ALL_DOMAINS } from './constants';
import type { ParentControl } from '@/types';
import api from '../../services/api';

interface StudyScheduleEntry {
  enabled: boolean;
  start: string;
  end: string;
}

type StudySchedule = Record<string, StudyScheduleEntry>;

interface ParentalControlsProps {
  controls: ParentControl | null;
  studySchedule: StudySchedule;
  onSave: (data: {
    dailyLimitMinutes: number;
    allowedDomains: string[];
    studySchedule: StudySchedule;
    eyeProtectionEnabled?: boolean;
  }) => Promise<void>;
  userId: number;
  controlsRef?: React.RefObject<HTMLDivElement | null>;
}

export default function ParentalControls({
  controls,
  studySchedule: initialSchedule,
  onSave,
  userId,
  controlsRef,
}: ParentalControlsProps) {
  const [editDailyLimit, setEditDailyLimit] = useState(controls?.dailyLimitMinutes || 30);
  const [editAllowedDomains, setEditAllowedDomains] = useState<string[]>(
    controls?.allowedDomains?.length ? controls.allowedDomains : ALL_DOMAINS,
  );
  const [eyeProtection, setEyeProtection] = useState(controls?.eyeProtectionEnabled ?? true);
  const [studySchedule, setStudySchedule] = useState<StudySchedule>(initialSchedule);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleDomain = (domain: string) => {
    setEditAllowedDomains((prev) => (
      prev.includes(domain)
        ? prev.filter((d) => d !== domain)
        : [...prev, domain]
    ));
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave({
        dailyLimitMinutes: editDailyLimit,
        allowedDomains: editAllowedDomains,
        studySchedule,
        eyeProtectionEnabled: eyeProtection,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      // Parent component handles errors
    } finally {
      setIsSaving(false);
    }
  }, [editDailyLimit, editAllowedDomains, studySchedule, eyeProtection, onSave]);

  const handleEyeProtectionToggle = useCallback(async () => {
    const nextValue = !eyeProtection;
    setEyeProtection(nextValue);
    try {
      await api.updateControls(userId, {
        eyeProtectionEnabled: nextValue,
        dailyLimitMinutes: editDailyLimit,
        allowedDomains: editAllowedDomains,
        studySchedule,
      });
    } catch {
      setEyeProtection(!nextValue);
    }
  }, [eyeProtection, userId, editDailyLimit, editAllowedDomains, studySchedule]);

  return (
    <div className="space-y-6" ref={controlsRef}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">家长控制</h2>
      </div>

      <div className="panel-card p-6">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-container/30">
            <Timer className="h-8 w-8 text-on-secondary-container" />
          </div>
          <div>
            <h3 className="text-lg font-bold">时间限制</h3>
            <p className="text-sm text-on-surface-variant">设置每日学习时长上限</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex justify-between text-sm font-bold text-on-surface-variant">
            <span>15 分钟</span>
            <span className="text-lg text-secondary">{editDailyLimit} 分钟</span>
            <span>120 分钟</span>
          </div>
          <input
            type="range"
            min={15}
            max={120}
            step={5}
            value={editDailyLimit}
            onChange={(e) => setEditDailyLimit(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background: `linear-gradient(to right, #006384 ${((editDailyLimit - 15) / 105) * 100}%, #b9ae6e ${((editDailyLimit - 15) / 105) * 100}%)`,
            }}
            aria-valuemin={15}
            aria-valuemax={120}
            aria-valuenow={editDailyLimit}
            aria-valuetext={`${editDailyLimit} 分钟`}
            aria-label="每日学习时长上限"
          />
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-outline-variant">15min</span>
            <span className="text-[10px] text-outline-variant">60min</span>
            <span className="text-[10px] text-outline-variant">120min</span>
          </div>
        </div>
      </div>

      <div className="panel-card p-6">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tertiary-container/30">
            <ShieldCheck className="h-8 w-8 text-on-tertiary-container" />
          </div>
          <div>
            <h3 className="text-lg font-bold">内容领域</h3>
            <p className="text-sm text-on-surface-variant">选择允许访问的学习领域</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {ALL_DOMAINS.map((domain) => {
            const config = DOMAIN_CONFIG[domain];
            const isActive = editAllowedDomains.includes(domain);
            return (
              <button
                key={domain}
                onClick={() => toggleDomain(domain)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all',
                  isActive ? 'scale-[1.03] border-current' : 'border-outline-variant/20 opacity-40',
                )}
                style={{ color: isActive ? DOMAIN_CONFIG[domain]?.chartColor : undefined }}
                aria-pressed={isActive}
                aria-label={`${config.label}领域${isActive ? '已启用' : '已禁用'}`}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white',
                    isActive ? config.color : 'bg-outline-variant/30',
                  )}
                >
                  {config.label[0]}
                </span>
                <span className="text-xs font-bold">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-card flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container">
            <Eye className="h-8 w-8 text-outline" />
          </div>
          <div>
            <h3 className="text-lg font-bold">护眼模式</h3>
            <p className="text-sm text-on-surface-variant">
              {controls?.restReminderMinutes ? `${controls.restReminderMinutes}分钟休息提醒` : '20分钟休息提醒'}
            </p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={eyeProtection}
          aria-label="护眼模式开关"
          className={cn(
            'relative h-6 w-12 cursor-pointer rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            eyeProtection ? 'bg-secondary' : 'bg-outline-variant/30',
          )}
          onClick={handleEyeProtectionToggle}
        >
          <div
            className={cn(
              'absolute top-1 h-4 w-4 rounded-full bg-white transition-all',
              eyeProtection ? 'right-1' : 'left-1',
            )}
          />
        </button>
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleSave}
        disabled={isSaving}
        className={cn(
          'shadow-card flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-lg font-bold transition-colors',
          saveSuccess
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-on-secondary-container text-white hover:opacity-90',
        )}
      >
        {isSaving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : saveSuccess ? (
          <>
            <CheckCircle2 className="h-5 w-5" />
            保存成功
          </>
        ) : (
          <>
            <Save className="h-5 w-5" />
            保存设置
          </>
        )}
      </motion.button>

      <div className="panel-card p-6">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container/30">
            <BookOpen className="h-8 w-8 text-on-primary-container" />
          </div>
          <div>
            <h3 className="text-lg font-bold">学习日程</h3>
            <p className="text-sm text-on-surface-variant">设置每天可学习时间段</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {Object.entries(studySchedule).map(([day, schedule]) => (
            <div key={day} className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={schedule.enabled}
                aria-label={`${day}学习开关`}
                onClick={() => setStudySchedule((prev) => ({
                  ...prev,
                  [day]: { ...prev[day], enabled: !prev[day].enabled },
                }))}
                className={cn(
                  'relative h-6 w-12 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  schedule.enabled ? 'bg-primary' : 'bg-outline-variant/30',
                )}
              >
                <div
                  className={cn(
                    'absolute top-1 h-4 w-4 rounded-full bg-white transition-all',
                    schedule.enabled ? 'right-1' : 'left-1',
                  )}
                />
              </button>

              <span className={cn('w-10 text-sm font-medium', schedule.enabled ? 'text-on-surface' : 'text-on-surface-variant opacity-50')}>{day}</span>

              {schedule.enabled ? (
                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <input
                    type="time"
                    value={schedule.start}
                    onChange={(e) => setStudySchedule((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], start: e.target.value },
                    }))}
                    className="rounded-lg border border-outline-variant/30 bg-transparent px-2 py-1 text-xs"
                    aria-label={`${day}开始时间`}
                  />
                  <span>-</span>
                  <input
                    type="time"
                    value={schedule.end}
                    onChange={(e) => setStudySchedule((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], end: e.target.value },
                    }))}
                    className="rounded-lg border border-outline-variant/30 bg-transparent px-2 py-1 text-xs"
                    aria-label={`${day}结束时间`}
                  />
                </div>
              ) : (
                <span className="text-xs text-on-surface-variant opacity-50">休息日</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
