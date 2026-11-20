import path from 'node:path';
import { nativeImage } from 'electron';
import { initializeCanvas, readPsd, type Layer, type PixelData } from 'ag-psd';
import { createCanvas, CanvasRenderingContext2D as NodeCanvasCtx } from 'canvas';

// 初始化 ag-psd 的 canvas 支持（Node 版 canvas）
initializeCanvas(createCanvas as unknown as (width: number, height: number) => HTMLCanvasElement);

type Deps = {
  fs: typeof import('node:fs/promises');
};

type PsdLayerTransform = {
  rotate: number;   // 旋转角度（度）
  scaleX: number;   // X 轴缩放（1 = 100%）
  scaleY: number;   // Y 轴缩放
  shearX: number;   // X 轴倾斜
  shearY: number;   // Y 轴倾斜
};

/**
 * 从 PSD PlacedLayer 的 8-double 仿射变换矩阵中提取 rotate / scale / shear。
 * transform 数组格式: [xx, xy, yx, yy, tx, ty, perspectiveX, perspectiveY]
 * 使用 QR 分解: M = R(θ) · S(sx, sy) · Sh(shx)
 */
function decomposePlacedLayerTransform(
  transform: number[] | undefined,
  /** 图层在 PSD 文档中的自然宽高，用于归一化 scale（单位：PSD point） */
  naturalWidth?: number,
  naturalHeight?: number,
): PsdLayerTransform {
  if (!transform || transform.length < 6) {
    return { rotate: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 };
  }

  const [xx, xy, yx, yy] = transform;
  let scaleX = Math.sqrt(xx * xx + yx * yx);

  if (scaleX < 1e-6) {
    return { rotate: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 };
  }

  // 从第一列提取旋转: xx = cosθ·sx,  yx = sinθ·sx
  const cosTheta = xx / scaleX;
  const sinTheta = yx / scaleX;
  const rotationRad = Math.atan2(sinTheta, cosTheta);

  // 移除旋转后得到 Scale·Shear:
  // Rᵀ · M = [sx,  cosθ·xy + sinθ·yy;  0,  -sinθ·xy + cosθ·yy]
  const upperRight = cosTheta * xy + sinTheta * yy;
  let lowerRight = -sinTheta * xy + cosTheta * yy;

  let shearX = Math.abs(lowerRight) > 1e-6 ? upperRight / lowerRight : 0;

  // 归一化：将绝对 PSD 文档单位转换为相对缩放比
  // 矩阵的列向量长度是智能对象在文档中的绝对尺寸（PSD point），
  // 除以图层边界在文档中的自然尺寸得到相对缩放（1.0 = 原始大小）
  if (naturalWidth && naturalWidth > 0) {
    scaleX = scaleX / naturalWidth;
  }
  if (naturalHeight && naturalHeight > 0) {
    lowerRight = lowerRight / naturalHeight;
  }

  // 防止极端值
  const scaleY = lowerRight;

  return {
    rotate: rotationRad * 180 / Math.PI,
    scaleX: Math.min(Math.max(scaleX, 0.01), 100),
    scaleY: Math.min(Math.max(scaleY, 0.01), 100),
    shearX,
    shearY: 0,
  };
}

type PsdLayerNode = {
  id: string;
  name: string;
  kind: 'group' | 'pixel' | 'layer';
  visible: boolean;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  children?: PsdLayerNode[];
  /** PSD 图层变换信息（当前 ag-psd 不直接暴露，使用默认值占位） */
  transform?: PsdLayerTransform;
};

export type PsdTemplatePayload = {
  id: string;
  name: string;
  originalPath: string;
  previewDataUrl: string;
  width: number;
  height: number;
  colorMode: 'RGB';
  bitsPerChannel: 8;
  layers: PsdLayerNode[];
  selectedProductLayerId?: string;
  createdAt: number;
};

/** 按需提取的图层像素数据 */
export type PsdLayerMaskPayload = {
  templateId: string;
  layerId: string;
  maskDataUrl: string;   // 灰度遮罩 dataURL（仅 alpha 通道，用于产品图裁剪）
  layerDataUrl: string;  // 完整 RGBA 图层 dataURL（含颜色+透明，用于前景层渲染）
  fullCanvasLayerDataUrl?: string; // 将该图层绘制在 PSD 原始全画布坐标中的透明 PNG，用于拆成可编辑图层时避免坐标偏移
  width: number;
  height: number;
};

const cache = new Map<string, PsdTemplatePayload>();
/** 缓存原始 PSD 解析结果，避免 getLayerMask 重复读盘和解析 */
const psdRawCache = new Map<string, { children?: Layer[] }>();

type CanvasLike = {
  width: number;
  height: number;
  toDataURL: () => string;
};

