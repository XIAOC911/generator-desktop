import type { Layer } from './layer';

/** 套图品牌设置 */
export type TaotuBrandSettings = {
  primaryColor: string;
  font: string;
  logoDataUrl?: string;
};

/** 套图单页背景 */
export type TaotuPageBackground = {
  type: 'color' | 'image';
  value: string; // color hex or image URL
  dataUrl?: string;
};

/** 套图页面 */
export type TaotuPage = {
  id: string;
  name: string;
  pageIndex: number;
  layers: Layer[];
  bg: TaotuPageBackground;
};

/** 套图模板（可保存到本地 JSON） */
export type TaotuTemplate = {
  id: string;
  name: string;
  pages: Array<{
    id: string;
    name: string;
    layers: Layer[];
    bg: TaotuPageBackground;
  }>;
  brand: TaotuBrandSettings;
  createdAt: number;
};

/** 复刻素材（用新商品图替换原素材） */
export type TaotuReplicateSource = {
  id: string;
  name: string;
  dataUrl: string;
};
