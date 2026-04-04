import { useState } from 'react';
import {
  UserCircle,
  Camera,
  Save,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const AVATAR_OPTIONS = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAcJOU_G2u01vuHUYluCZTjtWD4VhAzEtBxbPsOrSC-7zMwek86PYCQeGBRl2ZXSOFDGcbxmFeCbL7JfKhvPeodVjaqpELlu8SN5HeeS4n-mXbX5RXtEpO31539ATVu2GAi4qNYbYpuRG9nEVURqEZLqCqxFRGhVvrilL3XneAJY00kny1l1RaS2eFhdY040n61ZzvlCvLGLAnL-2Tdupnf3ULMkVbu3W7p4MlJiC2zASO8dOINAnwlrkn7sy1OBz-JiCfKjIW7ets',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBlLGatppX-CokggP0QNRHNCvSodc8gLJdgY6KggETyhD4kyAmypkOusYGdCNC9PwJgIbtUlPKrQxYKDasv1Dxl8DSoGeEkyxnSFjtw3DGuErf23Z5TJropXVHxS-3xZ9rsrHdq_a1WIZ9hF7S5FOlxqcSFqzVthNkXLKrVQT_JFULZRoqF6xIGcmN685jFkLiFHD4erKX5EdEySNhZZYCmQcQJclymeyH-W2QAlVKN3O-DHUEP92bMSByk84PsGIvpXdofjrXuoJk',
];

interface ProfileScreenProps {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: ProfileScreenProps) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState(user?.age?.toString() || '');
  const [avatar, setAvatar] = useState(user?.avatar || AVATAR_OPTIONS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.updateUser(user.id, {
        name,
        avatar,
        ...(age ? { age: parseInt(age) } : {}),
      });
      localStorage.setItem('auth_user', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('user-settings-updated', { detail: updated }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setError(err?.message || '保存失败');
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
          <h1 className="text-xl font-bold">个人资料</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Avatar Selection */}
        <section className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15">
          <h2 className="text-lg font-bold mb-6">选择头像</h2>
          <div className="flex justify-center mb-6">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-primary-container flex items-center justify-center relative">
              <img
                alt="User avatar"
                className="w-full h-full object-cover"
                src={avatar}
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-md">
                <Camera className="w-4 h-4 text-on-primary" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {AVATAR_OPTIONS.map((opt, i) => (
              <button
                key={i}
                onClick={() => setAvatar(opt)}
                className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-all ${
                  avatar === opt ? 'border-primary scale-110 shadow-lg' : 'border-outline-variant/30'
                }`}
              >
                <img alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" src={opt} referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        </section>

        {/* Profile Fields */}
        <section className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 space-y-6">
          <h2 className="text-lg font-bold">基本信息</h2>

          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">昵称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface text-on-surface focus:outline-none focus:border-primary transition-colors"
              placeholder="请输入昵称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">年龄</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min={3}
              max={12}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface text-on-surface focus:outline-none focus:border-primary transition-colors"
              placeholder="请输入年龄"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">手机号</label>
            <input
              type="tel"
              value={user?.phone || ''}
              disabled
              className="w-full px-4 py-3 rounded-xl border border-outline-variant/15 bg-surface-container text-on-surface-variant cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">账号类型</label>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-outline-variant/15 bg-surface-container">
              <UserCircle className="w-5 h-5 text-primary" />
              <span className="text-on-surface-variant">{user?.type === 'parent' ? '家长' : '小朋友'}</span>
            </div>
          </div>
        </section>

        {/* Save Button */}
        {error && (
          <div className="text-error text-sm font-medium text-center">{error}</div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-colors ${
            saveSuccess
              ? 'bg-primary-container text-on-primary-container'
              : 'bg-primary text-on-primary hover:opacity-90'
          }`}
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
              保存修改
            </>
          )}
        </motion.button>
      </main>
    </div>
  );
}
