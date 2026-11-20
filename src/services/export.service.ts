import { editorStore } from '@/app/store/editorStore';
import { renderCanvasScene } from '@/core/renderer/canvas-renderer';
import { updateQueue } from '@/core/engines/queue-engine';
import { buildRandomFreeLayers } from '@/core/engines/free-layout-engine';
import { buildSceneCarouselEntryState, sceneCarouselTemplateService } from '@/services/scene-carousel-template.service';
import type {
  AppState,
  BackgroundRotationItem,
  BackgroundRotationMode,
  ExportProgress,
  FolderMode,
  SourceAsset
} from '@/core/models/project';
import type { ImageLayer, Layer } from '@/core/models/layer';
import type { ExportJob } from '@/core/models/export';

export type BatchFolderMode = 'split' | 'chunk';

// ---- Export Progress Store ----
let _progress: ExportProgress = { status: 'idle', total: 0, completed: 0, message: '' };
const _progressListeners = new Set<() => void>();
let _abortController: AbortController | null = null;

function updateProgress(patch: Partial<ExportProgress>) {
  _progress = { ..._progress, ...patch };
  _progressListeners.forEach((fn) => fn());
}

export function getExportProgress(): ExportProgress {
  return _progress;
}

export function subscribeExportProgress(listener: () => void) {
  _progressListeners.add(listener);
  return () => _progressListeners.delete(listener);
}

export function cancelExport() {
  if (_abortController) {
    updateProgress({ status: 'cancelling', message: '正在取消...' });
    _abortController.abort();
  }
}

export function resetExportProgress() {
  _abortController = null;
  updateProgress({ status: 'idle', total: 0, completed: 0, message: '' });
}

function isCancelled(): boolean {
  return _abortController?.signal.aborted ?? false;
}

export type BatchExportOptions = {
  folderMode: BatchFolderMode;
  itemsPerFolder: number;
};

export type BatchExportSummary = {
  groupCount: number;
  totalCount: number;
  backgroundCount: number;
  folderMode: FolderMode;
  backgroundRotationMode: BackgroundRotationMode;
};

type NormalizedExportOptions = {
  folderMode: FolderMode;
  splitCount: number;
  itemsPerFolder: number;
  singleBatch: number;
  variantCount: number;
  backgroundRotationMode: BackgroundRotationMode;
};

function sanitizeName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '_') || 'Result';
}

function buildComboTitleForExport(
  state: AppState,
  sourceNames: string[]
): string {
  if (!state.enableRandomComboTitle) return '';
  const required = state.titleRequiredText
    .split(/[,锛孿s]+/)
    .filter((t) => t.trim());
  const pool = state.titleRandomPool
    .split(/[,锛孿s]+/)
    .filter((t) => t.trim());

  // Pick random words from pool (1-3 words)
  const pickCount = Math.min(3, Math.max(1, Math.ceil(pool.length * 0.3)));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, pickCount);

  const parts: string[] = [];

  if (state.titleRequiredFirst && required.length > 0) {
    parts.push(required[0]);
  }

  parts.push(...picked);

  if (!state.titleRequiredFirst && required.length > 0) {
    parts.push(required[0]);
  }

  if (state.titleIncludeImageName && sourceNames.length > 0) {
    const firstImageName = sourceNames[0].replace(/\.[^.]+$/, '').slice(0, 16);
    parts.push(firstImageName);
  }

  return parts.join('_') || '';
}

function buildExportPrefix(state: AppState, basePrefix: string, sourceNames: string[]): string {
  let result = basePrefix;

  if (state.useImageNamePrefix && sourceNames.length > 0) {
    const firstImageName = sourceNames[0].replace(/\.[^.]+$/, '').slice(0, 20);
    result = `${firstImageName}_${result}`;
  }

  if (state.exportNameSuffix) {
    result = `${result}${state.exportNameSuffix}`;
  }

  return sanitizeName(result);
}

function buildExportFileName(
  state: AppState,
  basePrefix: string,
  baseName: string,
  sourceNames: string[]
): string {
  const comboTitle = buildComboTitleForExport(state, sourceNames);
  const suffix = state.exportNameSuffix ? state.exportNameSuffix : '';

  if (comboTitle) {
    return `${comboTitle}${suffix}_${baseName}`;
  }

  if (state.useImageNamePrefix && sourceNames.length > 0) {
    const firstImageName = sourceNames[0].replace(/\.[^.]+$/, '').slice(0, 20);
    return `${firstImageName}${suffix}_${baseName}`;
  }

  if (state.exportNameSuffix) {
    return `${basePrefix}${suffix}_${baseName}`;
  }

  return `${basePrefix}_${baseName}`;
}

function normalizeExportOptions(state: AppState, options: BatchExportOptions): NormalizedExportOptions {
  const folderMode: FolderMode = options.folderMode === 'chunk' ? 'chunk' : 'split';
  const backgroundRotationMode: BackgroundRotationMode = state.backgroundRotationMode;

  return {
    folderMode,
    splitCount: Math.max(1, state.splitCount || 1),
    itemsPerFolder: Math.max(1, options.itemsPerFolder || state.itemsPerFolder || 1),
    singleBatch: Math.max(1, state.singleBatch || 1),
    variantCount: Math.max(1, state.variantCount || 1),
    backgroundRotationMode
  };
}

