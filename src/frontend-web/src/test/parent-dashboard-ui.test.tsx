import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ParentDashboard from '../components/parent/ParentDashboard';

const { mockAuth, mockApi } = vi.hoisted(() => ({
  mockAuth: {
    user: {
      id: 10,
      phone: '13800000000',
      name: '测试家长',
      type: 'parent' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    logout: vi.fn(),
  },
  mockApi: {
    getChildren: vi.fn(),
    getControls: vi.fn(),
    getParentAssignments: vi.fn(),
    getReport: vi.fn(),
    getAchievements: vi.fn(),
    getAbilities: vi.fn(),
    getAbilityTrend: vi.fn(),
    getRecentSkills: vi.fn(),
    updateControls: vi.fn(),
    linkChild: vi.fn(),
    createAssignment: vi.fn(),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../services/api', () => ({
  default: mockApi,
}));

vi.mock('../components/AIChatPage', () => ({
  default: () => <div data-testid="ai-chat-page">chat-page</div>,
}));

vi.mock('../components/ReportDetail', () => ({
  default: () => <div data-testid="report-detail">report-detail</div>,
}));

describe('ParentDashboard UI regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockApi.getChildren.mockResolvedValue([]);
    mockApi.getControls.mockResolvedValue({
      id: 1,
      parentId: 10,
      dailyLimitMinutes: 30,
      allowedDomains: ['language', 'math'],
      blockedTopics: [],
    });
    mockApi.getParentAssignments.mockResolvedValue([]);
    mockApi.getReport.mockResolvedValue({
      dailyStats: [],
      totalLearningTime: 0,
      insights: [],
    });
    mockApi.getAchievements.mockResolvedValue([]);
    mockApi.getAbilities.mockResolvedValue({ abilities: [] });
    mockApi.getAbilityTrend.mockResolvedValue([]);
    mockApi.getRecentSkills.mockResolvedValue([]);
    mockApi.updateControls.mockResolvedValue({ success: true });
    mockApi.linkChild.mockResolvedValue({});
    mockApi.createAssignment.mockResolvedValue({});
  });

  it('shows empty state in report tab when no child is selected', async () => {
    const user = userEvent.setup();
    render(<ParentDashboard onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '报告' }));

    expect(await screen.findByText('请先选择一个孩子')).toBeInTheDocument();
  });

  it('shows error banner when part of dashboard data fails', async () => {
    mockApi.getChildren.mockResolvedValueOnce([
      {
        id: 22,
        phone: '13800000022',
        name: '小明',
        type: 'child',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mockApi.getControls.mockRejectedValueOnce(new Error('network error'));

    render(<ParentDashboard onBack={vi.fn()} />);

    expect(await screen.findByText('部分数据加载失败，请稍后重试。')).toBeInTheDocument();
  });

  it('keeps bottom navigation buttons touch-friendly', async () => {
    render(<ParentDashboard onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '对话' })).toBeInTheDocument();
    });

    const buttons = [
      screen.getByRole('button', { name: '对话' }),
      screen.getByRole('button', { name: '报告' }),
      screen.getByRole('button', { name: '控制' }),
      screen.getByRole('button', { name: '作业' }),
    ];

    for (const button of buttons) {
      expect(button.className).toContain('touch-target');
    }
  });
});
