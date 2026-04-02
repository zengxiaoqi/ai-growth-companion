import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, X, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../services/api';

interface EmergencyCallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  childId: number;
  childName: string;
}

type DialogState = 'idle' | 'countdown' | 'calling' | 'success' | 'error';

export default function EmergencyCallDialog({ isOpen, onClose, childId, childName }: EmergencyCallDialogProps) {
  const [state, setState] = useState<DialogState>('idle');
  const [countdown, setCountdown] = useState(5);
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setState('idle');
      setCountdown(5);
      setErrorMsg('');
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  const handleTrigger = useCallback(async () => {
    setState('calling');
    try {
      await api.triggerEmergencyCall(childId);
      setState('success');
      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.message || '呼叫失败，请重试');
      setState('error');
    }
  }, [childId, onClose]);

  const startCountdown = () => {
    setState('countdown');
    setCountdown(5);

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTrigger();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && state !== 'calling' && onClose()}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="bg-surface-container-lowest rounded-3xl p-8 mx-6 max-w-sm w-full shadow-2xl text-center"
          >
            {/* idle: show call button */}
            {state === 'idle' && (
              <>
                <div className="w-24 h-24 mx-auto mb-6 bg-error/10 rounded-full flex items-center justify-center">
                  <Phone className="w-12 h-12 text-error" />
                </div>
                <h2 className="text-2xl font-bold text-on-surface mb-2">紧急呼叫</h2>
                <p className="text-on-surface-variant mb-8 text-lg">呼叫爸爸妈妈</p>
                <button
                  onClick={startCountdown}
                  className="w-full py-5 rounded-2xl bg-error text-white text-xl font-bold shadow-lg active:scale-95 transition-transform tactile-press border-b-4 border-error-dim"
                >
                  呼叫爸爸妈妈
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 mt-3 rounded-2xl text-on-surface-variant text-lg font-medium hover:bg-surface-container-high transition-colors"
                >
                  取消
                </button>
              </>
            )}

            {/* countdown: show timer */}
            {state === 'countdown' && (
              <>
                <div className="w-32 h-32 mx-auto mb-6 bg-error/10 rounded-full flex items-center justify-center relative">
                  <motion.div
                    key={countdown}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-6xl font-black text-error"
                  >
                    {countdown}
                  </motion.div>
                </div>
                <h2 className="text-2xl font-bold text-on-surface mb-2">即将呼叫</h2>
                <p className="text-on-surface-variant mb-8 text-lg">
                  {countdown} 秒后通知爸爸妈妈
                </p>
                <button
                  onClick={cancelCountdown}
                  className="w-full py-5 rounded-2xl bg-surface-container-high text-on-surface text-xl font-bold active:scale-95 transition-transform"
                >
                  取消
                </button>
              </>
            )}

            {/* calling: show loading */}
            {state === 'calling' && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-24 h-24 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center"
                >
                  <Phone className="w-12 h-12 text-primary" />
                </motion.div>
                <h2 className="text-2xl font-bold text-on-surface mb-2">正在呼叫</h2>
                <p className="text-on-surface-variant text-lg flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  正在通知爸爸妈妈...
                </p>
              </>
            )}

            {/* success */}
            {state === 'success' && (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="w-24 h-24 mx-auto mb-6 bg-primary-container rounded-full flex items-center justify-center"
                >
                  <CheckCircle className="w-12 h-12 text-on-primary-container" />
                </motion.div>
                <h2 className="text-2xl font-bold text-on-surface mb-2">通知成功</h2>
                <p className="text-on-surface-variant text-lg">已经通知爸爸妈妈了！</p>
              </>
            )}

            {/* error */}
            {state === 'error' && (
              <>
                <div className="w-24 h-24 mx-auto mb-6 bg-error/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-12 h-12 text-error" />
                </div>
                <h2 className="text-2xl font-bold text-on-surface mb-2">呼叫失败</h2>
                <p className="text-on-surface-variant text-lg mb-6">{errorMsg}</p>
                <button
                  onClick={onClose}
                  className="w-full py-5 rounded-2xl bg-surface-container-high text-on-surface text-xl font-bold active:scale-95 transition-transform"
                >
                  关闭
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
