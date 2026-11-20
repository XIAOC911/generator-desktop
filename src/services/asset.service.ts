import { editorStore } from '@/app/store/editorStore';
import type { SourceAsset, BackgroundRotationItem, ScenePlacementPreset } from '@/core/models/project';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function toRotationItems(results: Awaited<ReturnType<typeof window.fanDesktop.file.openImages>>): BackgroundRotationItem[] {
  return results.map((item) => ({
    id: item.id,
    name: item.name,
    dataUrl: item.previewUrl,
    sourceType: 'image'
  }));
}

export const assetService = {
  async importImages() {
    const results = await window.fanDesktop.file.openImages();
    const assets: SourceAsset[] = results.map((item) => ({
      id: item.id,
      name: item.name,
      previewUrl: item.previewUrl,
      originalPreviewUrl: item.previewUrl,
      originalPath: item.originalPath,
      selected: true,
      mattingStatus: 'idle',
      naturalWidth: (item as any).naturalWidth,
      naturalHeight: (item as any).naturalHeight
    }));
    editorStore.addAssets(assets);
  },
  async importBackgroundImage() {
    const results = await window.fanDesktop.file.openImages();
    if (!results.length) return;
    const items = toRotationItems(results);
    const current = editorStore.getState().backgroundRotationItems;
    const merged = [...current, ...items];
    editorStore.setBackgroundRotationItems(merged);
    const first = items[0];
    const activeIndex = current.length;
    editorStore.setActiveBgRotationIndex(activeIndex);
    editorStore.patchCanvas({
      backgroundType: 'image',
      backgroundImageUrl: first?.dataUrl ?? results[0].previewUrl,
      backgroundPsdTemplateId: undefined,
      backgroundFit: 'cover'
    });
  },
  async importBackgroundRotation() {
    const results = await window.fanDesktop.file.openImages();
    if (!results.length) return;
    editorStore.setBackgroundRotationItems(toRotationItems(results));
    editorStore.patchCanvas({
      backgroundType: 'image',
      backgroundImageUrl: results[0].previewUrl,
      backgroundPsdTemplateId: undefined,
      backgroundFit: 'cover'
    });
  },
  async importStickerLayer() {
    const results = await window.fanDesktop.file.openImages();
    if (!results.length) return;
    const item = results[0];
    editorStore.addLayer({
      id: uid(),
      type: 'image',
      x: 540,
      y: 540,
      scale: 180,
      rotation: 0,
      opacity: 100,
      filters: { ...DEFAULT_FILTERS },
      visible: true,
      sourceFileId: item.id,
      sourceName: item.name,
      previewUrl: item.previewUrl,
      freeSourceLayer: false // 标记为装饰贴图，套版时不被替换
    });
  },
  applyBackgroundRotationIndex(index: number) {
    const state = editorStore.getState();
    const item = state.backgroundRotationItems[index];
    if (!item) return;
    editorStore.setActiveBgRotationIndex(index);
    editorStore.patchCanvas(
      item.sourceType === 'psd'
        ? {
            backgroundType: 'psd',
            backgroundImageUrl: item.dataUrl,
            backgroundPsdTemplateId: item.psdTemplateId
          }
        : {
            backgroundType: 'image',
            backgroundImageUrl: item.dataUrl,
            backgroundPsdTemplateId: undefined,
            backgroundFit: 'cover'
          }
    );
  },

  importGeneratedBackgrounds(
    images: string[],
    options: { prefix?: string; sceneMeta?: { preset: ScenePlacementPreset; source?: 'scene' | 'replicate-scene'; compositionHint?: string } } = {}
  ) {
    if (!images.length) return [] as BackgroundRotationItem[];
    const current = editorStore.getState().backgroundRotationItems;
    const items: BackgroundRotationItem[] = images.map((dataUrl, index) => ({
      id: uid(),
      name: `${options.prefix || 'ai-scene'}-${index + 1}.png`,
      dataUrl,
      sourceType: 'image',
      sceneMeta: options.sceneMeta ? { ...options.sceneMeta } : undefined
    }));
    const merged = [...current, ...items];
    editorStore.setBackgroundRotationItems(merged);
    editorStore.patchCanvas({
      backgroundType: 'image',
      backgroundImageUrl: items[0].dataUrl,
      backgroundPsdTemplateId: undefined,
      backgroundFit: 'cover'
    });
    return items;
  },
  applyBackgroundRotationItem(itemId: string) {
    const state = editorStore.getState();
    const index = state.backgroundRotationItems.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    this.applyBackgroundRotationIndex(index);
    return true;
  },
  removeBackgroundRotationItem(itemId: string) {
    const state = editorStore.getState();
    const index = state.backgroundRotationItems.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const nextItems = state.backgroundRotationItems.filter((_, idx) => idx !== index);
    let nextActive = state.activeBgRotationIndex;
    if (index === nextActive) {
      nextActive = Math.max(0, index - 1);
    } else if (index < nextActive) {
      nextActive -= 1;
    }
    editorStore.patch({ backgroundRotationItems: nextItems, activeBgRotationIndex: nextActive });
    if (nextItems.length > 0) {
      this.applyBackgroundRotationIndex(nextActive);
    }
  },
  moveBackgroundRotationItem(itemId: string, direction: -1 | 1) {
    const state = editorStore.getState();
    const items = [...state.backgroundRotationItems];
    const index = items.findIndex((item) => item.id === itemId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const tmp = items[index];
    items[index] = items[nextIndex];
    items[nextIndex] = tmp;
    let nextActive = state.activeBgRotationIndex;
    if (nextActive === index) nextActive = nextIndex;
    else if (nextActive === nextIndex) nextActive = index;
    editorStore.patch({ backgroundRotationItems: items, activeBgRotationIndex: nextActive });
    this.applyBackgroundRotationIndex(nextActive);
  },
  moveBackgroundRotationItemToIndex(fromIndex: number, toIndex: number) {
    const state = editorStore.getState();
    const items = [...state.backgroundRotationItems];
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    let nextActive = state.activeBgRotationIndex;
    if (nextActive === fromIndex) {
      nextActive = toIndex;
    } else if (fromIndex < nextActive && toIndex >= nextActive) {
      nextActive -= 1;
    } else if (fromIndex > nextActive && toIndex <= nextActive) {
      nextActive += 1;
    }
    editorStore.patch({ backgroundRotationItems: items, activeBgRotationIndex: nextActive });
    this.applyBackgroundRotationIndex(nextActive);
  },
  clearBackgroundRotation() {
    editorStore.patch({ backgroundRotationItems: [], activeBgRotationIndex: 0 });
  }
};
