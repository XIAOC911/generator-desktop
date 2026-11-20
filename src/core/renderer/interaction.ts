import type { Layer } from '@/core/models/layer';
import type { PsdLayerNode, PsdTemplate } from '@/core/models/psd';

export type CanvasPoint = { x: number; y: number };
export type LayerHandleType = 'resize' | 'rotate';

const HANDLE_SIZE = 12;
const ROTATE_HANDLE_OFFSET = 28;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function rotatePoint(x: number, y: number, angleRad: number) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

export function getLayerDimensions(layer: Layer) {
  if (layer.type === 'text') {
    const fontSize = Math.max(18, layer.fontSize || layer.scale);
    const width = Math.max(120, layer.text.length * fontSize * 0.65 + 28);
    const height = fontSize + 26;
    return { width, height };
  }

  const baseWidth = layer.naturalWidth ?? 200;
  const baseHeight = layer.naturalHeight ?? baseWidth;
  const width = Math.max(20, baseWidth * (layer.scale / 100));
  const height = Math.max(20, baseHeight * (layer.scale / 100));
  return { width, height };
}

export function pointToLayerLocal(point: CanvasPoint, layer: Layer) {
  const angle = -toRadians(layer.rotation || 0);
  const shiftedX = point.x - layer.x;
  const shiftedY = point.y - layer.y;
  return rotatePoint(shiftedX, shiftedY, angle);
}

export function pointInLayer(point: CanvasPoint, layer: Layer) {
  const local = pointToLayerLocal(point, layer);
  const { width, height } = getLayerDimensions(layer);
  return Math.abs(local.x) <= width / 2 && Math.abs(local.y) <= height / 2;
}

export function getLayerWorldHandlePosition(layer: Layer, type: LayerHandleType): CanvasPoint {
  const { width, height } = getLayerDimensions(layer);
  const local =
    type === 'resize'
      ? { x: width / 2, y: height / 2 }
      : { x: 0, y: -height / 2 - ROTATE_HANDLE_OFFSET };
  const rotated = rotatePoint(local.x, local.y, toRadians(layer.rotation || 0));
  return {
    x: layer.x + rotated.x,
    y: layer.y + rotated.y
  };
}

export function hitLayerHandle(layer: Layer, point: CanvasPoint): LayerHandleType | null {
  const resize = getLayerWorldHandlePosition(layer, 'resize');
  if (Math.hypot(point.x - resize.x, point.y - resize.y) <= HANDLE_SIZE) return 'resize';
  const rotate = getLayerWorldHandlePosition(layer, 'rotate');
  if (Math.hypot(point.x - rotate.x, point.y - rotate.y) <= HANDLE_SIZE) return 'rotate';
  return null;
}

export function hitTopLayer(layers: Layer[], point: CanvasPoint) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (pointInLayer(point, layer)) return layer;
  }
  return null;
}

export function findPsdLayerById(layers: PsdLayerNode[], id: string): PsdLayerNode | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (layer.children) {
      const found = findPsdLayerById(layer.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function getPsdProductLayerIds(template: PsdTemplate) {
  const productLayerIds = Object.entries(template.layerRoles ?? {})
    .filter(([, role]) => role === 'placeholder')
    .map(([id]) => id);
  return productLayerIds.length
    ? productLayerIds
    : template.selectedProductLayerId
      ? [template.selectedProductLayerId]
      : [];
}

export function computePsdCanvasMapping(psdWidth: number, psdHeight: number, canvasSize: number) {
  const scale = Math.max(canvasSize / psdWidth, canvasSize / psdHeight);
  const drawWidth = psdWidth * scale;
  const drawHeight = psdHeight * scale;
  return {
    scale,
    offsetX: (canvasSize - drawWidth) / 2,
    offsetY: (canvasSize - drawHeight) / 2
  };
}

export function mapPsdBoundsToCanvas(
  bounds: { left: number; top: number; right: number; bottom: number },
  mapping: { scale: number; offsetX: number; offsetY: number }
) {
  return {
    x: mapping.offsetX + bounds.left * mapping.scale,
    y: mapping.offsetY + bounds.top * mapping.scale,
    width: (bounds.right - bounds.left) * mapping.scale,
    height: (bounds.bottom - bounds.top) * mapping.scale
  };
}

export function hitPsdProductSlot(template: PsdTemplate, canvasSize: number, point: CanvasPoint) {
  const mapping = computePsdCanvasMapping(template.width, template.height, canvasSize);
  for (const layerId of getPsdProductLayerIds(template)) {
    const layer = findPsdLayerById(template.layers, layerId);
    if (!layer?.visible || !layer.bounds) continue;
    const rect = mapPsdBoundsToCanvas(layer.bounds, mapping);
    if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      return { layerId, layer, rect };
    }
  }
  return null;
}