export function estimateBatchSummary(state: AppState, options: BatchExportOptions): BatchExportSummary {
  const normalized = normalizeExportOptions(state, options);
  const selectedMemoryTemplate = state.memoryTemplates.find((item) => item.id === state.selectedMemoryTemplateId);
  const selectedSceneCarouselTemplate = state.sceneCarouselTemplates.find(
    (item) => item.id === state.selectedSceneCarouselTemplateId
  );
  const queue = updateQueue(state.layoutId, state.sourceAssets, state.mode, state.repeatMode, 120, {
    randomCount: state.randomCount,
    layoutSlots: selectedMemoryTemplate?.spec.length,
    sceneSlots: selectedMemoryTemplate?.spec.length
  });
  const backgroundCount = state.backgroundRotationItems.length;

  if (state.mode === 'scene' && selectedSceneCarouselTemplate) {
    if (state.sceneCarouselExportMode === 'per-product') {
      const selectedCount = state.sourceAssets.filter((a) => a.selected).length;
      const groupCount = Math.max(1, selectedCount);
      const totalCount = groupCount * selectedSceneCarouselTemplate.entries.length;
      return {
        groupCount,
        totalCount,
        backgroundCount: selectedSceneCarouselTemplate.entries.length,
        folderMode: normalized.folderMode,
        backgroundRotationMode: normalized.backgroundRotationMode
      };
    }
    const effectiveSlotCount = selectedSceneCarouselTemplate.slotCount || Math.max(
      ...selectedSceneCarouselTemplate.entries.map((e) => e.slotCount ?? e.layers.filter((l) => l.type === 'image').length),
      1
    );
    const sceneQueue = updateQueue(state.layoutId, state.sourceAssets, 'random', state.repeatMode, 120, {
      randomCount: effectiveSlotCount
    });
    const groupCount = Math.min(sceneQueue.length, normalized.singleBatch);
    const totalCount = groupCount * selectedSceneCarouselTemplate.entries.length;
    return {
      groupCount,
      totalCount,
      backgroundCount: selectedSceneCarouselTemplate.entries.length,
      folderMode: normalized.folderMode,
      backgroundRotationMode: normalized.backgroundRotationMode
    };
  }

  if (state.layers.length > 0) {
    const groupCount = normalized.singleBatch;
    const freeVariants = Math.max(1, state.freeExportMode === 'random' ? normalized.variantCount : 1);
    const backgroundsPerGroup = normalized.backgroundRotationMode === 'all' ? Math.max(1, backgroundCount) : 1;
    return {
      groupCount,
      totalCount: groupCount * freeVariants * backgroundsPerGroup,
      backgroundCount,
      folderMode: normalized.folderMode,
      backgroundRotationMode: normalized.backgroundRotationMode
    };
  }

  const groupCount = Math.min(queue.length, normalized.singleBatch);
  const backgroundsPerGroup = normalized.backgroundRotationMode === 'all' ? Math.max(1, backgroundCount) : 1;
  return {
    groupCount,
    totalCount: groupCount * backgroundsPerGroup,
    backgroundCount,
    folderMode: normalized.folderMode,
    backgroundRotationMode: normalized.backgroundRotationMode
  };
}

/** 加载图层的全分辨率原图，替换 thumbnail previewUrl */
async function resolveFullResLayers(state: AppState): Promise<AppState> {
  const paths = new Set<string>();
  for (const layer of state.layers) {
    if (layer.type === 'image' && (layer as any).originalPath) {
      paths.add((layer as any).originalPath as string);
    }
  }
  if (paths.size === 0) return state;

  const pathToDataUrl = new Map<string, string>();
  for (const filePath of paths) {
    try {
      const result = await window.fanDesktop.file.readImage(filePath);
      if (result?.dataUrl) pathToDataUrl.set(filePath, result.dataUrl);
    } catch { /* 加载失败则保持缩略图 */ }
  }
  if (pathToDataUrl.size === 0) return state;

  return {
    ...state,
    layers: state.layers.map((layer) => {
      if (layer.type !== 'image' || !(layer as any).originalPath) return layer;
      const fullRes = pathToDataUrl.get((layer as any).originalPath);
      if (!fullRes) return layer;
      return { ...layer, previewUrl: fullRes } as typeof layer;
    }),
  };
}

