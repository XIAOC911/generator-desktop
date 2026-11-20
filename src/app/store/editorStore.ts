import type { AppState, BackgroundRotationItem, RecentProject, SourceAsset } from '@/core/models/project';
import type { PsdTemplate, PsdLayerNode } from '@/core/models/psd';
import { createDefaultAppState } from '@/core/constants/defaults';
import type { Layer } from '@/core/models/layer';
import type { MattingResult } from '@/core/models/matting';
import { createId } from '@/core/utils/id';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';

/**
 * 将当前预览状态的产品图转换为图层
 * 当用户添加文字/贴纸时，确保产品图不会消失 */
function buildLayersFromPreview(state: AppState): Layer[] {
  const selectedAssets = state.sourceAssets.filter((asset) => asset.selected);
  if (selectedAssets.length === 0) return [];

  const layers: Layer[] = [];

  if (state.mode === 'combination') {
    const templateId = state.layoutId || state.selectedMemoryTemplateId;
    const template = state.memoryTemplates.find((item) => item.id === templateId);
    if (!template) return [];

    template.spec.forEach((specItem, index) => {
      const asset =
        selectedAssets[specItem.slotIndex ?? index] ??
        selectedAssets[index] ??
        state.sourceAssets.find(
          (candidate) => candidate.id === specItem.sourceFileId || candidate.name === specItem.sourceName
        );
      if (!asset) return;
      layers.push({
        id: createId(),
        type: 'image',
        x: specItem.x,
        y: specItem.y,
        scale: specItem.scale,
        rotation: specItem.rotation,
        opacity: specItem.opacity ?? 100,
        filters: specItem.filters ? { ...specItem.filters } : { ...DEFAULT_FILTERS },
        visible: true,
        sourceFileId: asset.id,
        sourceName: asset.name,
        previewUrl: asset.previewUrl,
        freeSourceLayer: specItem.freeSourceLayer ?? true
      });
    });
  }

  return layers;
}

let state: AppState = createDefaultAppState();
const listeners = new Set<() => void>();

// Undo/redo history — tracks layers + selection state
export interface HistoryEntry {
  layers: Layer[];
  activeLayerId?: string;
  selectedLayerIds: string[];
  /** 操作描述，供历史面板展示 */
  description: string;
}
const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];
const MAX_HISTORY = 50;
let isUndoRedoAction = false;

let lastHistoryDesc = '';

