import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsObject,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── POST /learning/start ────────────────────────────────────────────
export class StartLearningDto {
  @ApiProperty({ description: 'Child user ID', example: 1 })
  @IsInt()
  @Min(1)
  childId!: number;

  @ApiProperty({ description: 'Content ID to start', example: 1 })
  @IsInt()
  @Min(1)
  contentId!: number;
}

// ─── POST /learning/complete/:id ─────────────────────────────────────
export class CompleteLearningDto {
  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'Score (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ description: 'Answer data' })
  @IsOptional()
  @IsArray()
  answers?: any[];

  @ApiPropertyOptional({ description: 'Interaction data' })
  @IsOptional()
  @IsObject()
  interactionData?: Record<string, any>;
}

// ─── POST /learning/record-activity ───────────────────────────────────
export class RecordActivityDto {
  @ApiProperty({ description: 'Child user ID', example: 1 })
  @IsInt()
  @Min(1)
  childId!: number;

  @ApiPropertyOptional({ description: 'Domain', example: 'language' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiProperty({ description: 'Score (0-100)', example: 80 })
  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'Session ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Activity type' })
  @IsOptional()
  @IsString()
  activityType?: string;

  @ApiPropertyOptional({ description: 'Interaction data' })
  @IsOptional()
  @IsObject()
  interactionData?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Wrong question review items' })
  @IsOptional()
  @IsArray()
  reviewItems?: Record<string, any>[];

  @ApiPropertyOptional({ description: 'Topic of the activity' })
  @IsOptional()
  @IsString()
  topic?: string;
}

// ─── POST /learning/lessons/generate ─────────────────────────────────
export class GenerateDraftDto {
  @ApiProperty({ description: 'Topic of the lesson', example: '太阳系' })
  @IsString()
  @MinLength(1)
  topic!: string;

  @ApiProperty({ description: 'Child user ID', example: 1 })
  @IsInt()
  @Min(1)
  childId!: number;

  @ApiPropertyOptional({
    description: 'Difficulty level (1-5)',
    example: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'Subject/domain', example: 'science' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Age group', enum: ['3-4', '5-6'] })
  @IsOptional()
  @IsString()
  ageGroup?: '3-4' | '5-6';

  @ApiPropertyOptional({
    description: 'Focus area',
    enum: ['literacy', 'math', 'science', 'mixed'],
  })
  @IsOptional()
  @IsString()
  focus?: 'literacy' | 'math' | 'science' | 'mixed';

  @ApiPropertyOptional({ description: 'Duration in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Additional prompt from parent' })
  @IsOptional()
  @IsString()
  parentPrompt?: string;
}

// ─── POST /learning/lessons/draft ────────────────────────────────────
export class SaveDraftDto {
  @ApiProperty({ description: 'Child user ID', example: 1 })
  @IsInt()
  @Min(1)
  childId!: number;

  @ApiProperty({ description: 'Lesson title' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional({ description: 'Subtitle' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Domain', example: 'science' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ description: 'Topic' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ description: 'Age group', enum: ['3-4', '5-6'] })
  @IsOptional()
  @IsString()
  ageGroup?: '3-4' | '5-6';

  @ApiPropertyOptional({
    description: 'Difficulty level (1-5)',
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'Duration in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Lesson content object' })
  @IsOptional()
  @IsObject()
  content?: any;

  @ApiPropertyOptional({ description: 'Additional prompt from parent' })
  @IsOptional()
  @IsString()
  parentPrompt?: string;
}

// ─── PUT /learning/lessons/:id/draft ─────────────────────────────────
export class UpdateDraftDto {
  @ApiPropertyOptional({ description: 'Lesson title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Subtitle' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Domain' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ description: 'Topic' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ description: 'Age group', enum: ['3-4', '5-6'] })
  @IsOptional()
  @IsString()
  ageGroup?: '3-4' | '5-6';

  @ApiPropertyOptional({
    description: 'Difficulty level (1-5)',
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'Duration in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Lesson content object' })
  @IsOptional()
  @IsObject()
  content?: any;
}

// ─── PATCH /learning/lessons/:id ─────────────────────────────────────
export class ModifyDraftDto {
  @ApiProperty({
    description: 'Modification instruction for AI',
    example: '请把难度降低一点',
  })
  @IsString()
  @MinLength(1)
  modification!: string;

  @ApiPropertyOptional({ description: 'Specific step ID to modify' })
  @IsOptional()
  @IsString()
  stepId?: string;
}

// ─── POST /learning/lessons/:id/confirm ──────────────────────────────
export class ConfirmLessonDto {
  @ApiProperty({ description: 'Child user ID', example: 1 })
  @IsInt()
  @Min(1)
  childId!: number;
}

// ─── POST /learning/lessons/:id/teaching-video/tasks ─────────────────
export class CreateVideoTaskDto {
  @ApiPropertyOptional({ description: 'Child user ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  childId?: number;

  @ApiPropertyOptional({ description: 'Force regeneration', default: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ description: 'Video render engine', example: 'auto' })
  @IsOptional()
  @IsString()
  engine?: string;
}

// ─── POST /learning/lessons/:id/video-approve ────────────────────────
export class ApproveVideoDto {
  @ApiProperty({ description: 'Child user ID', example: 1 })
  @IsInt()
  @Min(1)
  childId!: number;

  @ApiProperty({ description: 'Whether to approve', example: true })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({
    description: 'Rejection feedback (required if rejected)',
  })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional({ description: 'Specific task ID' })
  @IsOptional()
  @IsInt()
  taskId?: number;
}

// ─── POST /learning/lessons/:id/complete-step ────────────────────────
export class CompleteStepDto {
  @ApiProperty({ description: 'Child user ID', example: 1 })
  @IsInt()
  @Min(1)
  childId!: number;

  @ApiProperty({ description: 'Step ID to complete' })
  @IsString()
  @MinLength(1)
  stepId!: string;

  @ApiPropertyOptional({ description: 'Score for this step (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'Interaction data for this step' })
  @IsOptional()
  @IsObject()
  interactionData?: Record<string, any>;
}

// ─── POST /learning/video/quick-generate ──────────────────────────────
export class QuickVideoGenerateDto {
  @ApiProperty({ description: '课程主题', example: '海洋动物' })
  @IsString()
  topic!: string;

  @ApiProperty({ description: '年龄段', example: '4-5' })
  @IsString()
  ageGroup!: string;

  @ApiPropertyOptional({ description: '目标视频时长（秒）', example: 60 })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(300)
  durationSec?: number;

  @ApiPropertyOptional({ description: '风格', enum: ['story', 'science', 'song'] })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional({ description: '孩子ID（parent必传）', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  childId?: number;

  @ApiPropertyOptional({ description: '强制重新生成（绕过缓存）', example: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({
    description: '渲染引擎',
    enum: ['auto', 'hyperframes', 'remotion', 'dsh'],
  })
  @IsOptional()
  @IsString()
  renderEngine?: string;
}
