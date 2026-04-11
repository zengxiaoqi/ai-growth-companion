import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

type MockAuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: number; type: 'parent' | 'child'; name: string } | null;
  error: string | null;
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
};

const mockAuthState: MockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  error: null,
  login: vi.fn(),
  register: vi.fn(),
  clearError: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockAuthState,
}));

vi.mock('../components/ui', () => ({
  AppToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/LoginScreen', () => ({
  default: () => <div data-testid="login-screen">login</div>,
}));

vi.mock('../components/RegisterScreen', () => ({
  default: () => <div data-testid="register-screen">register</div>,
}));

vi.mock('../components/ModeSelection', () => ({
  default: () => <div data-testid="mode-selection">mode</div>,
}));

vi.mock('../components/games/GameRenderer', () => ({
  default: () => <div data-testid="game-renderer">game</div>,
}));

vi.mock('../components/StudentDashboard', () => ({
  default: () => <div data-testid="student-dashboard">student-dashboard</div>,
}));

vi.mock('../components/ContentDetail', () => ({
  default: ({ contentId }: { contentId: number }) => (
    <div data-testid="content-detail">content-{contentId}</div>
  ),
}));

vi.mock('../components/AchievementShowcase', () => ({
  default: () => <div data-testid="achievement-showcase">achievements</div>,
}));

vi.mock('../components/ProfileScreen', () => ({
  default: () => <div data-testid="profile-screen">profile</div>,
}));

vi.mock('../components/SettingsScreen', () => ({
  default: () => <div data-testid="settings-screen">settings</div>,
}));

vi.mock('../components/AIChatPage', () => ({
  default: () => <div data-testid="ai-chat-page">ai-chat-page</div>,
}));

vi.mock('../components/AIChat', () => ({
  default: () => <div data-testid="floating-ai-chat">floating-ai-chat</div>,
}));

vi.mock('../components/parent', () => ({
  default: () => <div data-testid="parent-dashboard">parent-dashboard</div>,
}));

describe('App routing regression', () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLoading = false;
    mockAuthState.user = null;
    mockAuthState.error = null;
    window.history.pushState({}, '', '/');
  });

  it('redirects unauthenticated users to /login', async () => {
    window.history.pushState({}, '', '/student');

    render(<App />);

    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
  });

  it('redirects authenticated users away from /login to /mode', async () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.user = { id: 1, type: 'child', name: 'Kid' };
    window.history.pushState({}, '', '/login');

    render(<App />);

    expect(await screen.findByTestId('mode-selection')).toBeInTheDocument();
  });

  it('supports deep link to student content route', async () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.user = { id: 7, type: 'child', name: 'Kid' };
    window.history.pushState({}, '', '/student/content/42');

    render(<App />);

    expect(await screen.findByTestId('content-detail')).toHaveTextContent('content-42');
  });
});
