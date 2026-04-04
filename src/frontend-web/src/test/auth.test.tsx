import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

// Mock the api module
vi.mock('../services/api', () => ({
  default: {
    setToken: vi.fn(),
    getToken: vi.fn(() => null),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

import api from '../services/api';

const mockLogin = api.login as ReturnType<typeof vi.fn>;
const mockRegister = api.register as ReturnType<typeof vi.fn>;

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="user-name">{auth.user?.name || 'none'}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="error">{auth.error || 'none'}</span>
      <button onClick={() => auth.login({ phone: '13800000001', password: 'pass' }).catch(() => {})}>login</button>
      <button onClick={() => auth.register({ phone: '13800000001', password: 'pass', name: 'Test', type: 'child' }).catch(() => {})}>register</button>
      <button onClick={auth.logout}>logout</button>
    </div>
  );
}

function renderWithProvider(ui: ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('starts unauthenticated', () => {
    renderWithProvider(<TestConsumer />);
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user-name')).toHaveTextContent('none');
  });

  it('login sets user and token', async () => {
    mockLogin.mockResolvedValueOnce({
      user: { id: 1, phone: '13800000001', name: 'TestUser', type: 'child' },
      token: 'jwt-token',
    });

    renderWithProvider(<TestConsumer />);
    await userEvent.click(screen.getByText('login'));

    expect(mockLogin).toHaveBeenCalledWith({ phone: '13800000001', password: 'pass' });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-name')).toHaveTextContent('TestUser');
  });

  it('login error sets error state', async () => {
    mockLogin.mockRejectedValueOnce(new Error('手机号或密码错误'));

    renderWithProvider(<TestConsumer />);
    await userEvent.click(screen.getByText('login'));

    expect(screen.getByTestId('error')).toHaveTextContent('手机号或密码错误');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('register sets user and token', async () => {
    mockRegister.mockResolvedValueOnce({
      user: { id: 2, phone: '13800000002', name: 'NewUser', type: 'parent' },
      token: 'jwt-token-2',
    });

    renderWithProvider(<TestConsumer />);
    await userEvent.click(screen.getByText('register'));

    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-name')).toHaveTextContent('NewUser');
  });

  it('logout clears user and token', async () => {
    mockLogin.mockResolvedValueOnce({
      user: { id: 1, phone: '13800000001', name: 'TestUser', type: 'child' },
      token: 'jwt-token',
    });

    renderWithProvider(<TestConsumer />);
    await userEvent.click(screen.getByText('login'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');

    await userEvent.click(screen.getByText('logout'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user-name')).toHaveTextContent('none');
  });

  it('restores session from localStorage', () => {
    localStorage.setItem('auth_token', 'stored-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: 1, phone: '13800000001', name: 'Stored', type: 'child',
    }));

    renderWithProvider(<TestConsumer />);
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-name')).toHaveTextContent('Stored');
  });
});
