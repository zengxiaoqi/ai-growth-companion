import { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Loader2, ArrowLeft } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useReducedMotion } from './hooks/useReducedMotion';
import ModeSelection from './components/ModeSelection';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import GameRenderer from './components/games/GameRenderer';
import type { Assignment, ActivityResult } from './types';
import api from './services/api';

const ParentDashboard = lazy(() => import('./components/parent'));
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const ContentDetail = lazy(() => import('./components/ContentDetail'));
const AchievementShowcase = lazy(() => import('./components/AchievementShowcase'));
const ProfileScreen = lazy(() => import('./components/ProfileScreen'));
const SettingsScreen = lazy(() => import('./components/SettingsScreen'));
const AIChat = lazy(() => import('./components/AIChat'));

export type AppMode = 'selection' | 'parent' | 'student';
type View = 'login' | 'register' | 'selection' | 'parent' | 'student' | 'content-detail' | 'achievements' | 'profile' | 'settings' | 'companion' | 'assignment';

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-on-surface-variant text-sm">加载中...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, isAuthenticated, isLoading: authLoading, error, login, register, clearError } = useAuth();
  const [view, setView] = useState<View>('login');
  const [selectedContentId, setSelectedContentId] = useState<number | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isAssignmentCompleted, setIsAssignmentCompleted] = useState(false);
  const reducedMotion = useReducedMotion();

  const viewTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.3 };

  const slideTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.4, ease: "easeOut" as const };

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
              transition={viewTransition}
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
              transition={viewTransition}
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
            transition={viewTransition}
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
            transition={slideTransition}
          >
            <Suspense fallback={<PageLoader />}>
              <ParentDashboard onBack={() => setView('selection')} />
            </Suspense>
          </motion.div>
        )}

        {view === 'student' && (
          <motion.div
            key="student"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.5, type: "spring", damping: 20 }}
          >
            <Suspense fallback={<PageLoader />}>
              <StudentDashboard
              onBack={() => setView('selection')}
              onOpenContent={(contentId: number) => {
                setSelectedContentId(contentId);
                setView('content-detail');
              }}
              onOpenAchievements={() => setView('achievements')}
              onOpenProfile={() => setView('profile')}
              onOpenSettings={() => setView('settings')}
              onOpenCompanion={() => setView('companion')}
              onOpenAssignment={(assignment) => {
                setSelectedAssignment(assignment);
                setIsAssignmentCompleted(false);
                setView('assignment');
              }}
            />
            </Suspense>
          </motion.div>
        )}

        {view === 'content-detail' && selectedContentId && (
          <motion.div
            key="content-detail"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={slideTransition}
          >
            <Suspense fallback={<PageLoader />}>
            <ContentDetail
              contentId={selectedContentId}
              childId={user?.type === 'child' ? user.id : undefined}
              onBack={() => {
                setSelectedContentId(null);
                setView('student');
              }}
              onComplete={() => {
                // Could refresh dashboard data here
              }}
            />
            </Suspense>
          </motion.div>
        )}

        {view === 'assignment' && selectedAssignment && (
          <motion.div
            key="assignment"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={slideTransition}
          >
            <div className="min-h-screen bg-background">
              <div className="sticky top-0 z-10 bg-surface-container-lowest/95 backdrop-blur-sm border-b border-outline-variant/15 px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedAssignment(null);
                    setView('student');
                  }}
                  className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-on-surface" />
                </button>
                <h2 className="font-bold text-on-surface">{selectedAssignment.activityType}练习</h2>
              </div>
              <GameRenderer
                type={selectedAssignment.activityType}
                data={selectedAssignment.activityData ?? { type: selectedAssignment.activityType, title: '练习' }}
                onComplete={async (result: ActivityResult) => {
                  try {
                    await api.completeAssignment(selectedAssignment.id, result);
                  } catch {
                    // Silently handle — game was still completed locally
                  }
                  setIsAssignmentCompleted(true);
                }}
              />
              {isAssignmentCompleted && (
                <div className="max-w-lg mx-auto px-4 pb-6">
                  <button
                    onClick={() => {
                      setIsAssignmentCompleted(false);
                      setSelectedAssignment(null);
                      setView('student');
                    }}
                    className="w-full bg-primary text-on-primary py-3 rounded-full font-bold shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press min-h-[48px]"
                  >
                    返回主页
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === 'achievements' && (
          <motion.div
            key="achievements"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={slideTransition}
          >
            <Suspense fallback={<PageLoader />}>
            <AchievementShowcase
              userId={user?.id ?? 0}
              onBack={() => setView('student')}
            />
            </Suspense>
          </motion.div>
        )}

        {view === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={slideTransition}
          >
            <Suspense fallback={<PageLoader />}>
            <ProfileScreen onBack={() => setView('student')} />
            </Suspense>
          </motion.div>
        )}

        {view === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={slideTransition}
          >
            <Suspense fallback={<PageLoader />}>
            <SettingsScreen onBack={() => setView('student')} />
            </Suspense>
          </motion.div>
        )}

        {view === 'companion' && (
          <motion.div
            key="companion"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={viewTransition}
            className="min-h-screen"
          >
            <Suspense fallback={<PageLoader />}>
              <AIChat childId={user?.type === 'child' ? user.id : undefined} fullPage onBack={() => setView('student')} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Security Badge (Visible in Selection & Student) */}
      {view !== 'parent' && view !== 'login' && view !== 'register' && view !== 'achievements' && view !== 'companion' && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 px-5 py-2 bg-surface-container-low/90 backdrop-blur-sm rounded-full border border-outline-variant/15 flex items-center gap-2 shadow-lg z-30 pointer-events-none"
        >
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-on-surface-variant text-xs font-medium">由灵犀安全卫士实时守护您的孩子</span>
        </motion.div>
      )}

      {/* Global Floating AI Chat — available on all authenticated views except full-page companion */}
      {view !== 'companion' && view !== 'login' && view !== 'register' && (
        <Suspense fallback={null}>
          <AIChat childId={user?.type === 'child' ? user.id : undefined} />
        </Suspense>
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
