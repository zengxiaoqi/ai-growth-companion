import { useCallback, useEffect, useState, type RefObject } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Eye,
  Loader2,
  Save,
  ShieldCheck,
  Timer,
} from '@/icons';
import { cn } from '../../lib/utils';
import { ALL_DOMAINS, DOMAIN_CONFIG } from './constants';
import type { ParentControl } from '@/types';
import api from '../../services/api';
import { Button, Card } from '../ui';

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
  controlsRef?: RefObject<HTMLDivElement | null>;
}

function Switch({
  checked,
  onToggle,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'touch-target relative h-7 w-12 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-outline-variant/35',
        disabled && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'left-6' : 'left-1',
        )}
      />
    </button>
  );
}

export default function ParentalControls({
  controls,
  studySchedule: initialSchedule,
  onSave,
  userId,
  controlsRef,
}: ParentalControlsProps) {
  const [dailyLimit, setDailyLimit] = useState(controls?.dailyLimitMinutes || 30);
  const [allowedDomains, setAllowedDomains] = useState<string[]>(
    controls?.allowedDomains?.length ? controls.allowedDomains : ALL_DOMAINS,
  );
  const [eyeProtection, setEyeProtection] = useState(controls?.eyeProtectionEnabled ?? true);
  const [studySchedule, setStudySchedule] = useState<StudySchedule>(initialSchedule);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTogglingEye, setIsTogglingEye] = useState(false);

  useEffect(() => {
    setDailyLimit(controls?.dailyLimitMinutes || 30);
    setAllowedDomains(controls?.allowedDomains?.length ? controls.allowedDomains : ALL_DOMAINS);
    setEyeProtection(controls?.eyeProtectionEnabled ?? true);
  }, [controls]);

  useEffect(() => {
    setStudySchedule(initialSchedule);
  }, [initialSchedule]);

  const toggleDomain = (domain: string) => {
    setAllowedDomains((prev) =>
      prev.includes(domain) ? prev.filter((item) => item !== domain) : [...prev, domain],
    );
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      await onSave({
        dailyLimitMinutes: dailyLimit,
        allowedDomains,
        studySchedule,
        eyeProtectionEnabled: eyeProtection,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (error: any) {
      setSaveError(error?.message || '保存失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  }, [allowedDomains, dailyLimit, eyeProtection, onSave, studySchedule]);

  const handleEyeProtectionToggle = useCallback(async () => {
    const next = !eyeProtection;
    setEyeProtection(next);
    setIsTogglingEye(true);

    try {
      await api.updateControls(userId, {
        eyeProtectionEnabled: next,
        dailyLimitMinutes: dailyLimit,
        allowedDomains,
        studySchedule,
      });
    } catch {
      setEyeProtection(!next);
      setSaveError('护眼模式切换失败，请重试。');
    } finally {
      setIsTogglingEye(false);
    }
  }, [allowedDomains, dailyLimit, eyeProtection, studySchedule, userId]);

  return (
    <div className="space-y-5" ref={controlsRef}>
      <h2 className="text-2xl font-black text-on-surface">家长控制</h2>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container/30">
            <Timer className="h-6 w-6 text-on-secondary-container" />
          </div>
          <div>
            <h3 className="text-lg font-black text-on-surface">每日学习时长</h3>
            <p className="text-sm text-on-surface-variant">设置孩子每天可学习的总时长上限</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-on-surface-variant">
            <span>15 分钟</span>
            <span className="text-base font-black text-primary">{dailyLimit} 分钟</span>
            <span>120 分钟</span>
          </div>
          <input
            type="range"
            min={15}
            max={120}
            step={5}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(Number(event.target.value))}
            className="h-2 w-full cursor-pointer rounded-full accent-primary"
            aria-valuemin={15}
            aria-valuemax={120}
            aria-valuenow={dailyLimit}
            aria-label="每日学习时长上限"
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tertiary-container/35">
            <ShieldCheck className="h-6 w-6 text-on-tertiary-container" />
          </div>
          <div>
            <h3 className="text-lg font-black text-on-surface">允许学习领域</h3>
            <p className="text-sm text-on-surface-variant">可以开启多个领域，关闭后该领域内容会被限制访问</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ALL_DOMAINS.map((domain) => {
            const config = DOMAIN_CONFIG[domain];
            const active = allowedDomains.includes(domain);
            return (
              <button
                key={domain}
                type="button"
                onClick={() => toggleDomain(domain)}
                className={cn(
                  'touch-target rounded-xl border px-3 py-2 text-sm font-bold transition-colors',
                  active
                    ? `${config.containerColor} ${config.textColor} border-primary/35`
                    : 'border-outline-variant/25 bg-surface text-on-surface-variant',
                )}
                aria-pressed={active}
                aria-label={`${config.label} ${active ? '已启用' : '已禁用'}`}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-high">
              <Eye className="h-6 w-6 text-on-surface" />
            </div>
            <div>
              <h3 className="text-lg font-black text-on-surface">护眼模式</h3>
              <p className="text-sm text-on-surface-variant">
                {controls?.restReminderMinutes ? `${controls.restReminderMinutes} 分钟提醒休息` : '默认每 20 分钟提醒休息'}
              </p>
            </div>
          </div>

          <Switch
            checked={eyeProtection}
            onToggle={handleEyeProtectionToggle}
            ariaLabel="切换护眼模式"
            disabled={isTogglingEye}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/30">
            <BookOpen className="h-6 w-6 text-on-primary-container" />
          </div>
          <div>
            <h3 className="text-lg font-black text-on-surface">学习日程</h3>
            <p className="text-sm text-on-surface-variant">按天设置可学习时间段，支持精细化安排</p>
          </div>
        </div>

        <div className="space-y-2">
          {Object.entries(studySchedule).map(([day, schedule]) => (
            <div key={day} className="rounded-xl border border-outline-variant/15 bg-surface px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Switch
                  checked={schedule.enabled}
                  onToggle={() =>
                    setStudySchedule((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], enabled: !prev[day].enabled },
                    }))
                  }
                  ariaLabel={`${day} 学习开关`}
                />

                <span className={cn('w-12 text-sm font-bold', schedule.enabled ? 'text-on-surface' : 'text-on-surface-variant')}>
                  {day}
                </span>

                {schedule.enabled ? (
                  <div className="ml-auto flex items-center gap-2 text-sm">
                    <input
                      type="time"
                      value={schedule.start}
                      onChange={(event) =>
                        setStudySchedule((prev) => ({
                          ...prev,
                          [day]: { ...prev[day], start: event.target.value },
                        }))
                      }
                      className="h-9 rounded-lg border border-outline-variant/30 bg-background px-2 text-xs"
                      aria-label={`${day} 开始时间`}
                    />
                    <span className="text-on-surface-variant">-</span>
                    <input
                      type="time"
                      value={schedule.end}
                      onChange={(event) =>
                        setStudySchedule((prev) => ({
                          ...prev,
                          [day]: { ...prev[day], end: event.target.value },
                        }))
                      }
                      className="h-9 rounded-lg border border-outline-variant/30 bg-background px-2 text-xs"
                      aria-label={`${day} 结束时间`}
                    />
                  </div>
                ) : (
                  <span className="ml-auto text-xs font-semibold text-on-surface-variant">休息日</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {saveError ? <p className="text-sm font-semibold text-error">{saveError}</p> : null}

      <Button size="lg" className="w-full" onClick={handleSave} disabled={isSaving} variant={saveSuccess ? 'secondary' : 'primary'}>
        {isSaving ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            保存中...
          </>
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
      </Button>
    </div>
  );
}
