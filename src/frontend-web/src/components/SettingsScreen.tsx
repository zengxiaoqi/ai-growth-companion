import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  Bot,
  Camera,
  CheckCircle2,
  Info,
  Loader2,
  LogOut,
  Moon,
  RotateCcw,
  Save,
  Shield,
  Trophy,
  Type,
  User,
  UserCircle,
  Volume2,
} from '@/icons';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { AppUISettings, ChatAvatarSettings } from '@/lib/app-settings';
import {
  applyAppUISettings,
  mergeUserSettings,
  resolveAppUISettings,
  resolveChatAvatarSettings,
  saveStoredAppUISettings,
} from '@/lib/app-settings';
import { Button, Card, IconButton, TopBar } from './ui';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenProfile?: () => void;
  onOpenAchievements?: () => void;
}

async function compressAvatarFile(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('图片过大，请选择 20MB 以内的图片。');
  }

  const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('图片读取失败，请重试。'));
      reader.readAsDataURL(blob);
    });

  const objectUrl = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法解析图片文件。'));
    img.src = objectUrl;
  }).finally(() => {
    URL.revokeObjectURL(objectUrl);
  });

  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const targetW = Math.max(64, Math.round(image.width * scale));
  const targetH = Math.max(64, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('图片处理失败，请稍后再试。');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, targetW, targetH);

  const encode = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('图片压缩失败，请重试。'))),
        'image/jpeg',
        quality,
      );
    });

  const maxBlobSize = 36 * 1024;
  let blob = await encode(0.82);
  if (blob.size > maxBlobSize) blob = await encode(0.7);
  if (blob.size > maxBlobSize) blob = await encode(0.58);

  if (blob.size > 60 * 1024) {
    throw new Error('图片仍然过大，请换一张分辨率更低的图片。');
  }

  return readAsDataUrl(blob);
}

