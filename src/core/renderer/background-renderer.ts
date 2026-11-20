import type { AppState } from '@/core/models/project';
import type { PsdTemplate, PsdLayerNode, PsdLayerTransform, PsdLayerEffects } from '@/core/models/psd';

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  canvasSize: number
) {
  const scale = Math.max(canvasSize / image.width, canvasSize / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (canvasSize - drawWidth) / 2;
  const y = (canvasSize - drawHeight) / 2;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  canvasSize: number
) {
  const scale = Math.min(canvasSize / image.width, canvasSize / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (canvasSize - drawWidth) / 2;
  const y = (canvasSize - drawHeight) / 2;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    return image.width && image.height ? image : null;
  } catch {
    return null;
  }
}

function resolveSlotAsset(
  state: AppState,
  psdTemplate: PsdTemplate,
  layerId: string,
  fallbackIndex: number,
  selectedProducts: AppState['sourceAssets']
) {
  const binding = psdTemplate.slotBindings?.[layerId];
  if (binding?.assetId) {
    const boundAsset = state.sourceAssets.find((asset) => asset.id === binding.assetId);
    if (boundAsset?.previewUrl) return boundAsset;
  }
  return selectedProducts[fallbackIndex % Math.max(1, selectedProducts.length)];
}

/** 计算 PSD 坐标 → 画布坐标的映射参数 */
function computePsdMapping(psdWidth: number, psdHeight: number, canvasSize: number) {
  const bgScale = Math.max(canvasSize / psdWidth, canvasSize / psdHeight);
  const bgDrawWidth = psdWidth * bgScale;
  const bgDrawHeight = psdHeight * bgScale;
  const bgX = (canvasSize - bgDrawWidth) / 2;
  const bgY = (canvasSize - bgDrawHeight) / 2;
  return { scale: bgScale, offsetX: bgX, offsetY: bgY };
}

/** 将 PSD 图层 bounds 映射到画布坐标 */
function mapBoundsToCanvas(
  bounds: { left: number; top: number; right: number; bottom: number },
  mapping: { scale: number; offsetX: number; offsetY: number }
) {
  return {
    x: mapping.offsetX + bounds.left * mapping.scale,
    y: mapping.offsetY + bounds.top * mapping.scale,
    width: (bounds.right - bounds.left) * mapping.scale,
    height: (bounds.bottom - bounds.top) * mapping.scale,
  };
}

/** 在画布上绘制产品图（支持变换 + 遮罩 + 手动效果） */
async function drawProductInSlot(
  ctx: CanvasRenderingContext2D,
  productImage: HTMLImageElement,
  slot: ReturnType<typeof mapBoundsToCanvas>,
  transform?: { rotate: number; scaleX: number; scaleY: number; shearX: number; shearY: number },
  maskImage?: HTMLImageElement | null,
  effects?: PsdLayerEffects
) {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;

  // 产品图 contain-fit 在 slot 内的绘制尺寸
  const productScale = Math.min(slot.width / productImage.width, slot.height / productImage.height);
  const drawW = productImage.width * productScale;
  const drawH = productImage.height * productScale;
  const drawX = slot.x + (slot.width - drawW) / 2;
  const drawY = slot.y + (slot.height - drawH) / 2;

  ctx.save();

  // 应用 PSD 图层变换（旋转 → 缩放 → 倾斜）
  ctx.translate(cx, cy);
  if (transform) {
    const rad = ((transform.rotate ?? 0) * Math.PI) / 180;
    ctx.rotate(rad);
    ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
    if ((transform.shearX ?? 0) || (transform.shearY ?? 0)) {
      ctx.transform(1, transform.shearY ?? 0, transform.shearX ?? 0, 1, 0, 0);
    }
  }
  ctx.translate(-cx, -cy);

  if (maskImage) {
    // 带遮罩：先将产品图裁入遮罩形状，再整体绘制到 ctx（支持投影）
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = slot.x + slot.width;
    tempCanvas.height = slot.y + slot.height;
    const tempCtx = tempCanvas.getContext('2d')!;

    // 绘制遮罩形状
    tempCtx.drawImage(maskImage, drawX, drawY, drawW, drawH);
    // source-in：产品图只在遮罩区域内显示
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(productImage, drawX, drawY, drawW, drawH);

    // 带投影绘制到主 ctx
    if (effects?.dropShadow?.enabled) {
      const { color, blur, offsetX, offsetY, opacity } = effects.dropShadow;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = offsetX;
      ctx.shadowOffsetY = offsetY;
      ctx.globalAlpha = opacity;
    }
    ctx.drawImage(tempCanvas, 0, 0);

    // 重置投影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;

    // 描边效果
    if (effects?.stroke?.enabled) {
      ctx.strokeStyle = effects.stroke.color;
      ctx.lineWidth = effects.stroke.width;
      ctx.globalAlpha = effects.stroke.opacity;
      ctx.strokeRect(drawX, drawY, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  } else {
    // 无遮罩：直接绘制
    if (effects?.dropShadow?.enabled) {
      const { color, blur, offsetX, offsetY, opacity } = effects.dropShadow;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = offsetX;
      ctx.shadowOffsetY = offsetY;
      ctx.globalAlpha = opacity;
    }
    ctx.drawImage(productImage, drawX, drawY, drawW, drawH);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;

    if (effects?.stroke?.enabled) {
      ctx.strokeStyle = effects.stroke.color;
      ctx.lineWidth = effects.stroke.width;
      ctx.globalAlpha = effects.stroke.opacity;
      ctx.strokeRect(drawX, drawY, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

// ===========================
// 主渲染入口
// ===========================

export async function drawCanvasBackground(ctx: CanvasRenderingContext2D, state: AppState) {
  ctx.fillStyle = state.canvas.backgroundValue;
  ctx.fillRect(0, 0, state.canvas.size, state.canvas.size);

  if ((state.canvas.backgroundType !== 'image' && state.canvas.backgroundType !== 'psd') || !state.canvas.backgroundImageUrl) {
    console.warn('[drawCanvasBackground] skip: type=', state.canvas.backgroundType, 'hasUrl=', !!state.canvas.backgroundImageUrl);
    return;
  }

  const psdTemplate = state.psdTemplates.find((t) => t.id === state.canvas.backgroundPsdTemplateId);

  // PSD 模式
  if (state.canvas.backgroundType === 'psd' && psdTemplate) {
    console.log('[drawCanvasBackground] PSD mode, template=', psdTemplate.name, 'layers=', psdTemplate.layers.length, 'productLayers=', Object.entries(psdTemplate.layerRoles ?? {}).filter(([,r]) => r === 'placeholder').length);
    await drawPsdWithReplacement(ctx, state, psdTemplate);
    return;
  }

  // 非 PSD 背景：直接 cover-fit 绘制
  const bgImage = await loadImage(state.canvas.backgroundImageUrl);
  if (bgImage) {
    if (state.canvas.backgroundFit === 'contain') {
      drawImageContain(ctx, bgImage, state.canvas.size);
    } else {
      drawImageCover(ctx, bgImage, state.canvas.size);
    }
  }
}

async function drawPsdWithReplacement(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  psdTemplate: PsdTemplate
) {
  const canvasSize = state.canvas.size;
  const mapping = computePsdMapping(psdTemplate.width, psdTemplate.height, canvasSize);

  // 确定产品层和前景层 ID
  const layerRoles = psdTemplate.layerRoles ?? {};
  const productLayerIds = Object.entries(layerRoles)
    .filter(([, r]) => r === 'placeholder')
    .map(([id]) => id);
  const foregroundLayerIds = Object.entries(layerRoles)
    .filter(([, r]) => r === 'foreground')
    .map(([id]) => id);

  // 向后兼容
  const effectiveProductIds = productLayerIds.length > 0
    ? productLayerIds
    : psdTemplate.selectedProductLayerId
      ? [psdTemplate.selectedProductLayerId]
      : [];

  const selectedProducts = state.sourceAssets.filter((a) => a.selected);
  const hasSlotBindings = effectiveProductIds.some((layerId) => Boolean(psdTemplate.slotBindings?.[layerId]));

  // ──────────────────────────────────────────
  // 在离屏 Canvas 上绘制 PSD 内容
  // ──────────────────────────────────────────
  const offscreen = document.createElement('canvas');
  offscreen.width = canvasSize;
  offscreen.height = canvasSize;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) {
    console.error('[drawPsdWithReplacement] failed to get offscreen context');
    return;
  }

  // ─── 手动排版模式 ───
  if (state.psdManualMode) {
    // 先用扁平合成图作底（所有图层都在里面）
    const bgImage = await loadImage(state.canvas.backgroundImageUrl!);
    if (!bgImage) {
      console.error('[drawPsdWithReplacement] bgImage failed to load');
      return;
    }
    drawImageCover(offCtx, bgImage, canvasSize);

    // 1. 擦除隐藏层：用图层自身的 alpha 通道生成遮罩，只擦实际内容
    for (const layer of collectHiddenLayers(psdTemplate.layers)) {
      if (!layer.bounds) continue;
      const slot = mapBoundsToCanvas(layer.bounds, mapping);
      const eraseMask = await getEraseMask(layer);
      if (!eraseMask) continue; // 无数据 → 跳过擦除（比制造白块好）
      offCtx.save();
      offCtx.globalCompositeOperation = 'destination-out';
      drawLayerWithTransform(offCtx, eraseMask, slot, layer.transform);
      offCtx.restore();
    }

    // 2. 可见的非前景层重新盖一层（覆盖擦除残留）
    const overlays = collectOverlayLayers(psdTemplate.layers, foregroundLayerIds);
    for (const layer of overlays) {
      if (!layer.layerDataUrl || !layer.bounds) continue;
      const img = await loadImage(layer.layerDataUrl);
      if (!img) continue;
      const slot = mapBoundsToCanvas(layer.bounds, mapping);
      drawLayerWithTransform(offCtx, img, slot, layer.transform);
    }

    // 3. 擦除前景层区域（稍后在自由图层之上重新绘制）
    for (const layerId of foregroundLayerIds) {
      const fgLayer = findLayerById(psdTemplate.layers, layerId);
      if (!fgLayer?.visible || !fgLayer.layerDataUrl || !fgLayer.bounds) continue;
      const fgSlot = mapBoundsToCanvas(fgLayer.bounds, mapping);
      const fgImg = await loadImage(fgLayer.layerDataUrl);
      if (!fgImg) continue;
      const fgMask = await createAlphaMask(fgImg);
      if (!fgMask) continue;
      offCtx.save();
      offCtx.globalCompositeOperation = 'destination-out';
      offCtx.drawImage(fgMask, fgSlot.x, fgSlot.y, fgSlot.width, fgSlot.height);
      offCtx.restore();
    }

    // 输出底图
    ctx.drawImage(offscreen, 0, 0);
    return;
  }

  // ─── 自动替换模式（原有逻辑） ───

  // 画 PSD 完整扁平复合图作为底
  const bgImage = await loadImage(state.canvas.backgroundImageUrl!);
  if (!bgImage) {
    console.error('[drawPsdWithReplacement] bgImage failed to load/ decode, canvas stays background color only');
    return;
  }
  drawImageCover(offCtx, bgImage, canvasSize);

  // ─── 如有产品层且已选中素材 → 替换产品 ───
  if (effectiveProductIds.length > 0 && (selectedProducts.length > 0 || hasSlotBindings)) {
    // 1. 擦除旧产品区域
    for (const layerId of effectiveProductIds) {
      const productLayer = findLayerById(psdTemplate.layers, layerId);
      if (!productLayer?.bounds) continue;

      const slot = mapBoundsToCanvas(productLayer.bounds, mapping);
      let maskImg: HTMLImageElement | null = null;
      if (productLayer.maskDataUrl) {
        maskImg = await loadImage(productLayer.maskDataUrl);
      }

      offCtx.save();
      offCtx.globalCompositeOperation = 'destination-out';
      if (maskImg) {
        offCtx.drawImage(maskImg, slot.x, slot.y, slot.width, slot.height);
      } else {
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(slot.x, slot.y, slot.width, slot.height);
      }
      offCtx.restore();
    }

    // 2. 擦除前景区域（准备重新覆盖）
    for (const layerId of foregroundLayerIds) {
      const fgLayer = findLayerById(psdTemplate.layers, layerId);
      if (!fgLayer?.layerDataUrl || !fgLayer.bounds) continue;
      const fgImg = await loadImage(fgLayer.layerDataUrl);
      if (!fgImg) continue;
      const fgSlot = mapBoundsToCanvas(fgLayer.bounds, mapping);
      offCtx.save();
      offCtx.globalCompositeOperation = 'destination-out';
      offCtx.drawImage(fgImg, fgSlot.x, fgSlot.y, fgSlot.width, fgSlot.height);
      offCtx.restore();
    }

    // 3. 绘制新产品（继承变换 + 遮罩 + 效果）
    for (let i = 0; i < effectiveProductIds.length; i++) {
      const layerId = effectiveProductIds[i]!;
      const productLayer = findLayerById(psdTemplate.layers, layerId);
      if (!productLayer?.bounds) continue;

      const product = resolveSlotAsset(state, psdTemplate, layerId, i, selectedProducts);
      if (!product?.previewUrl) continue;

      const slot = mapBoundsToCanvas(productLayer.bounds, mapping);

      let maskImage: HTMLImageElement | null = null;
      if (productLayer.maskDataUrl) {
        maskImage = await loadImage(productLayer.maskDataUrl);
      }

      const productImage = await loadImage(product.previewUrl);
      if (!productImage) continue;

      await drawProductInSlot(
        offCtx,
        productImage,
        slot,
        productLayer.transform,
        maskImage,
        productLayer.effects
      );
    }
  }

  // ─── 前景层绘制（始终在画布最上方） ───
  for (const layerId of foregroundLayerIds) {
    const fgLayer = findLayerById(psdTemplate.layers, layerId);
    if (!fgLayer?.layerDataUrl || !fgLayer.bounds) continue;

    const fgImg = await loadImage(fgLayer.layerDataUrl);
    if (!fgImg) continue;

    const fgSlot = mapBoundsToCanvas(fgLayer.bounds, mapping);
    offCtx.drawImage(fgImg, fgSlot.x, fgSlot.y, fgSlot.width, fgSlot.height);
  }

  // ─── 输出到主画布 ───
  ctx.drawImage(offscreen, 0, 0);
}

/**
 * 收集有像素数据的隐藏层（用于擦除）
 */
function collectHiddenLayers(layers: PsdLayerNode[]): PsdLayerNode[] {
  const result: PsdLayerNode[] = [];
  for (const layer of layers) {
    if (!layer.visible) {
      result.push(layer);
    }
    if (layer.children) {
      result.push(...collectHiddenLayers(layer.children));
    }
  }
  return result;
}

/**
 * 收集需要重新覆盖的可见图层（可见、非前景、有 layerDataUrl）
 * 在擦除隐藏层后重新绘制，覆盖残留
 */
function collectOverlayLayers(
  layers: PsdLayerNode[],
  foregroundLayerIds: string[]
): PsdLayerNode[] {
  const result: PsdLayerNode[] = [];
  for (const layer of layers) {
    if (layer.children) {
      result.push(...collectOverlayLayers(layer.children, foregroundLayerIds));
    } else if (layer.visible && layer.layerDataUrl && !foregroundLayerIds.includes(layer.id)) {
      result.push(layer);
    }
  }
  return result;
}

/**
 * 从图层获取最佳擦除遮罩：
 * 1. maskDataUrl（优先 - 最精确）
 * 2. layerDataUrl 的 alpha 通道提取
 * 返回 null 表示无法擦除（跳过）
 */
async function getEraseMask(layer: PsdLayerNode): Promise<HTMLCanvasElement | HTMLImageElement | null> {
  if (layer.maskDataUrl) {
    const mask = await loadImage(layer.maskDataUrl);
    if (mask) return mask;
  }
  if (layer.layerDataUrl) {
    const img = await loadImage(layer.layerDataUrl);
    if (img) {
      const alphaMask = await createAlphaMask(img);
      if (alphaMask) return alphaMask;
    }
  }
  return null;
}

/**
 * 将 RGBA 图片的 alpha 通道提取为灰度遮罩（用于 destination-out 精确擦除）
 * 如果图片没有透明通道（全 opaque），返回 null
 */
async function createAlphaMask(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;

  // 检查是否有透明像素
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 254) { // 不完全不透明
      hasAlpha = true;
      break;
    }
  }
  if (!hasAlpha) return null; // 全 opaque → 无法提取形状

  // 将 alpha 通道转为灰度遮罩
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 3];     // R = alpha
    data[i + 1] = data[i + 3]; // G = alpha
    data[i + 2] = data[i + 3]; // B = alpha
    data[i + 3] = 255;         // A = opaque
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** 在 slot 位置以 transform 绘制图片（旋转→缩放→倾斜） */
function drawLayerWithTransform(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  slot: ReturnType<typeof mapBoundsToCanvas>,
  transform?: PsdLayerTransform
) {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (transform) {
    const rad = ((transform.rotate ?? 0) * Math.PI) / 180;
    ctx.rotate(rad);
    ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
    if ((transform.shearX ?? 0) || (transform.shearY ?? 0)) {
      ctx.transform(1, transform.shearY ?? 0, transform.shearX ?? 0, 1, 0, 0);
    }
  }
  ctx.translate(-cx, -cy);
  ctx.drawImage(img, slot.x, slot.y, slot.width, slot.height);
  ctx.restore();
}

/**
 * 在手动排版模式下，在自由图层之上绘制 PSD 前景层（如握扇子的手）
 * 需在 canvas-renderer drawLayerCollection 之后调用
 */
export async function drawPsdForegroundLayers(ctx: CanvasRenderingContext2D, state: AppState) {
  if (!state.psdManualMode) return;

  const psdTemplate = state.psdTemplates.find((t) => t.id === state.canvas.backgroundPsdTemplateId);
  if (!psdTemplate) return;

  const canvasSize = state.canvas.size;
  const mapping = computePsdMapping(psdTemplate.width, psdTemplate.height, canvasSize);

  const layerRoles = psdTemplate.layerRoles ?? {};
  const foregroundLayerIds = Object.entries(layerRoles)
    .filter(([, r]) => r === 'foreground')
    .map(([id]) => id);

  if (!foregroundLayerIds.length) return;

  for (const layerId of foregroundLayerIds) {
    const fgLayer = findLayerById(psdTemplate.layers, layerId);
    // 只绘制可见的前景层
    if (!fgLayer?.visible || !fgLayer.layerDataUrl || !fgLayer.bounds) continue;

    const fgImg = await loadImage(fgLayer.layerDataUrl);
    if (!fgImg) continue;

    const fgSlot = mapBoundsToCanvas(fgLayer.bounds, mapping);
    ctx.drawImage(fgImg, fgSlot.x, fgSlot.y, fgSlot.width, fgSlot.height);
  }
}

function findLayerById(layers: PsdLayerNode[], id: string): PsdLayerNode | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (layer.children) {
      const found = findLayerById(layer.children, id);
      if (found) return found;
    }
  }
  return undefined;
}