async function renderStateToDataUrl(state: AppState) {
  // 导出时加载全分辨率原图，替换缩略图
  const highResState = await resolveFullResLayers(state);
  const canvas = document.createElement('canvas');
  canvas.width = highResState.canvas.size;
  canvas.height = highResState.canvas.size;
  await renderCanvasScene(canvas, highResState);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function buildStateForQueueJob(baseState: AppState, files: SourceAsset[]) {
  return {
    ...baseState,
    layers: [],
    activeLayerId: undefined,
    sourceAssets: baseState.sourceAssets.map((asset) => ({
      ...asset,
      selected: files.some((file) => file.id === asset.id)
    }))
  } satisfies AppState;
}

function buildStateForBackground(baseState: AppState, backgroundItem?: BackgroundRotationItem) {
  if (!backgroundItem) return baseState;

  // 濡傛灉鏄?PSD 鑳屾櫙
  if (backgroundItem.sourceType === 'psd' && backgroundItem.psdTemplateId) {
    const psdTemplate = baseState.psdTemplates.find(t => t.id === backgroundItem.psdTemplateId);
    return {
      ...baseState,
      canvas: {
        ...baseState.canvas,
        backgroundType: 'psd',
        backgroundImageUrl: psdTemplate?.previewDataUrl || backgroundItem.dataUrl,
        backgroundPsdTemplateId: backgroundItem.psdTemplateId
      }
    } satisfies AppState;
  }

  // 普通图片背景
  return {
    ...baseState,
    canvas: {
      ...baseState.canvas,
      backgroundType: 'image',
      backgroundImageUrl: backgroundItem.dataUrl
    }
  } satisfies AppState;
}

function buildStateForFreeVariant(baseState: AppState, variantIndex: number) {
  if (baseState.freeExportMode !== 'random') return baseState;

  const imageLayers = baseState.layers.filter((layer): layer is ImageLayer => layer.type === 'image');
  const freeLayers = imageLayers.filter((layer) => layer.freeSourceLayer);
  if (!freeLayers.length) return baseState;

  const sourceFiles = freeLayers
    .map((layer) =>
      baseState.sourceAssets.find(
        (asset) => asset.id === layer.sourceFileId || asset.name === layer.sourceName
      )
    )
    .filter((asset): asset is SourceAsset => Boolean(asset));

  if (!sourceFiles.length) return baseState;

  const families = ['center', 'triangle', 'sides', 'vertical'] as const;
  const family = families[variantIndex % families.length];
  const randomizedFreeLayers = buildRandomFreeLayers(sourceFiles, family).map((layer, index) => {
    const baseLayer = freeLayers[index];
    return {
      ...baseLayer,
      ...layer,
      id: baseLayer?.id ?? layer.id
    } satisfies ImageLayer;
  });

  const freeLayerIds = new Set(freeLayers.map((layer) => layer.id));
  const nextLayers: Layer[] = baseState.layers.map((layer) => {
    if (layer.type !== 'image' || !freeLayerIds.has(layer.id)) return layer;
    return randomizedFreeLayers.shift() ?? layer;
  });

  return {
    ...baseState,
    layers: nextLayers
  } satisfies AppState;
}

type DraftJob = {
  groupKey: string;
  fileName: string;
  dataUrl: string;
  backgroundIndex: number;
};

const EXPORT_WRITE_CHUNK_SIZE = 12;
const EXPORT_YIELD_INTERVAL = 4;

function createFolderResolver(
  baseFolder: string,
  options: NormalizedExportOptions,
  orderedGroupKeys: string[]
) {
  if (options.folderMode === 'chunk') {
    return (job: DraftJob, index: number): ExportJob => ({
      folder: `${baseFolder}/batch_${String(Math.floor(index / options.itemsPerFolder) + 1).padStart(3, '0')}`,
      fileName: job.fileName,
      dataUrl: job.dataUrl
    });
  }

  const splitCount = Math.max(1, options.splitCount);
  const groupsPerFolder = Math.max(1, Math.ceil(orderedGroupKeys.length / splitCount));
  const folderByGroupKey = new Map(
    orderedGroupKeys.map((groupKey, groupIndex) => [
      groupKey,
      `${baseFolder}/group_${String(Math.floor(groupIndex / groupsPerFolder) + 1).padStart(3, '0')}`
    ])
  );

  return (job: DraftJob): ExportJob => ({
    folder: folderByGroupKey.get(job.groupKey) ?? `${baseFolder}/group_001`,
    fileName: job.fileName,
    dataUrl: job.dataUrl
  });
}

async function yieldToMainThread() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushExportBuffer(rootDir: string, buffer: ExportJob[]) {
  if (!buffer.length) return 0;
  const jobs = buffer.splice(0, buffer.length);
  await window.fanDesktop.export.writeJobs({ rootDir, jobs });
  return jobs.length;
}

function expandBackgrounds(state: AppState, rotationMode: BackgroundRotationMode, groupIndex: number) {
  const items = state.backgroundRotationItems;
  if (!items.length) return [undefined];
  if (rotationMode === 'all') return items;
  return [items[groupIndex % items.length]];
}

function assignFolders(baseFolder: string, draftJobs: DraftJob[], options: NormalizedExportOptions): ExportJob[] {
  if (!draftJobs.length) return [];

  if (options.folderMode === 'chunk') {
    return draftJobs.map((job, index) => ({
      folder: `${baseFolder}/batch_${String(Math.floor(index / options.itemsPerFolder) + 1).padStart(3, '0')}`,
      fileName: job.fileName,
      dataUrl: job.dataUrl
    }));
  }

  const splitCount = Math.max(1, options.splitCount);
  const orderedGroupKeys = Array.from(new Set(draftJobs.map((job) => job.groupKey)));
  const groupsPerFolder = Math.max(1, Math.ceil(orderedGroupKeys.length / splitCount));
  const folderByGroupKey = new Map(
    orderedGroupKeys.map((groupKey, groupIndex) => [
      groupKey,
      `${baseFolder}/group_${String(Math.floor(groupIndex / groupsPerFolder) + 1).padStart(3, '0')}`
    ])
  );

  return draftJobs.map((job) => ({
    folder: folderByGroupKey.get(job.groupKey) ?? `${baseFolder}/group_001`,
    fileName: job.fileName,
    dataUrl: job.dataUrl
  }));
}

/**
 * 鎵嬪姩 PSD 鎺掔増妯″紡瀵煎嚭锛氶亶鍘嗛€変腑鐨勭礌鏉愶紝濂楃敤鑷敱鍥惧眰鐨勬帓鐗堜綅缃? */
async function buildPsdManualLayerJobs(prefix: string, options: BatchExportOptions) {
  const baseState = editorStore.getState();
  const normalized = normalizeExportOptions(baseState, options);
  const draftJobs: DraftJob[] = [];
  const copyCount = Math.max(1, baseState.exportCopies || 1);

  // 获取用户手动放置的素材槽位图层
  const templateLayers = baseState.layers.filter((l): l is ImageLayer => l.type === 'image' && l.freeSourceLayer);
  const selectedAssets = baseState.sourceAssets.filter((a) => a.selected);

  if (!templateLayers.length || !selectedAssets.length) return [];

  // 获取当前导出需要轮换的背景集合
  const backgrounds = expandBackgrounds(baseState, normalized.backgroundRotationMode, 0);
  const sourceNames = selectedAssets.map((a) => a.name);

  for (let assetIndex = 0; assetIndex < selectedAssets.length; assetIndex++) {
    const asset = selectedAssets[assetIndex];
    if (!asset.previewUrl) continue;

    for (let bgIndex = 0; bgIndex < backgrounds.length; bgIndex++) {
      // 构建当前背景下的渲染状态
      const bgState = backgrounds[bgIndex]
        ? buildStateForBackground(baseState, backgrounds[bgIndex])
        : baseState;

      // 鎵嬪姩妯″紡蹇呴』淇濇寔 psdManualMode=true锛岄槻姝㈡覆鏌撳櫒浣跨敤鑷姩鏇挎崲
      const stateWithPsdManual = {
        ...bgState,
        psdManualMode: true,
      };

      // 用当前素材替换所有素材槽位，保留文字和装饰层
      const layers: Layer[] = baseState.layers.map((layer) => {
        if (layer.type === 'image' && layer.freeSourceLayer) {
          return { ...layer, sourceFileId: asset.id, sourceName: asset.name, previewUrl: asset.previewUrl, originalPath: (asset as any).originalPath } as ImageLayer;
        }
        return layer;
      });

      const renderState = {
        ...stateWithPsdManual,
        layers,
        sourceAssets: baseState.sourceAssets.map((a) => ({
          ...a,
          selected: a.id === asset.id,
        })),
      };

      const dataUrl = await renderStateToDataUrl(renderState);

      for (let copyIndex = 0; copyIndex < copyCount; copyIndex++) {
        const copySuffix = copyCount > 1 ? `_${String(copyIndex + 1).padStart(2, '0')}` : '';
        const bgSuffix = backgrounds.length > 1 ? `_bg_${String(bgIndex + 1).padStart(2, '0')}` : '';
        const baseName = `${String(assetIndex + 1).padStart(3, '0')}${bgSuffix}${copySuffix}`;
        const fileName = buildExportFileName(baseState, prefix, baseName + '.jpg', sourceNames);
        draftJobs.push({
          groupKey: `product-${assetIndex + 1}`,
          fileName: fileName.endsWith('.jpg') ? fileName : fileName + '.jpg',
          dataUrl,
          backgroundIndex: bgIndex,
        });
      }
    }
  }

  return assignFolders(buildExportPrefix(baseState, `${prefix}_psd_manual`, []), draftJobs, normalized);
}

async function buildQueueJobs(prefix: string, options: BatchExportOptions) {
  const state = editorStore.getState();
  const normalized = normalizeExportOptions(state, options);
  const selectedMemoryTemplate = state.memoryTemplates.find((item) => item.id === state.selectedMemoryTemplateId);
  const queue = updateQueue(state.layoutId, state.sourceAssets, state.mode, state.repeatMode, 120, {
    randomCount: state.randomCount,
    layoutSlots: selectedMemoryTemplate?.spec.length,
    sceneSlots: selectedMemoryTemplate?.spec.length
  }).slice(0, normalized.singleBatch);

  const draftJobs: DraftJob[] = [];
  const copyCount = Math.max(1, state.exportCopies || 1);

  for (let comboIndex = 0; comboIndex < queue.length; comboIndex += 1) {
    const files = queue[comboIndex];
    if (!files.length) continue;

    const sourceNames = files.map((f) => f.name);
    const backgrounds = expandBackgrounds(state, normalized.backgroundRotationMode, comboIndex);
    for (let variantIndex = 0; variantIndex < backgrounds.length; variantIndex += 1) {
      const variantState = buildStateForBackground(buildStateForQueueJob(state, files), backgrounds[variantIndex]);
      const dataUrl = await renderStateToDataUrl(variantState);
      const variantSuffix = backgrounds[variantIndex] ? `_bg_${String(variantIndex + 1).padStart(2, '0')}` : '';
      const baseName = String(comboIndex + 1).padStart(3, '0') + variantSuffix;

      for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
        const copySuffix = copyCount > 1 ? `_${String(copyIndex + 1).padStart(2, '0')}` : '';
        const fileName = buildExportFileName(state, prefix, baseName + copySuffix + '.jpg', sourceNames);
        draftJobs.push({
          groupKey: `queue-${comboIndex + 1}`,
          fileName: fileName.endsWith('.jpg') ? fileName : fileName + '.jpg',
          dataUrl,
          backgroundIndex: variantIndex
        });
      }
    }
  }
  return assignFolders(buildExportPrefix(state, `${prefix}_fixed_layout`, []), draftJobs, normalized);
}

