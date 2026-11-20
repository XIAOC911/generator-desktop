export type LLMProviderId = 'openai' | 'openai-compatible' | 'ollama';
export type LLMTaskId =
  | 'headline'
  | 'selling-points'
  | 'layout-suggestion'
  | 'custom'
  | 'campaign-pack'
  | 'vision-campaign-pack'
  | 'vision-layout-suggestion';

export type AiCopyPack = {
  headline: string;
  subheadline?: string;
  badge?: string;
  sellingPoints: string[];
  cta?: string;
  paletteHint?: string;
};

export type LLMRequest = {
  prompt: string;
  system?: string;
  images?: string[];
  provider?: LLMProviderId;
  model?: string;
  imageModel?: string;
  temperature?: number;
  task?: LLMTaskId;
};

export type LLMResponse = {
  text: string;
  raw?: unknown;
  provider?: LLMProviderId;
  model?: string;
};

export type LLMSettings = {
  provider: LLMProviderId;
  baseUrl: string;
  model: string;
  imageModel: string;
  temperature: number;
};

export type LLMSettingsPayload = LLMSettings & {
  apiKey?: string;
  clearApiKey?: boolean;
};

export type LLMProviderStatus = {
  id: LLMProviderId;
  label: string;
  available: boolean;
  message: string;
};

export type LLMSettingsResponse = {
  settings: LLMSettings & { hasApiKey: boolean };
  providers: LLMProviderStatus[];
};

export type LLMProxyResponse = {
  ok: boolean;
  status: number;
  text: string;
};

export type LLMGenerateResponse =
  | {
      status: 'success';
      result: LLMResponse;
    }
  | {
      status: 'error';
      error: string;
    };

type VisualImageSource = 'canvas' | 'selected-assets';

export type VisionComposeOptions = {
  includeCanvas: boolean;
  includeSelectedAssets: boolean;
  maxSelectedAssetImages: number;
};

export type VisionContextSummary = {
  imageCount: number;
  sources: VisualImageSource[];
  selectedAssetCount: number;
  usedSelectedAssetCount: number;
};


export type SceneGenerateMode = 'generate-scenes' | 'replicate-scenes';

export type SceneGenerateRequest = {
  prompt: string;
  provider?: LLMProviderId;
  imageModel?: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  count?: number;
  referenceImages?: string[];
};

export type SceneGenerateResponse =
  | {
      status: 'success';
      images: Array<{ dataUrl: string; revisedPrompt?: string }>;
    }
  | {
      status: 'error';
      error: string;
    };

export type SceneReferenceAnalysis = {
  styleSummary: string;
  shotType?: string;
  lighting?: string;
  palette?: string;
  props?: string[];
  composition?: string;
};
