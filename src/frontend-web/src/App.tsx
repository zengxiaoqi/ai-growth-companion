import { useEffect, useMemo, useState, lazy, Suspense, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Shield, Loader2, ArrowLeft } from '@/icons';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import ModeSelection from './components/ModeSelection';
import GameRenderer from './components/games/GameRenderer';
import type { ActivityResult, Assignment } from './types';
import api from './services/api';
import { applyAppUISettings, resolveAppUISettings } from './lib/app-settings';
import { AppToastProvider } from './components/ui';
import { normalizeActivityData, normalizeActivityType } from './components/ai-chat/activity-normalizer';

const ParentDashboard = lazy(() => import('./components/parent'));
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const ContentDetail = lazy(() => import('./components/ContentDetail'));
const StructuredLessonView = lazy(() => import('./components/StructuredLessonView'));
const AchievementShowcase = lazy(() => import('./components/AchievementShowcase'));
const ProfileScreen = lazy(() => import('./components/ProfileScreen'));
const SettingsScreen = lazy(() => import('./components/SettingsScreen'));
const AIChat = lazy(() => import('./components/AIChat'));
const AIChatPage = lazy(() => import('./components/AIChatPage'));

export type AppMode = 'selection' | 'parent' | 'student';

function PageLoader({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="min-h-app flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to="/mode" replace />;
  return <>{children}</>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const navigate = useNavigate();
  const { login, error, isLoading, clearError } = useAuth();

  return (
    <LoginScreen
      onLogin={async (phone, password) => {
        await login({ phone, password });
        navigate('/mode', { replace: true });
      }}
      onSwitchToRegister={() => {
        clearError();
        navigate('/register');
      }}
      error={error}
      isLoading={isLoading}
    />
  );
}

function RegisterRoute() {
  const navigate = useNavigate();
  const { register, error, isLoading, clearError } = useAuth();

  return (
    <RegisterScreen
      onRegister={async (data) => {
        await register(data);
        navigate('/mode', { replace: true });
      }}
      onSwitchToLogin={() => {
        clearError();
        navigate('/login');
      }}
      error={error}
      isLoading={isLoading}
    />
  );
}

function ModeRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <ModeSelection
      user={user}
      onSelectMode={(mode) => navigate(mode === 'parent' ? '/parent' : '/student')}
    />
  );
}

function StudentHomeRoute() {
  const navigate = useNavigate();
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isAssignmentCompleted, setIsAssignmentCompleted] = useState(false);

  if (selectedAssignment) {
    const resolvedType = normalizeActivityType(selectedAssignment.activityType, selectedAssignment.activityData);
    const resolvedData = normalizeActivityData(
      resolvedType,
      selectedAssignment.activityData ?? { type: resolvedType, title: '练习' },
    );

    return (
      <div className="min-h-app bg-background">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-outline-variant/15 bg-surface-container-lowest/95 px-4 py-3 backdrop-blur-sm">
          <button
            onClick={() => {
              setSelectedAssignment(null);
              setIsAssignmentCompleted(false);
            }}
            className="touch-target rounded-full p-2 transition-colors hover:bg-surface-container-high"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5 text-on-surface" />
          </button>
          <h2 className="font-bold text-on-surface">{resolvedType}练习</h2>
        </div>

        <GameRenderer
          type={resolvedType}
          data={resolvedData}
          onComplete={async (result: ActivityResult) => {
            try {
              await api.completeAssignment(selectedAssignment.id, result);
            } catch {
              // Completed locally even if upload fails.
            }
            setIsAssignmentCompleted(true);
          }}
        />

        {isAssignmentCompleted && (
          <div className="mx-auto max-w-lg px-4 pb-safe pb-6">
            <button
              onClick={() => {
                setIsAssignmentCompleted(false);
                setSelectedAssignment(null);
              }}
              className="w-full touch-target rounded-full bg-primary py-3 font-bold text-on-primary shadow-tactile transition-all active:translate-y-1 active:shadow-tactile-active"
            >
              返回主页
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <StudentDashboard
        onBack={() => navigate('/mode')}
        onOpenContent={(contentId) => navigate(`/student/content/${contentId}`)}
        onOpenAchievements={() => navigate('/student/achievements')}
        onOpenSettings={() => navigate('/student/settings')}
        onOpenCompanion={() => navigate('/student/companion')}
        onOpenAssignment={(assignment) => {
          setSelectedAssignment(assignment);
          setIsAssignmentCompleted(false);
        }}
      />
    </Suspense>
  );
}

function StudentContentRoute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const contentId = Number(id);
  const childId = user?.type === 'child' ? user.id : undefined;

  if (!Number.isFinite(contentId) || contentId <= 0) {
    return <Navigate to="/student" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <ContentDetailRouter
        contentId={contentId}
        childId={childId}
        onBack={() => navigate('/student')}
        onComplete={() => {}}
      />
    </Suspense>
  );
}

function ContentDetailRouter({ contentId, childId, onBack, onComplete }: {
  contentId: number;
  childId?: number;
  onBack: () => void;
  onComplete: (record: any) => void;
}) {
  const [isStructured, setIsStructured] = useState<boolean | null>(null);

  useEffect(() => {
    api.getContent(contentId).then((content) => {
      const data = typeof content.content === 'string' ? JSON.parse(content.content) : content.content;
      setIsStructured(data?.type === 'structured_lesson');
    }).catch(() => {
      setIsStructured(false);
    });
  }, [contentId]);

  if (isStructured === null) return <PageLoader />;

  if (isStructured) {
    return (
      <StructuredLessonView
        contentId={contentId}
        childId={childId}
        onBack={onBack}
      />
    );
  }

  return (
    <ContentDetail
      contentId={contentId}
      childId={childId}
      onBack={onBack}
      onComplete={onComplete}
    />
  );
}

function StudentAchievementsRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <Suspense fallback={<PageLoader />}>
      <AchievementShowcase userId={user?.id ?? 0} onBack={() => navigate('/student')} />
    </Suspense>
  );
}

