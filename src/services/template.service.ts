import { editorStore } from '@/app/store/editorStore';
import type {
  BackgroundTemplate,
  MemoryTemplate,
  SceneCarouselTemplate,
  SceneCarouselTemplateEntry,
  SceneTemplateBackgroundItem
} from '@/core/models/template';
import type { ImageLayer, Layer } from '@/core/models/layer';
import type { SourceAsset } from '@/core/models/project';
import { nameDialogService } from '@/services/name-dialog.service';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function resolveName(inputName: string | undefined, defaultName: string) {
  const trimmedInput = inputName?.trim();
  if (trimmedInput) return trimmedInput;
  return defaultName;
}

function getSelectedAssets(assets: SourceAsset[]) {
  return assets.filter((asset) => asset.selected);
}

function normalizeMemoryTemplate(template: Partial<MemoryTemplate>, index: number): MemoryTemplate {
  const spec = Array.isArray(template.spec) ? template.spec : [];
  return {
    id: template.id || uid(),
    name: template.name || `版式-${index + 1}`,
    canvasSize: template.canvasSize,
    slotCount: template.slotCount ?? spec.length,
    sourceMode: 'random',
    spec: spec.map((item, specIndex) => ({
      slotIndex: item.slotIndex ?? specIndex,
      x: item.x ?? 0,
      y: item.y ?? 0,
      scale: item.scale ?? 220,
      rotation: item.rotation ?? 0,
      opacity: item.opacity ?? 100,
      filters: {
        brightness: item.filters?.brightness ?? 100,
        contrast: item.filters?.contrast ?? 100,
        saturate: item.filters?.saturate ?? 100,
        hue: item.filters?.hue ?? 0
      },
      sourceFileId: item.sourceFileId,
      sourceName: item.sourceName,
      freeSourceLayer: item.freeSourceLayer ?? true
    })),
    createdAt: template.createdAt ?? Date.now()
  };
}

function normalizeBackgroundTemplate(template: Partial<BackgroundTemplate>, index: number): BackgroundTemplate {
  const items = Array.isArray(template.items) ? template.items : [];
  return {
    id: template.id || uid(),
    name: template.name || `背景模板-${index + 1}`,
    items: items.map((item, itemIndex) => ({
      id: item.id || uid(),
      name: item.name || `背景-${itemIndex + 1}`,
      dataUrl: item.dataUrl || ''
    })),
    createdAt: template.createdAt ?? Date.now()
  };
}

function normalizeSceneTemplateBackground(
  background: Partial<SceneTemplateBackgroundItem> | undefined,
  index: number
): SceneTemplateBackgroundItem {
  return {
    id: background?.id || uid(),
    name: background?.name || `场景-${index + 1}`,
    dataUrl: background?.dataUrl || '',
    sourceType: background?.sourceType ?? 'image',
    psdTemplateId: background?.psdTemplateId,
    sceneMeta: background?.sceneMeta
      ? {
          preset: background.sceneMeta.preset ?? 'center-stage',
          source: background.sceneMeta.source,
          compositionHint: background.sceneMeta.compositionHint
        }
      : undefined
  };
}

function normalizeSceneCarouselEntry(
  entry: Partial<SceneCarouselTemplateEntry>,
  index: number,
  fallbackCanvasSize?: number
): SceneCarouselTemplateEntry {
  const layers = Array.isArray(entry.layers)
    ? entry.layers.map((layer, layerIndex) => {
        if (!layer) return layer as Layer;
        if (layer.type === 'image') {
          return {
            ...layer,
            slotIndex: (layer as ImageLayer).slotIndex ?? layerIndex
          } as Layer;
        }
        // 文本层或其他类型：确保 filters 被克隆，避免引用共享
        return {
          ...layer,
          filters: layer.filters ? { ...(layer.filters as Record<string, number>) } : undefined
        } as Layer;
      })
    : [];
  const slotCount =
    entry.slotCount ??
    layers.filter((layer) => layer?.type === 'image').length;
  return {
    id: entry.id || uid(),
    name: entry.name || `场景版式-${index + 1}`,
    order: entry.order ?? index,
    background: normalizeSceneTemplateBackground(entry.background, index),
    layers,
    canvasSize: entry.canvasSize ?? fallbackCanvasSize,
    sourceMode: 'random',
    slotCount,
    createdAt: entry.createdAt ?? Date.now(),
    previewDataUrl: entry.previewDataUrl
  };
}

