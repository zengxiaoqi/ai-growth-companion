import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Volume2,
  Type,
  Moon,
  Info,
  ChevronRight,
  Shield,
  Save,
  Loader2,
  CheckCircle2,
  Camera,
  ImagePlus,
  Bot,
  User,
  RotateCcw,
} from 'lucide-react';
import { motion } from 'motion/react';
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

interface SettingsScreenProps {
  onBack: () => void;
}

async function compressAvatarFile(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('图片过大，请选择 20MB 以内的照片');
  }

  const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(blob);
    });

  const objectUrl = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('解析图片失败'));
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
  if (!ctx) throw new Error('无法处理图片');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, targetW, targetH);

  const encode = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('图片压缩失败'))),
        'image/jpeg',
        quality,
      );
    });

  const maxBlobSize = 36 * 1024;
  let blob = await encode(0.82);
  if (blob.size > maxBlobSize) blob = await encode(0.7);
  if (blob.size > maxBlobSize) blob = await encode(0.58);
  if (blob.size > 60 * 1024) {
    throw new Error('图片仍然过大，请换一张更清晰度低一些的照片');
  }

  return readAsDataUrl(blob);
}

function AvatarPreview({
  src,
  isAI,
}: {
  src?: string;
  isAI?: boolean;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={isAI ? 'AI头像' : '用户头像'}
        className="h-full w-full rounded-full object-cover"
      />
    );
  }
  return isAI ? (
    <Bot className="w-7 h-7 text-white" />
  ) : (
    <User className="w-7 h-7 text-white" />
  );
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppUISettings>(() =>
    resolveAppUISettings(undefined),
  );
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

  const updateAvatarFromFile = async (
    target: 'userAvatar' | 'aiAvatar',
    file?: File,
  ) => {
    if (!file) return;
    try {
      setError(null);
      const dataUrl = await compressAvatarFile(file);
      setChatAvatars((prev) => ({ ...prev, [target]: dataUrl }));
    } catch (err: any) {
      setError(err?.message || '头像处理失败，请重试');
    }
  };

  const onPickAvatarFile =
    (target: 'userAvatar' | 'aiAvatar') =>
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      await updateAvatarFromFile(target, file);
      event.target.value = '';
    };

  const settingsGroups = useMemo(
    () => [
      {
        title: '显示设置',
        items: [
          {
            icon: Type,
            label: '字体大小',
            description: settings.fontSize === 'normal' ? '标准' : '大号',
            action: (
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    fontSize: prev.fontSize === 'normal' ? 'large' : 'normal',
                  }))
                }
                className={cn(
                  'w-12 h-6 rounded-full relative transition-colors',
                  settings.fontSize === 'large' ? 'bg-primary' : 'bg-outline-variant/30',
                )}
              >
                <div
                  className={cn(
                    'absolute top-1 w-4 h-4 bg-white rounded-full transition-all',
                    settings.fontSize === 'large' ? 'right-1' : 'left-1',
                  )}
                />
              </button>
            ),
          },
          {
            icon: Moon,
            label: '深色模式',
            description: settings.darkMode ? '已开启' : '未开启',
            action: (
              <button
                onClick={() => setSettings((prev) => ({ ...prev, darkMode: !prev.darkMode }))}
                className={cn(
                  'w-12 h-6 rounded-full relative transition-colors',
                  settings.darkMode ? 'bg-primary' : 'bg-outline-variant/30',
                )}
              >
                <div
                  className={cn(
                    'absolute top-1 w-4 h-4 bg-white rounded-full transition-all',
                    settings.darkMode ? 'right-1' : 'left-1',
                  )}
                />
              </button>
            ),
          },
        ],
      },
      {
        title: '音频设置',
        items: [
          {
            icon: Volume2,
            label: '音量',
            description: `${settings.volume}%`,
            action: (
              <input
                type="range"
                min={0}
                max={100}
                value={settings.volume}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, volume: Number(e.target.value) }))
                }
                className="w-24 h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #006384 ${settings.volume}%, #b9ae6e ${settings.volume}%)`,
                }}
              />
            ),
          },
        ],
      },
      {
        title: '关于',
        items: [
          {
            icon: Shield,
            label: '内容安全',
            description: '实时过滤不适内容',
            action: <ChevronRight className="w-5 h-5 text-on-surface-variant" />,
          },
          {
            icon: Info,
            label: '关于灵犀伴学',
            description: 'v1.0.0',
            action: <ChevronRight className="w-5 h-5 text-on-surface-variant" />,
          },
        ],
      },
    ],
    [settings.darkMode, settings.fontSize, settings.volume],
  );

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
        throw new Error('头像数据过大，请重新选择一张更小的图片后再保存');
      }
      const updated = await api.updateUser(user.id, { settings: mergedSettings });
      localStorage.setItem('auth_user', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('user-settings-updated', { detail: updated }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (err: any) {
      setError(err?.message || '保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-surface w-full sticky top-0 z-40">
        <div className="flex items-center gap-4 w-full px-8 py-6 max-w-3xl mx-auto">
          <button
            onClick={onBack}
            className="p-2.5 hover:bg-surface-container-low rounded-xl transition-colors"
            aria-label="返回"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">设置</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/15 overflow-hidden p-5">
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">
            对话头像
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant/20 bg-surface p-4">
              <p className="text-sm font-bold text-on-surface mb-3">我的头像</p>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center overflow-hidden">
                  <AvatarPreview src={userAvatar} />
                </div>
                <div className="text-xs text-on-surface-variant">
                  AI 对话中的“我”将使用这个头像
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => userAlbumInputRef.current?.click()}
                  className="rounded-full bg-primary-container/45 px-3 py-1.5 text-xs font-semibold text-on-primary-container hover:bg-primary-container/60 inline-flex items-center gap-1.5"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  相册
                </button>
                <button
                  onClick={() => userCameraInputRef.current?.click()}
                  className="rounded-full bg-secondary-container/40 px-3 py-1.5 text-xs font-semibold text-on-secondary-container hover:bg-secondary-container/55 inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  拍照
                </button>
                <button
                  onClick={() => setChatAvatars((prev) => ({ ...prev, userAvatar: undefined }))}
                  className="rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  默认
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant/20 bg-surface p-4">
              <p className="text-sm font-bold text-on-surface mb-3">AI 头像</p>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-tertiary flex items-center justify-center overflow-hidden">
                  <AvatarPreview src={aiAvatar} isAI />
                </div>
                <div className="text-xs text-on-surface-variant">
                  AI 对话中的助手头像可自定义
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => aiAlbumInputRef.current?.click()}
                  className="rounded-full bg-primary-container/45 px-3 py-1.5 text-xs font-semibold text-on-primary-container hover:bg-primary-container/60 inline-flex items-center gap-1.5"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  相册
                </button>
                <button
                  onClick={() => aiCameraInputRef.current?.click()}
                  className="rounded-full bg-secondary-container/40 px-3 py-1.5 text-xs font-semibold text-on-secondary-container hover:bg-secondary-container/55 inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  拍照
                </button>
                <button
                  onClick={() => setChatAvatars((prev) => ({ ...prev, aiAvatar: undefined }))}
                  className="rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  默认
                </button>
              </div>
            </div>
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
        </section>

        {settingsGroups.map((group) => (
          <motion.section
            key={group.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-container-lowest rounded-2xl border border-outline-variant/15 overflow-hidden"
          >
            <h2 className="px-6 pt-5 pb-2 text-sm font-bold text-on-surface-variant uppercase tracking-wider">
              {group.title}
            </h2>
            {group.items.map((item, i) => (
              <div
                key={item.label}
                className={cn(
                  'flex items-center justify-between px-6 py-4',
                  i < group.items.length - 1 && 'border-b border-outline-variant/10',
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-on-surface-variant">{item.description}</p>
                  </div>
                </div>
                {item.action}
              </div>
            ))}
          </motion.section>
        ))}

        {error && <p className="text-sm font-medium text-error text-center">{error}</p>}

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            'w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors',
            saveSuccess
              ? 'bg-primary-container text-on-primary-container'
              : 'bg-primary text-on-primary hover:opacity-90',
          )}
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : saveSuccess ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              已保存
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              保存设置
            </>
          )}
        </motion.button>
      </main>
    </div>
  );
}
