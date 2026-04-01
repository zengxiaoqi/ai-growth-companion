import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('LLM_BASE_URL', 'http://localhost:11434/v1');
    this.apiKey = this.configService.get<string>('LLM_API_KEY', 'ollama');
    this.model = this.configService.get<string>('LLM_MODEL', 'qwen2.5:7b');
    this.maxTokens = this.configService.get<number>('LLM_MAX_TOKENS', 1024);
    this.temperature = this.configService.get<number>('LLM_TEMPERATURE', 0.7);
  }

  /** Check if LLM is configured and likely available */
  get isConfigured(): boolean {
    return !!this.baseUrl;
  }
}
