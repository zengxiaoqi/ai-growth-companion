import { useState } from 'react';
import { AlertCircle, Lock, Rocket, Shield, Sparkles, TrendingUp, UserCircle } from '@/icons';
import type { User } from '@/types';
import type { AppMode } from '../App';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Button, Card } from './ui';

interface ModeSelectionProps {
  onSelectMode: (mode: AppMode) => void;
  user?: User | null;
}

export default function ModeSelection({ onSelectMode, user }: ModeSelectionProps) {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleParentLogin = async () => {
    if (!auth.isAuthenticated || user?.type !== 'parent') {
      setPasswordError('请先登录家长账号，再进入家长中心。');
      return;
    }

    if (!password) {
      setPasswordError('请输入家长登录密码。');
      return;
    }

    setLoading(true);
    setPasswordError(null);

    try {
      const result = await api.switchToParent(password);
      if (result.token) {
        api.setToken(result.token);
        localStorage.setItem('auth_token', result.token);
      }
      onSelectMode('parent');
    } catch (err: any) {
      setPasswordError(err?.message || '密码错误，请重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell min-h-app overflow-hidden px-safe pb-safe pt-safe">
      <div className="pointer-events-none absolute -left-16 top-12 h-56 w-56 rounded-full bg-primary-container/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-28 h-64 w-64 rounded-full bg-secondary-container/25 blur-3xl" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 py-6 md:py-10">
        <header className="space-y-3 text-center md:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-tertiary-container/65 px-4 py-1.5 text-xs font-black text-on-tertiary-container">
            <Sparkles className="h-4 w-4" />
            触控友好模式已开启
          </div>
          <h1 className="text-3xl font-black tracking-tight text-on-surface md:text-4xl">
            请选择使用模式
          </h1>
          <p className="text-sm font-medium text-on-surface-variant md:text-base">
            学生端适合沉浸学习，家长端可查看进展并管理学习计划。
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-2 md:gap-6">
          <Card className="relative overflow-hidden p-6 md:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary-container/35 blur-3xl" />
            <div className="relative z-10 flex h-full flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
                  <Rocket className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-primary">学生模式</h2>
                  <p className="text-sm font-semibold text-on-surface-variant">
                    课程、挑战与 AI 伙伴
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-on-surface-variant md:text-base">
                进入学习主界面，开始今日任务、完成互动练习，并解锁成长成就。
              </p>

              <Button
                onClick={() => onSelectMode('student')}
                className="mt-auto w-full rounded-2xl text-base"
                size="lg"
              >
                <Rocket className="h-5 w-5" />
                进入学生端
              </Button>
            </div>
          </Card>

          <Card className="relative overflow-hidden p-6 md:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-secondary-container/35 blur-3xl" />
            <div className="relative z-10 flex h-full flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-container text-on-secondary-container">
                  <TrendingUp className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-on-surface">家长模式</h2>
                  <p className="text-sm font-semibold text-on-surface-variant">
                    报告、管控与作业管理
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-outline-variant/20 bg-surface px-4 py-3 text-sm text-on-surface-variant">
                <div className="mb-2 flex items-center gap-2 font-semibold text-on-surface">
                  <UserCircle className="h-4 w-4" />
                  当前账号：{user?.name || '未登录'}
                </div>
                <p>
                  {user?.type === 'parent'
                    ? '已登录家长账号，请输入登录密码验证。'
                    : '请先使用家长账号登录。'}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-on-surface">
                  家长登录密码
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  aria-label="家长登录密码"
                  className="touch-target h-12 w-full rounded-xl border border-outline-variant/35 bg-surface px-4 text-base font-semibold text-on-surface focus:border-primary focus:outline-none"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setPasswordError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleParentLogin();
                  }}
                  disabled={loading}
                />
              </div>

              {passwordError && (
                <div className="flex items-start gap-2 rounded-xl bg-error-container/20 px-3 py-2 text-sm font-semibold text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handleParentLogin}
                  disabled={loading}
                  className="w-full rounded-2xl"
                  variant="secondary"
                  size="lg"
                >
                  {loading ? (
                    <>验证中...</>
                  ) : (
                    <>
                      <Lock className="h-5 w-5" />
                      验证并进入家长端
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => auth.logout()}
                  variant="ghost"
                  className="w-full rounded-2xl sm:w-auto"
                >
                  退出账号
                </Button>
              </div>
            </div>
          </Card>
        </section>

        <footer className="flex justify-center pb-2 text-xs font-semibold text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            全程启用安全保护与家长管控能力
          </span>
        </footer>
      </main>
    </div>
  );
}
