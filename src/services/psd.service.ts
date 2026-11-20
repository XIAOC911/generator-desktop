import { editorStore } from '@/app/store/editorStore';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';
import type { ImageLayer } from '@/core/models/layer';
import type { BackgroundRotationItem } from '@/core/models/project';
import type { PsdLayerNode, PsdTemplate } from '@/core/models/psd';
import { computePsdCanvasMapping, mapPsdBoundsToCanvas } from '@/core/renderer/interaction';

/** 在模板的图层树中递归查找并更新指定 layer 的 layerDataUrl */
function patchLayerDataInTemplate(
  layers: PsdLayerNode[],
  targetId: string,
  layerDataUrl: string
): PsdLayerNode[] {
  return layers.map((layer) => {
    if (layer.id === targetId) {
      return { ...layer, layerDataUrl };
    }
    if (layer.children) {
      return { ...layer, children: patchLayerDataInTemplate(layer.children, targetId, layerDataUrl) };
    }
    return layer;
  });
}

function toRotationItem(templateId: string): BackgroundRotationItem | null {
  const state = editorStore.getState();
  const template = state.psdTemplates.find((item) => item.id === templateId);
  if (!template) return null;
  return {
    id: `psd:${template.id}`,
    name: template.name,
    dataUrl: template.previewDataUrl,
    sourceType: 'psd',
    psdTemplateId: template.id
  };
}

/** 干净背景缓存 keyed by "templateId:layerId1,layerId2" */
const cleanBgCache = new Map<string, string>();

type FlatPsdLayer = {
  node: PsdLayerNode;
  depth: number;
};

function collectPsdPixelLayerIds(layers: PsdLayerNode[]): string[] {
  const result: string[] = [];
  for (const layer of layers) {
    if (layer.children?.length) {
      result.push(...collectPsdPixelLayerIds(layer.children));
    } else if (layer.kind === 'pixel' && layer.bounds) {
      result.push(layer.id);
    }
  }
  return result;
}

function collectHiddenPsdLayerIds(layers: PsdLayerNode[]): string[] {
  const result: string[] = [];
  for (const layer of layers) {
    if (layer.children?.length) {
      result.push(...collectHiddenPsdLayerIds(layer.children));
    } else if (layer.kind === 'pixel' && layer.bounds && !layer.visible) {
      result.push(layer.id);
    }
  }
  return result;
}
function collectEditablePsdLayers(layers: PsdLayerNode[], depth = 0): FlatPsdLayer[] {
  const result: FlatPsdLayer[] = [];
  for (const layer of layers) {
    if (layer.children?.length) {
      result.push(...collectEditablePsdLayers(layer.children, depth + 1));
    }
    if (layer.kind === 'pixel' && layer.visible && layer.bounds) {
      result.push({ node: layer, depth });
    }
  }
  return result;
}

