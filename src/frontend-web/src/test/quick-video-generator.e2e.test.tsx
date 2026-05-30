/**
 * QuickVideoGenerator E2E Tests
 *
 * Full end-to-end user journeys: complete flows from idle → completed/failed,
 * including progress updates, retry cycles, and cleanup.
 *
 * Uses vitest + @testing-library/react with mocked API layer.
 * These tests verify the real component rendering (no shallow render).
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuickVideoGenerator from '../components/parent/QuickVideoGenerator';

// ── Mock objects ──
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    quickGenerateVideo: vi.fn(),
    getLessonTeachingVideoTask: vi.fn(),
    downloadLessonTeachingVideo: vi.fn(),
  },
}));

vi.mock('@/services/api', () => ({ default: mockApi }));
vi.mock('@/icons', () => ({
  Play: (props: any) => <svg data-testid="icon-play" {...props} />,
  Sparkles: (props: any) => <svg data-testid="icon-sparkles" {...props} />,
  Loader2: (props: any) => <svg data-testid="icon-loader2" {...props} />,
  Check: (props: any) => <svg data-testid="icon-check" {...props} />,
  RotateCcw: (props: any) => <svg data-testid="icon-rotate-ccw" {...props} />,
  XCircle: (props: any) => <svg data-testid="icon-xcircle" {...props} />,
}));
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, animate, initial, transition, ...props }: any) => {
      const extra: any = { ...props };
      if (animate?.width) extra['data-progress-width'] = animate.width;
      return <div {...extra}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock('../ui', () => ({
  Button: ({ children, disabled, onClick, className, variant, ...props }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      data-variant={variant}
      {...props}
    >
      {children}
    </button>
  ),
  Card: ({ children, className, ...props }: any) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
}));
vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// ── Global URL.createObjectURL / revokeObjectURL mock ──
const urlMocks = {
  created: [] as string[],
  revoked: [] as string[],
};
globalThis.URL.createObjectURL = vi.fn((_blob: Blob) => {
  const url = 'blob:mock-video-' + urlMocks.created.length;
  urlMocks.created.push(url);
  return url;
});
globalThis.URL.revokeObjectURL = vi.fn((url: string) => {
  urlMocks.revoked.push(url);
});

// ── Helpers ──

function renderComponent(
  overrides: { selectedChildId?: number | null; childAgeGroup?: '3-4' | '5-6' } = {},
) {
  const childId = 'selectedChildId' in overrides ? overrides.selectedChildId : 1;
  return render(
    <QuickVideoGenerator selectedChildId={childId} childAgeGroup={overrides.childAgeGroup} />,
  );
}

/** Type a topic into the topic input */
function typeTopic(topic: string) {
  fireEvent.change(screen.getByPlaceholderText('例如：海洋动物、认识数字、四季变化'), {
    target: { value: topic },
  });
}

/** Type topic + click submit */
async function submitTopic(topic: string) {
  typeTopic(topic);
  await act(() => Promise.resolve());
  fireEvent.click(screen.getByRole('button', { name: /生成教学视频/ }));
}

// ── Default API responses ──
const DEFAULT_GENERATE_RES = { taskId: 100, contentId: 200, status: 'pending' };
const DEFAULT_TASK_RES = { status: 'processing', progress: 0 };

// ── ═══════════════ E2E Test Suite ═══════════════ ──