function StudentProfileRoute() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<PageLoader />}>
      <ProfileScreen onBack={() => navigate('/student')} />
    </Suspense>
  );
}

function StudentSettingsRoute() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<PageLoader />}>
      <SettingsScreen
        onBack={() => navigate('/student')}
        onOpenProfile={() => navigate('/student/profile')}
        onOpenAchievements={() => navigate('/student/achievements')}
      />
    </Suspense>
  );
}

function StudentCompanionRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const childId = user?.type === 'child' ? user.id : undefined;

  return (
    <Suspense fallback={<PageLoader />}>
      <AIChatPage childId={childId} onBack={() => navigate('/student')} />
    </Suspense>
  );
}

function ParentRoute() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<PageLoader />}>
      <ParentDashboard onBack={() => navigate('/mode')} />
    </Suspense>
  );
}

function ParentContentRoute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const contentId = Number(id);

  if (!Number.isFinite(contentId) || contentId <= 0) {
    return <Navigate to="/parent" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <ContentDetailRouter
        contentId={contentId}
        onBack={() => navigate('/parent')}
        onComplete={() => {}}
      />
    </Suspense>
  );
}

function ProtectedShell() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    applyAppUISettings(resolveAppUISettings(user?.settings as Record<string, unknown> | undefined));
  }, [user?.settings]);

  const hideSecurityBadge = useMemo(() => {
    const path = location.pathname;
    return path.startsWith('/parent') || path.startsWith('/student/achievements') || path.startsWith('/student/companion');
  }, [location.pathname]);

  const showFloatingChat = useMemo(() => {
    const path = location.pathname;
    return !path.startsWith('/parent') && !path.startsWith('/student/companion');
  }, [location.pathname]);

  const childId = user?.type === 'child' ? user.id : undefined;

  return (
    <div className="min-h-app bg-background selection:bg-primary-container">
      <Routes>
        <Route path="/mode" element={<ModeRoute />} />
        <Route path="/student" element={<StudentHomeRoute />} />
        <Route path="/student/content/:id" element={<StudentContentRoute />} />
        <Route path="/student/achievements" element={<StudentAchievementsRoute />} />
        <Route path="/student/profile" element={<StudentProfileRoute />} />
        <Route path="/student/settings" element={<StudentSettingsRoute />} />
        <Route path="/student/companion" element={<StudentCompanionRoute />} />
        <Route path="/parent" element={<ParentRoute />} />
        <Route path="/parent/content/:id" element={<ParentContentRoute />} />
        <Route path="*" element={<Navigate to="/mode" replace />} />
      </Routes>

      {!hideSecurityBadge && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none fixed bottom-[max(7rem,var(--safe-area-bottom))] left-1/2 z-30 -translate-x-1/2 rounded-full border border-outline-variant/15 bg-surface-container-low/90 px-5 py-2 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-on-surface-variant">由灵犀安全卫士实时守护您的孩子</span>
          </div>
        </motion.div>
      )}

      {showFloatingChat && (
        <Suspense fallback={null}>
          <AIChat childId={childId} />
        </Suspense>
      )}
    </div>
  );
}

function AppRouter() {
  return (
    <Routes>
      <Route
        path="/login"
        element={(
          <GuestOnly>
            <LoginRoute />
          </GuestOnly>
        )}
      />
      <Route
        path="/register"
        element={(
          <GuestOnly>
            <RegisterRoute />
          </GuestOnly>
        )}
      />
      <Route
        path="*"
        element={(
          <RequireAuth>
            <ProtectedShell />
          </RequireAuth>
        )}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppToastProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AppToastProvider>
    </AuthProvider>
  );
}

