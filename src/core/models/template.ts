import type { LayerFilters, Layer } from './layer';

export type TemplateSpecItem = {
  slotIndex?: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  filters: LayerFilters;
  sourceFileId?: string;
  sourceName?: string;
  freeSourceLayer?: boolean;
};

export type MemoryTemplate = {
  id: string;
  name: string;
  spec: TemplateSpecItem[];
  canvasSize?: number;
  slotCount?: number;
  sourceMode?: 'random';
  createdAt: number;
};

export type SceneTemplateBackgroundItem = {
  id: string;
  name: string;
  dataUrl: string;
  sourceType?: 'image' | 'psd';
  psdTemplateId?: string;
  sceneMeta?: {
    preset: 'center-stage' | 'left-stage' | 'right-stage' | 'wide-stage';
    source?: 'scene' | 'replicate-scene';
    compositionHint?: string;
  };
};

export type BackgroundTemplateItem = {
  id: string;
  name: string;
  dataUrl: string;
};

export type BackgroundTemplate = {
  id: string;
  name: string;
  items: BackgroundTemplateItem[];
  createdAt: number;
};

export type SceneCarouselTemplateEntry = {
  id: string;
  name: string;
  order?: number;
  background: SceneTemplateBackgroundItem;
  layers: Layer[];
  canvasSize?: number;
  slotCount?: number;
  sourceMode?: 'random';
  createdAt: number;
  previewDataUrl?: string;
};

export type SceneCarouselTemplate = {
  id: string;
  name: string;
  entries: SceneCarouselTemplateEntry[];
  canvasSize?: number;
  slotCount?: number;
  sourceMode?: 'random';
  createdAt: number;
};
