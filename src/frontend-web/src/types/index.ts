// User Types
export interface User {
  id: number;
  phone: string;
  name: string;
  type: 'parent' | 'child';
  avatar?: string;
  age?: number;
  gender?: string;
  parentId?: number;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface RegisterRequest {
  phone: string;
  password: string;
  name: string;
  type: 'parent' | 'child';
  age?: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface UpdateUserRequest {
  nickname?: string;
  avatar?: string;
}

// Content Types
export interface Content {
  id: number;
  uuid: string;
  title: string;
  subtitle?: string;
  ageRange: '3-4' | '5-6';
  domain: 'language' | 'math' | 'science' | 'art' | 'social';
  topic?: string;
  difficulty: number;
  durationMinutes: number;
  contentType?: string;
  content?: string;
  mediaUrls?: string[];
  status?: string;
  thumbnail?: string;
  createdAt?: string;
}

export interface ContentListParams {
  ageRange?: '3-4' | '5-6';
  domain?: string;
  page?: number;
  limit?: number;
}

// Learning Types
export interface StartLearningRequest {
  childId: number;
  contentId: number;
}

export interface CompleteLearningRequest {
  recordId: number;
  score: number;
  feedback?: string;
}

export interface LearningRecord {
  id: number;
  userId: number;
  contentId: number;
  startTime: string;
  endTime?: string;
  score?: number;
  status: 'in_progress' | 'completed';
}

// Ability Types
export interface Ability {
  id: number;
  userId: number;
  domain: string;
  level: number;
  progress: number;
  updatedAt: string;
}

export interface AbilityReport {
  userId: number;
  abilities: Ability[];
  overallLevel: number;
}

// Achievement Types
export interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  progress: number;
  totalRequired: number;
}

// AI Chat Types
export interface ChatMessage {
  message: string;
  childId?: number;
  parentId?: number;
  sessionId?: string;
}

export interface ChatResponse {
  reply: string;
  sessionId?: string;
  suggestions?: string[];
}

// Parent Control Types
export interface ParentControl {
  id: number;
  parentId: number;
  childId?: number;
  dailyLimitMinutes: number;
  allowedDomains: string[];
  blockedTopics: string[];
  studySchedule?: Record<string, unknown>;
  notifications?: boolean;
  dailyLimit?: number;
  allowedContent?: string[];
  contentFilterEnabled?: boolean;
  eyeProtectionEnabled?: boolean;
  restReminderMinutes?: number;
}

export interface UpdateParentControlRequest {
  dailyLimitMinutes?: number;
  allowedDomains?: string[];
  blockedTopics?: string[];
  studySchedule?: Record<string, unknown>;
  notifications?: boolean;
  dailyLimit?: number;
  allowedContent?: string[];
  contentFilterEnabled?: boolean;
  eyeProtectionEnabled?: boolean;
  restReminderMinutes?: number;
}

// Recommendation Types
export interface Recommendation {
  contentId: number;
  content: Content;
  reason: string;
  priority: number;
}

export interface RecommendationParams {
  userId: number;
  ageRange?: '3-4' | '5-6';
}

// Report Types
export interface DailyStats {
  date: string;
  totalTime: number;
  completedLessons: number;
  averageScore: number;
}

export interface GrowthReport {
  userId: number;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  totalLearningTime: number;
  totalLessonsCompleted: number;
  averageScore: number;
  dailyStats: DailyStats[];
  skillProgress: Record<string, number>;
  achievements: Achievement[];
  insights?: string[];
  streak?: number;
}

export interface ReportParams {
  userId: number;
  period: 'daily' | 'weekly' | 'monthly';
}

// Notification Types
export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: 'system' | 'achievement' | 'learning' | 'reminder';
  read: boolean;
  relatedId?: number;
  createdAt: string;
}

// Activity Types
export type ActivityType = 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle';

export interface ActivityData {
  type: ActivityType;
  title: string;
  [key: string]: any;
}

export interface ActivityResult {
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeSpent?: number;
  interactionData: any;
}

// Emergency Call Types
export interface EmergencyCall {
  id: number;
  childId: number;
  parentId: number;
  parentPhone: string;
  status: 'pending' | 'sms_sent' | 'call_initiated' | 'completed' | 'failed';
  smsResult?: string;
  callResult?: string;
  errorMessage?: string;
  createdAt: string;
}

// Assignment Types
export interface Assignment {
  id: number;
  uuid: string;
  parentId: number;
  childId: number;
  contentId?: number;
  activityType: ActivityType;
  activityData?: ActivityData;
  domain?: string;
  difficulty: number;
  dueDate?: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: string;
  score?: number;
  resultData?: any;
  createdAt: string;
}
