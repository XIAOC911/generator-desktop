import type { MattingProvider } from './provider';

export const localMattingProvider: MattingProvider = {
  name: 'local-matting',
  async cutout(input) {
    return {
      cutoutPath: input.assetPath
    };
  }
};
