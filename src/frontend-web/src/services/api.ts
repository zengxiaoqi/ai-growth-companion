import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
  UpdateUserRequest,
  Content,
  ContentListParams,
  StartLearningRequest,
  CompleteLearningRequest,
  LearningRecord,
  AbilityReport,
  Achievement,
  ChatMessage,
  ChatResponse,
  ParentControl,
  UpdateParentControlRequest,
  ReportParams,
  GrowthReport,
  Recommendation,
  RecommendationParams,
  Notification,
  Assignment,
  ActivityResult,
  EmergencyCall,
  TodayStatsWithSources,
  AchievementDisplay,
  LearningPoint,
  WrongQuestion,
  StudyPlanRecord,
  ConversationSession,
  ConversationMessageHistory,
} from '@/types';

const API_BASE_URL = (() => {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const backendProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${backendProtocol}//${window.location.hostname}:3000/api`;
  }

  return 'http://localhost:3000/api';
})();

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutMs = 20000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接或后端服务是否可访问');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(response.token);
    return response;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(response.token);
    return response;
  }

  logout() {
    this.setToken(null);
  }

  // PIN Verification
  async verifyPin(pin: string): Promise<{ valid: boolean; needsSetup?: boolean }> {
    return this.request<{ valid: boolean; needsSetup?: boolean }>('/auth/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  async setPin(pin: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/auth/set-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  // Users
  async getUser(id: number): Promise<User> {
    return this.request<User>(`/users/${id}`);
  }

  async updateUser(id: number, data: UpdateUserRequest): Promise<User> {
    return this.request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Children
  async getChildren(parentId: number): Promise<User[]> {
    return this.request<User[]>(`/users/children/${parentId}`);
  }

  async linkChild(childPhone: string): Promise<User> {
    return this.request<User>('/users/link-child', {
      method: 'POST',
      body: JSON.stringify({ childPhone }),
    });
  }

  // Contents
  async getContents(params?: ContentListParams): Promise<Content[]> {
    const searchParams = new URLSearchParams();
    if (params?.ageRange) searchParams.set('ageRange', params.ageRange);
    if (params?.domain) searchParams.set('domain', params.domain);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    
    const query = searchParams.toString();
    const response = await this.request<{ list: Content[]; total: number }>(`/contents${query ? `?${query}` : ''}`);
    return response.list;
  }

  async getContent(id: number): Promise<Content> {
    return this.request<Content>(`/contents/${id}`);
  }

  // Learning
  async startLearning(data: StartLearningRequest): Promise<LearningRecord> {
    return this.request<LearningRecord>('/learning/start', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async completeLearning(data: CompleteLearningRequest): Promise<LearningRecord> {
    return this.request<LearningRecord>('/learning/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Abilities
  async getAbilities(userId: number): Promise<AbilityReport> {
    return this.request<AbilityReport>(`/abilities/${userId}`);
  }

  // Achievements
  async getAchievements(userId: number): Promise<Achievement[]> {
    return this.request<Achievement[]>(`/achievements/user/${userId}`);
  }

  // AI Chat
  async sendChatMessage(data: ChatMessage): Promise<ChatResponse> {
    return this.request<ChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // AI Chat Stream (SSE)
  sendChatMessageStream(data: ChatMessage): Promise<Response> {
    const params = new URLSearchParams({ message: data.message });
    if (data.childId) params.append('childId', String(data.childId));
    if (data.parentId) params.append('parentId', String(data.parentId));
    if (data.sessionId) params.set('sessionId', data.sessionId);

    const token = this.getToken();
    return fetch(`${API_BASE_URL}/ai/chat/stream?${params.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  // AI Suggestion
  async getAISuggestion(params: { userId: number; ageRange?: '3-4' | '5-6' }): Promise<{ suggestion: string }> {
    const searchParams = new URLSearchParams();
    searchParams.set('userId', String(params.userId));
    if (params.ageRange) searchParams.set('ageRange', params.ageRange);
    
    return this.request<{ suggestion: string }>(`/ai/suggest?${searchParams.toString()}`);
  }

  // Recommendations
  async getRecommendations(params: RecommendationParams): Promise<Recommendation[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('userId', String(params.userId));
    if (params.ageRange) searchParams.set('ageRange', params.ageRange);
    
    const response = await this.request<{ recommended: Recommendation[]; reason: string; nextLevel: unknown }>(`/recommend?${searchParams.toString()}`);
    return response.recommended;
  }

  // Reports
  async getReport(params: ReportParams): Promise<GrowthReport> {
    const searchParams = new URLSearchParams();
    searchParams.set('userId', String(params.userId));
    if (params.period) searchParams.set('period', params.period);

    return this.request<GrowthReport>(`/report?${searchParams.toString()}`);
  }

  // Report - Ability Trend
  async getAbilityTrend(userId: number, weeks: number = 6): Promise<{ week: string; language: number; math: number; science: number; art: number; social: number }[]> {
    return this.request(`/report/trend?userId=${userId}&weeks=${weeks}`);
  }

  // Report - Recent Mastered Skills
  async getRecentSkills(userId: number, limit: number = 3): Promise<{ domain: string; level: number; label: string }[]> {
    return this.request(`/report/recent-skills?userId=${userId}&limit=${limit}`);
  }

  // Parent Controls
  async getControls(parentId: number): Promise<ParentControl> {
    return this.request<ParentControl>(`/parent/controls/${parentId}`);
  }

  async updateControls(parentId: number, data: UpdateParentControlRequest): Promise<ParentControl> {
    return this.request<ParentControl>(`/parent/controls/${parentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Voice TTS - returns audio stream URL
  getTTSUrl(text: string, voice: string = 'zh-CN-XiaoxiaoNeural'): string {
    return `${API_BASE_URL}/voice/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
  }

  // Notifications
  async getNotifications(userId: number): Promise<{ notifications: Notification[]; unreadCount: number }> {
    return this.request<{ notifications: Notification[]; unreadCount: number }>(`/notifications/${userId}`);
  }

  async markNotificationRead(id: number): Promise<Notification> {
    return this.request<Notification>(`/notifications/${id}/read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsRead(userId: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/notifications/user/${userId}/read-all`, {
      method: 'POST',
    });
  }

  // Assignments
  async createAssignment(data: {
    parentId: number;
    childId: number;
    activityType: string;
    activityData?: any;
    contentId?: number;
    domain?: string;
    difficulty?: number;
    dueDate?: string;
  }): Promise<Assignment> {
    return this.request<Assignment>('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChildAssignments(childId: number): Promise<Assignment[]> {
    return this.request<Assignment[]>(`/assignments/child/${childId}`);
  }

  async getParentAssignments(parentId: number): Promise<Assignment[]> {
    return this.request<Assignment[]>(`/assignments/parent/${parentId}`);
  }

  async getAssignment(id: number): Promise<Assignment> {
    return this.request<Assignment>(`/assignments/${id}`);
  }

  async completeAssignment(id: number, result: ActivityResult): Promise<Assignment> {
    return this.request<Assignment>(`/assignments/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ score: result.score, resultData: result.interactionData }),
    });
  }

  // Emergency
  async triggerEmergencyCall(childId: number): Promise<EmergencyCall> {
    return this.request<EmergencyCall>('/emergency/trigger', {
      method: 'POST',
      body: JSON.stringify({ childId }),
    });
  }

  async getEmergencyHistory(childId: number): Promise<EmergencyCall[]> {
    return this.request<EmergencyCall[]>(`/emergency/history/${childId}`);
  }

  // Learning tracker
  async getTodayStatsDetail(userId: number): Promise<TodayStatsWithSources> {
    return this.request<TodayStatsWithSources>(`/learning/today-detail/${userId}`);
  }

  async recordActivity(data: {
    childId: number;
    domain: string;
    score: number;
    durationSeconds?: number;
    sessionId?: string;
    activityType?: string;
    interactionData?: Record<string, any>;
    reviewItems?: Array<{
      question: string;
      userAnswer?: string;
      correctAnswer?: string;
      isCorrect: boolean;
      explanation?: string;
    }>;
    topic?: string;
  }): Promise<{
    success: boolean;
    recordId: number;
    abilityUpdated: boolean;
    achievementsAwarded: string[];
  }> {
    return this.request('/learning/record-activity', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getLearningPoints(
    childId: number,
    params?: {
      domain?: string;
      status?: 'cooldown' | 'available';
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ list: LearningPoint[]; total: number; page: number; limit: number }> {
    const search = new URLSearchParams();
    if (params?.domain) search.set('domain', params.domain);
    if (params?.status) search.set('status', params.status);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    return this.request(`/learning/points/${childId}${search.toString() ? `?${search.toString()}` : ''}`);
  }

  async getWrongQuestions(
    childId: number,
    params?: { domain?: string; status?: string; page?: number; limit?: number },
  ): Promise<{ list: WrongQuestion[]; total: number; page: number; limit: number }> {
    const search = new URLSearchParams();
    if (params?.domain) search.set('domain', params.domain);
    if (params?.status) search.set('status', params.status);
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    return this.request(`/learning/wrong-questions/${childId}${search.toString() ? `?${search.toString()}` : ''}`);
  }

  async getStudyPlans(
    childId: number,
    params?: { sourceType?: string; page?: number; limit?: number },
  ): Promise<{ list: StudyPlanRecord[]; total: number; page: number; limit: number }> {
    const search = new URLSearchParams();
    if (params?.sourceType) search.set('sourceType', params.sourceType);
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    return this.request(`/learning/plans/${childId}${search.toString() ? `?${search.toString()}` : ''}`);
  }

  async getConversationSessions(
    childId: number,
    params?: { page?: number; limit?: number },
  ): Promise<{ list: ConversationSession[]; total: number; page: number; limit: number }> {
    const search = new URLSearchParams();
    search.set('childId', String(childId));
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    return this.request(`/ai/history/sessions?${search.toString()}`);
  }

  async getConversationMessages(
    sessionId: string,
    params?: { page?: number; limit?: number },
  ): Promise<{
    sessionId: string;
    childId?: number;
    list: ConversationMessageHistory[];
    total: number;
    page: number;
    limit: number;
  }> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    return this.request(`/ai/history/sessions/${encodeURIComponent(sessionId)}/messages${search.toString() ? `?${search.toString()}` : ''}`);
  }

  async getAchievementDisplays(userId: number): Promise<AchievementDisplay[]> {
    return this.request<AchievementDisplay[]>(`/achievements/user/${userId}`);
  }
}

export const api = new ApiService();
export default api;
