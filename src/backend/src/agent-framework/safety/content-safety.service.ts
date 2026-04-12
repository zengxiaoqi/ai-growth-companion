/**
 * Content safety service — NestJS wrapper around the core safety utilities.
 * Provides DI-friendly access to content filtering.
 */

import { Injectable } from '@nestjs/common';
import { filterContent, isContentSafe, type SafetyFilterResult } from '../core/utils/content-safety';

@Injectable()
export class ContentSafetyService {
  /** Full safety filter: prohibited words + PII redaction + encouragement */
  filter(text: string): SafetyFilterResult {
    return filterContent(text);
  }

  /** Check if content contains prohibited words */
  isSafe(text: string): boolean {
    return isContentSafe(text);
  }
}
