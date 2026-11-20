export type FreeExportMode = 'current' | 'random';
export type BackgroundRotationMode = 'single' | 'all';
export type FolderMode = 'split' | 'chunk';

export type ExportMode = 'single' | 'group';

export type ExportJob = {
  folder: string;
  fileName: string;
  dataUrl: string;
};