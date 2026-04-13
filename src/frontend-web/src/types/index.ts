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
  name?: string;
  avatar?: string;
  age?: number;
  settings?: Record<string, unknown>;
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
  durationSeconds?: number;
}

export interface LearningRecord {
  id: number;
  userId: number;
  contentId: number;
  startTime: string;
  endTime?: string;
  startedAt?: string;
  completedAt?: string;
  score?: number;
  durationSeconds?: number;
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
  interactionData: {
    reviewData?: Array<{
      question: string;
      userAnswer?: string;
      correctAnswer?: string;
      isCorrect: boolean;
      explanation?: string;
    }>;
    [key: string]: any;
  };
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

export interface DraftLessonSummary {
  id: number;
  title: string;
  subtitle?: string | null;
  domain?: string;
  status: 'draft' | string;
  contentType?: string;
  childId: number;
  createdAt: string;
  updatedAt: string;
}

// Learning Tracker types
export interface TodayStatsWithSources {
  totalMinutes: number;
  completedCount: number;
  recordsCount: number;
  sources: {
    content: number;
    assignment: number;
    activity: number;
    unknown: number;
  };
}

export interface AchievementDisplay {
  id: number;
  uuid: string;
  userId: number;
  achievementType: string;
  achievementName: string;
  description?: string;
  icon?: string;
  earnedAt: string;
}

export interface ActivityFeedback {
  score: number;
  total: number;
  correct: number;
  domain: string;
  message: string;
}

// Lesson Scene Types
export type LessonSceneStepType = 'watch' | 'write' | 'practice';
export type LessonSceneMode = 'playback' | 'guided_trace' | 'activity_shell';
export type SceneTimelineActionType =
  | 'enter'
  | 'move'
  | 'highlight'
  | 'state_change'
  | 'particle'
  | 'caption'
  | 'pause';

export interface SceneBackground {
  type: 'day' | 'night' | 'indoor' | 'seasonal' | 'abstract';
  themeColor?: string;
  accentColor?: string;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

export interface SceneCharacter {
  id: string;
  label: string;
  pose?: string;
  mood?: string;
  color?: string;
}

export interface SceneItem {
  id: string;
  label: string;
  kind?: string;
  state?: string;
  color?: string;
}

export interface SceneVisual {
  background?: SceneBackground;
  characters?: SceneCharacter[];
  items?: SceneItem[];
  effects?: string[];
  caption?: string;
  templateId?: string;
  templateParams?: Record<string, any>;
}

export interface SceneTimelineAction {
  type: SceneTimelineActionType;
  target?: string;
  value?: string;
  durationSec?: number;
  atSec?: number;
}

export interface TraceGlyphTarget {
  id: string;
  label: string;
  kind: 'glyph';
  text: string;
  fontSize?: number;
}

export interface TracePolylineTarget {
  id: string;
  label: string;
  kind: 'polyline';
  points: Array<{ x: number; y: number }>;
}

export type TracePathSpec = TraceGlyphTarget | TracePolylineTarget;

export interface TracePathInteraction {
  type: 'trace_path';
  prompt?: string;
  targets: TracePathSpec[];
  minCoverage?: number;
}

export interface LaunchActivityInteraction {
  type: 'launch_activity';
  prompt?: string;
  activityType: ActivityType;
  activityData: ActivityData;
}

export type SceneInteraction = TracePathInteraction | LaunchActivityInteraction;

export interface LessonScene {
  id: string;
  title: string;
  narration: string;
  onScreenText?: string;
  durationSec: number;
  visual?: SceneVisual;
  timeline?: SceneTimelineAction[];
  interaction?: SceneInteraction;
  fallbackActivity?: {
    activityType: ActivityType;
    activityData: ActivityData;
  };
}

export interface LessonSceneCompletionPolicy {
  type: 'all_scenes' | 'any_interaction';
  passingScore?: number;
  minCoverage?: number;
}

export interface LessonSceneDocument {
  version: 1;
  stepType: LessonSceneStepType;
  mode: LessonSceneMode;
  scenes: LessonScene[];
  completionPolicy?: LessonSceneCompletionPolicy;
}

// Learning archive types
export interface LearningPoint {
  id: number;
  childId: number;
  sessionId?: string;
  domain?: string;
  pointKey: string;
  pointLabel: string;
  source: 'chat_summary' | 'activity';
  lastLearnedAt: string;
  cooldownUntil: string;
  evidence?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface WrongQuestion {
  id: number;
  childId: number;
  sessionId?: string;
  domain?: string;
  activityType?: string;
  questionHash: string;
  questionText: string;
  userAnswer?: string;
  correctAnswer?: string;
  explanation?: string;
  status: 'new' | 'reviewed' | 'mastered' | string;
  occurredAt: string;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudyPlanRecord {
  id: number;
  childId: number;
  parentId?: number;
  sourceType: 'ai_generated' | 'parent_assignment' | string;
  sourceId?: number;
  title: string;
  planContent?: Record<string, any>;
  status: string;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateCoursePackRequest {
  topic: string;
  childId?: number;
  ageGroup?: '3-4' | '5-6';
  domain?: 'language' | 'math' | 'science' | 'art' | 'social';
  durationMinutes?: number;
  focus?: 'literacy' | 'math' | 'science' | 'mixed';
  difficulty?: number;
  includeGame?: boolean;
  includeAudio?: boolean;
  includeVideo?: boolean;
  parentPrompt?: string;
  sessionId?: string;
}

export interface CoursePackRecord extends StudyPlanRecord {
  sourceType: 'ai_course_pack' | string;
}

export type CoursePackExportFormat =
  | 'capcut_json'
  | 'narration_txt'
  | 'narration_mp3'
  | 'teaching_video_mp4'
  | 'storyboard_csv'
  | 'subtitle_srt'
  | 'subtitle_srt_bilingual'
  | 'bundle_zip';

export interface SaveCoursePackVersionRequest {
  title?: string;
  planContent?: Record<string, any>;
  note?: string;
  sessionId?: string;
}

export interface EnrichCoursePackBilingualRequest {
  saveAsVersion?: boolean;
  overwrite?: boolean;
  sessionId?: string;
}

export interface GenerateWeeklyCoursePackRequest {
  topic: string;
  childId: number;
  ageGroup?: '3-4' | '5-6';
  durationMinutes?: number;
  focus?: 'literacy' | 'math' | 'science' | 'mixed';
  difficulty?: number;
  includeGame?: boolean;
  includeAudio?: boolean;
  includeVideo?: boolean;
  parentPrompt?: string;
  sessionId?: string;
  startDate?: string;
  days?: number;
}

export interface ConversationSession {
  id: number;
  uuid: string;
  childId: number;
  status: string;
  metadata?: Record<string, any>;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessageHistory {
  id: number;
  conversationId: number;
  role: 'system' | 'user' | 'assistant' | 'tool' | string;
  content: string;
  toolCalls?: any[];
  toolResult?: any;
  toolCallId?: string;
  toolName?: string;
  createdAt: string;
}

// Structured Lesson Types
export interface StructuredLessonStep {
  id: string;
  label: string;
  icon: string;
  order: number;
  module: {
    type: 'video' | 'reading' | 'writing' | 'game';
    scene?: LessonSceneDocument;
    [key: string]: any;
  };
  assignmentId?: number;
}

export interface StructuredLessonContent {
  type: 'structured_lesson';
  version: 1;
  topic: string;
  ageGroup: '3-4' | '5-6';
  summary: string;
  outcomes: string[];
  steps: StructuredLessonStep[];
  parentGuide: {
    beforeClass: string[];
    duringClass: string[];
    afterClass: string[];
  };
  generatedAt: string;
}

export interface GenerateLessonParams {
  topic: string;
  childId: number;
  ageGroup?: '3-4' | '5-6';
  domain?: 'language' | 'math' | 'science' | 'art' | 'social';
  focus?: 'literacy' | 'math' | 'science' | 'mixed';
  difficulty?: number;
  durationMinutes?: number;
  parentPrompt?: string;
}

export interface LessonProgress {
  contentId: number;
  childId: number;
  completedSteps: string[];
  overallScore: number;
  stepResults: Record<string, { status: string; score: number | null }>;
}

export interface StepResult {
  score?: number;
  durationSeconds?: number;
  interactionData?: Record<string, any>;
}
