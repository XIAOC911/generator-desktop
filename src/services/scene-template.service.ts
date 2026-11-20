import { editorStore } from '@/app/store/editorStore';
import { buildSceneProductPlacementLayers, getSceneTemplateLabel, normalizeSceneLayersToCanvas } from '@/core/engines/scene-placement-engine';
import type { ScenePlacementPreset } from '@/core/models/project';

export const sceneTemplateService = {
  applyCurrentSceneTemplate(mode: 'single' | 'multi', preset?: ScenePlacementPreset) {
    const state = editorStore.getState();
    const selectedAssets = state.sourceAssets.filter((asset) => asset.selected);
    if (!selectedAssets.length) {
      return { ok: false as const, error: '请先勾选至少一张商品素材。' };
    }

    const nextImageLayers = normalizeSceneLayersToCanvas(
      state.canvas.size,
      buildSceneProductPlacementLayers(state, mode, preset)
    );
    if (!nextImageLayers.length) {
      return { ok: false as const, error: '当前没有可应用的商品图层。' };
    }

    const selectedIds = new Set(selectedAssets.map((asset) => asset.id));
    const preservedLayers = state.layers.filter((layer) => layer.type !== 'image' || !selectedIds.has(layer.sourceFileId || ''));
    editorStore.setLayers([...preservedLayers, ...nextImageLayers]);
    editorStore.setActiveLayerId(nextImageLayers[0]?.id);

    const effectivePreset = preset || state.backgroundRotationItems[state.activeBgRotationIndex]?.sceneMeta?.preset || 'center-stage';
    return {
      ok: true as const,
      count: nextImageLayers.length,
      preset: effectivePreset,
      label: getSceneTemplateLabel(effectivePreset)
    };
  }
};