function normalizeSceneCarouselTemplate(
  template: Partial<SceneCarouselTemplate>,
  index: number
): SceneCarouselTemplate {
  const entries = Array.isArray(template.entries) ? template.entries : [];
  const normalizedEntries = entries.map((entry, entryIndex) =>
    normalizeSceneCarouselEntry(entry, entryIndex, template.canvasSize)
  );
  const firstCanvasSize = normalizedEntries[0]?.canvasSize;
  const slotCount =
    template.slotCount ??
    Math.max(0, ...normalizedEntries.map((entry) => entry.slotCount ?? 0));
  return {
    id: template.id || uid(),
    name: template.name || `轮换套版-${index + 1}`,
    entries: normalizedEntries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    canvasSize: template.canvasSize ?? firstCanvasSize,
    sourceMode: 'random',
    slotCount,
    createdAt: template.createdAt ?? Date.now()
  };
}

function resolveSlotAsset(
  specItem: MemoryTemplate['spec'][number],
  assets: SourceAsset[],
  selectedAssets: SourceAsset[],
  slotIndex: number
) {
  return (
    selectedAssets[slotIndex] ??
    assets.find((asset) => asset.id === specItem.sourceFileId || asset.name === specItem.sourceName)
  );
}

function buildLayerFromSpec(
  specItem: MemoryTemplate['spec'][number],
  assets: SourceAsset[],
  selectedAssets: SourceAsset[],
  slotIndex: number
): ImageLayer {
  const matchedAsset = resolveSlotAsset(specItem, assets, selectedAssets, slotIndex);

  return {
    id: uid(),
    type: 'image',
    x: specItem.x,
    y: specItem.y,
    scale: specItem.scale,
    rotation: specItem.rotation,
    opacity: specItem.opacity,
    filters: { ...specItem.filters },
    visible: true,
    sourceFileId: matchedAsset?.id ?? specItem.sourceFileId,
    sourceName: matchedAsset?.name ?? specItem.sourceName,
    previewUrl: matchedAsset?.previewUrl,
    freeSourceLayer: specItem.freeSourceLayer ?? true
  };
}

