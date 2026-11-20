import type { WatermarkConfig, WatermarkPosition } from '@/core/models/project';

const imageCache = new Map<string, HTMLImageElement>();

function getPositionOffset(
  position: WatermarkPosition,
  canvasSize: number,
  wmWidth: number,
  wmHeight: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  const positions: Record<WatermarkPosition, { x: number; y: number }> = {
    'top-left':     { x: offsetX + wmWidth / 2,         y: offsetY + wmHeight / 2 },
    'top-center':   { x: canvasSize / 2,                y: offsetY + wmHeight / 2 },
    'top-right':    { x: canvasSize - offsetX - wmWidth / 2, y: offsetY + wmHeight / 2 },
    'center-left':  { x: offsetX + wmWidth / 2,         y: canvasSize / 2 },
    'center':       { x: canvasSize / 2,                y: canvasSize / 2 },
    'center-right': { x: canvasSize - offsetX - wmWidth / 2, y: canvasSize / 2 },
    'bottom-left':  { x: offsetX + wmWidth / 2,         y: canvasSize - offsetY - wmHeight / 2 },
    'bottom-center':{ x: canvasSize / 2,                y: canvasSize - offsetY - wmHeight / 2 },
    'bottom-right': { x: canvasSize - offsetX - wmWidth / 2, y: canvasSize - offsetY - wmHeight / 2 },
  };
  return positions[position] ?? positions['bottom-right'];
}

export async function drawWatermark(ctx: CanvasRenderingContext2D, wm: WatermarkConfig, canvasSize: number) {
  if (!wm.enabled) return;
  if (wm.type === 'text' && !wm.text) return;
  if (wm.type === 'image' && !wm.imageDataUrl) return;

  ctx.save();
  const alpha = wm.opacity / 100;

  if (wm.tileMode) {
    // 平铺模式
    await drawTiledWatermark(ctx, wm, canvasSize, alpha);
  } else {
    // 单个水印
    await drawSingleWatermark(ctx, wm, canvasSize, alpha);
  }

  ctx.restore();
}

async function drawSingleWatermark(
  ctx: CanvasRenderingContext2D,
  wm: WatermarkConfig,
  canvasSize: number,
  alpha: number,
) {
  if (wm.type === 'text') {
    drawTextWatermark(ctx, wm, canvasSize, alpha);
  } else {
    await drawImageWatermark(ctx, wm, canvasSize, alpha, false, 0, 0);
  }
}

async function drawTiledWatermark(
  ctx: CanvasRenderingContext2D,
  wm: WatermarkConfig,
  canvasSize: number,
  alpha: number,
) {
  const spacing = wm.tileSpacing;

  if (wm.type === 'text') {
    // 测量文字大小
    ctx.save();
    ctx.font = `${wm.fontSize}px sans-serif`;
    const metrics = ctx.measureText(wm.text);
    const tw = metrics.width;
    const th = wm.fontSize;
    ctx.restore();

    // 循环绘制
    for (let x = spacing; x < canvasSize; x += tw + spacing) {
      for (let y = spacing + th / 2; y < canvasSize; y += th + spacing) {
        drawTextAt(ctx, wm, alpha, x, y);
      }
    }
  } else if (wm.imageDataUrl) {
    const img = await loadImage(wm.imageDataUrl);
    if (!img.width) return;
    const scale = (canvasSize * wm.imageScale) / 100;
    const aspect = img.height / img.width;
    const iw = scale;
    const ih = scale * aspect;

    for (let x = spacing; x < canvasSize; x += iw + spacing) {
      for (let y = spacing; y < canvasSize; y += ih + spacing) {
        drawImageAt(ctx, img, wm, alpha, x + iw / 2, y + ih / 2, iw, ih);
      }
    }
  }
}

async function drawImageWatermark(
  ctx: CanvasRenderingContext2D,
  wm: WatermarkConfig,
  canvasSize: number,
  alpha: number,
  _isTile: boolean,
  _tileX: number,
  _tileY: number,
) {
  if (!wm.imageDataUrl) return;
  const img = await loadImage(wm.imageDataUrl);
  if (!img.width) return;
  const scale = (canvasSize * wm.imageScale) / 100;
  const aspect = img.height / img.width;
  const iw = scale;
  const ih = scale * aspect;

  const { x, y } = getPositionOffset(wm.position, canvasSize, iw, ih, wm.offsetX, wm.offsetY);
  drawImageAt(ctx, img, wm, alpha, x, y, iw, ih);
}

function drawImageAt(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  wm: WatermarkConfig,
  alpha: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((wm.rotation * Math.PI) / 180);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawTextWatermark(
  ctx: CanvasRenderingContext2D,
  wm: WatermarkConfig,
  canvasSize: number,
  alpha: number,
) {
  ctx.save();
  ctx.font = `${wm.fontSize}px sans-serif`;
  const metrics = ctx.measureText(wm.text);
  const tw = metrics.width;
  const th = wm.fontSize;

  const { x, y } = getPositionOffset(wm.position, canvasSize, tw, th, wm.offsetX, wm.offsetY);
  drawTextAt(ctx, wm, alpha, x, y);
  ctx.restore();
}

function drawTextAt(
  ctx: CanvasRenderingContext2D,
  wm: WatermarkConfig,
  alpha: number,
  cx: number,
  cy: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((wm.rotation * Math.PI) / 180);
  ctx.globalAlpha = alpha;
  ctx.font = `${wm.fontSize}px sans-serif`;
  ctx.fillStyle = wm.fontColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(wm.text, 0, 0);
  ctx.restore();
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => undefined);
  imageCache.set(src, img);
  return img;
}