async function buildLayerJobs(prefix: string, options: BatchExportOptions) {
  const state = editorStore.getState();

  // 鎵嬪姩 PSD 鎺掔増妯″紡锛氶亶鍘嗛€変腑绱犳潗锛屽鐢ㄨ嚜鐢卞浘灞傜殑鎺掔増浣嶇疆
  if (state.psdManualMode) {
    const manualJobs = await buildPsdManualLayerJobs(prefix, options);
    if (manualJobs.length > 0) return manualJobs;
    // 如果没有选中素材或槽位，则回退到普通自由排版导出
  }

  const normalized = normalizeExportOptions(state, options);
  const draftJobs: DraftJob[] = [];
  const groupCount = normalized.singleBatch;
  const copyCount = Math.max(1, state.exportCopies || 1);

  const imageLayers = state.layers.filter((l): l is ImageLayer => l.type === 'image');
  const sourceNames = imageLayers
    .filter((l) => l.freeSourceLayer)
    .map((l) => l.sourceName || '')
    .filter(Boolean);

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const freeVariants = Math.max(1, state.freeExportMode === 'random' ? normalized.variantCount : 1);
    const backgrounds = expandBackgrounds(state, normalized.backgroundRotationMode, groupIndex);
    for (let freeIndex = 0; freeIndex < freeVariants; freeIndex += 1) {
      for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
        const copySuffix = copyCount > 1 ? `_${String(copyIndex + 1).padStart(2, '0')}` : '';
        if (normalized.backgroundRotationMode === 'all') {
          for (let bgIndex = 0; bgIndex < backgrounds.length; bgIndex += 1) {
            const variantState = buildStateForBackground(buildStateForFreeVariant(state, freeIndex), backgrounds[bgIndex]);
            const dataUrl = await renderStateToDataUrl(variantState);
            const baseName = `${String(groupIndex + 1).padStart(3, '0')}_${String(freeIndex + 1).padStart(2, '0')}_bg_${String(bgIndex + 1).padStart(2, '0')}${copySuffix}`;
            const fileName = buildExportFileName(state, prefix, baseName + '.jpg', sourceNames);
            draftJobs.push({
              groupKey: `free-${groupIndex + 1}`,
              fileName: fileName.endsWith('.jpg') ? fileName : fileName + '.jpg',
              dataUrl,
              backgroundIndex: bgIndex
            });
          }
        } else {
          const backgroundItem = backgrounds[0];
          const variantState = buildStateForBackground(buildStateForFreeVariant(state, freeIndex), backgroundItem);
          const dataUrl = await renderStateToDataUrl(variantState);
          const baseName = `${String(groupIndex + 1).padStart(3, '0')}_${String(freeIndex + 1).padStart(2, '0')}${copySuffix}`;
          const fileName = buildExportFileName(state, prefix, baseName + '.jpg', sourceNames);
          draftJobs.push({
            groupKey: `free-${groupIndex + 1}`,
            fileName: fileName.endsWith('.jpg') ? fileName : fileName + '.jpg',
            dataUrl,
            backgroundIndex: 0
          });
        }
      }
    }
  }

  return assignFolders(buildExportPrefix(state, `${prefix}_free_layout`, []), draftJobs, normalized);
}


