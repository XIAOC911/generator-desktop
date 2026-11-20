import type { SourceAsset } from '@/core/models/project';
import type { ImageLayer } from '@/core/models/layer';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';
import { resolveFreeLayoutCollisions, tightenFreeLayout } from './collision-engine';

const CANVAS_SIZE = 1080;
const CANVAS_CENTER = CANVAS_SIZE / 2;

export type FreeLayoutFamily = 'triangle' | 'sides' | 'vertical' | 'center' | 'grid';

export type GridLayoutConfig = {
  columns: number;  // 列数
  rows: number;     // 行数
  spacing: number;  // 间距（像素）
  uniformScale?: number; // 统一缩放比例，不传则自适应
  alignX?: 'left' | 'center' | 'right';   // 单元格内水平对齐，默认 center
  alignY?: 'top' | 'center' | 'bottom';    // 单元格内垂直对齐，默认 center
};

type LayoutSpec = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

const FAMILY_ORDER: FreeLayoutFamily[] = ['center', 'triangle', 'sides', 'vertical', 'grid'];

const FAMILY_LAYOUTS: Record<FreeLayoutFamily, Record<number, LayoutSpec[]>> = {
  center: {
    1: [{ x: 540, y: 540, scale: 360, rotation: 0 }],
    2: [
      { x: 370, y: 560, scale: 300, rotation: -8 },
      { x: 710, y: 520, scale: 286, rotation: 7 }
    ],
    3: [
      { x: 540, y: 350, scale: 280, rotation: -4 },
      { x: 360, y: 690, scale: 236, rotation: -10 },
      { x: 720, y: 670, scale: 236, rotation: 10 }
    ],
    4: [
      { x: 400, y: 360, scale: 236, rotation: -8 },
      { x: 680, y: 350, scale: 228, rotation: 8 },
      { x: 395, y: 700, scale: 222, rotation: -6 },
      { x: 690, y: 710, scale: 214, rotation: 6 }
    ],
    5: [
      { x: 540, y: 260, scale: 220, rotation: 0 },
      { x: 330, y: 470, scale: 196, rotation: -10 },
      { x: 750, y: 470, scale: 196, rotation: 10 },
      { x: 400, y: 760, scale: 188, rotation: -6 },
      { x: 680, y: 760, scale: 188, rotation: 6 }
    ],
    6: [
      { x: 300, y: 320, scale: 174, rotation: -6 },
      { x: 540, y: 300, scale: 180, rotation: 0 },
      { x: 780, y: 320, scale: 170, rotation: 6 },
      { x: 320, y: 720, scale: 166, rotation: -8 },
      { x: 540, y: 750, scale: 172, rotation: 0 },
      { x: 760, y: 720, scale: 162, rotation: 8 }
    ],
    7: [
      { x: 300, y: 260, scale: 158, rotation: -6 },
      { x: 540, y: 240, scale: 170, rotation: 0 },
      { x: 780, y: 260, scale: 158, rotation: 6 },
      { x: 540, y: 520, scale: 164, rotation: 0 },
      { x: 260, y: 760, scale: 148, rotation: -8 },
      { x: 540, y: 800, scale: 154, rotation: 0 },
      { x: 820, y: 760, scale: 148, rotation: 8 }
    ],
    8: [
      { x: 280, y: 230, scale: 144, rotation: -6 },
      { x: 540, y: 200, scale: 154, rotation: 0 },
      { x: 800, y: 230, scale: 144, rotation: 6 },
      { x: 360, y: 500, scale: 142, rotation: -8 },
      { x: 720, y: 500, scale: 142, rotation: 8 },
      { x: 260, y: 790, scale: 138, rotation: -6 },
      { x: 540, y: 830, scale: 144, rotation: 0 },
      { x: 820, y: 790, scale: 138, rotation: 6 }
    ]
  },
  triangle: {
    1: [{ x: 540, y: 540, scale: 360, rotation: 0 }],
    2: [
      { x: 540, y: 340, scale: 292, rotation: -6 },
      { x: 540, y: 760, scale: 286, rotation: 6 }
    ],
    3: [
      { x: 540, y: 270, scale: 270, rotation: -4 },
      { x: 330, y: 720, scale: 236, rotation: -10 },
      { x: 750, y: 720, scale: 236, rotation: 10 }
    ],
    4: [
      { x: 540, y: 210, scale: 220, rotation: 0 },
      { x: 320, y: 500, scale: 204, rotation: -12 },
      { x: 760, y: 500, scale: 204, rotation: 12 },
      { x: 540, y: 810, scale: 212, rotation: 0 }
    ],
    5: [
      { x: 540, y: 180, scale: 208, rotation: 0 },
      { x: 320, y: 450, scale: 188, rotation: -12 },
      { x: 760, y: 450, scale: 188, rotation: 12 },
      { x: 400, y: 800, scale: 180, rotation: -6 },
      { x: 680, y: 800, scale: 180, rotation: 6 }
    ],
    6: [
      { x: 540, y: 220, scale: 178, rotation: -4 },
      { x: 320, y: 420, scale: 166, rotation: -8 },
      { x: 760, y: 420, scale: 166, rotation: 8 },
      { x: 320, y: 630, scale: 158, rotation: -10 },
      { x: 760, y: 630, scale: 158, rotation: 10 },
      { x: 540, y: 840, scale: 164, rotation: 0 }
    ],
    7: [
      { x: 540, y: 190, scale: 160, rotation: -4 },
      { x: 300, y: 360, scale: 150, rotation: -8 },
      { x: 780, y: 360, scale: 150, rotation: 8 },
      { x: 300, y: 540, scale: 146, rotation: -10 },
      { x: 780, y: 540, scale: 146, rotation: 10 },
      { x: 420, y: 750, scale: 142, rotation: -6 },
      { x: 660, y: 750, scale: 142, rotation: 6 }
    ],
    8: [
      { x: 540, y: 170, scale: 146, rotation: -4 },
      { x: 280, y: 320, scale: 138, rotation: -8 },
      { x: 800, y: 320, scale: 138, rotation: 8 },
      { x: 280, y: 490, scale: 134, rotation: -10 },
      { x: 800, y: 490, scale: 134, rotation: 10 },
      { x: 370, y: 690, scale: 130, rotation: -6 },
      { x: 710, y: 690, scale: 130, rotation: 6 },
      { x: 540, y: 870, scale: 136, rotation: 0 }
    ]
  },
  sides: {
    1: [{ x: 540, y: 540, scale: 360, rotation: 0 }],
    2: [
      { x: 310, y: 550, scale: 288, rotation: -10 },
      { x: 770, y: 550, scale: 288, rotation: 10 }
    ],
    3: [
      { x: 300, y: 560, scale: 244, rotation: -10 },
      { x: 780, y: 560, scale: 244, rotation: 10 },
      { x: 540, y: 320, scale: 236, rotation: 0 }
    ],
    4: [
      { x: 285, y: 350, scale: 214, rotation: -12 },
      { x: 795, y: 350, scale: 214, rotation: 12 },
      { x: 310, y: 760, scale: 210, rotation: -8 },
      { x: 770, y: 760, scale: 210, rotation: 8 }
    ],
    5: [
      { x: 270, y: 260, scale: 188, rotation: -10 },
      { x: 810, y: 260, scale: 188, rotation: 10 },
      { x: 300, y: 580, scale: 184, rotation: -8 },
      { x: 780, y: 580, scale: 184, rotation: 8 },
      { x: 540, y: 840, scale: 194, rotation: 0 }
    ],
    6: [
      { x: 270, y: 280, scale: 172, rotation: -10 },
      { x: 810, y: 280, scale: 172, rotation: 10 },
      { x: 270, y: 530, scale: 166, rotation: -8 },
      { x: 810, y: 530, scale: 166, rotation: 8 },
      { x: 270, y: 780, scale: 160, rotation: -6 },
      { x: 810, y: 780, scale: 160, rotation: 6 }
    ],
    7: [
      { x: 270, y: 250, scale: 158, rotation: -10 },
      { x: 810, y: 250, scale: 158, rotation: 10 },
      { x: 270, y: 460, scale: 154, rotation: -8 },
      { x: 810, y: 460, scale: 154, rotation: 8 },
      { x: 270, y: 670, scale: 150, rotation: -6 },
      { x: 810, y: 670, scale: 150, rotation: 6 },
      { x: 540, y: 860, scale: 156, rotation: 0 }
    ],
    8: [
      { x: 260, y: 220, scale: 144, rotation: -10 },
      { x: 820, y: 220, scale: 144, rotation: 10 },
      { x: 260, y: 410, scale: 140, rotation: -8 },
      { x: 820, y: 410, scale: 140, rotation: 8 },
      { x: 260, y: 600, scale: 136, rotation: -6 },
      { x: 820, y: 600, scale: 136, rotation: 6 },
      { x: 260, y: 790, scale: 132, rotation: -4 },
      { x: 820, y: 790, scale: 132, rotation: 4 }
    ]
  },
  vertical: {
    1: [{ x: 540, y: 540, scale: 360, rotation: 0 }],
    2: [
      { x: 540, y: 320, scale: 294, rotation: -4 },
      { x: 540, y: 760, scale: 286, rotation: 4 }
    ],
    3: [
      { x: 540, y: 220, scale: 236, rotation: -4 },
      { x: 540, y: 540, scale: 246, rotation: 0 },
      { x: 540, y: 860, scale: 228, rotation: 4 }
    ],
    4: [
      { x: 540, y: 190, scale: 204, rotation: -4 },
      { x: 420, y: 470, scale: 214, rotation: -8 },
      { x: 660, y: 620, scale: 214, rotation: 8 },
      { x: 540, y: 890, scale: 198, rotation: 4 }
    ],
    5: [
      { x: 540, y: 170, scale: 184, rotation: -4 },
      { x: 390, y: 390, scale: 190, rotation: -10 },
      { x: 690, y: 540, scale: 196, rotation: 8 },
      { x: 390, y: 720, scale: 186, rotation: -8 },
      { x: 690, y: 900, scale: 178, rotation: 6 }
    ],
    6: [
      { x: 540, y: 200, scale: 172, rotation: -4 },
      { x: 390, y: 430, scale: 168, rotation: -8 },
      { x: 690, y: 430, scale: 164, rotation: 6 },
      { x: 390, y: 640, scale: 164, rotation: -6 },
      { x: 690, y: 640, scale: 160, rotation: 8 },
      { x: 540, y: 870, scale: 166, rotation: 4 }
    ],
    7: [
      { x: 540, y: 180, scale: 156, rotation: -4 },
      { x: 370, y: 380, scale: 152, rotation: -8 },
      { x: 710, y: 380, scale: 152, rotation: 8 },
      { x: 370, y: 550, scale: 148, rotation: -6 },
      { x: 710, y: 550, scale: 148, rotation: 6 },
      { x: 430, y: 740, scale: 144, rotation: -4 },
      { x: 650, y: 740, scale: 144, rotation: 4 }
    ],
    8: [
      { x: 540, y: 160, scale: 140, rotation: -4 },
      { x: 350, y: 340, scale: 136, rotation: -8 },
      { x: 730, y: 340, scale: 136, rotation: 8 },
      { x: 350, y: 500, scale: 132, rotation: -6 },
      { x: 730, y: 500, scale: 132, rotation: 6 },
      { x: 350, y: 660, scale: 128, rotation: -4 },
      { x: 730, y: 660, scale: 128, rotation: 4 },
      { x: 540, y: 840, scale: 138, rotation: 0 }
    ]
  }
};

