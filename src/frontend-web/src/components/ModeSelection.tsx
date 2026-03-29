import { useState } from 'react';
import { 
  Rocket, 
  Lock, 
  UserCircle, 
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import type { User } from '@/types';
import { AppMode } from '../App';
import { useAuth } from '../contexts/AuthContext';

interface ModeSelectionProps {
  onSelectMode: (mode: AppMode) => void;
  user?: User | null;
}

export default function ModeSelection({ onSelectMode, user }: ModeSelectionProps) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState<string | null>(null);
  const auth = useAuth();

    const handlePinChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newPin = [...pin];
        newPin[index] = value.slice(-1);
        setPin(newPin);
        setPinError(null);
        
        // Auto-focus next input
        if (value && index < 3) {
            const nextInput = document.getElementById(`pin-${index + 1}`);
            nextInput?.focus();
        }
    };

    
    const handleStudentMode = () => {
        onSelectMode('student');
    };

    const handleParentLogin = () => {
        // Check if the logged-in user is a parent type
        if (!auth.isAuthenticated || user?.type !== 'parent') {
            setPinError('请先登录家长账号');
            return;
        }
        
        onSelectMode('parent');
    };
    
    return (
        <div className="flex flex-col min-h-screen">
            <header className="w-full bg-surface">
                <div className="flex justify-between items-center w-full px-8 py-6 max-w-7xl mx-auto">
                    <h1 className="text-2xl font-bold tracking-tight">灵犀伴学</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-on-surface-variant text-sm font-medium">请选择使用模式</span>
                        <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                            <UserCircle className="w-6 h-6 text-primary" />
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-grow flex items-center justify-center px-6 py-12">
                <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-stretch">
                    {/* Student Mode */}
                    <section className="group relative bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center justify-between text-center overflow-hidden transition-all duration-300 hover:scale-[1.02] shadow-sm">
                        <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary-container/30 rounded-full blur-3xl group-hover:bg-primary-container/50 transition-colors"></div>
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="w-40 h-40 mb-8 rounded-full bg-primary-container flex items-center justify-center shadow-inner border-b-8 border-primary/20">
                                <img 
                                    alt="Mascot" 
                                    className="w-24 h-24" 
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAcJOU_G2u01vuHUYluCZTjtWD4VhAzEtBxbPsOrSC-7zMwek86PYCQeGBRl2ZXSOFDGcbxmFeCbL7JfKhvPeodVjaqpELlu8SN5HeeS4n-mXbX5RXtEpO31539ATVu2GAi4qNYbYpuRG9nEVURqEZLqCqxFRGhVvrilL3XneAJY00kny1l1RaS2eFhdY040n61ZzvlCvLGLAnL-2Tdupnf3ULMkVbu3W7p4MlJiC2zASO8dOINAnwlrkn7sy1OBz-JiCfKjIW7ets"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                            <h2 className="text-4xl font-black tracking-tight text-primary mb-4">宝贝模式</h2>
                            <p className="text-on-surface-variant text-lg leading-relaxed max-w-[280px]">
                                探索有趣的知识，开启快乐的学习旅程！
                            </p>
                        </div>
                        <div className="mt-12 w-full">
                            <button 
                                onClick={handleStudentMode}
                                className="w-full bg-primary text-on-primary py-6 rounded-full font-bold text-xl shadow-tactile active:shadow-tactile-active active:translate-y-[4px] transition-all flex items-center justify-center gap-3 tactile-press"
                            >
                                <span>进入游乐园</span>
                                <Rocket className="w-6 h-6 fill-current" />
                            </button>
                        </div>
                    </section>

                    {/* Parent Mode */}
                    <section className="group relative bg-on-secondary-container rounded-lg p-10 flex flex-col items-center justify-between text-center overflow-hidden transition-all duration-300 border border-outline-variant/10">
                        <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary-container/30 rounded-full blur-3xl group-hover:bg-primary-container/50 transition-colors"></div>
                        <div className="relative z-10 flex flex-col items-center w-full">
                            <div className="w-40 h-40 mb-8 rounded-2xl bg-on-secondary/10 flex items-center justify-center shadow-inner border-b-8 border-on-secondary/20">
                                <TrendingUp className="w-16 h-16 text-on-secondary stroke-[1.5px]" />
                            </div>
                            <h2 className="text-3xl font-bold tracking-tight text-on-secondary mb-4">家长控制中心</h2>
                            <p className="text-secondary-fixed-dim text-md leading-relaxed mb-10 max-w-[300px] opacity-80">
                                查看学习进度、设置学习时间及管理课程内容。
                            </p>
                            
                            <div className="w-full space-y-4">
                                <label className="block text-secondary-container text-sm font-medium uppercase tracking-widest">请输入家长管理密码</label>
                                <div className="flex justify-center gap-4">
                                    {pin.map((digit, i) => (
                                        <input
                                            key={i}
                                            id={`pin-${i}`}
                                            className="w-14 h-16 bg-on-secondary/10 border-b-2 border-secondary-container text-on-secondary text-2xl text-center focus:ring-0 focus:border-on-secondary transition-colors rounded-t-md"
                                            maxLength={1}
                                            type="password"
                                            value={digit}
                                            onChange={(e) => handlePinChange(i, e.target.value)}
                                        />
                                    ))}
                                </div>
                                {pinError && (
                                    <div className="flex items-center justify-center gap-2 text-error text-sm font-medium">
                                        <AlertCircle className="w-4 h-4" />
                                        {pinError}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-12 w-full">
                            <button 
                                onClick={handleParentLogin}
                                className="w-full bg-on-secondary text-on-secondary-container py-5 rounded-lg font-bold text-lg hover:bg-secondary-container transition-colors flex items-center justify-center gap-3 tactile-press"
                            >
                                <span>验证并进入</span>
                                <Lock className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => auth.logout()}
                                className="mt-4 text-secondary-container/60 text-sm font-medium hover:text-on-secondary transition-colors"
                            >
                                忘记密码？
                            </button>
                        </div>
                    </section>
                </div>
            </main>

            <footer className="w-full h-32 flex items-end justify-center pointer-events-none overflow-hidden">
                <div className="flex gap-4 opacity-10 translate-y-8">
                    <div className="w-32 h-32 bg-primary rounded-full"></div>
                    <div className="w-48 h-48 bg-secondary rounded-full -translate-y-12"></div>
                    <div className="w-32 h-32 bg-tertiary rounded-full"></div>
                </div>
            </footer>
        </div>
    );
}