import { DEFAULT_FILTERS } from '@/core/constants/defaults';
import type { AppState } from '@/core/models/project';
import type { AiCopyPack } from '@/core/models/llm';
import type { Layer, TextLayer } from '@/core/models/layer';
import { createId } from '@/core/utils/id';
import { getLayerDimensions } from '@/core/renderer/interaction';

type Rect = { left: number; top: number; right: number; bottom: number };
type AnchorKey = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type Anchor = { key: AnchorKey; x: number; y: number; stackDirection: 1 | -1; badgeX: number; badgeY: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function brightnessFromHex(hex: string) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return 255;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function layerRect(layer: Layer): Rect {
  const { width, height } = getLayerDimensions(layer);
  return {
    left: layer.x - width / 2,
    top: layer.y - height / 2,
    right: layer.x + width / 2,
    bottom: layer.y + height / 2
  };
}

function mergeRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  return rects.reduce(
    (acc, rect) => ({
      left: Math.min(acc.left, rect.left),
      top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, rect.right),
      bottom: Math.max(acc.bottom, rect.bottom)
    }),
    rects[0]
  );
}

function expandRect(rect: Rect, padding: number, size: number): Rect {
  return {
    left: clamp(rect.left - padding, 0, size),
    top: clamp(rect.top - padding, 0, size),
    right: clamp(rect.right + padding, 0, size),
    bottom: clamp(rect.bottom + padding, 0, size)
  };
}

function rectContainsPoint(rect: Rect, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function buildSceneFootprint(state: AppState): Rect | null {
  const imageLayers = state.layers.filter((layer) => layer.type === 'image');
  if (imageLayers.length) {
    const rect = mergeRects(imageLayers.map(layerRect));
    return rect ? expandRect(rect, 44, state.canvas.size) : null;
  }

  const selectedCount = state.sourceAssets.filter((asset) => asset.selected).length;
  if (state.mode === 'combination') {
    const templateId = state.layoutId || state.selectedMemoryTemplateId;
    const template = state.memoryTemplates.find((item) => item.id === templateId);
    if (!template) return null;
    const useCount = Math.max(1, Math.min(template.spec.length, selectedCount || template.spec.length));
    const rect = mergeRects(
      template.spec.slice(0, useCount).map((specItem) => {
        const width = Math.max(20, 200 * (specItem.scale / 100));
        const height = width;
        return {
          left: specItem.x - width / 2,
          top: specItem.y - height / 2,
          right: specItem.x + width / 2,
          bottom: specItem.y + height / 2
        };
      })
    );
    return rect ? expandRect(rect, 36, state.canvas.size) : null;
  }

  return null;
}

function buildAnchors(size: number): Anchor[] {
  return [
    { key: 'top-left', x: size * 0.24, y: size * 0.17, stackDirection: 1, badgeX: size * 0.14, badgeY: size * 0.1 },
    { key: 'top-center', x: size * 0.5, y: size * 0.15, stackDirection: 1, badgeX: size * 0.16, badgeY: size * 0.1 },
    { key: 'top-right', x: size * 0.76, y: size * 0.17, stackDirection: 1, badgeX: size * 0.86, badgeY: size * 0.1 },
    { key: 'bottom-left', x: size * 0.24, y: size * 0.78, stackDirection: -1, badgeX: size * 0.14, badgeY: size * 0.12 },
    { key: 'bottom-center', x: size * 0.5, y: size * 0.8, stackDirection: -1, badgeX: size * 0.84, badgeY: size * 0.1 },
    { key: 'bottom-right', x: size * 0.76, y: size * 0.78, stackDirection: -1, badgeX: size * 0.86, badgeY: size * 0.12 }
  ];
}

function chooseBestAnchor(state: AppState) {
  const size = state.canvas.size;
  const anchors = buildAnchors(size);
  const footprint = buildSceneFootprint(state);
  if (!footprint) return anchors[1];
  const centerX = (footprint.left + footprint.right) / 2;
  const centerY = (footprint.top + footprint.bottom) / 2;

  let best = anchors[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  anchors.forEach((anchor) => {
    const distance = Math.hypot(anchor.x - centerX, anchor.y - centerY);
    const insidePenalty = rectContainsPoint(footprint, anchor.x, anchor.y) ? 320 : 0;
    const verticalBias = anchor.stackDirection === 1 && centerY > size * 0.55 ? 42 : anchor.stackDirection === -1 && centerY < size * 0.45 ? 42 : 0;
    const edgeComfort = Math.min(anchor.x, size - anchor.x) * 0.05 + Math.min(anchor.y, size - anchor.y) * 0.03;
    const score = distance + verticalBias + edgeComfort - insidePenalty;
    if (score > bestScore) {
      bestScore = score;
      best = anchor;
    }
  });
  return best;
}

function buildTextStyle(state: AppState) {
  const lightBackground =
    state.canvas.backgroundType === 'color' ? brightnessFromHex(state.canvas.backgroundValue) > 180 : false;
  return {
    headline: {
      color: lightBackground ? '#0f172a' : '#ffffff',
      stroke: !lightBackground,
      strokeColor: lightBackground ? '#ffffff' : 'rgba(15,23,42,0.65)',
      shadow: true,
      shadowColor: lightBackground ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.45)'
    },
    body: {
      color: lightBackground ? '#1e293b' : '#ffffff',
      stroke: !lightBackground,
      strokeColor: lightBackground ? '#ffffff' : 'rgba(15,23,42,0.55)',
      shadow: true,
      shadowColor: lightBackground ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.4)'
    },
    badge: {
      color: '#f97316',
      stroke: true,
      strokeColor: '#ffffff',
      shadow: true,
      shadowColor: 'rgba(15,23,42,0.35)'
    }
  };
}

