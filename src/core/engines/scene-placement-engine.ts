import type { AppState, ScenePlacementPreset, SourceAsset } from "@/core/models/project";
import type { ImageLayer } from "@/core/models/layer";
import { DEFAULT_FILTERS } from "@/core/constants/defaults";
import { createId } from "@/core/utils/id";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scaleFromWidth(size: number, fraction: number) {
  return Math.round((size * fraction) / 2);
}

function buildImageLayer(asset: SourceAsset, x: number, y: number, scale: number, rotation = 0): ImageLayer {
  return {
    id: createId('scene'),
    type: 'image',
    x,
    y,
    scale,
    rotation,
    opacity: 100,
    filters: { ...DEFAULT_FILTERS },
    visible: true,
    sourceFileId: asset.id,
    sourceName: asset.name,
    previewUrl: asset.previewUrl,
    freeSourceLayer: true
  };
}

export function inferScenePlacementPreset(text?: string): ScenePlacementPreset {
  const value = (text || '').toLowerCase();
  if (/(左侧留白|左边留白|左侧文案|左文案|左上文案)/.test(value)) return 'right-stage';
  if (/(右侧留白|右边留白|右侧文案|右文案|右上文案)/.test(value)) return 'left-stage';
  if (/(横图|宽景|宽幅|左右延展|全景)/.test(value)) return 'wide-stage';
  return 'center-stage';
}

function buildSinglePreset(size: number, preset: ScenePlacementPreset) {
  switch (preset) {
    case 'left-stage':
      return { x: size * 0.34, y: size * 0.68, scale: scaleFromWidth(size, 0.42), rotation: -4 };
    case 'right-stage':
      return { x: size * 0.66, y: size * 0.68, scale: scaleFromWidth(size, 0.42), rotation: 4 };
    case 'wide-stage':
      return { x: size * 0.5, y: size * 0.72, scale: scaleFromWidth(size, 0.34), rotation: 0 };
    default:
      return { x: size * 0.5, y: size * 0.68, scale: scaleFromWidth(size, 0.44), rotation: 0 };
  }
}

function buildClusterAnchor(size: number, preset: ScenePlacementPreset) {
  switch (preset) {
    case 'left-stage':
      return { x: size * 0.36, y: size * 0.71, spread: size * 0.14 };
    case 'right-stage':
      return { x: size * 0.64, y: size * 0.71, spread: size * 0.14 };
    case 'wide-stage':
      return { x: size * 0.5, y: size * 0.73, spread: size * 0.18 };
    default:
      return { x: size * 0.5, y: size * 0.71, spread: size * 0.16 };
  }
}

function buildMultiLayers(size: number, preset: ScenePlacementPreset, assets: SourceAsset[]) {
  const anchor = buildClusterAnchor(size, preset);
  const count = assets.length;
  if (count === 2) {
    return [
      buildImageLayer(assets[0], anchor.x - anchor.spread * 0.72, anchor.y - size * 0.02, scaleFromWidth(size, 0.26), -10),
      buildImageLayer(assets[1], anchor.x + anchor.spread * 0.62, anchor.y - size * 0.05, scaleFromWidth(size, 0.32), 8)
    ];
  }

  if (count === 3) {
    return [
      buildImageLayer(assets[0], anchor.x - anchor.spread * 0.9, anchor.y - size * 0.05, scaleFromWidth(size, 0.24), -12),
      buildImageLayer(assets[1], anchor.x, anchor.y - size * 0.1, scaleFromWidth(size, 0.34), 0),
      buildImageLayer(assets[2], anchor.x + anchor.spread * 0.9, anchor.y - size * 0.05, scaleFromWidth(size, 0.24), 12)
    ];
  }

  if (count === 4) {
    return [
      buildImageLayer(assets[0], anchor.x - anchor.spread * 1.15, anchor.y - size * 0.04, scaleFromWidth(size, 0.2), -14),
      buildImageLayer(assets[1], anchor.x - anchor.spread * 0.35, anchor.y - size * 0.1, scaleFromWidth(size, 0.28), -5),
      buildImageLayer(assets[2], anchor.x + anchor.spread * 0.35, anchor.y - size * 0.1, scaleFromWidth(size, 0.28), 5),
      buildImageLayer(assets[3], anchor.x + anchor.spread * 1.15, anchor.y - size * 0.04, scaleFromWidth(size, 0.2), 14)
    ];
  }

  const chosen = assets.slice(0, 5);
  return [
    buildImageLayer(chosen[0], anchor.x - anchor.spread * 1.2, anchor.y - size * 0.04, scaleFromWidth(size, 0.18), -16),
    buildImageLayer(chosen[1], anchor.x - anchor.spread * 0.45, anchor.y - size * 0.1, scaleFromWidth(size, 0.24), -8),
    buildImageLayer(chosen[2], anchor.x, anchor.y - size * 0.15, scaleFromWidth(size, 0.32), 0),
    buildImageLayer(chosen[3], anchor.x + anchor.spread * 0.45, anchor.y - size * 0.1, scaleFromWidth(size, 0.24), 8),
    buildImageLayer(chosen[4], anchor.x + anchor.spread * 1.2, anchor.y - size * 0.04, scaleFromWidth(size, 0.18), 16)
  ];
}

export function buildSceneProductPlacementLayers(state: AppState, mode: 'single' | 'multi', preset?: ScenePlacementPreset) {
  const selectedAssets = state.sourceAssets.filter((asset) => asset.selected);
  const effectivePreset = preset || state.backgroundRotationItems[state.activeBgRotationIndex]?.sceneMeta?.preset || 'center-stage';
  const size = state.canvas.size;
  if (!selectedAssets.length) return [];

  if (mode === 'single') {
    const target = buildSinglePreset(size, effectivePreset);
    return [buildImageLayer(selectedAssets[0], target.x, target.y, target.scale, target.rotation)];
  }

  return buildMultiLayers(size, effectivePreset, selectedAssets.slice(0, 5));
}

export function getSceneTemplateLabel(preset?: ScenePlacementPreset) {
  switch (preset) {
    case 'left-stage':
      return '商品偏左展示位';
    case 'right-stage':
      return '商品偏右展示位';
    case 'wide-stage':
      return '宽幅分布展示位';
    default:
      return '中间前景展示位';
  }
}

export function normalizeSceneLayersToCanvas(size: number, layers: ImageLayer[]) {
  return layers.map((layer) => ({
    ...layer,
    x: clamp(layer.x, size * 0.12, size * 0.88),
    y: clamp(layer.y, size * 0.2, size * 0.88),
    scale: clamp(layer.scale, scaleFromWidth(size, 0.14), scaleFromWidth(size, 0.48))
  }));
}
