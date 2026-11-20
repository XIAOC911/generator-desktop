import type { LLMGenerateResponse, LLMSettingsResponse, SceneGenerateResponse } from '@/core/models/llm';
import type { PsdTemplate } from '@/core/models/psd';

type PsdLayerMaskPayload = {
  templateId: string;
  layerId: string;
  maskDataUrl: string;
  layerDataUrl: string;
  fullCanvasLayerDataUrl?: string;
  width: number;
  height: number;
};

export {};

declare global {
  interface Window {
    fanDesktop: {
      file: {
        openImages: () => Promise<Array<{ id: string; name: string; originalPath: string; previewUrl: string; naturalWidth?: number; naturalHeight?: number }>>;
        openJson: () => Promise<{ filePath: string; content: string } | null>;
        pickDirectory: () => Promise<string | null>;
        readImage: (filePath: string) => Promise<{ dataUrl: string; width: number; height: number } | null>;
      };
      project: {
        saveAs: (payload: unknown) => Promise<{ filePath: string; recentProjects: Array<{ filePath: string; name: string; lastOpenedAt: number }> } | null>;
        saveToPath: (payload: unknown) => Promise<{ filePath: string; recentProjects: Array<{ filePath: string; name: string; lastOpenedAt: number }> } | null>;
        open: () => Promise<{ filePath: string; content: string; recentProjects: Array<{ filePath: string; name: string; lastOpenedAt: number }> } | null>;
        openRecent: (filePath: string) => Promise<{ filePath: string; content: string; recentProjects: Array<{ filePath: string; name: string; lastOpenedAt: number }> } | null>;
        listRecent: () => Promise<Array<{ filePath: string; name: string; lastOpenedAt: number }>>;
        saveAutosave: (payload: unknown) => Promise<{ filePath: string; savedAt: number } | null>;
        loadAutosave: () => Promise<{ filePath: string; content: string; savedAt: number } | null>;
        clearAutosave: () => Promise<boolean>;
      };
      template: {
        load: () => Promise<string>;
        save: (payload: unknown) => Promise<string>;
      };
      psd: {
        openTemplates: () => Promise<PsdTemplate[]>;
        setProductSlot: (payload: { templateId: string; layerId: string }) => Promise<boolean>;
        getLayerMask: (payload: { templateId: string; layerId: string }) => Promise<PsdLayerMaskPayload | null>;
        renderCleanBackground: (payload: { templateId: string; excludeLayerIds: string[] }) => Promise<string | null>;
        clearCache: (payload: { templateId?: string }) => Promise<boolean>;
      };
      export: {
        writeJobs: (payload: unknown) => Promise<{ count: number }>;
      };
      matting: {
        run: (payload: unknown) => Promise<
          | {
              status: 'success';
              result: {
                cutoutPath: string;
                maskPath?: string;
                previewDataUrl: string;
                provider: string;
                width: number;
                height: number;
                removedPixels?: number;
                backgroundColor?: { r: number; g: number; b: number };
              };
            }
          | {
              status: 'error';
              error: string;
            }
        >;
        getProviderStatus: () => Promise<{
          providers: Array<{
            id: 'edge-floodfill' | 'rembg-python' | 'api-matting';
            label: string;
            available: boolean;
            message: string;
          }>;
        }>;
        exportCutouts: (payload: {
          rootDir: string;
          items: Array<{ sourcePath: string; fileName?: string }>;
        }) => Promise<
          | {
              ok: true;
              count: number;
              skipped?: number;
            }
          | {
              ok: false;
              error: string;
              count: number;
            }
        >;
      };
      llm: {
        getSettings: () => Promise<LLMSettingsResponse>;
        saveSettings: (payload: unknown) => Promise<LLMSettingsResponse>;
        clearApiKey: () => Promise<LLMSettingsResponse>;
        generate: (payload: unknown) => Promise<LLMGenerateResponse>;
        generateImage: (payload: unknown) => Promise<SceneGenerateResponse>;
        request: (payload: { path: string; body: unknown }) => Promise<{ ok: boolean; status: number; text: string }>;
      };
    };
  }
}