async function buildSceneCarouselTemplateJobs(prefix: string, options: BatchExportOptions) {
  const state = editorStore.getState();
  const template = sceneCarouselTemplateService.getTemplate();
  if (!template) return [];
  const effectiveSlotCount = template.slotCount || Math.max(
    ...template.entries.map((e) => e.slotCount ?? e.layers.filter((l) => l.type === 'image').length),
    1
  );
  const normalized = normalizeExportOptions(state, options);
  const queue = updateQueue(state.layoutId, state.sourceAssets, 'random', state.repeatMode, 120, {
    randomCount: effectiveSlotCount
  }).slice(0, normalized.singleBatch);
  if (!queue.length) return [];

  const draftJobs: DraftJob[] = [];
  const copyCount = Math.max(1, state.exportCopies || 1);
  const totalJobs = queue.length * template.entries.length * copyCount;
  updateProgress({ status: 'running', total: totalJobs, completed: 0, message: '场景轮播导出中...' });

  for (let comboIndex = 0; comboIndex < queue.length; comboIndex += 1) {
    if (isCancelled()) { updateProgress({ status: 'cancelled', total: totalJobs, completed: draftJobs.length, message: '已取消' }); return []; }
    const files = queue[comboIndex];
    if (!files.length) continue;

    const sourceNames = files.map((f) => f.name);
    const templateState = {
      ...state,
      backgroundRotationItems: template.entries.map((entry) => ({ ...entry.background })),
      activeBgRotationIndex: 0,
      randomCount: effectiveSlotCount,
      sameProductCount: 1
    } satisfies AppState;

    for (let entryIndex = 0; entryIndex < template.entries.length; entryIndex += 1) {
      if (isCancelled()) { updateProgress({ status: 'cancelled', total: totalJobs, completed: draftJobs.length, message: '已取消' }); return []; }
      const entry = template.entries[entryIndex];
      const renderState = buildSceneCarouselEntryState(templateState, entry, files);
      const dataUrl = await renderStateToDataUrl(renderState);

      for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
        const copySuffix = copyCount > 1 ? `_${String(copyIndex + 1).padStart(2, '0')}` : '';
        const baseName = `${String(comboIndex + 1).padStart(3, '0')}_${String(entryIndex + 1).padStart(2, '0')}${copySuffix}`;
        const fileName = buildExportFileName(state, prefix, baseName + '.jpg', sourceNames);
        draftJobs.push({
          groupKey: `scene-${comboIndex + 1}`,
          fileName: fileName.endsWith('.jpg') ? fileName : fileName + '.jpg',
          dataUrl,
          backgroundIndex: entryIndex
        });
      }
    }

    if (comboIndex % 3 === 0) {
      updateProgress({ completed: draftJobs.length, message: `渲染中 ${draftJobs.length}/${totalJobs}` });
    }

    if (comboIndex % 3 === 2) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  updateProgress({ completed: draftJobs.length, message: '正在写入文件...' });
  return assignFolders(buildExportPrefix(state, `${prefix}_scene_carousel`, []), draftJobs, normalized);
}

