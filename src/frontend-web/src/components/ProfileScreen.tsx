import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  Save,
  UserCircle,
} from '@/icons';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Button, Card, IconButton, TopBar } from './ui';

interface ProfileScreenProps {
  onBack: () => void;
}

function createAvatarSvg(background: string, foreground: string, accent: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='${background}'/>
        <stop offset='100%' stop-color='${accent}'/>
      </linearGradient>
    </defs>
    <rect width='120' height='120' rx='60' fill='url(#g)'/>
    <circle cx='60' cy='46' r='22' fill='${foreground}' fill-opacity='0.9'/>
    <rect x='28' y='74' width='64' height='30' rx='15' fill='${foreground}' fill-opacity='0.88'/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AVATAR_OPTIONS = [
  createAvatarSvg('#f7cf47', '#6a5200', '#ffb86c'),
  createAvatarSvg('#97daff', '#004d68', '#8ec6ff'),
  createAvatarSvg('#e7f568', '#5a6100', '#c2f06d'),
  createAvatarSvg('#ffc9a4', '#7f3413', '#ff9aa8'),
  createAvatarSvg('#cbb8ff', '#4e2f8b', '#a3d6ff'),
  createAvatarSvg('#b8f0d4', '#1f6653', '#89d8ff'),
];

export default function ProfileScreen({ onBack }: ProfileScreenProps) {
  const { user } = useAuth();

  const initialAvatar = useMemo(() => {
    if (user?.avatar && user.avatar.trim().length > 0) return user.avatar;
    return AVATAR_OPTIONS[0];
  }, [user?.avatar]);

  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState(user?.age?.toString() || '');
  const [avatar, setAvatar] = useState(initialAvatar);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    setError(null);

    try {
      const parsedAge = age ? Number(age) : undefined;
      const updated = await api.updateUser(user.id, {
        name: name.trim() || user.name,
        avatar,
        ...(Number.isFinite(parsedAge) ? { age: parsedAge } : {}),
      });

      localStorage.setItem('auth_user', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('user-settings-updated', { detail: updated }));

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1800);
    } catch (err: any) {
      setError(err?.message || '保存失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-app pb-safe">
      <TopBar
        title="个人资料"
        subtitle="维护孩子账号的基础信息"
        leftSlot={(
          <IconButton aria-label="返回" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        )}
      />

      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 md:px-6">
        <Card className="space-y-4 p-4 md:p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">头像</h2>

          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border border-outline-variant/25 bg-primary-container">
              <img src={avatar} alt="当前头像" className="h-full w-full object-cover" />
              <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary">
                <Camera className="h-4 w-4" />
              </div>
            </div>
            <p className="text-sm text-on-surface-variant">点击下方头像样式即可切换，实时预览。</p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {AVATAR_OPTIONS.map((option, index) => {
              const active = avatar === option;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setAvatar(option)}
                  aria-label={`选择头像 ${index + 1}`}
                  className={`touch-target overflow-hidden rounded-full border-2 transition ${
                    active
                      ? 'border-primary shadow-card-hover scale-105'
                      : 'border-outline-variant/30 hover:border-primary/40'
                  }`}
                >
                  <img src={option} alt="头像选项" className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-4 p-4 md:p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">基础信息</h2>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-on-surface">昵称</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-on-surface outline-none transition focus:border-primary"
              placeholder="请输入昵称"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-on-surface">年龄</label>
            <input
              type="number"
              min={3}
              max={12}
              value={age}
              onChange={(event) => setAge(event.target.value)}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-on-surface outline-none transition focus:border-primary"
              placeholder="请输入年龄"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-on-surface">手机号</label>
            <input
              type="tel"
              value={user?.phone || ''}
              disabled
              className="w-full rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-2.5 text-on-surface-variant"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-2.5 text-sm font-semibold text-on-surface-variant">
            <UserCircle className="h-4 w-4 text-primary" />
            账号类型：{user?.type === 'parent' ? '家长' : '学生'}
          </div>
        </Card>

        {error ? <p className="text-sm font-semibold text-error">{error}</p> : null}

        <Button
          className="w-full"
          size="lg"
          onClick={handleSave}
          disabled={isSaving}
          variant={saveSuccess ? 'secondary' : 'primary'}
        >
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
              保存修改
            </>
          )}
        </Button>
      </main>
    </div>
  );
}