let remapSeed = 0;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function getFamilyLayout(family: FreeLayoutFamily, count: number): LayoutSpec[] {
  const safeCount = Math.min(Math.max(1, count), 8);
  const familyLayouts = FAMILY_LAYOUTS[family];
  return familyLayouts[safeCount] ?? FAMILY_LAYOUTS.center[safeCount];
}

function applyJitter(spec: LayoutSpec, familyIndex: number, itemIndex: number, seed = 0): LayoutSpec {
  const wave = Math.sin((seed + 1) * (itemIndex + 1) * 1.37 + familyIndex * 0.91);
  const sway = Math.cos((seed + 1) * (itemIndex + 1) * 1.13 + familyIndex * 0.47);
  return {
    x: Math.round(spec.x + wave * 18),
    y: Math.round(spec.y + sway * 18),
    scale: Math.round(spec.scale * (1 + wave * 0.04)),
    rotation: Math.round(spec.rotation + sway * 5)
  };
}

/** 网格布局：计算每个槽位的位置（scale 设为 0 占位，由 buildRandomFreeLayers 按图片逐张适配） */
function buildGridLayoutSpecs(count: number, config: GridLayoutConfig): LayoutSpec[] {
  const { columns, rows, spacing, alignX = 'center', alignY = 'center' } = config;
  const cellW = (CANVAS_SIZE - (columns + 1) * spacing) / columns;
  const cellH = (CANVAS_SIZE - (rows + 1) * spacing) / rows;

  const alignXOffset = alignX === 'left' ? cellW * 0.2 : alignX === 'right' ? cellW * 0.8 : cellW / 2;
  const alignYOffset = alignY === 'top' ? cellH * 0.2 : alignY === 'bottom' ? cellH * 0.8 : cellH / 2;

  const specs: LayoutSpec[] = [];
  for (let i = 0; i < Math.min(count, rows * columns); i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    specs.push({
      x: Math.round(spacing + alignXOffset + col * (cellW + spacing)),
      y: Math.round(spacing + alignYOffset + row * (cellH + spacing)),
      scale: 0, // 占位，由 buildRandomFreeLayers 按图片实际宽高逐张计算
      rotation: 0
    });
  }
  return specs;
}

