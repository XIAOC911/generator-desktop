export type PsdLayerTransform = {
  rotate: number;   // 旋转角度（度）
  scaleX: number;   // X 轴缩放（1 = 100%）
  scaleY: number;   // Y 轴缩放
  shearX: number;   // X 轴倾斜
  shearY: number;   // Y 轴倾斜
};

export type PsdLayerRole = 'background' | 'placeholder' | 'foreground';

/** 产品替换层手动效果配置（补偿图层样式丢失） */
export type PsdLayerEffects = {
  dropShadow?: {
    enabled: boolean;
    color: string;    // #000000
    blur: number;     // 0-30px
    offsetX: number;  // -50 ~ 50px
    offsetY: number;  // -50 ~ 50px
    opacity: number;  // 0-1
  };
  stroke?: {
    enabled: boolean;
    color: string;    // #ffffff
    width: number;    // 0-20px
    opacity: number;  // 0-1
  };
};

export type PsdSlotBinding = {
  assetId: string;
  assetName: string;
  previewUrl?: string;
  boundAt: number;
};

export type PsdLayerNode = {
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
  /** PSD 图层变换信息（旋转、缩放、倾斜） */
  transform?: PsdLayerTransform;
  /** 图层像素遮罩 (dataURL)，用于不规则形状裁剪产品图 */
  maskDataUrl?: string;
  /** 完整图层 RGBA 像素 (dataURL)，用于前景层直接叠加渲染 */
  layerDataUrl?: string;
  /** 手动效果配置（产品替换层专用） */
  effects?: PsdLayerEffects;
};

/** AI 配置占位 — 后续接入图像生成 API */
export type PsdAiConfig = {
  enabled: boolean;
  /** AI 服务提供方，如 'openai-image' | 'stability' */
  provider?: string;
  /** 用户自定义提示词 */
  prompt?: string;
  /** 扩展配置，不同 provider 可注入专属参数 */
  settings?: Record<string, unknown>;
};

export type PsdTemplate = {
  id: string;
  name: string;
  originalPath: string;
  previewDataUrl: string;
  width: number;
  height: number;
  colorMode: 'RGB';
  bitsPerChannel: 8;
  layers: PsdLayerNode[];
  /** @deprecated 保留向后兼容，新逻辑优先用 layerRoles */
  selectedProductLayerId?: string;
  /** 图层角色映射: layerId → 背景层/产品层/前景层 */
  layerRoles?: Record<string, PsdLayerRole>;
  slotBindings?: Record<string, PsdSlotBinding>;
  /** AI 配置入口，为后续智能填充预留 */
  aiConfig?: PsdAiConfig;
  createdAt: number;
};
