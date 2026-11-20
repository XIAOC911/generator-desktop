import type { AppState } from '@/core/models/project';
import { drawCanvasBackground, drawPsdForegroundLayers } from './background-renderer';
import { drawLayerCollection } from './layer-renderer';
import { drawWatermark } from './watermark-renderer';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';

const previewCache = new Map<string, HTMLImageElement>();

async function getPreviewImage(src: string) {
  const cached = previewCache.get(src);
  if (cached) return cached;
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    // 图片解码失败，仍然会缓存但后续会跳过绘制
  }
  previewCache.set(src, image);
  return image;
}

async function drawLayoutPreview(ctx: CanvasRenderingContext2D, state: AppState) {
  const templateId = state.layoutId || state.selectedMemoryTemplateId;
  const template = state.memoryTemplates.find((item) => item.id === templateId);
  if (!template) return;

  const selectedAssets = state.sourceAssets.filter((asset) => asset.selected);

  for (let index = 0; index < template.spec.length; index += 1) {
    const specItem = template.spec[index];
    const asset =
      selectedAssets[specItem.slotIndex ?? index] ??
      selectedAssets[index] ??
      state.sourceAssets.find(
        (candidate) => candidate.id === specItem.sourceFileId || candidate.name === specItem.sourceName
      );
    if (!asset?.previewUrl) continue;

    const image = await getPreviewImage(asset.previewUrl);
    if (!image.width || !image.height) continue;

    const width = Math.max(20, 200 * (specItem.scale / 100));
    const height = width / (image.width / image.height || 1);

    ctx.save();
    ctx.translate(specItem.x, specItem.y);
    ctx.rotate(((specItem.rotation ?? 0) * Math.PI) / 180);
    ctx.globalAlpha = (specItem.opacity ?? 100) / 100;
    const filters = specItem.filters ?? DEFAULT_FILTERS;
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) hue-rotate(${filters.hue}deg)`;
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
}

export async function renderCanvasScene(canvas: HTMLCanvasElement, state: AppState) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 先同步绘制背景色，确保 canvas 不会出现空白/黑屏
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCanvasBackgroundSync(ctx, state);

  try {
    // 异步加载背景图片（如果有）
    await drawCanvasBackground(ctx, state);

    if (state.layers.length > 0) {
      await drawLayerCollection(ctx, state);
    }

    // 手动排版模式：在自由图层之上绘制 PSD 前景层（如握扇子的手）
    await drawPsdForegroundLayers(ctx, state);

    // 水印：始终在最顶层渲染（图层 + 前景层之上）
    await drawWatermark(ctx, state.watermark, canvas.width);

    if (state.layers.length > 0) return;

    if (state.mode === 'combination') {
      await drawLayoutPreview(ctx, state);
    }
  } catch (err) {
    console.error('[Canvas Render] rendering error:', err);
    // 出错时不中断，canvas 已显示背景色
  }
}

/** 同步绘制背景色，避免异步等待期间 canvas 空白 */
function drawCanvasBackgroundSync(ctx: CanvasRenderingContext2D, state: AppState) {
  ctx.fillStyle = state.canvas.backgroundValue || '#ffffff';
  ctx.fillRect(0, 0, state.canvas.size, state.canvas.size);
}
