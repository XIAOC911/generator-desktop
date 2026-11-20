import type { LLMProvider } from './provider';

export const openAiProvider: LLMProvider = {
  name: 'openai',
  async generateText(req) {
    return { text: `stub: ${req.prompt}` };
  }
};
