import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Rocket, 
  Lock, 
  ChevronRight,
  LayoutDashboard,
  Baby,
  Settings,
  Bell,
  Timer,
  ShieldCheck,
  Eye,
  ArrowRight,
  BookOpen,
  Gamepad2,
  ClipboardList,
  Trophy,
  Zap,
  UserCircle
} from 'lucide-react';
import { cn } from './lib/utils';
import ParentDashboard from './components/ParentDashboard';
import StudentDashboard from './components/StudentDashboard';
import ModeSelection from './components/ModeSelection';

export type AppMode = 'selection' | 'parent' | 'student';

export default function App() {
  const [mode, setMode] = useState<AppMode>('selection');

  return (
    <div className="min-h-screen bg-background selection:bg-primary-container">
      <AnimatePresence mode="wait">
        {mode === 'selection' && (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ModeSelection onSelectMode={setMode} />
          </motion.div>
        )}

        {mode === 'parent' && (
          <motion.div
            key="parent"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <ParentDashboard onBack={() => setMode('selection')} />
          </motion.div>
        )}

        {mode === 'student' && (
          <motion.div
            key="student"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5, type: "spring", damping: 20 }}
          >
            <StudentDashboard onBack={() => setMode('selection')} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Security Badge (Visible in Selection & Student) */}
      {mode !== 'parent' && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-surface-container-low rounded-full border border-outline-variant/15 flex items-center gap-3 shadow-xl z-50 pointer-events-none"
        >
          <Shield className="w-5 h-5 text-primary" />
          <span className="text-on-surface text-sm font-medium">由灵犀安全卫士实时守护您的孩子</span>
        </motion.div>
      )}
    </div>
  );
}
