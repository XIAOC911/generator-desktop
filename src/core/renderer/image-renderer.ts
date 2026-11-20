import type { ImageLayer } from '@/core/models/layer';
import { getLayerDimensions } from './interaction';

const imageCache = new Map<string, HTMLImageElement>();

async function getImage(previewUrl: string) {
  const cached = imageCache.get(previewUrl);
  if (cached) return cached;
  const image = new Image();
  image.src = previewUrl;
  await image.decode().catch(() => undefined);
  imageCache.set(previewUrl, image);
  return image;
}

export async function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer) {
  if (!layer.previewUrl) return;
  let image: HTMLImageElement;
  try {
    image = await getImage(layer.previewUrl);
    if (!image.width || !image.height) return;
  } catch {
    return;
  }

  const { width, height } = getLayerDimensions(layer);

  try {
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.globalAlpha = layer.opacity / 100;
    ctx.filter = `brightness(${layer.filters.brightness}%) contrast(${layer.filters.contrast}%) saturate(${layer.filters.saturate}%) hue-rotate(${layer.filters.hue}deg)`;
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  } catch (err) {
    console.error('[Image Render] drawImageLayer error:', err);
    ctx.restore();
  }
}
