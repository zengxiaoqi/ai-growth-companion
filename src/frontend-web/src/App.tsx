import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ParentDashboard from './components/ParentDashboard';
import StudentDashboard from './components/StudentDashboard';
import ModeSelection from './components/ModeSelection';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';

export type AppMode = 'selection' | 'parent' | 'student';
type View = 'login' | 'register' | 'selection' | 'parent' | 'student';

function AppContent() {
  const { user, isAuthenticated, isLoading: authLoading, error, login, register, clearError } = useAuth();
  const [view, setView] = useState<View>('login');

  // When user becomes authenticated, go to selection
  useEffect(() => {
    if (isAuthenticated && (view === 'login' || view === 'register')) {
      setView('selection');
    }
  }, [isAuthenticated, view]);

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-on-surface-variant font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login or register
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <AnimatePresence mode="wait">
          {view === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <LoginScreen
                onLogin={async (phone, password) => {
                  await login({ phone, password });
                }}
                onSwitchToRegister={() => {
                  clearError();
                  setView('register');
                }}
                error={error}
                isLoading={authLoading}
              />
            </motion.div>
          )}

          {view === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <RegisterScreen
                onRegister={async (data) => {
                  await register(data);
                }}
                onSwitchToLogin={() => {
                  clearError();
                  setView('login');
                }}
                error={error}
                isLoading={authLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Authenticated - show main app
  return (
    <div className="min-h-screen bg-background selection:bg-primary-container">
      <AnimatePresence mode="wait">
        {view === 'selection' && (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ModeSelection 
              onSelectMode={(mode) => setView(mode as View)}
              user={user}
            />
          </motion.div>
        )}

        {view === 'parent' && (
          <motion.div
            key="parent"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <ParentDashboard onBack={() => setView('selection')} />
          </motion.div>
        )}

        {view === 'student' && (
          <motion.div
            key="student"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5, type: "spring", damping: 20 }}
          >
            <StudentDashboard onBack={() => setView('selection')} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Security Badge (Visible in Selection & Student) */}
      {view !== 'parent' && view !== 'login' && view !== 'register' && (
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

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