async function buildPerProductSceneCarouselJobs(prefix: string) {
  const state = editorStore.getState();
  const template = sceneCarouselTemplateService.getTemplate();
  if (!template || !template.entries.length) return [];

  const selectedProducts = state.sourceAssets.filter((asset) => asset.selected);
  if (!selectedProducts.length) return [];

  const jobs: ExportJob[] = [];
  const copyCount = Math.max(1, state.exportCopies || 1);
  let productIndex = 0;

  for (const product of selectedProducts) {
    const productName = sanitizeName(product.name || 'product');
    const baseFolder = buildExportPrefix(state, `${prefix}_${productName}`, [product.name]);
    const templateState = {
      ...state,
      backgroundRotationItems: template.entries.map((entry) => ({
        ...entry.background,
        id: entry.background.id,
        name: entry.background.name,
        dataUrl: entry.background.dataUrl
      })),
      activeBgRotationIndex: 0
    } satisfies AppState;

    for (let entryIndex = 0; entryIndex < template.entries.length; entryIndex += 1) {
      const entry = template.entries[entryIndex];
      const renderState = buildSceneCarouselEntryState(templateState, entry, [product]);
      const dataUrl = await renderStateToDataUrl(renderState);

      for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
        const copySuffix = copyCount > 1 ? `_${String(copyIndex + 1).padStart(2, '0')}` : '';
        const baseName = `${String(entryIndex + 1).padStart(2, '0')}${copySuffix}`;
        const fileName = buildExportFileName(state, prefix, `${baseName}.jpg`, [product.name]);
        jobs.push({
          folder: baseFolder,
          fileName: fileName.endsWith('.jpg') ? fileName : `${fileName}.jpg`,
          dataUrl
        });
      }
    }

    productIndex += 1;
    if (productIndex % EXPORT_YIELD_INTERVAL === 0) {
      await yieldToMainThread();
    }
  }

  return jobs;
}

async function exportPsdManualLayerBatchStreaming(rootDir: string, prefix: string, options: BatchExportOptions) {
  const baseState = editorStore.getState();
  const normalized = normalizeExportOptions(baseState, options);
  const copyCount = Math.max(1, baseState.exportCopies || 1);
  const templateLayers = baseState.layers.filter((layer): layer is ImageLayer => layer.type === 'image' && layer.freeSourceLayer);
  const selectedAssets = baseState.sourceAssets.filter((asset) => asset.selected);

  if (!templateLayers.length || !selectedAssets.length) return 0;

  const backgrounds = expandBackgrounds(baseState, normalized.backgroundRotationMode, 0);
  const sourceNames = selectedAssets.map((asset) => asset.name);
  const baseFolder = buildExportPrefix(baseState, `${prefix}_psd_manual`, []);
  const orderedGroupKeys = selectedAssets.map((_, index) => `product-${index + 1}`);
  const resolveFolder = createFolderResolver(baseFolder, normalized, orderedGroupKeys);
  const buffer: ExportJob[] = [];
  let jobIndex = 0;
  let writtenCount = 0;

  const totalJobs = selectedAssets.length * Math.max(1, backgrounds.length) * copyCount;
  updateProgress({ status: 'running', total: totalJobs, completed: 0, message: 'PSD 手动套版导出中...' });

  for (let assetIndex = 0; assetIndex < selectedAssets.length; assetIndex += 1) {
    if (isCancelled()) { updateProgress({ status: 'cancelled', total: totalJobs, completed: writtenCount, message: '已取消' }); return writtenCount; }
    const asset = selectedAssets[assetIndex];
    if (!asset.previewUrl) continue;

    for (let bgIndex = 0; bgIndex < backgrounds.length; bgIndex += 1) {
      if (isCancelled()) { updateProgress({ status: 'cancelled', total: totalJobs, completed: writtenCount, message: '已取消' }); return writtenCount; }
      const bgState = backgrounds[bgIndex]
        ? buildStateForBackground(baseState, backgrounds[bgIndex])
        : baseState;

      const layers: Layer[] = baseState.layers.map((layer) => {
        if (layer.type === 'image' && layer.freeSourceLayer) {
          return {
            ...layer,
            sourceFileId: asset.id,
            sourceName: asset.name,
            previewUrl: asset.previewUrl,
            originalPath: (asset as any).originalPath
          } as ImageLayer;
        }
        return layer;
      });

      const renderState = {
        ...bgState,
        psdManualMode: true,
        layers,
        sourceAssets: baseState.sourceAssets.map((sourceAsset) => ({
          ...sourceAsset,
          selected: sourceAsset.id === asset.id
        }))
      } satisfies AppState;

      const dataUrl = await renderStateToDataUrl(renderState);
      for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
        const copySuffix = copyCount > 1 ? `_${String(copyIndex + 1).padStart(2, '0')}` : '';
        const bgSuffix = backgrounds.length > 1 ? `_bg_${String(bgIndex + 1).padStart(2, '0')}` : '';
        const baseName = `${String(assetIndex + 1).padStart(3, '0')}${bgSuffix}${copySuffix}`;
        const fileName = buildExportFileName(baseState, prefix, `${baseName}.jpg`, sourceNames);
        const draftJob: DraftJob = {
          groupKey: `product-${assetIndex + 1}`,
          fileName: fileName.endsWith('.jpg') ? fileName : `${fileName}.jpg`,
          dataUrl,
          backgroundIndex: bgIndex
        };
        buffer.push(resolveFolder(draftJob, jobIndex));
        jobIndex += 1;

        if (buffer.length >= EXPORT_WRITE_CHUNK_SIZE) {
          writtenCount += await flushExportBuffer(rootDir, buffer);
          if (jobIndex % 4 === 0) updateProgress({ completed: writtenCount, message: `正在导出 ${writtenCount}/${totalJobs}` });
          await yieldToMainThread();
        }
      }

      if ((assetIndex * Math.max(1, backgrounds.length) + bgIndex + 1) % EXPORT_YIELD_INTERVAL === 0) {
        await yieldToMainThread();
      }
    }
  }

  writtenCount += await flushExportBuffer(rootDir, buffer);
  updateProgress({ completed: writtenCount, message: `已完成 ${writtenCount} 张` });
  return writtenCount;
}