function buildCanvasLayerFromPsd(
  template: PsdTemplate,
  node: PsdLayerNode,
  layerDataUrl: string,
  index: number,
  canvasSize: number
): ImageLayer | null {
  if (!node.bounds) return null;
  const mapping = computePsdCanvasMapping(template.width, template.height, canvasSize);
  const rect = mapPsdBoundsToCanvas(node.bounds, mapping);
  if (rect.width <= 0 || rect.height <= 0) return null;

  const role = template.layerRoles?.[node.id];
  return {
    id: `psd-layer-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'image',
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    scale: 100,
    rotation: node.transform?.rotate ?? 0,
    opacity: 100,
    filters: { ...DEFAULT_FILTERS },
    visible: true,
    sourceName: `PSD/${node.name}`,
    previewUrl: layerDataUrl,
    freeSourceLayer: false,
    naturalWidth: rect.width,
    naturalHeight: rect.height,
    psdTemplateId: template.id,
    psdLayerId: node.id,
    psdRole: role
  };
}

export const psdService = {
  async importPsdTemplates() {
    try {
      const results = await window.fanDesktop.psd.openTemplates();
      if (!results.length) return;
      editorStore.upsertPsdTemplates(results);
      editorStore.setSelectedPsdTemplateId(results[0].id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'PSD 导入失败');
    }
  },

  applyPsdBackground(templateId: string) {
    const state = editorStore.getState();
    const template = state.psdTemplates.find((item) => item.id === templateId);
    if (!template) return false;
    editorStore.setSelectedPsdTemplateId(template.id);
    editorStore.patchCanvas({
      backgroundType: 'psd',
      backgroundImageUrl: template.previewDataUrl,
      backgroundPsdTemplateId: template.id
    });

    // 自动预加载所有前景层的完整像素数据
    const foregroundIds = Object.entries(template.layerRoles ?? {})
      .filter(([, r]) => r === 'foreground')
      .map(([id]) => id);
    if (foregroundIds.length > 0) {
      void Promise.all(
        foregroundIds.map((layerId) => this.fetchAndStoreForegroundData(templateId, layerId))
      );
    }

    // 预加载干净背景（排除所有产品层）
    const productLayerIds = Object.entries(template.layerRoles ?? {})
      .filter(([, r]) => r === 'placeholder')
      .map(([id]) => id);
    const effectiveIds = productLayerIds.length > 0
      ? productLayerIds
      : template.selectedProductLayerId
        ? [template.selectedProductLayerId]
        : [];
    if (effectiveIds.length > 0) {
      void this.renderCleanBackground(templateId, effectiveIds);
    }

    return true;
  },

  addPsdToBackgroundRotation(templateId: string) {
    const state = editorStore.getState();
    const item = toRotationItem(templateId);
    if (!item) return false;
    const existingIndex = state.backgroundRotationItems.findIndex((entry) => entry.id === item.id);
    const nextItems =
      existingIndex >= 0
        ? state.backgroundRotationItems.map((entry, index) => (index === existingIndex ? item : entry))
        : [...state.backgroundRotationItems, item];
    editorStore.setBackgroundRotationItems(nextItems);
    return true;
  },

  /**
   * 进入 PSD 文档模式 — 美图秀秀风格：
   * 每个 PSD 图层拆成独立画布对象，可选中、拖动、隐藏。
   * 隐藏图层预加载数据但不加入画布。
   */
  async enterPsdDocumentMode(templateId: string) {
    const state = editorStore.getState();
    const template = state.psdTemplates.find((item) => item.id === templateId);
    if (!template) return { ok: false, count: 0, message: '未找到 PSD 模板' };

    const canvasSize = state.canvas.size;

    // 1. 设置 PSD 为画布背景
    this.applyPsdBackground(templateId);

    // 2. 预加载所有图层像素数据
    const allPixelIds = collectPsdPixelLayerIds(template.layers);
    const hiddenIds = collectHiddenPsdLayerIds(template.layers);
    const preloadIds = Array.from(new Set([...allPixelIds, ...hiddenIds]));
    let loadedCount = 0;
    for (const layerId of preloadIds) {
      const loaded = await this.fetchAndStoreLayerData(templateId, layerId);
      if (loaded) loadedCount += 1;
    }

    // 3. 重新获取最新模板数据
    const refreshed = editorStore.getState().psdTemplates.find((item) => item.id === templateId);
    if (!refreshed) return { ok: false, count: 0, message: 'PSD 模板数据异常' };

    // 4. 遍历扁平化可见图层，逐一创建画布图层对象
    const flatLayers = collectEditablePsdLayers(refreshed.layers);
    const canvasLayers: ImageLayer[] = [];

    flatLayers.forEach((flat, index) => {
      const { node } = flat;
      if (!node.layerDataUrl) return; // 像素数据未就绪则跳过
      const layer = buildCanvasLayerFromPsd(refreshed, node, node.layerDataUrl, index, canvasSize);
      if (layer) canvasLayers.push(layer);
    });

    // 5. 清除旧 PSD 图层，保留用户手动添加的自由图层
    const preservedLayers = state.layers.filter(
      (layer) => layer.type !== 'image' || (!layer.psdLayerId && layer.freeSourceLayer !== false)
    );

    // 6. 合并：自由图层在下 + PSD 图层在上（PSD 前景层置顶）
    const foregroundLayers = canvasLayers.filter((l) => l.psdRole === 'foreground');
    const normalLayers = canvasLayers.filter((l) => l.psdRole !== 'foreground');
    const merged = [...preservedLayers, ...normalLayers, ...foregroundLayers];

    const latest = editorStore.getState();
    editorStore.patch({
      layers: merged,
      activeLayerId: merged[merged.length - 1]?.id,
      selectedLayerIds: merged[merged.length - 1] ? [merged[merged.length - 1]!.id] : [],
      selectedPsdTemplateId: templateId,
      selectedPsdSlotId: undefined,
      canvas: {
        ...latest.canvas,
        backgroundType: 'psd',
        backgroundImageUrl: template.previewDataUrl,
        backgroundPsdTemplateId: template.id
      }
    });

    return {
      ok: true,
      count: canvasLayers.length,
      message: `已拆解 ${canvasLayers.length} 个 PSD 图层到画布。点击图层即可选中拖动，右键图层面板可标记为占位层。`
    };
  },

  /** 切换图层占位标记 */
  toggleLayerPlaceholder(layerId: string) {
    const state = editorStore.getState();
    const layer = state.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'image') return;
    editorStore.patch({
      layers: state.layers.map((l) =>
        l.id === layerId && l.type === 'image'
          ? { ...l, isPlaceholder: !l.isPlaceholder }
          : l
      )
    });
  },

  /** 保存当前画布布局为 PSD 套版模板 */
  saveLayoutTemplate(name: string) {
    const state = editorStore.getState();
    const psdLayers = state.layers.filter(
      (l) => l.type === 'image' && l.psdTemplateId
    ) as ImageLayer[];

    if (!psdLayers.length) {
      window.alert('当前画布没有 PSD 图层，请先导入 PSD。');
      return null;
    }

    const templateId = psdLayers[0]!.psdTemplateId!;
    const template = {
      templateId,
      name,
      canvasSize: state.canvas.size,
      layers: state.layers
        .filter((l) => l.type === 'image')
        .map((l) => {
          const img = l as ImageLayer;
          return {
            id: img.id,
            name: img.sourceName || '',
            type: 'bitmap' as const,
            visible: img.visible !== false,
            x: img.x,
            y: img.y,
            width: img.naturalWidth ?? 200,
            height: img.naturalHeight ?? 200,
            scale: img.scale,
            rotation: img.rotation,
            opacity: img.opacity,
            previewUrl: img.previewUrl,
            sourceFileId: img.sourceFileId,
            isPlaceholder: img.isPlaceholder || false,
            psdLayerId: img.psdLayerId,
            psdRole: img.psdRole,
          };
        }),
    };

    // 存储到 memoryTemplates 扩展
    const current = editorStore.getState().memoryTemplates;
    const entry = {
      id: `psd-layout-${Date.now()}`,
      name,
      spec: [],
      layoutData: template,
    };
    editorStore.patch({
      memoryTemplates: [...current, entry as any],
    });

    return template;
  },

  /** 批量套用模板：用素材图替换所有占位层 */
  applyLayoutTemplate(assetIds: string[]) {
    const state = editorStore.getState();
    const placeholderLayers = state.layers.filter(
      (l) => l.type === 'image' && (l as ImageLayer).isPlaceholder
    ) as ImageLayer[];

    if (!placeholderLayers.length) {
      window.alert('当前画布没有占位层，请先在图层上右键标记为占位层。');
      return { ok: false, replaced: 0 };
    }

    const assets = assetIds
      .map((id) => state.sourceAssets.find((a) => a.id === id))
      .filter(Boolean);

    if (!assets.length) {
      window.alert('请先选中要套用的素材。');
      return { ok: false, replaced: 0 };
    }

    // 循环匹配：素材按顺序替换占位层
    let replaced = 0;
    const updated = state.layers.map((l) => {
      const img = l as ImageLayer;
      if (!img.isPlaceholder || l.type !== 'image') return l;
      const asset = assets[replaced % assets.length];
      if (!asset) return l;
      replaced += 1;
      return {
        ...img,
        sourceFileId: asset.id,
        sourceName: asset.name,
        previewUrl: asset.previewUrl,
      };
    });

    editorStore.patch({ layers: updated });
    return { ok: true, replaced };
  },

  /** 兼容旧按钮 */
  async convertPsdToEditableLayers(templateId: string) {
    return this.enterPsdDocumentMode(templateId);
  },

  /** 按需获取图层像素数据（遮罩 + 完整 RGBA），用于不规则形状裁剪和前景层渲染 */
  async getLayerMask(templateId: string, layerId: string) {
    try {
      return await window.fanDesktop.psd.getLayerMask({ templateId, layerId });
    } catch (error) {
      console.error('Failed to get layer mask:', error);
      return null;
    }
  },

  /** 请求 Electron 主进程合成不包含指定图层的干净背景图（带前端缓存） */
  async renderCleanBackground(templateId: string, excludeLayerIds: string[]) {
    const key = `${templateId}:${[...excludeLayerIds].sort().join(',')}`;
    const cached = cleanBgCache.get(key);
    if (cached) return cached;

    try {
      const result = await window.fanDesktop.psd.renderCleanBackground({ templateId, excludeLayerIds });
      if (result) cleanBgCache.set(key, result);
      return result;
    } catch (error) {
      console.error('Failed to render clean background:', error);
      return null;
    }
  },

  /** 清理 PSD 缓存（前端干净背景 + Electron 内存缓存） */
  clearCache(templateId?: string) {
    // 清理前端干净背景缓存
    if (templateId) {
      for (const key of cleanBgCache.keys()) {
        if (key.startsWith(templateId + ':')) cleanBgCache.delete(key);
      }
    } else {
      cleanBgCache.clear();
    }
    // 通知 Electron 主进程清理内存缓存
    window.fanDesktop.psd.clearCache({ templateId }).catch(() => {});
  },

  /** 获取 PSD 图层完整像素数据并存储到模板中的 layerDataUrl */
  async fetchAndStoreLayerData(templateId: string, layerId: string) {
    try {
      const result = await window.fanDesktop.psd.getLayerMask({ templateId, layerId });
      if (!result?.layerDataUrl) return null;

      // 将 layerDataUrl 存储到模板的图层节点中
      const state = editorStore.getState();
      const template = state.psdTemplates.find((t) => t.id === templateId);
      if (!template) return null;

      const updatedLayers = patchLayerDataInTemplate(template.layers, layerId, result.layerDataUrl);
      editorStore.patch({
        psdTemplates: state.psdTemplates.map((t) =>
          t.id === templateId ? { ...t, layers: updatedLayers } : t
        ),
      }, { markDirty: false });

      return result.layerDataUrl;
    } catch (error) {
      console.error('Failed to fetch PSD layer data:', error);
      return null;
    }
  },

  /** 向后兼容旧调用名 */
  async fetchAndStoreForegroundData(templateId: string, layerId: string) {
    return this.fetchAndStoreLayerData(templateId, layerId);
  },

};
