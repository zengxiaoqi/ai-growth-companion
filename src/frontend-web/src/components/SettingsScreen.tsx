import { useState } from 'react';
import {
  ArrowLeft,
  Volume2,
  Type,
  Moon,
  Info,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface SettingsScreenProps {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [volume, setVolume] = useState(80);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [darkMode, setDarkMode] = useState(false);

  const settingsGroups = [
    {
      title: '显示设置',
      items: [
        {
          icon: Type,
          label: '字体大小',
          description: fontSize === 'normal' ? '标准' : '大号',
          action: (
            <button
              onClick={() => setFontSize(f => f === 'normal' ? 'large' : 'normal')}
              className={cn(
                "w-12 h-6 rounded-full relative transition-colors",
                fontSize === 'large' ? "bg-primary" : "bg-outline-variant/30"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                fontSize === 'large' ? "right-1" : "left-1"
              )} />
            </button>
          ),
        },
        {
          icon: Moon,
          label: '深色模式',
          description: darkMode ? '已开启' : '未开启',
          action: (
            <button
              onClick={() => setDarkMode(d => !d)}
              className={cn(
                "w-12 h-6 rounded-full relative transition-colors",
                darkMode ? "bg-primary" : "bg-outline-variant/30"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                darkMode ? "right-1" : "left-1"
              )} />
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
          description: `${volume}%`,
          action: (
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-24 h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #006384 ${volume}%, #b9ae6e ${volume}%)`,
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
  ];

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
                  "flex items-center justify-between px-6 py-4",
                  i < group.items.length - 1 && "border-b border-outline-variant/10"
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
      </main>
    </div>
  );
}
