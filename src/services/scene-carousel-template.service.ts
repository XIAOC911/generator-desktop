import { editorStore } from '@/app/store/editorStore';
import type { SourceAsset, AppState, BackgroundRotationItem } from '@/core/models/project';
import type { ImageLayer, Layer, TextLayer } from '@/core/models/layer';
import type { SceneCarouselTemplate, SceneCarouselTemplateEntry, SceneTemplateBackgroundItem } from '@/core/models/template';
import { templateService } from '@/services/template.service';
import { nameDialogService } from '@/services/name-dialog.service';
import { renderCanvasScene } from '@/core/renderer/canvas-renderer';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function resolveName(inputName: string | undefined, defaultName: string) {
  const trimmedInput = inputName?.trim();
  if (trimmedInput) return trimmedInput;
  return defaultName;
}

function cloneTextLayer(layer: TextLayer): TextLayer {
  return { ...layer, filters: { ...layer.filters } };
}

function cloneImageLayer(layer: ImageLayer): ImageLayer {
  return { ...layer, filters: { ...layer.filters } };
}

function cloneLayer(layer: Layer): Layer {
  return layer.type === 'text' ? cloneTextLayer(layer) : cloneImageLayer(layer);
}

function cloneBackground(item: BackgroundRotationItem | SceneTemplateBackgroundItem): SceneTemplateBackgroundItem {
  return {
    id: item.id,
    name: item.name,
    dataUrl: item.dataUrl,
    sourceType: item.sourceType ?? 'image',
    psdTemplateId: item.psdTemplateId,
    sceneMeta: item.sceneMeta ? { ...item.sceneMeta } : undefined
  };
}