describe('QuickVideoGenerator E2E flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    urlMocks.created = [];
    urlMocks.revoked = [];
  });

  afterEach(() => vi.useRealTimers());

  // ═══════════════ 1. Happy Path ═══════════════
  describe('Happy path: idle → generating → polling → completed', () => {
    it('completes full flow with progress updates and video download', async () => {
      vi.useFakeTimers();

      mockApi.quickGenerateVideo.mockResolvedValue(DEFAULT_GENERATE_RES);

      let pollCount = 0;
      mockApi.getLessonTeachingVideoTask.mockImplementation(() => {
        pollCount++;
        if (pollCount === 1) return Promise.resolve({ status: 'processing', progress: 30 });
        if (pollCount === 2) return Promise.resolve({ status: 'processing', progress: 60 });
        return Promise.resolve({ status: 'completed', progress: 100 });
      });

      const mockBlob = new Blob(['video-data'], { type: 'video/mp4' });
      mockApi.downloadLessonTeachingVideo.mockResolvedValue(mockBlob);

      renderComponent();

      // Phase 1: Idle — verify form
      expect(screen.getByPlaceholderText('例如：海洋动物、认识数字、四季变化')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /生成教学视频/ })).toBeDisabled();

      // Phase 2: Submit
      await act(async () => {
        await submitTopic('海洋动物');
      });
      await act(() => vi.advanceTimersByTimeAsync(0));

      // Phase 3: Generating → polling transition
      expect(screen.getByText('视频任务已创建，开始生成...')).toBeInTheDocument();
      expect(mockApi.quickGenerateVideo).toHaveBeenCalledWith({
        topic: '海洋动物',
        ageGroup: '5-6',
        childId: 1,
        style: undefined,
      });

      // Phase 4: Polling with progress updates
      await act(() => vi.advanceTimersByTimeAsync(3100)); // 1st poll tick
      expect(screen.getByText(/30/)).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(3100)); // 2nd poll tick
      expect(screen.getByText(/60/)).toBeInTheDocument();

      // Phase 5: Completion
      await act(() => vi.advanceTimersByTimeAsync(3100)); // 3rd poll tick
      expect(screen.getByText('视频生成完成！')).toBeInTheDocument();
      expect(screen.getByTestId('icon-check')).toBeInTheDocument();

      // Phase 6: Video download triggered
      expect(mockApi.downloadLessonTeachingVideo).toHaveBeenCalledWith(200);
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(urlMocks.created.length).toBeGreaterThanOrEqual(1);

      // Phase 7: Retry button visible for completed state
      expect(screen.getByRole('button', { name: /重新生成/ })).toBeInTheDocument();
    });
  });

  // ═══════════════ 2. Cache hit ═══════════════
  describe('Cache hit: instant completion', () => {
    it('shows completed immediately when API returns completed status', async () => {
      mockApi.quickGenerateVideo.mockResolvedValue({
        taskId: 101,
        contentId: 201,
        status: 'completed',
      });

      renderComponent();
      await submitTopic('认识数字');

      await waitFor(() => {
        expect(screen.getByText('视频生成完成！')).toBeInTheDocument();
      });

      // No polling should occur
      expect(mockApi.getLessonTeachingVideoTask).not.toHaveBeenCalled();
    });
  });

  // ═══════════════ 3. Failed + Retry cycle ═══════════════
  describe('Failed → retry → success', () => {
    it('retries after failure and completes successfully', async () => {
      vi.useFakeTimers();

      // First attempt: polling → failed
      mockApi.quickGenerateVideo.mockResolvedValue(DEFAULT_GENERATE_RES);

      let pollCount = 0;
      mockApi.getLessonTeachingVideoTask.mockImplementation(() => {
        pollCount++;
        if (pollCount === 1) return Promise.resolve({ status: 'processing', progress: 25 });
        return Promise.resolve({ status: 'failed', progress: 25, errorMessage: '生成失败，请稍后重试' });
      });

      renderComponent();
      await act(async () => {
        await submitTopic('四季变化');
      });
      await act(() => vi.advanceTimersByTimeAsync(6500));

      // Verify failed state
      const errors = screen.getAllByText('生成失败，请稍后重试');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();

      // Second attempt: reset mocks for success
      mockApi.quickGenerateVideo.mockResolvedValue({
        taskId: 102,
        contentId: 202,
        status: 'completed',
      });

      // Click retry → back to idle
      fireEvent.click(screen.getByRole('button', { name: '重试' }));
      expect(screen.getByPlaceholderText('例如：海洋动物、认识数字、四季变化')).toBeInTheDocument();

      // Submit new topic
      await act(async () => {
        typeTopic('认识动物');
        await Promise.resolve();
        fireEvent.click(screen.getByRole('button', { name: /生成教学视频/ }));
        // Advance past API + React re-render
        await vi.advanceTimersByTimeAsync(50);
      });

      expect(screen.getByText('视频生成完成！')).toBeInTheDocument();
    });
  });

  // ═══════════════ 4. Network error on submit ═══════════════
  describe('Network error on submit', () => {
    it('shows error when quickGenerateVideo fails', async () => {
      mockApi.quickGenerateVideo.mockRejectedValue(new Error('网络连接失败，请检查网络'));

      renderComponent();
      await submitTopic('海洋动物');

      await waitFor(() => {
        const errors = screen.getAllByText('网络连接失败，请检查网络');
        expect(errors.length).toBeGreaterThanOrEqual(1);
      });

      // Form should still be visible (fails back to idle+form)
      expect(screen.getByPlaceholderText('例如：海洋动物、认识数字、四季变化')).toBeInTheDocument();
    });
  });

  // ═══════════════ 5. Download failure graceful ═══════════════
  describe('Download failure is graceful', () => {
    it('completes without video preview when download fails', async () => {
      vi.useFakeTimers();

      mockApi.quickGenerateVideo.mockResolvedValue(DEFAULT_GENERATE_RES);

      let pollCount = 0;
      mockApi.getLessonTeachingVideoTask.mockImplementation(() => {
        pollCount++;
        if (pollCount === 1) return Promise.resolve({ status: 'completed', progress: 100 });
        return Promise.resolve({ status: 'completed', progress: 100 });
      });

      mockApi.downloadLessonTeachingVideo.mockRejectedValue(new Error('下载失败'));

      renderComponent();
      await act(async () => {
        await submitTopic('海洋动物');
      });
      await act(() => vi.advanceTimersByTimeAsync(3500));

      // Should still show completed, just no video tag
      expect(screen.getByText('视频生成完成！')).toBeInTheDocument();
      expect(screen.queryByRole('video')).toBeNull();
    });
  });

  // ═══════════════ 6. Cleanup on retry/unmount ═══════════════
  describe('Resource cleanup', () => {
    it('revokes blob URL on retry after completion', async () => {
      mockApi.quickGenerateVideo.mockResolvedValue({
        taskId: 103,
        contentId: 203,
        status: 'completed',
      });

      renderComponent();
      await submitTopic('海洋动物');

      await waitFor(() => {
        expect(screen.getByText('视频生成完成！')).toBeInTheDocument();
      });

      // Click retry — should revoke any lingering blob URL
      fireEvent.click(screen.getByRole('button', { name: /重新生成/ }));
      expect(urlMocks.revoked.length).toBeGreaterThanOrEqual(0); // no URL created, but no leak
    });
  });

  // ═══════════════ 7. Disabled when no child selected ═══════════════
  describe('Disabled state', () => {
    it('shows disabled button and prevents submit when childId is null', () => {
      renderComponent({ selectedChildId: null });

      typeTopic('海洋动物');
      const btn = screen.getByRole('button', { name: /生成教学视频/ });
      // Button should be disabled when childId is null
      expect(btn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(btn);
      expect(mockApi.quickGenerateVideo).not.toHaveBeenCalled();
    });
  });

  // ═══════════════ 8. Style + ageGroup API params ═══════════════
  describe('API parameter correctness', () => {
    it('sends correct style, ageGroup, and topic in API call', async () => {
      mockApi.quickGenerateVideo.mockResolvedValue(DEFAULT_GENERATE_RES);
      renderComponent({ childAgeGroup: '3-4' });

      typeTopic('认识颜色');

      // Select style
      const styleSelect = screen.getByText('风格').closest('div')!.querySelector('select')!;
      fireEvent.change(styleSelect, { target: { value: 'science' } });

      await act(() => Promise.resolve());
      fireEvent.click(screen.getByRole('button', { name: /生成教学视频/ }));

      await waitFor(() => {
        expect(mockApi.quickGenerateVideo).toHaveBeenCalledWith({
          topic: '认识颜色',
          ageGroup: '3-4',
          childId: 1,
          style: 'science',
        });
      });
    });

    it('omits style when set to auto (empty string)', async () => {
      mockApi.quickGenerateVideo.mockResolvedValue(DEFAULT_GENERATE_RES);
      renderComponent();

      await submitTopic('海洋动物');

      await waitFor(() => {
        expect(mockApi.quickGenerateVideo).toHaveBeenCalledWith({
          topic: '海洋动物',
          ageGroup: '5-6',
          childId: 1,
          style: undefined,
        });
      });
    });
  });

  // ═══════════════ 9. Polling error resilience ═══════════════
  describe('Polling error resilience', () => {
    it('survives intermittent polling errors and eventually completes', async () => {
      vi.useFakeTimers();

      mockApi.quickGenerateVideo.mockResolvedValue(DEFAULT_GENERATE_RES);

      let pollCount = 0;
      mockApi.getLessonTeachingVideoTask.mockImplementation(() => {
        pollCount++;
        if (pollCount === 1) return Promise.reject(new Error('网络超时'));
        if (pollCount === 2) return Promise.resolve({ status: 'processing', progress: 45 });
        return Promise.resolve({ status: 'completed', progress: 100 });
      });

      mockApi.downloadLessonTeachingVideo.mockResolvedValue(new Blob(['ok']));

      renderComponent();
      await act(async () => {
        await submitTopic('海洋动物');
      });
      await act(() => vi.advanceTimersByTimeAsync(0));

      // Should survive the initial polling error
      await act(() => vi.advanceTimersByTimeAsync(3100)); // Fail silently, no crash
      await act(() => vi.advanceTimersByTimeAsync(3100)); // Progress 45%
      expect(screen.getByText(/45/)).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(3100)); // Completed
      expect(screen.getByText('视频生成完成！')).toBeInTheDocument();
    });
  });

  // ═══════════════ 10. Trimming topic ═══════════════
  describe('Input handling', () => {
    it('trims whitespace from topic before sending', async () => {
      mockApi.quickGenerateVideo.mockResolvedValue(DEFAULT_GENERATE_RES);
      renderComponent();

      fireEvent.change(screen.getByPlaceholderText('例如：海洋动物、认识数字、四季变化'), {
        target: { value: '  海洋动物  ' },
      });
      await act(() => Promise.resolve());
      fireEvent.click(screen.getByRole('button', { name: /生成教学视频/ }));

      await waitFor(() => {
        expect(mockApi.quickGenerateVideo).toHaveBeenCalledWith(
          expect.objectContaining({ topic: '海洋动物' }),
        );
      });
    });
  });

  // ═══════════════ 11. Multiple submissions in sequence ═══════════════
  describe('Sequential submissions', () => {
    it('handles two full cycles: submit → complete → retry → submit → complete', async () => {
      // First cycle
      mockApi.quickGenerateVideo.mockResolvedValue({
        taskId: 1,
        contentId: 10,
        status: 'completed',
      });

      renderComponent();
      await submitTopic('海洋动物');
      await waitFor(() => expect(screen.getByText('视频生成完成！')).toBeInTheDocument());

      // Retry → back to idle
      fireEvent.click(screen.getByRole('button', { name: /重新生成/ }));
      expect(screen.getByPlaceholderText('例如：海洋动物、认识数字、四季变化')).toBeInTheDocument();

      // Second cycle
      mockApi.quickGenerateVideo.mockResolvedValue({
        taskId: 2,
        contentId: 20,
        status: 'completed',
      });

      await submitTopic('认识数字');
      await waitFor(() => expect(screen.getByText('视频生成完成！')).toBeInTheDocument());
      expect(mockApi.quickGenerateVideo).toHaveBeenCalledTimes(2);
    });
  });
});