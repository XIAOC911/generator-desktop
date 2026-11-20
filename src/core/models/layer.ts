export type LayerFilters = {
  brightness: number;
  contrast: number;
  saturate: number;
  hue: number;
};

export type BaseLayer = {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  filters: LayerFilters;
  visible?: boolean;
  /** 锁定后不可拖拽、缩放、旋转，只能通过图层列表删除 */
  locked?: boolean;
};

export type ImageLayer = BaseLayer & {
  type: 'image';
  slotIndex?: number;
  sourceFileId?: string;
  sourceName?: string;
  previewUrl?: string;
  /** 原始文件路径，导出时用于加载全分辨率图片 */
  originalPath?: string;
  freeSourceLayer?: boolean;
  /** 图层原始显示宽度；PSD 拆层需要用它保持原始位置和比例 */
  naturalWidth?: number;
  /** 图层原始显示高度；PSD 拆层需要用它保持原始位置和比例 */
  naturalHeight?: number;
  /** 来自 PSD 拆层导入时，记录原始 PSD 模板 ID */
  psdTemplateId?: string;
  /** 来自 PSD 拆层导入时，记录原始 PSD 图层 ID */
  psdLayerId?: string;
  /** PSD 原图层角色：背景层、占位替换层、前景遮挡层 */
  psdRole?: 'background' | 'placeholder' | 'foreground';
  /** 占位层标记：批量套模板时被素材替换 */
  isPlaceholder?: boolean;
};

export type TextLayer = BaseLayer & {
  type: 'text';
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  textAlign?: 'left' | 'center' | 'right';
  bold?: boolean;
  shadow?: boolean;
  stroke?: boolean;
  shadowColor?: string;
  strokeColor?: string;
  shadowBlur?: number;
};

export type Layer = ImageLayer | TextLayer;
