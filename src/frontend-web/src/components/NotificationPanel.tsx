import { useState, useEffect, useRef } from 'react';
import {
  Bell,
  X,
  Trophy,
  BookOpen,
  Clock,
  Megaphone,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import api from '../services/api';
import type { Notification } from '@/types';

interface NotificationPanelProps {
  userId: number;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string }> = {
  achievement: { icon: Trophy, color: 'text-tertiary' },
  learning: { icon: BookOpen, color: 'text-primary' },
  reminder: { icon: Clock, color: 'text-secondary' },
  system: { icon: Megaphone, color: 'text-on-surface-variant' },
};

export default function NotificationPanel({ userId }: NotificationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await api.getNotifications(userId);
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch {
        // Silently fail
      }
    };
    if (userId) fetchNotifications();
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleMarkRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead(userId);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 hover:bg-surface-container-low rounded-xl transition-colors relative"
      >
        <Bell className="w-6 h-6 text-on-secondary-container" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-error text-on-error text-[10px] font-black rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full mt-2 w-96 max-h-[480px] bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/15 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
              <h3 className="font-bold text-lg">通知</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs font-medium text-primary hover:opacity-70 transition-opacity flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    全部已读
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-surface-container-high rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto max-h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">暂无通知</p>
                </div>
              ) : (
                notifications.map(notification => {
                  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;
                  const Icon = config.icon;
                  return (
                    <button
                      key={notification.id}
                      onClick={() => !notification.read && handleMarkRead(notification.id)}
                      className={cn(
                        "w-full text-left px-5 py-4 flex gap-3 transition-colors border-b border-outline-variant/5",
                        notification.read
                          ? "opacity-60"
                          : "bg-primary-container/10 hover:bg-primary-container/20"
                      )}
                    >
                      <div className={cn("mt-0.5", config.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm leading-snug", !notification.read && "font-bold")}>
                          {notification.title}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-outline mt-1.5">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
