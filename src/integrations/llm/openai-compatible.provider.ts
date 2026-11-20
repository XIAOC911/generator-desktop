import type { LLMProvider } from './provider';

export const openAiCompatibleProvider: LLMProvider = {
  name: 'openai-compatible',
  async generateText(req) {
    return { text: `stub: ${req.prompt}` };
  }
};
