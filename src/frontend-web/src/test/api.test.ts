import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../services/api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ApiService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    api.setToken(null);
  });

  describe('setToken / getToken', () => {
    it('stores token in localStorage', () => {
      api.setToken('test-token');
      expect(localStorage.getItem('auth_token')).toBe('test-token');
      expect(api.getToken()).toBe('test-token');
    });

    it('removes token from localStorage when set to null', () => {
      api.setToken('test-token');
      api.setToken(null);
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(api.getToken()).toBeNull();
    });
  });

  describe('login', () => {
    it('calls /auth/login and stores token', async () => {
      const mockResponse = {
        user: { id: 1, phone: '13800000001', name: 'Test', type: 'child' },
        token: 'jwt-token',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await api.login({ phone: '13800000001', password: 'password123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/login',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.token).toBe('jwt-token');
      expect(api.getToken()).toBe('jwt-token');
    });

    it('throws on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: '手机号或密码错误' }),
      });

      await expect(
        api.login({ phone: '13800000001', password: 'wrong' })
      ).rejects.toThrow('手机号或密码错误');
    });
  });

  describe('verifyPin', () => {
    it('calls /auth/verify-pin', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true, needsSetup: false }),
      });

      const result = await api.verifyPin('1234');
      expect(result.valid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/verify-pin',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getChildren', () => {
    it('calls /users/children/:parentId', async () => {
      const mockChildren = [
        { id: 2, name: 'Child 1', type: 'child' },
        { id: 3, name: 'Child 2', type: 'child' },
      ];
      api.setToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockChildren),
      });

      const result = await api.getChildren(1);
      expect(result).toEqual(mockChildren);
    });
  });

  describe('linkChild', () => {
    it('calls /users/link-child', async () => {
      const mockChild = { id: 2, name: 'Child', type: 'child', phone: '13800000002' };
      api.setToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockChild),
      });

      const result = await api.linkChild('13800000002');
      expect(result).toEqual(mockChild);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/link-child',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ childPhone: '13800000002' }),
        })
      );
    });
  });

  describe('getDraftLessons', () => {
    it('calls /learning/lessons/drafts?childId=:id', async () => {
      const mockDrafts = [
        {
          id: 9,
          title: '认识数字 1-5',
          status: 'draft',
          childId: 22,
          createdAt: '2026-04-09T09:00:00.000Z',
          updatedAt: '2026-04-09T09:10:00.000Z',
        },
      ];
      api.setToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDrafts),
      });

      const result = await api.getDraftLessons(22);

      expect(result).toEqual(mockDrafts);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/learning/lessons/drafts?childId=22',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });
  });

  describe('getNotifications', () => {
    it('calls /notifications/:userId', async () => {
      const mockData = {
        notifications: [{ id: 1, title: 'Test', message: 'Hello', type: 'system', read: false }],
        unreadCount: 1,
      };
      api.setToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await api.getNotifications(1);
      expect(result.unreadCount).toBe(1);
      expect(result.notifications).toHaveLength(1);
    });
  });
});
