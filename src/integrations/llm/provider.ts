import type { LLMRequest, LLMResponse } from '@/core/models/llm';

export interface LLMProvider {
  name: string;
  generateText(req: LLMRequest): Promise<LLMResponse>;
}