function Switch({ checked, onChange, ariaLabel }: { checked: boolean; onChange: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={cn(
        'touch-target relative h-7 w-12 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-outline-variant/35',
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

function AvatarPreview({ src, fallback }: { src?: string; fallback: ReactNode }) {
  if (src) {
    return <img src={src} alt="头像预览" className="h-full w-full rounded-full object-cover" />;
  }
  return <>{fallback}</>;
}

function SettingsRow({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/15 bg-surface p-3 md:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-on-surface">{title}</p>
          <p className="text-xs text-on-surface-variant">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export default function SettingsScreen({ onBack, onOpenProfile, onOpenAchievements }: SettingsScreenProps) {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<AppUISettings>(() => resolveAppUISettings(undefined));
  const [chatAvatars, setChatAvatars] = useState<ChatAvatarSettings>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userAlbumInputRef = useRef<HTMLInputElement>(null);
  const userCameraInputRef = useRef<HTMLInputElement>(null);
  const aiAlbumInputRef = useRef<HTMLInputElement>(null);
  const aiCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const source = user?.settings as Record<string, unknown> | undefined;
    setSettings(resolveAppUISettings(source));
    setChatAvatars(resolveChatAvatarSettings(source));
  }, [user?.id, user?.settings]);

  useEffect(() => {
    applyAppUISettings(settings);
    saveStoredAppUISettings(settings);
  }, [settings]);

  const userAvatar = chatAvatars.userAvatar || user?.avatar || undefined;
  const aiAvatar = chatAvatars.aiAvatar || undefined;

  const updateAvatarFromFile = async (target: 'userAvatar' | 'aiAvatar', file?: File) => {
    if (!file) return;

    try {
      setError(null);
      const dataUrl = await compressAvatarFile(file);
      setChatAvatars((prev) => ({ ...prev, [target]: dataUrl }));
    } catch (err: any) {
      setError(err?.message || '头像处理失败，请重试。');
    }
  };

  const onPickAvatarFile =
    (target: 'userAvatar' | 'aiAvatar') =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      await updateAvatarFromFile(target, file);
      event.target.value = '';
    };

  const handleSave = async () => {
    setError(null);
    setSaveSuccess(false);

    if (!user?.id) {
      setSaveSuccess(true);
      return;
    }

    try {
      setIsSaving(true);

      const mergedSettings = mergeUserSettings(
        user.settings as Record<string, unknown> | undefined,
        {
          uiSettings: settings,
          chatAvatars,
        },
      );

      const payloadSize = JSON.stringify({ settings: mergedSettings }).length;
      if (payloadSize > 90000) {
        throw new Error('头像数据过大，请换一张更小的图片后再保存。');
      }

      const updated = await api.updateUser(user.id, { settings: mergedSettings });
      localStorage.setItem('auth_user', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('user-settings-updated', { detail: updated }));

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (err: any) {
      setError(err?.message || '保存失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    onBack();
  };

  return (
    <div className="min-h-app pb-safe">
      <TopBar
        title="设置"
        leftSlot={(
          <IconButton aria-label="返回" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        )}
      />

      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 md:px-6">
        <div className="flex items-center gap-4 rounded-2xl border border-outline-variant/15 bg-surface p-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-primary-container">
            {user?.avatar ? (
              <img alt="用户头像" className="h-full w-full object-cover" src={user.avatar} referrerPolicy="no-referrer" />
            ) : (
              <span className="text-lg font-bold text-on-primary-container">{(user?.name || '?')[0]}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-on-surface">{user?.name || '用户'}</h3>
            <p className="text-sm text-on-surface-variant">{user?.type === 'parent' ? '家长端' : '学生端'} · {user?.phone || ''}</p>
          </div>
        </div>

        <Card className="space-y-3 p-4 md:p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">快捷入口</h2>

          <div className="grid grid-cols-2 gap-3">
            {onOpenProfile ? (
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex items-center gap-3 rounded-2xl border border-outline-variant/15 bg-surface p-3 text-left transition-colors hover:bg-surface-container"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-container">
                  <UserCircle className="h-5 w-5 text-on-secondary-container" />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">个人资料</p>
                  <p className="text-xs text-on-surface-variant">头像、昵称、年龄</p>
                </div>
              </button>
            ) : null}

            {onOpenAchievements ? (
              <button
                type="button"
                onClick={onOpenAchievements}
                className="flex items-center gap-3 rounded-2xl border border-outline-variant/15 bg-surface p-3 text-left transition-colors hover:bg-surface-container"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tertiary-container">
                  <Trophy className="h-5 w-5 text-on-tertiary-container" />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">我的成就</p>
                  <p className="text-xs text-on-surface-variant">徽章、里程碑</p>
                </div>
              </button>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-4 p-4 md:p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">对话头像</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="space-y-3 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary text-white">
                  <AvatarPreview src={userAvatar} fallback={<User className="h-7 w-7" />} />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">我的头像</p>
                  <p className="text-xs text-on-surface-variant">用于聊天中“我”的头像展示</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => userAlbumInputRef.current?.click()}>
                  选自相册
                </Button>
                <Button size="sm" variant="ghost" onClick={() => userCameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  拍照
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setChatAvatars((prev) => ({ ...prev, userAvatar: undefined }))}
                >
                  <RotateCcw className="h-4 w-4" />
                  还原
                </Button>
              </div>
            </Card>

            <Card className="space-y-3 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-tertiary text-white">
                  <AvatarPreview src={aiAvatar} fallback={<Bot className="h-7 w-7" />} />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">AI 头像</p>
                  <p className="text-xs text-on-surface-variant">用于聊天中助手头像展示</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => aiAlbumInputRef.current?.click()}>
                  选自相册
                </Button>
                <Button size="sm" variant="ghost" onClick={() => aiCameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  拍照
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setChatAvatars((prev) => ({ ...prev, aiAvatar: undefined }))}
                >
                  <RotateCcw className="h-4 w-4" />
                  还原
                </Button>
              </div>
            </Card>
          </div>

          <input
            ref={userAlbumInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickAvatarFile('userAvatar')}
          />
          <input
            ref={userCameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={onPickAvatarFile('userAvatar')}
          />
          <input
            ref={aiAlbumInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickAvatarFile('aiAvatar')}
          />
          <input
            ref={aiCameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={onPickAvatarFile('aiAvatar')}
          />
        </Card>

        <Card className="space-y-3 p-4 md:p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">显示与声音</h2>

          <SettingsRow
            icon={<Type className="h-5 w-5 text-primary" />}
            title="字体大小"
            description={settings.fontSize === 'normal' ? '标准字号' : '放大字号'}
            action={(
              <Switch
                checked={settings.fontSize === 'large'}
                onChange={() =>
                  setSettings((prev) => ({
                    ...prev,
                    fontSize: prev.fontSize === 'normal' ? 'large' : 'normal',
                  }))
                }
                ariaLabel="切换字体大小"
              />
            )}
          />

          <SettingsRow
            icon={<Moon className="h-5 w-5 text-primary" />}
            title="深色模式"
            description={settings.darkMode ? '已开启' : '已关闭'}
            action={(
              <Switch
                checked={settings.darkMode}
                onChange={() => setSettings((prev) => ({ ...prev, darkMode: !prev.darkMode }))}
                ariaLabel="切换深色模式"
              />
            )}
          />

          <SettingsRow
            icon={<Volume2 className="h-5 w-5 text-primary" />}
            title="音量"
            description={`当前 ${settings.volume}%`}
            action={(
              <input
                type="range"
                min={0}
                max={100}
                value={settings.volume}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    volume: Number(event.target.value),
                  }))
                }
                className="h-2 w-28 cursor-pointer rounded-full accent-primary"
                aria-label="设置应用音量"
              />
            )}
          />
        </Card>

        <Card className="space-y-3 p-4 md:p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface-variant">关于</h2>

          <SettingsRow
            icon={<Shield className="h-5 w-5 text-primary" />}
            title="内容安全"
            description="实时过滤不适宜内容，保护学习环境。"
            action={<span className="text-xs font-bold text-success">已启用</span>}
          />

          <SettingsRow
            icon={<Info className="h-5 w-5 text-primary" />}
            title="应用版本"
            description="灵犀伴学 Web 端"
            action={<span className="text-xs font-bold text-on-surface-variant">v1.0.0</span>}
          />
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
              正在保存...
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

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-error/20 bg-error-container/15 py-3.5 text-sm font-bold text-error transition-colors hover:bg-error-container/30"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </main>
    </div>
  );
}