function buildPlaceholderKeys(layers: Layer[]) {
  const keys: string[] = [];
  const seen = new Set<string>();
  layers.forEach((layer, index) => {
    if (layer.type !== 'image') return;
    // 装饰贴图不参与素材替换，跳过
    if ((layer as ImageLayer).freeSourceLayer === false) return;
    const key = layer.sourceFileId || layer.sourceName || `image-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  });
  return keys;
}

function resolveReplacementAssets(state: AppState) {
  const selected = state.sourceAssets.filter((asset) => asset.selected);
  return selected.length ? selected : state.sourceAssets;
}

function expandAssetsForSceneSlots(state: AppState, assets: SourceAsset[], slotCount: number) {
  const pickedProductCount = Math.max(1, state.randomCount || 1);
  const sameProductCount = Math.max(1, state.sameProductCount || 1);
  const pickedAssets = assets.slice(0, pickedProductCount);
  const baseAssets = pickedAssets.length ? pickedAssets : assets;
  if (!baseAssets.length) return [];

  const expanded = baseAssets.flatMap((asset) => Array.from({ length: sameProductCount }, () => asset));
  const sceneAssets = expanded.length ? expanded : baseAssets;

  if (sceneAssets.length >= slotCount) {
    return sceneAssets.slice(0, slotCount);
  }

  const padded: SourceAsset[] = [];
  for (let index = 0; index < slotCount; index += 1) {
    padded.push(sceneAssets[index % sceneAssets.length]);
  }
  return padded;
}

function withSceneSlotIndices(layers: Layer[]) {
  const used = new Set(
    layers
      .filter((layer): layer is ImageLayer => layer.type === 'image' && layer.slotIndex !== undefined)
      .map((layer) => layer.slotIndex as number)
  );
  let nextSlotIndex = 0;
  return layers.map((layer) => {
    if (layer.type !== 'image') return cloneLayer(layer);
    while (used.has(nextSlotIndex)) nextSlotIndex += 1;
    const slotIndex = layer.slotIndex ?? nextSlotIndex++;
    used.add(slotIndex);
    return {
      ...cloneImageLayer(layer),
      slotIndex
    } satisfies ImageLayer;
  });
}

function remapLayersToAssets(layers: Layer[], assets: SourceAsset[]) {
  if (!assets.length) {
    return withSceneSlotIndices(layers);
  }

  const placeholderKeys = buildPlaceholderKeys(layers);
  const assetByKey = new Map<string, SourceAsset>();
  placeholderKeys.forEach((key, index) => {
    assetByKey.set(key, assets[index % assets.length]);
  });

  return layers.map((layer, index) => {
    if (layer.type !== 'image') return cloneLayer(layer);
    // 装饰贴图（freeSourceLayer === false）保留原样，不被替换
    if ((layer as ImageLayer).freeSourceLayer === false) return cloneLayer(layer);
    const slotIndex = layer.slotIndex ?? index;
    const slotAsset = assets[slotIndex];
    const key = layer.sourceFileId || layer.sourceName || `image-${index}`;
    const replacement = slotAsset ?? assetByKey.get(key);
    if (!replacement) {
      return {
        ...cloneImageLayer(layer),
        slotIndex
      } satisfies ImageLayer;
    }
    return {
      ...cloneImageLayer(layer),
      slotIndex,
      sourceFileId: replacement.id,
      sourceName: replacement.name,
      previewUrl: replacement.previewUrl
    } satisfies ImageLayer;
  });
}

function sortEntriesByRotationOrder(entries: SceneCarouselTemplateEntry[], backgrounds: BackgroundRotationItem[]) {
  if (!backgrounds.length) {
    return [...entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  const orderMap = new Map(backgrounds.map((item, index) => [item.id, index]));
  return [...entries].sort((a, b) => {
    const aIndex = orderMap.get(a.background.id) ?? a.order ?? Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.get(b.background.id) ?? b.order ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
}

function getEntryOrder(state: AppState, backgroundId: string) {
  const index = state.backgroundRotationItems.findIndex((item) => item.id === backgroundId);
  return index >= 0 ? index : state.sceneCarouselDraftEntries.length;
}

export function buildSceneCarouselEntryState(baseState: AppState, entry: SceneCarouselTemplateEntry, assets?: SourceAsset[]): AppState {
  const rawAssets = assets?.length ? assets : resolveReplacementAssets(baseState);
  const slotCount =
    entry.slotCount ??
    entry.layers.filter((layer) => layer.type === 'image').length;
  const replacements = expandAssetsForSceneSlots(baseState, rawAssets, Math.max(1, slotCount));
  const layers = remapLayersToAssets(entry.layers, replacements);
  const isPsdBackground = entry.background.sourceType === 'psd';
  return {
    ...baseState,
    canvas: {
      ...baseState.canvas,
      backgroundType: isPsdBackground ? 'psd' : 'image',
      backgroundImageUrl: entry.background.dataUrl,
      backgroundPsdTemplateId: isPsdBackground ? entry.background.psdTemplateId : undefined
    },
    layers,
    activeLayerId: layers[0]?.id,
    backgroundRotationItems: baseState.backgroundRotationItems,
    activeBgRotationIndex: Math.max(0, baseState.backgroundRotationItems.findIndex((item) => item.id === entry.background.id))
  };
}

function getSelectedTemplate(templateId?: string) {
  const state = editorStore.getState();
  const targetId = templateId ?? state.selectedSceneCarouselTemplateId;
  return state.sceneCarouselTemplates.find((item) => item.id === targetId);
}

export const sceneCarouselTemplateService = {
  async generateCompositePreview(state: AppState): Promise<string | undefined> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = state.canvas.size;
      canvas.height = state.canvas.size;
      await renderCanvasScene(canvas, state);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (err) {
      console.error('[sceneCarouselTemplateService] generateCompositePreview failed', err);
      return undefined;
    }
  },

  async captureCurrentSceneToDraft() {
    const state = editorStore.getState();
    // 允许在任何排版模式下保存场景草稿，只要画布上有内容
    const sourceMode = state.mode;
    const currentBackground = state.backgroundRotationItems[state.activeBgRotationIndex];
    if (!currentBackground) {
      return { ok: false as const, error: '请先准备轮换背景，并切到要保存的场景。' };
    }
    if (!state.layers.length) {
      return { ok: false as const, error: '当前场景还没有排版内容，请先把商品摆好。' };
    }

    // 弹出命名对话框，让用户自定义场景草稿名称
    const entryName = await nameDialogService.open({
      title: '保存场景草稿',
      message: '请为当前场景草稿命名。',
      defaultValue: currentBackground.name,
      confirmText: '保存'
    });
    if (!entryName) {
      return { ok: false as const, error: '已取消保存。' };
    }

    const previewDataUrl = await this.generateCompositePreview(state);

    // 保存前打日志，确认图层类型
    console.log('[captureCurrentSceneToDraft] saving layers:', state.layers.map((l) => ({
      id: l.id,
      type: l.type,
      ...(l.type === 'text' ? { text: (l as TextLayer).text } : { sourceName: (l as ImageLayer).sourceName })
    })));

    const savedLayers = withSceneSlotIndices(state.layers);
    const savedTextLayers = savedLayers.filter((l) => l.type === 'text');
    if (savedTextLayers.length > 0) {
      console.log('[captureCurrentSceneToDraft] text layers preserved:', savedTextLayers.map((l) => ({
        id: l.id,
        text: (l as TextLayer).text,
        fontSize: (l as TextLayer).fontSize,
        color: (l as TextLayer).color
      })));
    }

    const entry: SceneCarouselTemplateEntry = {
      id: uid(),
      name: entryName,
      order: getEntryOrder(state, currentBackground.id),
      background: cloneBackground(currentBackground),
      layers: savedLayers,
      canvasSize: state.canvas.size,
      slotCount: state.layers.filter((layer) => layer.type === 'image').length,
      sourceMode,
      createdAt: Date.now(),
      previewDataUrl
    };

    const existing = state.sceneCarouselDraftEntries.find((item) => item.background.id === currentBackground.id);
    const nextEntries = existing
      ? state.sceneCarouselDraftEntries.map((item) => (item.background.id === currentBackground.id ? { ...entry, id: item.id, createdAt: item.createdAt } : item))
      : [...state.sceneCarouselDraftEntries, entry];

    editorStore.patch({
      sceneCarouselDraftEntries: sortEntriesByRotationOrder(nextEntries, state.backgroundRotationItems)
    });

    return {
      ok: true as const,
      count: nextEntries.length,
      updated: Boolean(existing),
      name: entryName
    };
  },

  clearDraft() {
    editorStore.patch({ sceneCarouselDraftEntries: [] }, { markDirty: false });
  },

  removeDraftEntry(entryId: string) {
    const state = editorStore.getState();
    const nextEntries = state.sceneCarouselDraftEntries
      .filter((entry) => entry.id !== entryId)
      .map((entry, index) => ({ ...entry, order: index }));
    editorStore.patch({ sceneCarouselDraftEntries: nextEntries }, { markDirty: false });
    return { ok: true as const, count: nextEntries.length };
  },

  renameDraftEntry(entryId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false as const, error: '请输入有效的场景名称。' };
    }
    const state = editorStore.getState();
    const hit = state.sceneCarouselDraftEntries.some((entry) => entry.id === entryId);
    if (!hit) {
      return { ok: false as const, error: '未找到要重命名的场景草稿。' };
    }
    editorStore.patch(
      {
        sceneCarouselDraftEntries: state.sceneCarouselDraftEntries.map((entry) =>
          entry.id === entryId ? { ...entry, name: trimmed } : entry
        )
      },
      { markDirty: false }
    );
    return { ok: true as const, name: trimmed };
  },

  moveDraftEntry(entryId: string, direction: -1 | 1) {
    const state = editorStore.getState();
    const current = [...state.sceneCarouselDraftEntries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const index = current.findIndex((entry) => entry.id === entryId);
    if (index < 0) {
      return { ok: false as const, error: '未找到要排序的场景草稿。' };
    }
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) {
      return { ok: false as const, error: '已经到边界，不能继续移动。' };
    }
    const [entry] = current.splice(index, 1);
    current.splice(nextIndex, 0, entry);
    const nextEntries = current.map((item, order) => ({ ...item, order }));
    editorStore.patch({ sceneCarouselDraftEntries: nextEntries }, { markDirty: false });
    return { ok: true as const, count: nextEntries.length };
  },

  reorderDraftEntries(dragId: string, dropId: string) {
    if (dragId === dropId) return { ok: false as const, error: 'same' };
    const state = editorStore.getState();
    const ordered = [...state.sceneCarouselDraftEntries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const dragIndex = ordered.findIndex((entry) => entry.id === dragId);
    const dropIndex = ordered.findIndex((entry) => entry.id === dropId);
    if (dragIndex < 0 || dropIndex < 0) return { ok: false as const, error: 'not-found' };
    const [dragItem] = ordered.splice(dragIndex, 1);
    ordered.splice(dropIndex, 0, dragItem);
    const nextEntries = ordered.map((item, order) => ({ ...item, order }));
    editorStore.patch({ sceneCarouselDraftEntries: nextEntries }, { markDirty: false });
    return { ok: true as const, count: nextEntries.length };
  },

  previewDraftEntry(index: number) {
    const state = editorStore.getState();
    const ordered = [...state.sceneCarouselDraftEntries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const entry = ordered[index];
    if (!entry) {
      return { ok: false as const, error: '该场景草稿不存在。' };
    }
    const replacements = resolveReplacementAssets(state);
    const backgrounds = ordered.map((item) => cloneBackground(item.background));
    const nextState = buildSceneCarouselEntryState(
      {
        ...state,
        backgroundRotationItems: backgrounds,
        activeBgRotationIndex: index
      },
      entry,
      replacements
    );
    editorStore.patch({
      backgroundRotationItems: backgrounds,
      activeBgRotationIndex: index,
      canvas: nextState.canvas,
      layers: nextState.layers,
      activeLayerId: nextState.activeLayerId
    });
    return { ok: true as const, name: entry.name };
  },

  async saveDraftAsTemplate(name?: string) {
    const state = editorStore.getState();

    if (state.mode !== 'random') {
      return { ok: false as const, error: '轮换套版模板只能从自由排版结果里保存，请先切到自由排版。' };
    }
    if (!state.sceneCarouselDraftEntries.length) {
      return { ok: false as const, error: '请先至少保存一张场景到套版草稿。' };
    }
    const templateName =
      name?.trim() ||
      (await nameDialogService.open({
        title: '保存轮换套版模板',
        message: '请输入轮换套版模板名称。',
        defaultValue: resolveName(name, `场景套图-${state.sceneCarouselTemplates.length + 1}`),
        confirmText: '保存'
      }));
    if (!templateName) {
      return { ok: false as const, error: '已取消保存。' };
    }

    const template: SceneCarouselTemplate = {
      id: uid(),
      name: templateName,
      entries: state.sceneCarouselDraftEntries.map((entry, index) => ({
        ...entry,
        order: entry.order ?? index,
        background: cloneBackground(entry.background),
        sourceMode: 'random',
        layers: withSceneSlotIndices(entry.layers),
        canvasSize: entry.canvasSize ?? state.canvas.size,
        slotCount:
          entry.slotCount ??
          entry.layers.filter((layer) => layer.type === 'image').length
      })),
      canvasSize: state.canvas.size,
      sourceMode: 'random',
      slotCount: Math.max(
        0,
        ...state.sceneCarouselDraftEntries.map(
          (entry) =>
            entry.slotCount ??
            entry.layers.filter((layer) => layer.type === 'image').length
        )
      ),
      createdAt: Date.now()
    };

    editorStore.patch({
      sceneCarouselTemplates: [...state.sceneCarouselTemplates, template],
      selectedSceneCarouselTemplateId: template.id,
      sceneCarouselDraftEntries: []
    }, { markDirty: false });
    try {
      await templateService.saveTemplates();
    } catch (error) {
      console.error('[sceneCarouselTemplateService] saveDraftAsTemplate failed', error);
      throw error;
    }
    return { ok: true as const, count: template.entries.length, name: template.name };
  },

  async deleteTemplate(templateId?: string) {
    const state = editorStore.getState();
    const targetId = templateId ?? state.selectedSceneCarouselTemplateId;
    if (!targetId) return { ok: false as const, error: '请先选择场景套图模板。' };
    editorStore.patch({
      sceneCarouselTemplates: state.sceneCarouselTemplates.filter((item) => item.id !== targetId),
      selectedSceneCarouselTemplateId: state.selectedSceneCarouselTemplateId === targetId ? undefined : state.selectedSceneCarouselTemplateId
    }, { markDirty: false });
    await templateService.saveTemplates();
    return { ok: true as const };
  },

  applyTemplate(templateId?: string) {
    const template = getSelectedTemplate(templateId);
    const state = editorStore.getState();
    if (!template) {
      return { ok: false as const, error: '请先选择场景套图模板。' };
    }
    const replacements = resolveReplacementAssets(state);
    if (!replacements.length) {
      return { ok: false as const, error: '请先导入并勾选要替换的商品素材。' };
    }

    const backgrounds = template.entries.map((entry) => cloneBackground(entry.background));
    const firstEntry = template.entries[0];
    const firstState = buildSceneCarouselEntryState({
      ...state,
      backgroundRotationItems: backgrounds,
      activeBgRotationIndex: 0
    }, firstEntry, replacements);

    editorStore.patch({
      backgroundRotationItems: backgrounds,
      activeBgRotationIndex: 0,
      canvas: firstState.canvas,
      layers: firstState.layers,
      activeLayerId: firstState.activeLayerId,
      mode: 'scene',
      freeExportMode: 'current',
      selectedSceneCarouselTemplateId: template.id
    });

    return { ok: true as const, count: template.entries.length, name: template.name };
  },

  previewEntry(index: number, templateId?: string) {
    const template = getSelectedTemplate(templateId);
    const state = editorStore.getState();
    if (!template) {
      return { ok: false as const, error: '请先选择场景套图模板。' };
    }
    const entry = template.entries[index];
    if (!entry) {
      return { ok: false as const, error: '该场景不存在。' };
    }
    const replacements = resolveReplacementAssets(state);
    if (!replacements.length) {
      return { ok: false as const, error: '请先导入并勾选要替换的商品素材。' };
    }
    const nextState = buildSceneCarouselEntryState({
      ...state,
      backgroundRotationItems: template.entries.map((item) => cloneBackground(item.background)),
      activeBgRotationIndex: index
    }, entry, replacements);

    editorStore.patch({
      backgroundRotationItems: template.entries.map((item) => cloneBackground(item.background)),
      activeBgRotationIndex: index,
      canvas: nextState.canvas,
      layers: nextState.layers,
      activeLayerId: nextState.activeLayerId,
      mode: 'scene',
      freeExportMode: 'current',
      selectedSceneCarouselTemplateId: template.id
    });

    return { ok: true as const, name: entry.name };
  },

  getTemplate(templateId?: string) {
    return getSelectedTemplate(templateId);
  }
};
