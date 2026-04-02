import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';

interface ConnectionGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function ConnectionGame({ data, onComplete }: ConnectionGameProps) {
  const leftItems = data.leftItems || [];
  const rightItems = data.rightItems || [];
  const connections: { left: string; right: string }[] = data.connections || [];

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [userConnections, setUserConnections] = useState<Map<string, string>>(new Map());
  const [isFinished, setIsFinished] = useState(false);

  const handleLeftClick = useCallback((id: string) => {
    setSelectedLeft((prev) => prev === id ? null : id);
  }, []);

  const handleRightClick = useCallback((id: string) => {
    if (!selectedLeft) return;
    setUserConnections((prev) => {
      const next = new Map(prev);
      // Remove any existing connection from this left item or to this right item
      for (const [k, v] of next) {
        if (k === selectedLeft || v === id) next.delete(k);
      }
      next.set(selectedLeft, id);
      return next;
    });
    setSelectedLeft(null);
  }, [selectedLeft]);

  const handleCheck = useCallback(() => {
    let correct = 0;
    for (const conn of connections) {
      if (userConnections.get(conn.left) === conn.right) correct++;
    }
    setIsFinished(true);
    onComplete({
      score: correct,
      totalQuestions: connections.length,
      correctAnswers: correct,
      interactionData: { userConnections: Object.fromEntries(userConnections) },
    });
  }, [connections, userConnections, onComplete]);

  const isRightConnected = (id: string) => {
    for (const [, v] of userConnections) {
      if (v === id) return true;
    }
    return false;
  };

  const getConnectedRight = (leftId: string) => userConnections.get(leftId);

  if (leftItems.length === 0) return <div className="p-4 text-on-surface-variant">暂无题目</div>;
  if (isFinished) {
    const correct = connections.filter((c) => userConnections.get(c.left) === c.right).length;
    return <GameCompletionScreen score={correct} total={connections.length} />;
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="text-center">
        <h3 className="font-black text-on-surface text-lg">{data.title}</h3>
        <p className="text-sm text-on-surface-variant">
          {selectedLeft ? '点击右侧进行配对' : '先点击左侧，再点击右侧配对'}
        </p>
      </div>

      {/* Mobile: stacked layout (default), Desktop: side-by-side (md:) */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        {/* Left column */}
        <div className="flex-1 space-y-3">
          {leftItems.map((item: any) => {
            const isSelected = selectedLeft === item.id;
            const connected = getConnectedRight(item.id);
            return (
              <motion.button key={item.id}
                onClick={() => handleLeftClick(item.id)}
                whileTap={{ scale: 0.95 }}
                aria-label={`左侧: ${item.label}${connected ? '（已配对）' : isSelected ? '（已选中）' : ''}`}
                className={cn(
                  'w-full p-4 rounded-2xl border-2 text-center font-bold transition-all flex items-center gap-2 justify-center min-h-[52px]',
                  isSelected && 'border-primary bg-primary-container text-on-primary-container ring-2 ring-primary ring-offset-2',
                  connected && !isSelected && 'border-[#4caf50] bg-[#e8f5e9]/50 text-on-surface',
                  !isSelected && !connected && 'border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:border-primary/50',
                )}>
                {item.emoji && <span className="text-xl">{item.emoji}</span>}
                <span>{item.label}</span>
                {connected && <Link2 className="w-4 h-4 text-[#4caf50] ml-auto" />}
              </motion.button>
            );
          })}
        </div>

        {/* Center connection indicator */}
        <div className="flex md:flex-col items-center justify-center py-2 md:py-8">
          <Link2 className="w-8 h-8 text-primary/30 md:rotate-0 rotate-90" />
        </div>

        {/* Right column */}
        <div className="flex-1 space-y-3">
          {rightItems.map((item: any) => {
            const connected = isRightConnected(item.id);
            return (
              <motion.button key={item.id}
                onClick={() => handleRightClick(item.id)}
                whileTap={{ scale: 0.95 }}
                disabled={!selectedLeft && !connected}
                aria-label={`右侧: ${item.label}${connected ? '（已配对）' : ''}`}
                className={cn(
                  'w-full p-4 rounded-2xl border-2 text-center font-bold transition-all min-h-[52px]',
                  connected && 'border-[#4caf50] bg-[#e8f5e9]/50 text-on-surface',
                  !connected && selectedLeft && 'border-primary/30 bg-surface-container-lowest text-on-surface hover:border-primary/50 hover:bg-primary-container/10',
                  !connected && !selectedLeft && 'border-outline-variant/30 bg-surface-container text-on-surface-variant',
                )}>
                {item.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <AnimatePresence>
        {userConnections.size >= connections.length && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={handleCheck}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-2 min-h-[48px]">
              提交答案 <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
