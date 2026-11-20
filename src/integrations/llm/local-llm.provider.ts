import type { LLMProvider } from './provider';

export const localLlmProvider: LLMProvider = {
  name: 'local-llm',
  async generateText(req) {
    return { text: `stub: ${req.prompt}` };
  }
};