async function exportQueueBatchStreaming(rootDir: string, prefix: string, options: BatchExportOptions) {
  const state = editorStore.getState();
  const normalized = normalizeExportOptions(state, options);
  const selectedMemoryTemplate = state.memoryTemplates.find((item) => item.id === state.selectedMemoryTemplateId);
  const queue = updateQueue(state.layoutId, state.sourceAssets, state.mode, state.repeatMode, 120, {
    randomCount: state.randomCount,
    layoutSlots: selectedMemoryTemplate?.spec.length,
    sceneSlots: selectedMemoryTemplate?.spec.length
  }).slice(0, normalized.singleBatch);

  if (!queue.length) return 0;

  const copyCount = Math.max(1, state.exportCopies || 1);
  const backgroundsPerCombo = normalized.backgroundRotationMode === 'all' ? Math.max(1, state.backgroundRotationItems.length) : 1;
  const totalJobs = queue.length * backgroundsPerCombo * copyCount;
  updateProgress({ status: 'running', total: totalJobs, completed: 0, message: '排队导出中...' });

  const baseFolder = buildExportPrefix(state, `${prefix}_fixed_layout`, []);
  const orderedGroupKeys = queue.map((_, index) => `queue-${index + 1}`);
  const resolveFolder = createFolderResolver(baseFolder, normalized, orderedGroupKeys);
  const buffer: ExportJob[] = [];
  let jobIndex = 0;
  let writtenCount = 0;

  for (let comboIndex = 0; comboIndex < queue.length; comboIndex += 1) {
    if (isCancelled()) { updateProgress({ status: 'cancelled', total: totalJobs, completed: writtenCount, message: '已取消' }); return writtenCount; }
    const files = queue[comboIndex];
    if (!files.length) continue;

    const sourceNames = files.map((file) => file.name);
    const backgrounds = expandBackgrounds(state, normalized.backgroundRotationMode, comboIndex);
    for (let variantIndex = 0; variantIndex < backgrounds.length; variantIndex += 1) {
      if (isCancelled()) { updateProgress({ status: 'cancelled', total: totalJobs, completed: writtenCount, message: '已取消' }); return writtenCount; }
      const variantState = buildStateForBackground(buildStateForQueueJob(state, files), backgrounds[variantIndex]);
      const dataUrl = await renderStateToDataUrl(variantState);
      const variantSuffix = backgrounds[variantIndex] ? `_bg_${String(variantIndex + 1).padStart(2, '0')}` : '';
      const baseName = `${String(comboIndex + 1).padStart(3, '0')}${variantSuffix}`;

      for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
        const copySuffix = copyCount > 1 ? `_${String(copyIndex + 1).padStart(2, '0')}` : '';
        const fileName = buildExportFileName(state, prefix, `${baseName}${copySuffix}.jpg`, sourceNames);
        const draftJob: DraftJob = {
          groupKey: `queue-${comboIndex + 1}`,
          fileName: fileName.endsWith('.jpg') ? fileName : `${fileName}.jpg`,
          dataUrl,
          backgroundIndex: variantIndex
        };
        buffer.push(resolveFolder(draftJob, jobIndex));
        jobIndex += 1;

        if (buffer.length >= EXPORT_WRITE_CHUNK_SIZE) {
          writtenCount += await flushExportBuffer(rootDir, buffer);
          if (jobIndex % 4 === 0) updateProgress({ completed: writtenCount, message: `正在导出 ${writtenCount}/${totalJobs}` });
          await yieldToMainThread();
        }
      }
    }

    if ((comboIndex + 1) % EXPORT_YIELD_INTERVAL === 0) {
      await yieldToMainThread();
    }
  }

  writtenCount += await flushExportBuffer(rootDir, buffer);
  updateProgress({ completed: writtenCount, message: `已完成 ${writtenCount} 张` });
  return writtenCount;
}

