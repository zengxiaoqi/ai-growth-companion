/**
 * Text overlay on top of animation canvas.
 * Shows narration and on-screen text with child-friendly styling.
 */
import { motion, AnimatePresence } from 'motion/react';

interface SceneOverlayProps {
  onScreenText?: string;
  narration?: string;
  showNarration: boolean;
}

export default function SceneOverlay({ onScreenText, narration, showNarration }: SceneOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
      {/* Top: on-screen text */}
      <AnimatePresence>
        {onScreenText && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="self-start rounded-lg bg-surface/90 px-3 py-1.5 backdrop-blur-sm"
          >
            <span className="text-base font-bold text-on-surface">{onScreenText}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom: narration */}
      <AnimatePresence>
        {showNarration && narration && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="self-end max-w-[80%] rounded-lg bg-surface-container/90 px-3 py-2 backdrop-blur-sm"
          >
            <span className="text-sm text-on-surface-variant">{narration}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
