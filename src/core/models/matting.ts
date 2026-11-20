export type MattingProviderId = 'edge-floodfill' | 'rembg-python' | 'api-matting';
export type MattingBackgroundMode = 'auto' | 'white' | 'black';
export type RembgModelId = 'isnet-general-use' | 'u2net' | 'u2netp' | 'u2net_human_seg' | 'u2net_cloth_seg';

export type MattingRequest = {
  assetPath: string;
  outputDir?: string;
  provider?: MattingProviderId;
  threshold?: number;
  backgroundMode?: MattingBackgroundMode;
  createMask?: boolean;
  model?: RembgModelId;
  alphaMatting?: boolean;
  foregroundThreshold?: number;
  backgroundThreshold?: number;
  erodeSize?: number;
};

export type MattingResult = {
  cutoutPath: string;
  maskPath?: string;
  previewDataUrl: string;
  provider: string;
  width: number;
  height: number;
  removedPixels?: number;
  backgroundColor?: {
    r: number;
    g: number;
    b: number;
  };
};

export type MattingProviderStatus = {
  id: MattingProviderId;
  label: string;
  available: boolean;
  message: string;
};

export type MattingRunResponse =
  | {
      status: 'success';
      result: MattingResult;
    }
  | {
      status: 'error';
      error: string;
    };

export type MattingProviderStatusResponse = {
  providers: MattingProviderStatus[];
};
