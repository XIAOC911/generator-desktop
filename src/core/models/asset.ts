export type MattingStatus = 'idle' | 'pending' | 'success' | 'failed';

export type SourceAsset = {
  id: string;
  name: string;
  previewUrl: string;
  originalPreviewUrl?: string;
  selected: boolean;
  originalPath?: string;
  cutoutPath?: string;
  maskPath?: string;
  mattingStatus?: MattingStatus;
  mattingProvider?: string;
  mattingError?: string;
  tags?: string[];
  defaultScale?: number; // 默认缩放比例，用于批量调整素材大小
  naturalWidth?: number;  // 原始图片宽度
  naturalHeight?: number; // 原始图片高度
};
