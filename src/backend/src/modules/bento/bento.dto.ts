import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  IsIn,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── 子类型 ──

export class DailyStatDto {
  @IsString()
  date: string;

  @IsNumber()
  totalTime: number;

  @IsNumber()
  completedLessons: number;

  @IsNumber()
  averageScore: number;
}

export class AchievementDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  earnedAt: string;
}

export class SkillProgressDto {
  @IsObject()
  skillProgress: Record<string, number>;
}

export class WeekSummaryDto {
  @IsString()
  weekLabel: string;

  @IsNumber()
  totalTime: number;

  @IsNumber()
  completedLessons: number;

  @IsNumber()
  averageScore: number;
}

export class TrendHistoryDto {
  @IsString()
  label: string;

  @IsNumber()
  language: number;

  @IsNumber()
  math: number;

  @IsNumber()
  science: number;

  @IsNumber()
  art: number;

  @IsNumber()
  social: number;
}

export class NoteDto {
  @IsString()
  term: string;

  @IsString()
  explanation: string;
}

export class ContentSectionDto {
  @IsString()
  @IsIn(['text', 'image', 'game', 'quiz'])
  type: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class MonthSummaryDto {
  @IsString()
  month: string;

  @IsNumber()
  totalTime: number;

  @IsNumber()
  completedLessons: number;

  @IsNumber()
  averageScore: number;

  @IsString()
  highlight: string;

  @IsObject()
  skills: Record<string, number>;
}

export class LearnedPoemDto {
  @IsString()
  title: string;

  @IsString()
  author: string;
}

export class LearnedLessonDto {
  @IsString()
  title: string;

  @IsString()
  domain: string;
}

export class SemesterAchievementDto {
  @IsString()
  name: string;

  @IsString()
  @IsIn(['bronze', 'silver', 'gold', 'platinum', 'diamond'])
  tier: string;

  @IsString()
  unlockedAt: string;
}

export class SkillGrowthDto {
  @IsNumber()
  start: number;

  @IsNumber()
  end: number;
}

// ── 主 DTO ──

export class GenerateReportDto {
  @IsString()
  childName: string;

  @IsString()
  period: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsNumber()
  @Min(0)
  totalLearningTime: number;

  @IsNumber()
  @Min(0)
  totalLessonsCompleted: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  averageScore: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyStatDto)
  dailyStats: DailyStatDto[];

  @IsObject()
  skillProgress: Record<string, number>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AchievementDto)
  achievements: AchievementDto[];

  @IsArray()
  @IsString({ each: true })
  insights: string[];

  @IsNumber()
  @Min(0)
  streak: number;

  @IsString()
  encouragement: string;
}

export class GenerateMonthlyReportDto extends GenerateReportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeekSummaryDto)
  weekSummaries: WeekSummaryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrendHistoryDto)
  trendHistory: TrendHistoryDto[];

  @IsString()
  monthlyHighlight: string;
}

export class GeneratePoetryDto {
  @IsNumber()
  poemId: number;

  @IsString()
  title: string;

  @IsString()
  author: string;

  @IsString()
  dynasty: string;

  @IsString()
  type: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  lines: string[];

  @IsString()
  translation: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteDto)
  notes: NoteDto[];

  @IsString()
  appreciation: string;

  @IsOptional()
  @IsString()
  background?: string;
}

export class GenerateContentSlideDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsString()
  ageRange: string;

  @IsString()
  domain: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentSectionDto)
  sections: ContentSectionDto[];

  @IsOptional()
  @IsString()
  summary?: string;
}

export class GenerateAchievementDto {
  @IsString()
  childName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AchievementDto)
  achievements: AchievementDto[];

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  fontFamily?: string;
}

export class GenerateSemesterDto {
  @IsString()
  childName: string;

  @IsString()
  semesterLabel: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsString()
  summary: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonthSummaryDto)
  monthSummaries: MonthSummaryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LearnedPoemDto)
  learnedPoems: LearnedPoemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LearnedLessonDto)
  learnedLessons: LearnedLessonDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SemesterAchievementDto)
  achievements: SemesterAchievementDto[];

  @IsNumber()
  @Min(0)
  totalLearningTime: number;

  @IsNumber()
  @Min(0)
  totalLessonsCompleted: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  averageScore: number;

  @IsNumber()
  @Min(0)
  totalDaysStudied: number;

  @IsObject()
  skillGrowth: Record<string, SkillGrowthDto>;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  fontFamily?: string;
}

export class GenerateFromJsonDto {
  @IsString()
  title: string;

  @IsArray()
  @ValidateNested({ each: true })
  slides: any[];

  @IsObject()
  theme: any;
}
