/** Shared types for the AI Agent module */

export type AgeGroup = '3-4' | '5-6' | 'unknown';

export interface ChatRequest {
  message: string;
  childId: number;
  sessionId?: string;
  context?: {
    age?: number;
    currentPage?: string;
  };
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  suggestions?: string[];
  toolCalls?: ToolCallInfo[];
  wasFiltered?: boolean;
}

export interface ToolCallInfo {
  tool: string;
  args: Record<string, any>;
  resultSummary: string;
}

export interface QuizRequest {
  childId: number;
  topic: string;
  count?: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizResponse {
  questions: QuizQuestion[];
  topic: string;
  ageGroup: string;
}

export interface StreamEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  sessionId?: string;
  wasFiltered?: boolean;
  suggestions?: string[];
  message?: string;
}
