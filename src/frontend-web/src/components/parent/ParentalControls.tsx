import { useState, useCallback } from 'react';
import { Timer, ShieldCheck, Eye, BookOpen, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { DOMAIN_CONFIG, RADAR_COLORS, ALL_DOMAINS } from './constants';
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
  onSave: (data: { dailyLimitMinutes: number; allowedDomains: string[]; studySchedule: StudySchedule; eyeProtectionEnabled?: boolean }) => Promise<void>;
  userId: number;
  controlsRef?: React.RefObject<HTMLDivElement | null>;
}

export default function ParentalControls({ controls, studySchedule: initialSchedule, onSave, userId, controlsRef }: ParentalControlsProps) {
  const [editDailyLimit, setEditDailyLimit] = useState(controls?.dailyLimitMinutes || 30);
  const [editAllowedDomains, setEditAllowedDomains] = useState<string[]>(
    controls?.allowedDomains?.length ? controls.allowedDomains : ALL_DOMAINS
  );
  const [eyeProtection, setEyeProtection] = useState(controls?.eyeProtectionEnabled ?? true);
  const [studySchedule, setStudySchedule] = useState<StudySchedule>(initialSchedule);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleDomain = (domain: string) => {
    setEditAllowedDomains(prev =>
      prev.includes(domain)
        ? prev.filter(d => d !== domain)
        : [...prev, domain]
    );
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
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  }, [editDailyLimit, editAllowedDomains, studySchedule, eyeProtection, onSave]);

  // Fix Bug 4: Persist eye protection toggle immediately
  const handleEyeProtectionToggle = useCallback(async () => {
    const newValue = !eyeProtection;
    setEyeProtection(newValue);
    try {
      await api.updateControls(userId, {
        eyeProtectionEnabled: newValue,
        dailyLimitMinutes: editDailyLimit,
        allowedDomains: editAllowedDomains,
        studySchedule,
      });
    } catch {
      // Revert on failure
      setEyeProtection(!newValue);
    }
  }, [eyeProtection, userId, editDailyLimit, editAllowedDomains, studySchedule]);

  return (
    <div className="space-y-6" ref={controlsRef}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">家长控制</h2>
      </div>

      {/* Time Limit Slider */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
            <Timer className="w-8 h-8 text-on-secondary-container" />
          </div>
          <div>
            <h3 className="font-bold text-lg">时间限制</h3>
            <p className="text-sm text-on-surface-variant">设置每日学习时间上限</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-sm font-bold text-on-surface-variant mb-2">
            <span>15 分钟</span>
            <span className="text-secondary text-lg">{editDailyLimit} 分钟</span>
            <span>120 分钟</span>
          </div>
          <input
            type="range"
            min={15}
            max={120}
            step={5}
            value={editDailyLimit}
            onChange={(e) => setEditDailyLimit(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #006384 ${(editDailyLimit - 15) / 105 * 100}%, #b9ae6e ${(editDailyLimit - 15) / 105 * 100}%)`,
            }}
            aria-valuemin={15}
            aria-valuemax={120}
            aria-valuenow={editDailyLimit}
            aria-valuetext={`${editDailyLimit} 分钟`}
            aria-label="每日学习时间上限"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-outline-variant">15min</span>
            <span className="text-[10px] text-outline-variant">60min</span>
            <span className="text-[10px] text-outline-variant">120min</span>
          </div>
        </div>
      </div>

      {/* Content Domain Toggles */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-tertiary-container/30 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-on-tertiary-container" />
          </div>
          <div>
            <h3 className="font-bold text-lg">内容领域</h3>
            <p className="text-sm text-on-surface-variant">选择允许的学习领域</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {ALL_DOMAINS.map((domain) => {
            const config = DOMAIN_CONFIG[domain];
            const isActive = editAllowedDomains.includes(domain);
            return (
              <button
                key={domain}
                onClick={() => toggleDomain(domain)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                  isActive
                    ? "border-current scale-105"
                    : "border-outline-variant/20 opacity-40"
                )}
                style={{ color: isActive ? RADAR_COLORS[ALL_DOMAINS.indexOf(domain)] : undefined }}
                aria-pressed={isActive}
                aria-label={`${config.label}领域${isActive ? '已启用' : '已禁用'}`}
              >
                <span className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black",
                  isActive ? config.color : "bg-outline-variant/30"
                )}>
                  {config.label[0]}
                </span>
                <span className="text-xs font-bold">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Eye Protection */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center">
            <Eye className="w-8 h-8 text-outline" />
          </div>
          <div>
            <h3 className="font-bold text-lg">护眼模式</h3>
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
            "w-12 h-6 rounded-full relative transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            eyeProtection ? "bg-secondary" : "bg-outline-variant/30"
          )}
          onClick={handleEyeProtectionToggle}
        >
          <div className={cn(
            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
            eyeProtection ? "right-1" : "left-1"
          )}></div>
        </button>
      </div>

      {/* Save Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleSave}
        disabled={isSaving}
        className={cn(
          "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-colors",
          saveSuccess
            ? "bg-primary-container text-on-primary-container"
            : "bg-on-secondary-container text-white hover:opacity-90"
        )}
      >
        {isSaving ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : saveSuccess ? (
          <>
            <CheckCircle2 className="w-5 h-5" />
            保存成功
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            保存设置
          </>
        )}
      </motion.button>

      {/* Study Schedule */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-container/30 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-on-primary-container" />
          </div>
          <div>
            <h3 className="font-bold text-lg">学习日程</h3>
            <p className="text-sm text-on-surface-variant">设置每日学习时间段</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {Object.entries(studySchedule).map(([day, schedule]) => (
            <div key={day} className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={schedule.enabled}
                aria-label={`${day}学习开关`}
                onClick={() => setStudySchedule(prev => ({
                  ...prev,
                  [day]: { ...prev[day], enabled: !prev[day].enabled }
                }))}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  schedule.enabled ? "bg-primary" : "bg-outline-variant/30"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  schedule.enabled ? "right-1" : "left-1"
                )} />
              </button>
              <span className={cn("text-sm font-medium w-10", schedule.enabled ? "text-on-surface" : "text-on-surface-variant opacity-50")}>{day}</span>
              {schedule.enabled ? (
                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <input
                    type="time"
                    value={schedule.start}
                    onChange={(e) => setStudySchedule(prev => ({
                      ...prev,
                      [day]: { ...prev[day], start: e.target.value }
                    }))}
                    className="px-2 py-1 rounded-lg border border-outline-variant/30 text-xs bg-transparent"
                    aria-label={`${day} 开始时间`}
                  />
                  <span>-</span>
                  <input
                    type="time"
                    value={schedule.end}
                    onChange={(e) => setStudySchedule(prev => ({
                      ...prev,
                      [day]: { ...prev[day], end: e.target.value }
                    }))}
                    className="px-2 py-1 rounded-lg border border-outline-variant/30 text-xs bg-transparent"
                    aria-label={`${day} 结束时间`}
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