function rgbaToBgraBuffer(pixelData: PixelData): Buffer {
  const source = pixelData.data;
  const output = Buffer.alloc(pixelData.width * pixelData.height * 4);
  for (let i = 0; i < source.length; i += 4) {
    output[i] = source[i + 2] ?? 0;
    output[i + 1] = source[i + 1] ?? 0;
    output[i + 2] = source[i] ?? 0;
    output[i + 3] = source[i + 3] ?? 255;
  }
  return output;
}

function pixelDataToDataUrl(pixelData: PixelData): string {
  const image = nativeImage.createFromBitmap(rgbaToBgraBuffer(pixelData), {
    width: pixelData.width,
    height: pixelData.height
  });
  return image.toDataURL();
}

function pixelDataToCanvas(pixelData: PixelData): CanvasLike {
  const canvas = createCanvas(pixelData.width, pixelData.height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(pixelData.width, pixelData.height);
  imageData.data.set(pixelData.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas as unknown as CanvasLike;
}

function getLayerCanvas(layer: Layer): CanvasLike | null {
  const canvas = (layer as { canvas?: CanvasLike }).canvas;
  if (canvas?.width && canvas?.height) return canvas;
  if (layer.imageData?.width && layer.imageData.height) return pixelDataToCanvas(layer.imageData);
  return null;
}

function getPsdPreviewDataUrl(psd: { canvas?: CanvasLike; imageData?: PixelData }) {
  if (psd.canvas?.width && psd.canvas.height) return psd.canvas.toDataURL();
  if (psd.imageData) return pixelDataToDataUrl(psd.imageData);
  return null;
}

/**
 * 将指定图层的原始像素合成到 Canvas 上，跳过被排除的图层。
 * 用于生成不包含产品替换层的「干净背景」。
 */
function renderLayersToCanvas(
  ctx: NodeCanvasCtx,
  layers: Layer[],
  excludeIds: Set<string>,
  prefix = 'layer'
) {
  for (let i = 0; i < layers.length; i++) {
    const id = `${prefix}-${i}`;
    const layer = layers[i]!;

    if (layer.hidden) continue;
    if (excludeIds.has(id)) continue;

    const layerCanvas = getLayerCanvas(layer);
    if (layerCanvas && typeof layer.left === 'number' && typeof layer.top === 'number') {
      ctx.drawImage(layerCanvas as never, layer.left, layer.top);
    }

    // 递归处理子图层（组）
    if (layer.children) {
      renderLayersToCanvas(ctx, layer.children, excludeIds, id);
    }
  }
}

function buildLayerNodes(layers: Layer[] | undefined, prefix = 'layer'): PsdLayerNode[] {
  return (layers ?? []).map((layer, index) => {
    const id = `${prefix}-${index}`;
    const children = buildLayerNodes(layer.children, id);
    const hasPixels = !!getLayerCanvas(layer);
    // 从 PlacedLayer（智能对象）提取仿射变换；普通像素层用单位变换
    const boundsW = typeof layer.left === 'number' && typeof layer.right === 'number'
      ? layer.right - layer.left : undefined;
    const boundsH = typeof layer.top === 'number' && typeof layer.bottom === 'number'
      ? layer.bottom - layer.top : undefined;
    return {
      id,
      name: (layer as { name?: string }).name || `Layer ${index + 1}`,
      kind: children.length ? 'group' : hasPixels ? 'pixel' : 'layer',
      visible: !layer.hidden,
      bounds:
        typeof layer.left === 'number' &&
        typeof layer.top === 'number' &&
        typeof layer.right === 'number' &&
        typeof layer.bottom === 'number'
          ? {
              left: layer.left,
              top: layer.top,
              right: layer.right,
              bottom: layer.bottom
            }
          : undefined,
      transform: decomposePlacedLayerTransform(
        (layer as { placedLayer?: { transform?: number[] } }).placedLayer?.transform,
        boundsW,
        boundsH,
      ),
      children: children.length ? children : undefined
    };
  });
}

async function parsePsdFile(filePath: string, fs: Deps['fs']): Promise<PsdTemplatePayload> {
  const cached = cache.get(filePath);
  if (cached) return cached;

  const buffer = await fs.readFile(filePath);
  const psd = readPsd(buffer, {
    skipLayerImageData: false,
    skipCompositeImageData: false
  });

  if (psd.colorMode !== 3) {
    throw new Error('暂只支持 RGB PSD');
  }
  if ((psd.bitsPerChannel ?? 8) !== 8) {
    throw new Error('暂只支持 8bit PSD');
  }
  const previewDataUrl = getPsdPreviewDataUrl(psd);
  if (!previewDataUrl) {
    throw new Error('无法读取 PSD 合成预览');
  }

  const result: PsdTemplatePayload = {
    id: `psd:${path.basename(filePath)}:${Date.now()}`,
    name: path.basename(filePath),
    originalPath: filePath,
    previewDataUrl,
    width: psd.width,
    height: psd.height,
    colorMode: 'RGB',
    bitsPerChannel: 8,
    layers: buildLayerNodes(psd.children),
    createdAt: Date.now()
  };

  cache.set(filePath, result);
  psdRawCache.set(result.id, psd);
  return result;
}

export function createPsdService({ fs }: Deps) {
  return {
    async openTemplates(filePaths: string[]) {
      const results: PsdTemplatePayload[] = [];
      for (const filePath of filePaths) {
        results.push(await parsePsdFile(filePath, fs));
      }
      return results;
    },

    async setProductSlot(templateId: string, layerId: string) {
      for (const [filePath, template] of cache.entries()) {
        if (template.id === templateId) {
          template.selectedProductLayerId = layerId;
          cache.set(filePath, template);
          return true;
        }
      }
      return false;
    },

    /** 按需提取指定图层的像素数据（遮罩 + 完整 RGBA），优先使用缓存避免重复解析 */
    async getLayerMask(templateId: string, layerId: string): Promise<PsdLayerMaskPayload | null> {
      // 优先从原始 PSD 缓存获取，避免重复读盘和解析
      const rawPsd = psdRawCache.get(templateId);
      const psdChildren = rawPsd?.children;
      if (!psdChildren) return null;

      const found = findLayerByIdFn(psdChildren as Layer[], layerId);
      const layerCanvas = found ? getLayerCanvas(found) : null;
      if (!found || !layerCanvas) return null;

      const width = layerCanvas.width;
      const height = layerCanvas.height;
      const sampleCanvas = createCanvas(width, height);
      const sampleCtx = sampleCanvas.getContext('2d');
      sampleCtx.drawImage(layerCanvas as never, 0, 0);
      const src = sampleCtx.getImageData(0, 0, width, height).data;

      // 生成灰度遮罩（仅 alpha）
      const maskCanvas = createCanvas(width, height);
      const maskCtx = maskCanvas.getContext('2d');
      const maskImageData = maskCtx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const srcIdx = i * 4;
        const alpha = src[srcIdx + 3] ?? 0;
        const dstIdx = i * 4;
        maskImageData.data[dstIdx] = alpha;
        maskImageData.data[dstIdx + 1] = alpha;
        maskImageData.data[dstIdx + 2] = alpha;
        maskImageData.data[dstIdx + 3] = 255;
      }
      maskCtx.putImageData(maskImageData, 0, 0);
      const maskDataUrl = maskCanvas.toDataURL();

      // 官方路径：优先使用 ag-psd 提供的 layer.canvas 作为图层原始位图
      const layerDataUrl = layerCanvas.toDataURL();
      let fullCanvasLayerDataUrl: string | undefined;

      for (const template of cache.values()) {
        if (template.id !== templateId) continue;
        const fullCanvas = createCanvas(template.width, template.height);
        const fullCtx = fullCanvas.getContext('2d');
        fullCtx.drawImage(layerCanvas as never, found.left ?? 0, found.top ?? 0);
        fullCanvasLayerDataUrl = fullCanvas.toDataURL();
        break;
      }

      return {
        templateId,
        layerId,
        maskDataUrl,
        layerDataUrl,
        fullCanvasLayerDataUrl,
        width,
        height,
      };
    },

    /** 合成不包含指定图层的「干净背景」——逐层绘制所有非排除图层的原始像素 */
    async renderCleanBackground(
      templateId: string,
      excludeLayerIds: string[]
    ): Promise<string | null> {
      const rawPsd = psdRawCache.get(templateId);
      if (!rawPsd?.children) return null;

      // 查找模板信息（宽高）
      let template: PsdTemplatePayload | undefined;
      for (const cached of cache.values()) {
        if (cached.id === templateId) {
          template = cached;
          break;
        }
      }
      if (!template) return null;

      try {
        const canvas = createCanvas(template.width, template.height);
        const ctx = canvas.getContext('2d');
        const excludeSet = new Set(excludeLayerIds);
        if (!ctx) return null;

        renderLayersToCanvas(ctx, rawPsd.children, excludeSet);

        return canvas.toDataURL();
      } catch (error) {
        console.error('Failed to render clean background:', error);
        return null;
      }
    },

    /** 清理指定模板或全部模板的缓存，释放内存 */
    clearCache(templateId?: string) {
      if (templateId) {
        // 清除指定模板
        for (const [filePath, template] of cache.entries()) {
          if (template.id === templateId) {
            cache.delete(filePath);
            break;
          }
        }
        psdRawCache.delete(templateId);
      } else {
        cache.clear();
        psdRawCache.clear();
      }
    },
  };
}

function findLayerByIdFn(layers: Layer[], targetId: string, prefix = 'layer'): Layer | undefined {
  for (let i = 0; i < layers.length; i++) {
    const id = `${prefix}-${i}`;
    if (id === targetId) return layers[i]!;
    if (layers[i]!.children) {
      const found = findLayerByIdFn(layers[i]!.children!, targetId, id);
      if (found) return found;
    }
  }
  return undefined;
}
