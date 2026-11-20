import type { SourceAsset } from './asset';
import type { Layer } from './layer';
import type { BackgroundTemplate, MemoryTemplate, SceneCarouselTemplate, SceneCarouselTemplateEntry } from './template';
import type { PsdTemplate } from './psd';

export type CanvasState = {
  size: number;
  backgroundType: 'color' | 'image' | 'psd';
  backgroundValue: string;
  backgroundImageUrl?: string;
  backgroundPsdTemplateId?: string;
  backgroundFit?: 'cover' | 'contain';
};

export type ScenePlacementPreset = 'center-stage' | 'left-stage' | 'right-stage' | 'wide-stage';

export type BackgroundRotationItem = {
  id: string;
  name: string;
  dataUrl: string;
  sourceType?: 'image' | 'psd';
  psdTemplateId?: string;
  sceneMeta?: {
    preset: ScenePlacementPreset;
    source?: 'scene' | 'replicate-scene';
    compositionHint?: string;
  };
};

export type RecentProject = {
  filePath: string;
  name: string;
  lastOpenedAt: number;
};

export type ProjectMetaState = {
  currentFilePath?: string;
  currentName: string;
  dirty: boolean;
  recentProjects: RecentProject[];
  lastSavedAt?: number;
};

export type WatermarkType = 'text' | 'image';
export type WatermarkPosition = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type WatermarkConfig = {
  enabled: boolean;
  type: WatermarkType;
  /** 文字水印 */
  text: string;
  fontSize: number;       // px，基于画布尺寸
  fontColor: string;
  /** 图片水印 */
  imageDataUrl?: string;
  imageScale: number;     // 图片占画布百分比 5-30
  /** 通用属性 */
  opacity: number;        // 0-100
  rotation: number;       // 0-45 度
  position: WatermarkPosition;
  offsetX: number;
  offsetY: number;
  /** 平铺模式 */
  tileMode: boolean;
  tileSpacing: number;    // 平铺间距 px
};

export type FreeExportMode = 'current' | 'random';
export type BackgroundRotationMode = 'single' | 'all';
export type FolderMode = 'split' | 'chunk';
export type SceneCarouselExportMode = 'combo' | 'per-product';

export type AiDetailState = {
  status: 'idle' | 'analyzing' | 'analyzed' | 'generating' | 'done';
  country: string;
  selectedImageTypes: string[];
  imageTypeCounts: Record<string, number>;
  imageRatio: string;
  generateCount: number;
  perTypeCount: number;
  productMode: string;
  productName: string;
  sellingPoints: string;
  tone: string;
  constraints: string;
  extraRequirements: string;
  completedCount: number;
  failedCount: number;
  productSummaryCn: string;
  productSummaryEn: string;
  productIdentity: {
    nameCn: string;
    nameEn: string;
    categoryCn: string;
    categoryEn: string;
    materialCn: string;
    materialEn: string;
    colorCn: string;
    colorEn: string;
    sizeCn: string;
    sizeEn: string;
  } | null;
  targetAudienceSegments: Array<{ label: string; description: string }>;
  useScenarios: Array<{ label: string; description: string }>;
  toneDirection: string;
  titleSuggestions: Array<{ type: string; text: string }>;
  coreSellingPoints: Array<{ point: string }>;
  copyAngles: Array<{ angle: string; description: string }>;
  sceneStrategy: string;
  complianceNotes: string;
  imageTypeStatuses: Record<string, 'pending' | 'running' | 'done' | 'failed'>;
  imageTypeResults: Record<string, string>;
  imageTypePrompts: Record<string, string>;
  generationHistory: Array<{ time: number; prompts: Record<string, string>; results: Record<string, string> }>;
  // 复刻模式
  generationMode: 'generate' | 'replicate';
  referenceImages: Array<{ id: string; name: string; dataUrl: string; analysis?: string }>;
  replicateAnalysis: string;
  // 批量变量
  multiSize: boolean;
  variableMode: boolean;
  variableCsv: string;
  variableRows: Array<Record<string, string>>;
};

export type ExportProgress = {
  status: 'idle' | 'running' | 'cancelling' | 'done' | 'cancelled';
  total: number;
  completed: number;
  message: string;
};

export type AppState = {
  canvas: CanvasState;
  sourcePreviewMode: boolean;
  activeSidebarTab: string;
  workspaceMode: 'design' | 'ai' | 'ai-detail';
  layoutId: string;
  mode: 'random' | 'scene';
  repeatMode: 'unique' | 'repeat';
  randomCount: number;
  sameProductCount: number;
  freeExportMode: FreeExportMode;
  backgroundRotationMode: BackgroundRotationMode;
  singleBatch: number;
  variantCount: number;
  folderMode: FolderMode;
  splitCount: number;
  itemsPerFolder: number;
  exportCopies: number;
  exportNameSuffix: string;
  useImageNamePrefix: boolean;
  enableRandomComboTitle: boolean;
  titleRequiredFirst: boolean;
  titleIncludeImageName: boolean;
  titleRequiredText: string;
  titleRandomPool: string;
  preferredLayoutFamilies: string[];
  /** 网格布局 — 列数 */
  gridColumns: number;
  /** 网格布局 — 行数 */
  gridRows: number;
  /** 网格布局 — 间距 */
  gridSpacing: number;
  /** 网格布局 — 水平对齐 */
  gridAlignX: 'left' | 'center' | 'right';
  /** 网格布局 — 垂直对齐 */
  gridAlignY: 'top' | 'center' | 'bottom';
  sourceAssets: SourceAsset[];
  layers: Layer[];
  activeLayerId?: string;
  selectedLayerIds: string[];
  memoryTemplates: MemoryTemplate[];
  bgRotationTemplates: BackgroundTemplate[];
  psdTemplates: PsdTemplate[];
  sceneCarouselTemplates: SceneCarouselTemplate[];
  sceneCarouselDraftEntries: SceneCarouselTemplateEntry[];
  selectedMemoryTemplateId?: string;
  selectedBgRotationTemplateId?: string;
  selectedPsdTemplateId?: string;
  selectedPsdSlotId?: string;
  selectedSceneCarouselTemplateId?: string;
  sceneCarouselExportMode: SceneCarouselExportMode;
  psdManualMode: boolean;
  backgroundRotationItems: BackgroundRotationItem[];
  activeBgRotationIndex: number;
  watermark: WatermarkConfig;
  project: ProjectMetaState;
  aiDetail: AiDetailState;
};

export type { SourceAsset } from './asset';
