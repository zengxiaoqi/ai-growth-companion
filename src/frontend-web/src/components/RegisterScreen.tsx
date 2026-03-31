import { useState } from 'react';
import { Phone, Lock, User, Calendar, Users, Loader2, Eye, EyeOff } from 'lucide-react';
import type { RegisterRequest } from '@/types';

interface RegisterScreenProps {
  onRegister: (data: RegisterRequest) => Promise<void>;
  onSwitchToLogin: () => void;
  error: string | null;
  isLoading: boolean;
}

export default function RegisterScreen({ onRegister, onSwitchToLogin, error, isLoading }: RegisterScreenProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'parent' | 'child'>('parent');
  const [age, setAge] = useState<number | undefined>(undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }
    await onRegister({
      phone,
      password,
      name,
      type,
      age: type === 'child' ? age : undefined,
    });
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
      <main className="flex-grow flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-primary mb-2">创建账号</h2>
            <p className="text-on-surface-variant">加入灵犀伴学，开启成长之旅</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
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
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-3 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
                  required
                  pattern="1[3-9]\d{9}"
                  maxLength={11}
                />
              </div>
            </div>

            {/* Name Input */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-on-surface-variant px-1">
                姓名
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入姓名"
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-3 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
                  required
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
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请设置密码（至少6位）"
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-3 pl-12 pr-12 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-on-surface-variant px-1">
                确认密码
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入密码"
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-3 pl-12 pr-12 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label={showConfirm ? '隐藏密码' : '显示密码'}
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Account Type */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-on-surface-variant px-1">
                账号类型
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Users className="w-5 h-5" />
                </div>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'parent' | 'child')}
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-3 pl-12 pr-4 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors appearance-none cursor-pointer"
                >
                  <option value="parent">家长</option>
                  <option value="child">孩子</option>
                </select>
              </div>
            </div>

            {/* Age (only for child) */}
            {type === 'child' && (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-on-surface-variant px-1">
                  年龄
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <input
                    type="number"
                    value={age ?? ''}
                    onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="请输入年龄"
                    className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl py-3 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
                    min={3}
                    max={12}
                    required
                  />
                </div>
              </div>
            )}

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
                  注册中...
                </>
              ) : (
                '注册'
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-on-surface-variant">
              已有账号？
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="ml-2 text-primary font-bold hover:underline"
              >
                立即登录
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