export const templateService = {
  async loadTemplates() {
    const content = await window.fanDesktop.template.load();
    const data = JSON.parse(content);
    const memoryTemplates = Array.isArray(data.templates)
      ? data.templates.map((item: Partial<MemoryTemplate>, index: number) => normalizeMemoryTemplate(item, index))
      : [];
    const bgRotationTemplates = Array.isArray(data.bgRotationTemplates)
      ? data.bgRotationTemplates.map((item: Partial<BackgroundTemplate>, index: number) =>
          normalizeBackgroundTemplate(item, index)
        )
      : [];
    const sceneCarouselTemplates = Array.isArray(data.sceneCarouselTemplates)
      ? data.sceneCarouselTemplates.map((item: Partial<SceneCarouselTemplate>, index: number) =>
          normalizeSceneCarouselTemplate(item, index)
        )
      : [];
    editorStore.patch(
      {
        memoryTemplates,
        bgRotationTemplates,
        sceneCarouselTemplates,
      },
      { markDirty: false }
    );
  },

  async saveTemplatesLegacy() {
    return this.saveTemplates();
  },

  async saveTemplates() {
    try {
      const state = editorStore.getState();

      const payload = {
        templates: state.memoryTemplates.map((item, index) => normalizeMemoryTemplate(item, index)),
        bgRotationTemplates: state.bgRotationTemplates.map((item, index) => normalizeBackgroundTemplate(item, index)),
        sceneCarouselTemplates: state.sceneCarouselTemplates.map((item, index) =>
          normalizeSceneCarouselTemplate(item, index)
        ),
        updatedAt: Date.now()
      };

      return await window.fanDesktop.template.save(payload);
    } catch (error) {
      console.error('[templateService] saveTemplates failed', error);
      throw error;
    }
  },

  async saveMemoryTemplate(name?: string) {
    const state = editorStore.getState();
    if (state.mode !== 'random') {
      window.alert('组合版式只能从自由排版结果里保存，请先切到自由排版并调整当前画布。');
      return;
    }
    const imageLayers = state.layers.filter((layer): layer is ImageLayer => layer.type === 'image');
    if (!imageLayers.length) {
      window.alert('当前还没有可保存的自由排版结果，请先点击“开始排版”生成画布内容。');
      return;
    }

    const templateName =
      name?.trim() ||
      (await nameDialogService.open({
        title: '保存组合版式',
        message: '请输入组合版式名称。',
        defaultValue: resolveName(name, `版式-${state.memoryTemplates.length + 1}`),
        confirmText: '保存'
      }));
    if (!templateName) return;
    const template: MemoryTemplate = {
      id: uid(),
      name: templateName,
      canvasSize: state.canvas.size,
      slotCount: imageLayers.length,
      sourceMode: 'random',
      spec: imageLayers.map((layer, index) => ({
        slotIndex: index,
        x: layer.x,
        y: layer.y,
        scale: layer.scale,
        rotation: layer.rotation,
        opacity: layer.opacity,
        filters: { ...layer.filters },
        sourceFileId: layer.sourceFileId,
        sourceName: layer.sourceName,
        freeSourceLayer: layer.freeSourceLayer ?? true
      })),
      createdAt: Date.now()
    };

    editorStore.patch(
      {
        memoryTemplates: [...state.memoryTemplates, template],
        selectedMemoryTemplateId: template.id
      },
      { markDirty: false }
    );
    try {
      await this.saveTemplates();
      window.alert(`已保存组合版式：${template.name}`);
    } catch (error) {
      console.error('[templateService] saveMemoryTemplate failed', error);
      window.alert('组合版式保存失败，请重试。');
      throw error;
    }
  },

  async applyMemoryTemplate(templateId?: string) {
    const state = editorStore.getState();
    const targetId = templateId ?? state.selectedMemoryTemplateId;
    const template = state.memoryTemplates.find((item) => item.id === targetId);
    if (!template) return;

    editorStore.patch({
      layers: [],
      activeLayerId: undefined,
      mode: 'random',
      freeExportMode: 'current',
      selectedMemoryTemplateId: template.id,
      layoutId: template.id
    });
  },

  async deleteMemoryTemplate(templateId?: string) {
    const state = editorStore.getState();
    const targetId = templateId ?? state.selectedMemoryTemplateId;
    if (!targetId) return;
    editorStore.patch(
      {
        memoryTemplates: state.memoryTemplates.filter((item) => item.id !== targetId),
        selectedMemoryTemplateId:
          state.selectedMemoryTemplateId === targetId ? undefined : state.selectedMemoryTemplateId,
        layoutId: state.layoutId === targetId ? '' : state.layoutId
      },
      { markDirty: false }
    );
    await this.saveTemplates();
  },

  async saveBgRotationTemplate(name?: string) {
    const state = editorStore.getState();
    if (!state.backgroundRotationItems.length) return;
    const templateName =
      name?.trim() ||
      (await nameDialogService.open({
        title: '保存背景模板',
        message: '请输入背景模板名称。',
        defaultValue: resolveName(name, `背景模板-${state.bgRotationTemplates.length + 1}`),
        confirmText: '保存'
      }));
    if (!templateName) return;
    const template: BackgroundTemplate = {
      id: uid(),
      name: templateName,
      items: state.backgroundRotationItems.map((item) => ({ ...item })),
      createdAt: Date.now()
    };

    editorStore.patch(
      {
        bgRotationTemplates: [...state.bgRotationTemplates, template],
        selectedBgRotationTemplateId: template.id
      },
      { markDirty: false }
    );
    try {
      await this.saveTemplates();
      window.alert(`已保存背景模板：${template.name}`);
    } catch (error) {
      console.error('[templateService] saveBgRotationTemplate failed', error);
      window.alert('背景模板保存失败，请重试。');
      throw error;
    }
  },

  async applyBgRotationTemplate(templateId?: string) {
    const state = editorStore.getState();
    const targetId = templateId ?? state.selectedBgRotationTemplateId;
    const template = state.bgRotationTemplates.find((item) => item.id === targetId);
    if (!template) return;

    editorStore.patch({
      backgroundRotationItems: template.items.map((item) => ({ ...item })),
      activeBgRotationIndex: 0,
      selectedBgRotationTemplateId: template.id
    });
    editorStore.patchCanvas({
      backgroundType: 'image',
      backgroundImageUrl: template.items[0]?.dataUrl
    });
  },

  async deleteBgRotationTemplate(templateId?: string) {
    const state = editorStore.getState();
    const targetId = templateId ?? state.selectedBgRotationTemplateId;
    if (!targetId) return;
    editorStore.patch(
      {
        bgRotationTemplates: state.bgRotationTemplates.filter((item) => item.id !== targetId),
        selectedBgRotationTemplateId:
          state.selectedBgRotationTemplateId === targetId ? undefined : state.selectedBgRotationTemplateId
      },
      { markDirty: false }
    );
    await this.saveTemplates();
  }
};