function pushHistory(description?: string) {
  // 自动推断操作描述
  if (!description) {
    const prev = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
    if (!prev) {
      description = '初始状态';
    } else {
      const prevIds = new Set(prev.layers.map((l) => l.id));
      const currIds = new Set(state.layers.map((l) => l.id));
      const added = state.layers.filter((l) => !prevIds.has(l.id));
      const removed = prev.layers.filter((l) => !currIds.has(l.id));
      if (added.length > 0 && removed.length === 0) {
        description = added.length === 1
          ? `添加图层「${(added[0] as any).sourceName || '图片'}」`
          : `添加 ${added.length} 个图层`;
      } else if (removed.length > 0 && added.length === 0) {
        description = removed.length === 1
          ? `删除图层「${(removed[0] as any).sourceName || '图层'}」`
          : `删除 ${removed.length} 个图层`;
      } else if (added.length > 0 && removed.length > 0) {
        description = `修改图层`;
      } else {
        // 同一组图层，属性变化
        const changedLayer = state.layers.find((l) => {
          const prevLayer = prev.layers.find((p) => p.id === l.id);
          return prevLayer && (prevLayer.x !== l.x || prevLayer.y !== l.y);
        });
        if (changedLayer) {
          description = `移动图层「${(changedLayer as any).sourceName || '图层'}」`;
        } else {
          description = `编辑图层属性`;
        }
      }
    }
  }
  lastHistoryDesc = description;
  undoStack.push({
    layers: state.layers.map((l) => ({ ...l } as Layer)),
    activeLayerId: state.activeLayerId,
    selectedLayerIds: [...state.selectedLayerIds],
    description,
  });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

type CommitOptions = {
  markDirty?: boolean;
};

function notify() {
  listeners.forEach((listener) => listener());
}

function commit(next: AppState, options: CommitOptions = {}) {
  // Auto-push history on layers/selection changes (skip during undo/redo)
  if (!isUndoRedoAction && next.layers !== state.layers) {
    pushHistory();
  }
  const markDirty = options.markDirty ?? true;
  state = markDirty
    ? {
        ...next,
        project: {
          ...next.project,
          dirty: true
        }
      }
    : next;
  notify();
}

function fileNameFromPath(filePath?: string) {
  if (!filePath) return undefined;
  return filePath.split(/[/\\]/).pop();
}

function mapAssetAndLinkedLayers(
  assets: SourceAsset[],
  layers: Layer[],
  assetId: string,
  assetMapper: (asset: SourceAsset) => SourceAsset,
  layerMapper?: (layer: Layer, asset: SourceAsset) => Layer
) {
  let updatedAsset: SourceAsset | undefined;
  let linkedLayerCount = 0;
  const nextAssets = assets.map((asset) => {
    if (asset.id !== assetId) return asset;
    updatedAsset = assetMapper(asset);
    return updatedAsset;
  });

  const nextLayers =
    updatedAsset && layerMapper
      ? layers.map((layer) => {
          if (layer.type !== 'image' || layer.sourceFileId !== assetId) return layer;
          linkedLayerCount += 1;
          return layerMapper(layer, updatedAsset as SourceAsset);
        })
      : layers;

  return {
    nextAssets,
    nextLayers,
    updatedAsset,
    linkedLayerCount
  };
}

export const editorStore = {
  getState() {
    return state;
  },
  setState(next: AppState, options: CommitOptions = { markDirty: false }) {
    commit(next, options);
  },
  patch(patch: Partial<AppState>, options?: CommitOptions) {
    commit({ ...state, ...patch }, options);
  },
  patchCanvas(patch: Partial<AppState['canvas']>, options?: CommitOptions) {
    commit({ ...state, canvas: { ...state.canvas, ...patch } }, options);
  },
  setSourcePreviewMode(enabled: boolean) {
    commit({ ...state, sourcePreviewMode: enabled }, { markDirty: false });
  },
  patchProject(patch: Partial<AppState['project']>) {
    commit({ ...state, project: { ...state.project, ...patch } }, { markDirty: false });
  },
  patchExportSettings(
    patch: Partial<
      Pick<
        AppState,
        | 'freeExportMode'
        | 'backgroundRotationMode'
        | 'singleBatch'
        | 'variantCount'
        | 'folderMode'
        | 'splitCount'
        | 'itemsPerFolder'
        | 'sceneCarouselExportMode'
        | 'exportCopies'
        | 'exportNameSuffix'
        | 'useImageNamePrefix'
        | 'enableRandomComboTitle'
        | 'titleRequiredFirst'
        | 'titleIncludeImageName'
        | 'titleRequiredText'
        | 'titleRandomPool'
        | 'preferredLayoutFamilies'
      >
    >,
    options?: CommitOptions
  ) {
    commit({ ...state, ...patch }, options);
  },
  loadProject(next: AppState, projectPatch?: Partial<AppState['project']>) {
    const recentProjects = projectPatch?.recentProjects ?? state.project.recentProjects;
    const currentFilePath = projectPatch?.currentFilePath;
    commit(
      {
        ...next,
        project: {
          ...next.project,
          currentFilePath,
          currentName: projectPatch?.currentName ?? fileNameFromPath(currentFilePath) ?? next.project.currentName,
          dirty: projectPatch?.dirty ?? false,
          recentProjects,
          lastSavedAt: projectPatch?.lastSavedAt ?? Date.now()
        }
      },
      { markDirty: false }
    );
  },
  setRecentProjects(recentProjects: RecentProject[]) {
    commit({ ...state, project: { ...state.project, recentProjects } }, { markDirty: false });
  },
  markProjectSaved(filePath?: string, recentProjects?: RecentProject[]) {
    commit(
      {
        ...state,
        project: {
          ...state.project,
          currentFilePath: filePath ?? state.project.currentFilePath,
          currentName: fileNameFromPath(filePath ?? state.project.currentFilePath) ?? state.project.currentName,
          dirty: false,
          recentProjects: recentProjects ?? state.project.recentProjects,
          lastSavedAt: Date.now()
        }
      },
      { markDirty: false }
    );
  },
  setLayers(layers: Layer[]) {
    commit({ ...state, layers });
  },
  addLayer(layer: Layer) {
    // 如果当前还没有图层，先把预览中的商品图转换成可编辑图层
    let currentLayers = state.layers;
    if (currentLayers.length === 0) {
      const previewLayers = buildLayersFromPreview(state);
      currentLayers = previewLayers;
    }
    commit({ ...state, layers: [...currentLayers, layer], activeLayerId: layer.id });
  },
  updateLayer(layerId: string, patch: Partial<Layer>) {
    const layers = state.layers.map((layer) => (layer.id === layerId ? ({ ...layer, ...patch } as Layer) : layer));
    commit({ ...state, layers });
  },
  moveLayer(layerId: string, direction: -1 | 1) {
    const index = state.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.layers.length) return;
    const layers = [...state.layers];
    const [item] = layers.splice(index, 1);
    layers.splice(nextIndex, 0, item);
    commit({ ...state, layers });
  },
  /** 将图层移动到新数组中的指定位置（0 = 最底层，toIndex 是移除后的新数组下标） */
  reorderLayer(layerId: string, toIndex: number) {
    const layers = [...state.layers];
    const fromIndex = layers.findIndex((l) => l.id === layerId);
    if (fromIndex < 0) return;
    const [item] = layers.splice(fromIndex, 1);
    layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, item);
    commit({ ...state, layers });
  },
  removeLayer(layerId: string) {
    commit({
      ...state,
      layers: state.layers.filter((layer) => layer.id !== layerId),
      activeLayerId: state.activeLayerId === layerId ? undefined : state.activeLayerId,
    });
  },
  setActiveLayerId(layerId?: string) {
    commit({ ...state, activeLayerId: layerId, selectedLayerIds: layerId ? [layerId] : [] }, { markDirty: false });
  },
  toggleLayerSelection(layerId: string) {
    const set = new Set(state.selectedLayerIds);
    if (set.has(layerId)) set.delete(layerId); else set.add(layerId);
    commit({ ...state, selectedLayerIds: Array.from(set) }, { markDirty: false });
  },
  clearLayerSelection() {
    commit({ ...state, selectedLayerIds: [] }, { markDirty: false });
  },
  removeSelectedLayers() {
    const ids = new Set(state.selectedLayerIds);
    if (ids.size === 0 && state.activeLayerId) ids.add(state.activeLayerId);
    const remaining = state.layers.filter((layer) => !ids.has(layer.id));
    commit({
      ...state,
      layers: remaining,
      activeLayerId: remaining.length > 0 ? remaining[remaining.length - 1].id : undefined,
      selectedLayerIds: [],
    });
  },
  moveSelectedLayers(direction: -1 | 1) {
    const ids = new Set(state.selectedLayerIds);
    if (ids.size === 0 && state.activeLayerId) ids.add(state.activeLayerId);
    let layers = [...state.layers];
    // Collect indices to move, sorted by direction
    const indices = layers
      .map((l, i) => ({ id: l.id, i }))
      .filter((x) => ids.has(x.id))
      .sort((a, b) => direction * (a.i - b.i));
    for (const { id } of indices) {
      const idx = layers.findIndex((l) => l.id === id);
      const next = idx + direction;
      if (next < 0 || next >= layers.length) continue;
      [layers[idx], layers[next]] = [layers[next], layers[idx]];
    }
    commit({ ...state, layers });
  },
  toggleSelectedLayersVisibility() {
    const ids = new Set(state.selectedLayerIds);
    if (ids.size === 0 && state.activeLayerId) ids.add(state.activeLayerId);
    const allVisible = ids.size > 0 && ids.size === state.layers.filter((l) => ids.has(l.id)).every((l) => l.visible ?? true);
    const nextVisible = !allVisible;
    const layers = state.layers.map((layer) => (ids.has(layer.id) ? { ...layer, visible: nextVisible } as Layer : layer));
    commit({ ...state, layers });
  },
  moveSelectedLayersToFront() {
    const ids = new Set(state.selectedLayerIds);
    if (ids.size === 0 && state.activeLayerId) ids.add(state.activeLayerId);
    const selected = state.layers.filter((l) => ids.has(l.id));
    const rest = state.layers.filter((l) => !ids.has(l.id));
    commit({ ...state, layers: [...rest, ...selected] });
  },
  moveSelectedLayersToBack() {
    const ids = new Set(state.selectedLayerIds);
    if (ids.size === 0 && state.activeLayerId) ids.add(state.activeLayerId);
    const selected = state.layers.filter((l) => ids.has(l.id));
    const rest = state.layers.filter((l) => !ids.has(l.id));
    commit({ ...state, layers: [...selected, ...rest] });
  },
  duplicateSelectedLayers() {
    const ids = new Set(state.selectedLayerIds);
    if (ids.size === 0 && state.activeLayerId) ids.add(state.activeLayerId);
    const newIds: string[] = [];
    const layers = state.layers.flatMap((layer) => {
      if (!ids.has(layer.id)) return [layer];
      const dup = { ...layer, id: createId() };
      newIds.push(dup.id);
      return [layer, dup];
    });
    commit({ ...state, layers, activeLayerId: newIds[newIds.length - 1], selectedLayerIds: newIds });
  },
  addAssets(assets: SourceAsset[]) {
    commit({ ...state, sourceAssets: [...state.sourceAssets, ...assets] });
  },
  replaceAssets(sourceAssets: SourceAsset[]) {
    commit({ ...state, sourceAssets });
  },
  updateAsset(assetId: string, patch: Partial<SourceAsset>, options?: CommitOptions) {
    commit(
      {
        ...state,
        sourceAssets: state.sourceAssets.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset))
      },
      options
    );
  },
  toggleAssetSelection(assetId: string) {
    commit({
      ...state,
      sourceAssets: state.sourceAssets.map((asset) =>
        asset.id === assetId ? { ...asset, selected: !asset.selected } : asset
      )
    });
  },
  setAssetMattingPending(assetId: string, provider: string) {
    const { nextAssets, nextLayers } = mapAssetAndLinkedLayers(
      state.sourceAssets,
      state.layers,
      assetId,
      (asset) => ({
        ...asset,
        mattingStatus: 'pending',
        mattingProvider: provider,
        mattingError: undefined
      })
    );
    commit({ ...state, sourceAssets: nextAssets, layers: nextLayers });
  },
  applyMattingResult(assetId: string, result: MattingResult) {
    const { nextAssets, nextLayers, linkedLayerCount } = mapAssetAndLinkedLayers(
      state.sourceAssets,
      state.layers,
      assetId,
      (asset) => ({
        ...asset,
        previewUrl: result.previewDataUrl,
        originalPreviewUrl: asset.originalPreviewUrl ?? asset.previewUrl,
        cutoutPath: result.cutoutPath,
        maskPath: result.maskPath,
        mattingStatus: 'success',
        mattingProvider: result.provider,
        mattingError: undefined
      }),
      (layer, asset) => ({
        ...layer,
        previewUrl: asset.previewUrl,
        sourceName: asset.name
      })
    );
    commit({ ...state, sourceAssets: nextAssets, layers: nextLayers });
    const previewReferenceCount = state.layers.length === 0 && nextAssets.some((asset) => asset.id === assetId && asset.selected) ? 1 : 0;
    return linkedLayerCount + previewReferenceCount;
  },
  markAssetMattingFailed(assetId: string, error: string) {
    commit({
      ...state,
      sourceAssets: state.sourceAssets.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              mattingStatus: 'failed',
              mattingError: error
            }
          : asset
      )
    });
  },
  /** 停止抠图时重置 pending → idle/success，不清除已有抠图数据 */
  clearAssetMattingPending(assetId: string) {
    const asset = state.sourceAssets.find((item) => item.id === assetId);
    if (!asset || asset.mattingStatus !== 'pending') return;
    commit({
      ...state,
      sourceAssets: state.sourceAssets.map((item) =>
        item.id === assetId
          ? {
              ...item,
              mattingStatus: item.cutoutPath ? 'success' : 'idle',
              mattingError: undefined
            }
          : item
      )
    });
  },
  restoreAssetOriginal(assetId: string) {
    const { nextAssets, nextLayers, linkedLayerCount } = mapAssetAndLinkedLayers(
      state.sourceAssets,
      state.layers,
      assetId,
      (asset) => ({
        ...asset,
        previewUrl: asset.originalPreviewUrl ?? asset.previewUrl,
        cutoutPath: undefined,
        maskPath: undefined,
        mattingStatus: 'idle',
        mattingError: undefined
      }),
      (layer, asset) => ({
        ...layer,
        previewUrl: asset.previewUrl,
        sourceName: asset.name
      })
    );
    commit({ ...state, sourceAssets: nextAssets, layers: nextLayers });
    const previewReferenceCount = state.layers.length === 0 && nextAssets.some((asset) => asset.id === assetId && asset.selected) ? 1 : 0;
    return linkedLayerCount + previewReferenceCount;
  },
  removeAsset(assetId: string) {
    commit({
      ...state,
      sourceAssets: state.sourceAssets.filter((asset) => asset.id !== assetId),
      layers: state.layers.filter((layer) => layer.type !== 'image' || layer.sourceFileId !== assetId),
      activeLayerId:
        state.activeLayerId &&
        state.layers.some(
          (layer) => layer.id === state.activeLayerId && !(layer.type === 'image' && layer.sourceFileId === assetId)
        )
          ? state.activeLayerId
          : undefined
    });
  },
  setBackgroundRotationItems(items: BackgroundRotationItem[]) {
    commit({ ...state, backgroundRotationItems: items, activeBgRotationIndex: 0 });
  },
  upsertPsdTemplates(templates: PsdTemplate[]) {
    const byId = new Map(state.psdTemplates.map((item) => [item.id, item]));
    templates.forEach((item) => byId.set(item.id, item));
    commit({
      ...state,
      psdTemplates: Array.from(byId.values()),
      selectedPsdTemplateId: templates[0]?.id ?? state.selectedPsdTemplateId
    });
  },
  updatePsdTemplateProductLayer(templateId: string, layerId?: string) {
    const updatedTemplates = state.psdTemplates.map((template) =>
      template.id === templateId
        ? { ...template, selectedProductLayerId: layerId }
        : template
    );
    commit({ ...state, psdTemplates: updatedTemplates });
  },
  bindAssetToPsdSlot(templateId: string, layerId: string, assetId: string) {
    const asset = state.sourceAssets.find((item) => item.id === assetId);
    if (!asset) return false;
    const updatedTemplates = state.psdTemplates.map((template) =>
      template.id === templateId
        ? {
            ...template,
            slotBindings: {
              ...(template.slotBindings ?? {}),
              [layerId]: {
                assetId: asset.id,
                assetName: asset.name,
                previewUrl: asset.previewUrl,
                boundAt: Date.now()
              }
            }
          }
        : template
    );
    commit({
      ...state,
      psdManualMode: false,
      selectedPsdSlotId: layerId,
      sourceAssets: state.sourceAssets.map((item) =>
        item.id === assetId ? { ...item, selected: true } : item
      ),
      psdTemplates: updatedTemplates
    });
    return true;
  },
  unbindAssetFromPsdSlot(templateId: string, layerId: string) {
    const updatedTemplates = state.psdTemplates.map((template) => {
      if (template.id !== templateId || !template.slotBindings?.[layerId]) return template;
      const nextBindings = { ...template.slotBindings };
      delete nextBindings[layerId];
      return {
        ...template,
        slotBindings: Object.keys(nextBindings).length ? nextBindings : undefined
      };
    });
    commit({ ...state, psdTemplates: updatedTemplates });
  },
  removePsdTemplate(templateId: string) {
    const updatedTemplates = state.psdTemplates.filter((template) => template.id !== templateId);
    const isActiveBackground = state.canvas.backgroundPsdTemplateId === templateId;
    commit({
      ...state,
      psdTemplates: updatedTemplates,
      selectedPsdTemplateId: state.selectedPsdTemplateId === templateId ? undefined : state.selectedPsdTemplateId,
      ...(isActiveBackground ? {
        canvas: {
          ...state.canvas,
          backgroundType: 'color' as const,
          backgroundPsdTemplateId: undefined,
          backgroundImageUrl: undefined,
        }
      } : {})
    });
  },
  setSelectedPsdTemplateId(templateId?: string) {
    commit({ ...state, selectedPsdTemplateId: templateId, selectedPsdSlotId: undefined }, { markDirty: false });
  },
  setSelectedPsdSlotId(layerId?: string) {
    commit({ ...state, selectedPsdSlotId: layerId }, { markDirty: false });
  },
  setPsdLayerVisibility(templateId: string, layerId: string, visible: boolean) {
    function updateNode(node: PsdLayerNode): PsdLayerNode {
      if (node.id === layerId) {
        return { ...node, visible };
      }
      if (node.children) {
        return { ...node, children: node.children.map(updateNode) };
      }
      return node;
    }
    const updatedTemplates = state.psdTemplates.map((template) =>
      template.id === templateId
        ? { ...template, layers: template.layers.map(updateNode) }
        : template
    );
    commit({ ...state, psdTemplates: updatedTemplates });
  },
  setActiveBgRotationIndex(index: number) {
    const safeIndex = Math.max(0, Math.min(index, Math.max(0, state.backgroundRotationItems.length - 1)));
    commit({ ...state, activeBgRotationIndex: safeIndex }, { markDirty: false });
  },
  undo() {
    if (undoStack.length === 0) return;
    isUndoRedoAction = true;
    redoStack.push({
      layers: state.layers.map((l) => ({ ...l } as Layer)),
      activeLayerId: state.activeLayerId,
      selectedLayerIds: [...state.selectedLayerIds],
      description: lastHistoryDesc,
    });
    const entry = undoStack.pop()!;
    commit({ ...state, layers: entry.layers, activeLayerId: entry.activeLayerId, selectedLayerIds: entry.selectedLayerIds }, { markDirty: true });
    isUndoRedoAction = false;
  },
  redo() {
    if (redoStack.length === 0) return;
    isUndoRedoAction = true;
    undoStack.push({
      layers: state.layers.map((l) => ({ ...l } as Layer)),
      activeLayerId: state.activeLayerId,
      selectedLayerIds: [...state.selectedLayerIds],
      description: lastHistoryDesc,
    });
    const entry = redoStack.pop()!;
    commit({ ...state, layers: entry.layers, activeLayerId: entry.activeLayerId, selectedLayerIds: entry.selectedLayerIds }, { markDirty: true });
    isUndoRedoAction = false;
  },
  getHistory(): HistoryEntry[] {
    return [...undoStack];
  },
  getRedoHistory(): HistoryEntry[] {
    return [...redoStack];
  },
  jumpToHistory(targetIndex: number) {
    // targetIndex 是从 undoStack 顶部算起的索引（0=当前最新，越大越旧）
    // 弹出 undoStack 直到只剩 targetIndex 个条目
    if (targetIndex < 0 || targetIndex >= undoStack.length) return;
    while (undoStack.length > targetIndex + 1) {
      redoStack.push(undoStack.pop()!);
    }
    if (undoStack.length > 0) {
      const entry = undoStack[undoStack.length - 1];
      isUndoRedoAction = true;
      commit({ ...state, layers: entry.layers, activeLayerId: entry.activeLayerId, selectedLayerIds: entry.selectedLayerIds }, { markDirty: true });
      isUndoRedoAction = false;
    }
  },
  reset() {
    const recentProjects = state.project.recentProjects;
    const memoryTemplates = state.memoryTemplates;
    const bgRotationTemplates = state.bgRotationTemplates;
    const psdTemplates = state.psdTemplates;
    const sceneCarouselTemplates = state.sceneCarouselTemplates;
    state = createDefaultAppState();
    state.project.recentProjects = recentProjects;
    state.memoryTemplates = memoryTemplates;
    state.bgRotationTemplates = bgRotationTemplates;
    state.psdTemplates = psdTemplates;
    state.sceneCarouselTemplates = sceneCarouselTemplates;
    notify();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};
