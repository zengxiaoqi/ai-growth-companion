import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCheck,
  Clock,
  Loader2,
  Megaphone,
  Trophy,
  X,
} from '@/icons';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../lib/utils';
import api from '../services/api';
import type { Notification } from '@/types';
import { EmptyState, IconButton } from './ui';

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
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchNotifications = async () => {
      setIsLoading(true);
      try {
        const data = await api.getNotifications(userId);
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } catch {
        // 通知接口失败时不阻断主流程
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [userId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小时前`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} 天前`;

    return date.toLocaleDateString('zh-CN');
  };

  const handleMarkRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // 静默失败，避免影响用户阅读
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead(userId);
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch {
      // 静默失败
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <IconButton aria-label="打开通知" onClick={() => setIsOpen((open) => !open)}>
        <Bell className="h-5 w-5 text-on-secondary-container" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-error text-[10px] font-black text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </IconButton>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="panel-card absolute right-0 top-full z-50 mt-2 w-[min(92vw,24rem)] overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-outline-variant/12 px-4 py-3">
              <h3 className="text-sm font-black text-on-surface">消息通知</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 ? (
                  <button
                    onClick={handleMarkAllRead}
                    className="touch-target inline-flex items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary-container/20"
                  >
                    <CheckCheck className="h-4 w-4" />
                    全部已读
                  </button>
                ) : null}
                <IconButton aria-label="关闭通知" onClick={() => setIsOpen(false)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
            </div>

            <div className="max-h-[24rem] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-3">
                  <EmptyState
                    title="暂无通知"
                    description="有新的学习动态时会第一时间提醒你。"
                    icon={<Bell className="h-6 w-6 text-primary" />}
                  />
                </div>
              ) : (
                notifications.map((notification) => {
                  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;
                  const Icon = config.icon;

                  return (
                    <button
                      key={notification.id}
                      onClick={() => {
                        if (!notification.read) {
                          handleMarkRead(notification.id);
                        }
                      }}
                      className={cn(
                        'w-full border-b border-outline-variant/10 px-4 py-3 text-left transition-colors last:border-b-0',
                        notification.read
                          ? 'bg-transparent opacity-75'
                          : 'bg-primary-container/10 hover:bg-primary-container/18',
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn('mt-0.5', config.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm leading-snug text-on-surface', !notification.read && 'font-black')}>
                            {notification.title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{notification.message}</p>
                          <p className="mt-1.5 text-[11px] font-medium text-outline">{formatTime(notification.createdAt)}</p>
                        </div>
                        {!notification.read ? <span className="mt-2 h-2 w-2 rounded-full bg-primary" /> : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
