import type { MattingProvider } from './provider';

export const apiMattingProvider: MattingProvider = {
  name: 'api-matting',
  async cutout(input) {
    return {
      cutoutPath: input.assetPath
    };
  }
};
