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
  CoursePackRecord,
  CoursePackExportFormat,
  SaveCoursePackVersionRequest,
  EnrichCoursePackBilingualRequest,
  GenerateWeeklyCoursePackRequest,
  GenerateCoursePackRequest,
  DraftLessonSummary,
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
    options: RequestInit = {},
    timeoutMs: number = 20000,
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
    const { recordId, ...payload } = data;
    return this.request<LearningRecord>(`/learning/complete/${recordId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
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

  async generateCoursePack(data: GenerateCoursePackRequest): Promise<Record<string, any>> {
    return this.request('/ai/course-pack', {
      method: 'POST',
      body: JSON.stringify(data),
    }, 120000);
  }

  async getCoursePacks(
    childId: number,
    params?: { page?: number; limit?: number },
  ): Promise<{ list: CoursePackRecord[]; total: number; page: number; limit: number }> {
    const search = new URLSearchParams();
    search.set('childId', String(childId));
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    return this.request(`/ai/course-packs?${search.toString()}`);
  }

  async getCoursePackById(id: number): Promise<CoursePackRecord | null> {
    return this.request(`/ai/course-packs/${id}`);
  }

  async getCoursePackVersions(
    id: number,
    params?: { page?: number; limit?: number },
  ): Promise<{ list: CoursePackRecord[]; total: number; page: number; limit: number; rootSourceId: number }> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return this.request(`/ai/course-packs/${id}/versions${qs ? `?${qs}` : ''}`);
  }

  async saveCoursePackVersion(id: number, data: SaveCoursePackVersionRequest): Promise<Record<string, any>> {
    return this.request(`/ai/course-packs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async enrichCoursePackBilingual(
    id: number,
    data: EnrichCoursePackBilingualRequest = { saveAsVersion: true, overwrite: false },
  ): Promise<Record<string, any>> {
    return this.request(`/ai/course-packs/${id}/enrich-bilingual`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateWeeklyCoursePacks(data: GenerateWeeklyCoursePackRequest): Promise<Record<string, any>> {
    return this.request('/ai/course-packs/generate-weekly', {
      method: 'POST',
      body: JSON.stringify(data),
    }, 300000);
  }

  async downloadCoursePackExport(
    id: number,
    format: CoursePackExportFormat = 'capcut_json',
  ): Promise<void> {
    const token = this.getToken();
    const params = new URLSearchParams();
    params.set('format', format);

    const response = await fetch(`${API_BASE_URL}/ai/course-packs/${id}/export?${params.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      let message = `Download failed: ${response.status}`;
      try {
        const body = await response.json();
        message = body?.message || message;
      } catch {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const fileName = this.resolveDownloadFilename(disposition, `course-pack-${id}.${this.extByFormat(format)}`);

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async downloadCoursePackBatchExport(
    ids: number[],
    formats: CoursePackExportFormat[] = ['bundle_zip'],
  ): Promise<void> {
    const token = this.getToken();
    const response = await fetch(`${API_BASE_URL}/ai/course-packs/export-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ids, formats }),
    });

    if (!response.ok) {
      let message = `Download failed: ${response.status}`;
      try {
        const body = await response.json();
        message = body?.message || message;
      } catch {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const fileName = this.resolveDownloadFilename(disposition, `course-pack-batch.zip`);

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  private resolveDownloadFilename(contentDisposition: string, fallback: string): string {
    if (!contentDisposition) return fallback;
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }
    const normalMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    if (normalMatch?.[1]) return normalMatch[1];
    return fallback;
  }

  private extByFormat(format: CoursePackExportFormat): string {
    if (format === 'bundle_zip') return 'zip';
    if (format === 'narration_txt') return 'txt';
    if (format === 'narration_mp3') return 'mp3';
    if (format === 'teaching_video_mp4') return 'mp4';
    if (format === 'storyboard_csv') return 'csv';
    if (format === 'subtitle_srt') return 'srt';
    if (format === 'subtitle_srt_bilingual') return 'srt';
    return 'json';
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

  async updateAssignment(
    id: number,
    data: {
      activityType?: string;
      activityData?: any;
      domain?: string;
      difficulty?: number;
      dueDate?: string | null;
      topic?: string;
    },
  ): Promise<Assignment> {
    return this.request<Assignment>(`/assignments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAssignment(id: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/assignments/${id}`, {
      method: 'DELETE',
    });
  }

  async getChildAssignments(childId: number): Promise<Assignment[]> {
    return this.request<Assignment[]>(`/assignments/child/${childId}`);
  }

  async getParentAssignments(parentId: number): Promise<Assignment[]> {
    return this.request<Assignment[]>(`/assignments/parent/${parentId}`);
  }

  async getDraftLessons(childId: number): Promise<DraftLessonSummary[]> {
    return this.request<DraftLessonSummary[]>(`/learning/lessons/drafts?childId=${childId}`);
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

  // Structured Lessons
  async generateLesson(params: GenerateCoursePackRequest & { childId: number }): Promise<Content> {
    return this.request<Content>('/learning/lessons/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }, 120000);
  }

  async modifyLesson(id: number, modification: string, options?: { stepId?: string }): Promise<Content> {
    return this.request<Content>(`/learning/lessons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ modification, stepId: options?.stepId }),
    }, 60000);
  }

  async confirmLesson(id: number, childId: number): Promise<Content> {
    return this.request<Content>(`/learning/lessons/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ childId }),
    });
  }

  async getLessonProgress(id: number, childId: number): Promise<import('@/types').LessonProgress> {
    return this.request<import('@/types').LessonProgress>(`/learning/lessons/${id}/progress?childId=${childId}`);
  }

  async completeLessonStep(
    id: number,
    stepId: string,
    childId: number,
    result: import('@/types').StepResult,
  ): Promise<{
    success: boolean;
    recordId: number;
    abilityUpdated: boolean;
    achievementsAwarded: string[];
  }> {
    return this.request(`/learning/lessons/${id}/complete-step`, {
      method: 'POST',
      body: JSON.stringify({ childId, stepId, ...result }),
    });
  }

  async createLessonTeachingVideoTask(
    id: number,
    childId?: number,
  ): Promise<{
    taskId: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    provider: string;
    errorMessage?: string | null;
    ready: boolean;
    createdAt: string;
    updatedAt: string;
  }> {
    return this.request(`/learning/lessons/${id}/teaching-video/tasks`, {
      method: 'POST',
      body: JSON.stringify(childId ? { childId } : {}),
    });
  }

  async getLessonTeachingVideoTask(
    id: number,
    taskId: number,
    childId?: number,
  ): Promise<{
    taskId: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    provider: string;
    errorMessage?: string | null;
    ready: boolean;
    createdAt: string;
    updatedAt: string;
  }> {
    const query = childId && Number.isFinite(childId) ? `?childId=${childId}` : '';
    return this.request(`/learning/lessons/${id}/teaching-video/tasks/${taskId}${query}`);
  }

  async downloadLessonTeachingVideo(id: number, childId?: number, taskId?: number): Promise<Blob> {
    const token = this.getToken();
    const search = new URLSearchParams();
    if (childId && Number.isFinite(childId)) {
      search.set('childId', String(childId));
    }
    if (taskId && Number.isFinite(taskId)) {
      search.set('taskId', String(taskId));
    }
    const query = search.toString();
    const response = await fetch(`${API_BASE_URL}/learning/lessons/${id}/teaching-video${query ? `?${query}` : ''}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      let message = `Video request failed: ${response.status}`;
      try {
        const body = await response.json();
        message = body?.message || message;
      } catch {}
      throw new Error(message);
    }

    return response.blob();
  }

  async getLessonVideoStatus(
    id: number,
    childId?: number,
    taskId?: number,
  ): Promise<{
    exists: boolean;
    taskId?: number;
    status?: string;
    progress?: number;
    approvalStatus?: string;
    rejectionReason?: string | null;
    errorMessage?: string | null;
    ready?: boolean;
  }> {
    const search = new URLSearchParams();
    if (childId && Number.isFinite(childId)) {
      search.set('childId', String(childId));
    }
    if (taskId && Number.isFinite(taskId)) {
      search.set('taskId', String(taskId));
    }
    const query = search.toString();
    return this.request(`/learning/lessons/${id}/video-status${query ? `?${query}` : ''}`);
  }

  async approveLessonVideo(
    id: number,
    childId: number,
    approved: boolean,
    feedback?: string,
    taskId?: number,
  ): Promise<{ success: boolean; approvalStatus: string }> {
    return this.request(`/learning/lessons/${id}/video-approve`, {
      method: 'POST',
      body: JSON.stringify({
        childId,
        approved,
        feedback: feedback || undefined,
        taskId: taskId || undefined,
      }),
    });
  }
}

export const api = new ApiService();
export default api;