function createTextLayer(text: string, x: number, y: number, scale: number, patch: Partial<TextLayer> = {}): TextLayer {
  return {
    id: createId('text'),
    type: 'text',
    text,
    x,
    y,
    scale,
    rotation: 0,
    opacity: 100,
    filters: { ...DEFAULT_FILTERS },
    visible: true,
    color: '#111827',
    fontFamily: 'Microsoft YaHei',
    bold: true,
    shadow: true,
    stroke: false,
    shadowColor: 'rgba(0,0,0,0.35)',
    strokeColor: '#ffffff',
    shadowBlur: 10,
    ...patch
  };
}

export function buildCopyPackLayers(state: AppState, pack: AiCopyPack): TextLayer[] {
  const anchor = chooseBestAnchor(state);
  const style = buildTextStyle(state);
  const size = state.canvas.size;
  const maxPoints = pack.sellingPoints.slice(0, 4);
  const lineGap = anchor.stackDirection === 1 ? 1 : -1;
  const layers: TextLayer[] = [];

  const headlineY = anchor.y;
  const subheadlineY = headlineY + 82 * lineGap;
  const pointsStartY = headlineY + (pack.subheadline ? 158 : 112) * lineGap;
  const ctaY = pointsStartY + maxPoints.length * 56 * lineGap;

  layers.push(
    createTextLayer(pack.headline, anchor.x, clamp(headlineY, 90, size - 90), 94, {
      ...style.headline,
      bold: true,
      shadowBlur: 12
    })
  );

  if (pack.subheadline) {
    layers.push(
      createTextLayer(pack.subheadline, anchor.x, clamp(subheadlineY, 88, size - 88), 52, {
        ...style.body,
        bold: false,
        shadowBlur: 8
      })
    );
  }

  maxPoints.forEach((point, index) => {
    layers.push(
      createTextLayer(`• ${point}`, anchor.x, clamp(pointsStartY + index * 56 * lineGap, 80, size - 80), 42, {
        ...style.body,
        bold: false,
        shadowBlur: 6
      })
    );
  });

  if (pack.cta) {
    layers.push(
      createTextLayer(pack.cta, anchor.x, clamp(ctaY + 20 * lineGap, 72, size - 72), 40, {
        ...style.body,
        bold: true,
        shadowBlur: 6
      })
    );
  }

  if (pack.badge) {
    layers.push(
      createTextLayer(pack.badge, anchor.badgeX, anchor.badgeY, 40, {
        ...style.badge,
        bold: true,
        shadowBlur: 8
      })
    );
  }

  return layers;
}
