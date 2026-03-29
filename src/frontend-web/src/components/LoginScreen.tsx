import { useState } from 'react';
import { Phone, Lock, Loader2 } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (phone: string, password: string) => Promise<void>;
  onSwitchToRegister: () => void;
  error: string | null;
  isLoading: boolean;
}

export default function LoginScreen({ onLogin, onSwitchToRegister, error, isLoading }: LoginScreenProps) {
  const [phone, setPhone] = useState('13800000001');
  const [password, setPassword] = useState('password123');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(phone, password);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="w-full bg-surface">
        <div className="flex justify-center items-center w-full px-8 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-primary">灵犀伴学</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Title */}
          <div className="text-center mb-10">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary-container flex items-center justify-center shadow-inner border-b-8 border-primary/20">
              <img 
                alt="Mascot" 
                className="w-16 h-16" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAcJOU_G2u01vuHUYluCZTjtWD4VhAzEtBxbPsOrSC-7zMwek86PYCQeGBRl2ZXSOFDGcbxmFeCbL7JfKhvPeodVjaqpELlu8SN5HeeS4n-mXbX5RXtEpO31539ATVu2GAi4qNYbYpuRG9nEVURqEZLqCqxFRGhVvrilL3XneAJY00kny1l1RaS2eFhdY040n61ZzvlCvLGLAnL-2Tdupnf3ULMkVbu3W7p4MlJiC2zASO8dOINAnwlrkn7sy1OBz-JiCfKjIW7ets"
                referrerPolicy="no-referrer"
              />
            </div>
            <h2 className="text-3xl font-black text-primary mb-2">欢迎回来</h2>
            <p className="text-on-surface-variant">登录您的账号继续学习之旅</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Phone Input */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-on-surface-variant px-1">
                手机号码
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-0 transition-colors"
                  required
                  pattern="1[3-9]\d{9}"
                  maxLength={11}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-on-surface-variant px-1">
                密码
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-0 transition-colors"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-error-container/20 border border-error/30 rounded-xl p-4 text-error text-sm font-medium">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-on-primary py-5 rounded-full font-bold text-xl shadow-tactile active:shadow-tactile-active active:translate-y-[4px] transition-all flex items-center justify-center gap-3 tactile-press disabled:opacity-60 disabled:cursor-not-allowed disabled:active:translate-y-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </button>
          </form>

          {/* Register Link */}
          <div className="mt-8 text-center">
            <p className="text-on-surface-variant">
              还没有账号？
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="ml-2 text-primary font-bold hover:underline"
              >
                注册新账号
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
