import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, type: 'child', name: '小明', age: 4, settings: {} },
  }),
}));

vi.mock('../services/api', () => ({
  default: {
    updateUser: vi.fn().mockResolvedValue({
      id: 1,
      type: 'child',
      name: '小明',
      settings: {},
    }),
  },
}));

import ChildThemeQuickSwitch from '../components/ChildThemeQuickSwitch';
import { readStoredAppUISettings } from '../lib/app-settings';

beforeEach(() => {
  localStorage.clear();
  const root = document.documentElement;
  root.removeAttribute('data-child-theme');
  root.removeAttribute('data-child-theme-mode');
  root.classList.remove('theme-dark');
});

describe('孩子端快捷换肤', () => {
  it('打开面板列出四套皮肤', async () => {
    const user = userEvent.setup();
    render(<ChildThemeQuickSwitch />);

    await user.click(screen.getByRole('button', { name: '换皮肤' }));

    expect(screen.getByText('给小犀换一身衣服吧！')).toBeInTheDocument();
    for (const name of ['蜜黄绘本', '糖果云朵国', '森林探险队', '星际小队']) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });

  it('选择星际小队后立即换肤并写入本机偏好', async () => {
    const user = userEvent.setup();
    render(<ChildThemeQuickSwitch />);

    await user.click(screen.getByRole('button', { name: '换皮肤' }));
    await user.click(screen.getByRole('button', { name: /星际小队/ }));

    expect(document.documentElement.dataset.childTheme).toBe('space');
    expect(readStoredAppUISettings().childTheme).toBe('space');
    // 面板在点选后收起
    expect(screen.queryByText('给小犀换一身衣服吧！')).not.toBeInTheDocument();
  });

  it('选择糖果云朵国时同步切换根节点偏好模式', async () => {
    const user = userEvent.setup();
    render(<ChildThemeQuickSwitch />);

    await user.click(screen.getByRole('button', { name: '换皮肤' }));
    await user.click(screen.getByRole('button', { name: /糖果云朵国/ }));

    expect(document.documentElement.dataset.childTheme).toBe('candy');
    expect(document.documentElement.dataset.childThemeMode).toBe('candy');
  });
});