/** 将画布上所有自由图层设为统一缩放 */
export function normalizeFreeLayerScales(layers: ImageLayer[], targetScale?: number): ImageLayer[] {
  if (!layers.length) return layers;
  const freeLayers = layers.filter((l) => l.type === 'image' && l.freeSourceLayer) as ImageLayer[];
  if (!freeLayers.length) return layers;

  const baseScale = targetScale ?? Math.round(
    freeLayers.reduce((sum, l) => sum + (l.scale ?? 100), 0) / freeLayers.length
  );

  return layers.map((l) => {
    if (l.type !== 'image' || !(l as ImageLayer).freeSourceLayer) return l;
    return { ...l, scale: baseScale } as ImageLayer;
  });
}

export function buildRandomFreeLayers(
  files: SourceAsset[],
  family: FreeLayoutFamily = 'center',
  options: { resolveCollisions?: boolean; tighten?: boolean; gridConfig?: GridLayoutConfig } = {}
): ImageLayer[] {
  const familyIndex = FAMILY_ORDER.indexOf(family);

  // 网格模式：按行列排列
  let layoutSpecs: LayoutSpec[];
  if (family === 'grid') {
    const config = options.gridConfig || { columns: 3, rows: 2, spacing: 20 };
    layoutSpecs = buildGridLayoutSpecs(files.length, config);
  } else {
    layoutSpecs = getFamilyLayout(family, files.length);
  }

  // 网格模式：先算所有图片的统一缩放，保证网格整齐
  let gridUniformScale = 0;
  if (family === 'grid' && options.gridConfig) {
    const { columns, rows, spacing } = options.gridConfig;
    const cellW = (CANVAS_SIZE - (columns + 1) * spacing) / columns;
    const cellH = (CANVAS_SIZE - (rows + 1) * spacing) / rows;
    // 取所有图片中适配率最低的（即"最难塞进格子"的那张），作为统一缩放
    const fitScales = files.map((file) => {
      const nw = (file as any).naturalWidth || 200;
      const nh = (file as any).naturalHeight || 200;
      return Math.min(cellW / nw, cellH / nh);
    });
    gridUniformScale = Math.round(Math.min(...fitScales) * 100 * 0.8);
    gridUniformScale = Math.max(20, gridUniformScale);
  }

  const layers = files.map((file, index) => {
    const spec = applyJitter(layoutSpecs[index % layoutSpecs.length], Math.max(0, familyIndex), index);
    const nw = (file as any).naturalWidth || 200;
    const nh = (file as any).naturalHeight || 200;

    let finalScale = spec.scale;
    if (family === 'grid') {
      finalScale = gridUniformScale > 0 ? gridUniformScale : Math.max(20, spec.scale);
    }

    return {
      id: uid(),
      type: 'image',
      x: spec.x,
      y: spec.y,
      scale: finalScale,
      rotation: spec.rotation,
      opacity: 100,
      filters: { ...DEFAULT_FILTERS },
      visible: true,
      sourceFileId: file.id,
      sourceName: file.name,
      previewUrl: file.previewUrl,
      originalPath: (file as any).originalPath,
      freeSourceLayer: true,
      naturalWidth: nw,
      naturalHeight: nh
    };
  });

  if (options.tighten && options.resolveCollisions) {
    return tightenFreeLayout(layers, CANVAS_SIZE) as ImageLayer[];
  }
  if (options.resolveCollisions) {
    return resolveFreeLayoutCollisions(layers, CANVAS_SIZE) as ImageLayer[];
  }
  return layers;
}

export { resolveFreeLayoutCollisions, tightenFreeLayout };

export function remapFreeLayers(
  layers: ImageLayer[],
  options?: { gridConfig?: GridLayoutConfig }
) {
  remapSeed += 1;
  const family = FAMILY_ORDER[remapSeed % FAMILY_ORDER.length];
  let specs: LayoutSpec[];
  if (family === 'grid') {
    const config = options?.gridConfig || { columns: 3, rows: 2, spacing: 20 };
    specs = buildGridLayoutSpecs(layers.length, config);
  } else {
    specs = getFamilyLayout(family, layers.length);
  }

  return layers.map((layer, index) => {
    const spec = applyJitter(specs[index % specs.length], FAMILY_ORDER.indexOf(family), index, remapSeed);
    return {
      ...layer,
      x: spec.x,
      y: spec.y,
      scale: spec.scale,
      rotation: spec.rotation
    };
  });
}