export const exportService = {
  async exportCurrentPreview(prefix = 'Result') {
    const rootDir = await window.fanDesktop.file.pickDirectory();
    if (!rootDir) return;

    const safePrefix = sanitizeName(prefix);
    const state = editorStore.getState();
    const dataUrl = await renderStateToDataUrl(state);

    await window.fanDesktop.export.writeJobs({
      rootDir,
      jobs: [
        {
          folder: `${safePrefix}_preview`,
          fileName: `${safePrefix}_current.jpg`,
          dataUrl
        }
      ]
    });
  },

  async exportSceneCarousel(prefix = 'Result', options: BatchExportOptions = { folderMode: 'chunk', itemsPerFolder: 20 }) {
    const rootDir = await window.fanDesktop.file.pickDirectory();
    if (!rootDir) return;

    const safePrefix = sanitizeName(prefix);
    const state = editorStore.getState();

    // 先检查素材数量是否满足模板槽位要求
    if (state.sceneCarouselExportMode !== 'per-product') {
      const template = sceneCarouselTemplateService.getTemplate();
      const selectedCount = state.sourceAssets.filter((a) => a.selected).length;
      const requiredSlots = template?.slotCount || Math.max(
        ...(template?.entries ?? []).map((e) => e.slotCount ?? e.layers.filter((l) => l.type === 'image').length),
        1
      );

      const estimatedTotal = (state.sceneCarouselExportMode === 'per-product'
        ? selectedCount * (template?.entries.length ?? 1)
        : Math.min(state.singleBatch || 20, 120) * (template?.entries.length ?? 1)
      ) * Math.max(1, state.exportCopies || 1);

      if (estimatedTotal > 200) {
        const ok = window.confirm(
          `预计导出 ${estimatedTotal} 张图，可能需要较长时间。\n\n建议减少选中素材或降低”单批数量”。\n\n是否继续？`
        );
        if (!ok) return;
      }

      if (selectedCount < requiredSlots && state.repeatMode !== 'repeat') {
        window.alert(`当前模板至少需要 ${requiredSlots} 张素材（每个场景 ${requiredSlots} 个槽位），但你只选中了 ${selectedCount} 张。请多选素材或开启”允许重复”模式。`);
        return;
      }
    }

    // Setup abort controller & progress
    _abortController = new AbortController();
    updateProgress({ status: 'running', total: 0, completed: 0, message: '准备导出...' });

    try {
      const jobs = state.sceneCarouselExportMode === 'per-product'
        ? await buildPerProductSceneCarouselJobs(safePrefix)
        : await buildSceneCarouselTemplateJobs(safePrefix, options);

      if (_abortController?.signal.aborted) {
        updateProgress({ status: 'cancelled', message: '已取消' });
        return;
      }

      if (!jobs.length) {
        updateProgress({ status: 'done', message: '无内容可导出' });
        window.alert('当前没有可导出的场景套图结果，请先选择模板并勾选素材。');
        return;
      }

      updateProgress({ status: 'running', completed: jobs.length, message: '正在写入文件...' });
      await window.fanDesktop.export.writeJobs({ rootDir, jobs });

      updateProgress({ status: 'done', total: jobs.length, completed: jobs.length, message: '导出完成' });
      if (state.sceneCarouselExportMode === 'per-product') {
        const productNames = [...new Set(jobs.map((j) => j.folder))];
        window.alert(`已按产品导出：${productNames.length} 个产品，共 ${jobs.length} 张图。`);
      } else {
        window.alert(`已按场景套图模板导出 ${jobs.length} 张轮播图。`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || _abortController?.signal.aborted) {
        updateProgress({ status: 'cancelled', message: '已取消' });
        return;
      }
      console.error('[exportSceneCarousel] writeJobs failed:', err);
      updateProgress({ status: 'done', message: '导出失败' });
      window.alert(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      _abortController = null;
    }
  },

  async exportBatch(prefix = 'Result', options: BatchExportOptions = { folderMode: 'chunk', itemsPerFolder: 20 }) {
    const rootDir = await window.fanDesktop.file.pickDirectory();
    if (!rootDir) return;

    const safePrefix = sanitizeName(prefix);
    const state = editorStore.getState();
    const hasEditableLayers = state.layers.length > 0;

    // Setup abort controller & progress
    _abortController = new AbortController();
    updateProgress({ status: 'running', total: 0, completed: 0, message: '准备导出...' });

    try {
      if (state.psdManualMode && hasEditableLayers) {
        const writtenCount = await exportPsdManualLayerBatchStreaming(rootDir, safePrefix, options);
        if (_abortController?.signal.aborted) { updateProgress({ status: 'cancelled', message: '已取消' }); return; }
        if (!writtenCount) {
          updateProgress({ status: 'done', message: '无内容可导出' });
          window.alert('当前没有可导出的 PSD 手动套版结果，请先勾选素材并设置素材槽位。');
          return;
        }
        updateProgress({ status: 'done', total: writtenCount, completed: writtenCount, message: '导出完成' });
        window.alert(`已导出 ${writtenCount} 张图片。`);
        return;
      }

      if (!hasEditableLayers) {
        const writtenCount = await exportQueueBatchStreaming(rootDir, safePrefix, options);
        if (_abortController?.signal.aborted) { updateProgress({ status: 'cancelled', message: '已取消' }); return; }
        if (!writtenCount) {
          updateProgress({ status: 'done', message: '无内容可导出' });
          window.alert('当前没有可导出的组合排版结果，请先勾选足够的素材并选择版式。');
          return;
        }
        updateProgress({ status: 'done', total: writtenCount, completed: writtenCount, message: '导出完成' });
        window.alert(`已导出 ${writtenCount} 张图片。`);
        return;
      }

      const jobs = await buildLayerJobs(safePrefix, options);
      if (_abortController?.signal.aborted) { updateProgress({ status: 'cancelled', message: '已取消' }); return; }
      if (!jobs.length) {
        updateProgress({ status: 'done', message: '无内容可导出' });
        window.alert('当前没有可导出的自由排版结果。');
        return;
      }

      updateProgress({ status: 'running', completed: jobs.length, message: '正在写入文件...' });
      await window.fanDesktop.export.writeJobs({ rootDir, jobs });
      updateProgress({ status: 'done', total: jobs.length, completed: jobs.length, message: '导出完成' });
      window.alert(`已导出 ${jobs.length} 张图片。`);
    } catch (err: any) {
      if (err?.name === 'AbortError' || _abortController?.signal.aborted) {
        updateProgress({ status: 'cancelled', message: '已取消' });
        return;
      }
      console.error('[exportBatch] failed:', err);
      updateProgress({ status: 'done', message: '导出失败' });
      window.alert(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      _abortController = null;
    }
  }
};
