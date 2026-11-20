import { editorStore } from '@/app/store/editorStore';
import type {
  MattingBackgroundMode,
  MattingProviderId,
  MattingProviderStatus,
  MattingProviderStatusResponse,
  MattingRunResponse,
  RembgModelId
} from '@/core/models/matting';

type MattingOptions = {
  provider: MattingProviderId;
  threshold: number;
  backgroundMode: MattingBackgroundMode;
  createMask: boolean;
  model: RembgModelId;
  alphaMatting: boolean;
  foregroundThreshold: number;
  backgroundThreshold: number;
  erodeSize: number;
};

type CutoutAssetResult = {
  ok: boolean;
  replacedRefs: number;
  assetName?: string;
  error?: string;
};

type BatchCutoutResult = {
  success: number;
  failed: number;
  stopped: number;
  replacedRefs: number;
  total: number;
};

const DEFAULT_OPTIONS: MattingOptions = {
  provider: 'rembg-python',
  threshold: 38,
  backgroundMode: 'auto',
  createMask: false,
  model: 'u2netp', // 轻量模型，加载快，CPU 推理快 40%
  alphaMatting: true,
  foregroundThreshold: 200,
  backgroundThreshold: 20,
  erodeSize: 8
};

let sessionOptions: MattingOptions = { ...DEFAULT_OPTIONS };

function resolveAssetSource(assetId: string) {
  const asset = editorStore.getState().sourceAssets.find((item) => item.id === assetId);
  if (!asset) return null;
  return {
    asset,
    source: asset.originalPath || asset.originalPreviewUrl || asset.previewUrl
  };
}

function getCanvasAssetIds() {
  const state = editorStore.getState();
  const assetIds = new Set<string>();

  if (state.layers.length > 0) {
    state.layers.forEach((layer) => {
      if (layer.type === 'image' && layer.sourceFileId) {
        assetIds.add(layer.sourceFileId);
      }
    });
    return [...assetIds];
  }

  const selectedAssets = state.sourceAssets.filter((asset) => asset.selected);
  const assets = selectedAssets.length ? selectedAssets : state.sourceAssets;
  let slotCount = state.randomCount ?? assets.length;

  if (state.mode === 'combination') {
    const templateId = state.layoutId || state.selectedMemoryTemplateId;
    const template = state.memoryTemplates.find((item) => item.id === templateId);
    if (template) {
      slotCount = template.spec.length;
    }
  }

  assets.slice(0, slotCount).forEach((asset) => {
    assetIds.add(asset.id);
  });

  return [...assetIds];
}

function getProcessedAssetIds() {
  return editorStore
    .getState()
    .sourceAssets.filter((asset) => asset.cutoutPath)
    .map((asset) => asset.id);
}

function getSelectedAssetIds() {
  return editorStore
    .getState()
    .sourceAssets.filter((asset) => asset.selected)
    .map((asset) => asset.id);
}

function getSelectedCutoutAssets() {
  return editorStore.getState().sourceAssets.filter((asset) => asset.selected && asset.cutoutPath);
}

function getProcessedCutoutAssets() {
  return editorStore.getState().sourceAssets.filter((asset) => asset.cutoutPath);
}

function buildCutoutFileName(assetName: string, cutoutPath?: string) {
  const cleanedName = assetName.trim();
  const dotIndex = cleanedName.lastIndexOf('.');
  const base = dotIndex > 0 ? cleanedName.slice(0, dotIndex) : cleanedName || 'cutout';
  const extMatch = cutoutPath?.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch?.[0] || '.png';
  return `${base}-cutout${ext}`;
}

async function runBatchByAssetIds(assetIds: string[], options: Partial<MattingOptions> = {}, abortSignal?: AbortSignal) {
  let success = 0;
  let failed = 0;
  let stopped = 0;
  let replacedRefs = 0;

  // 顺序逐个处理，完全模拟手动点击每个素材的抠图按钮
  // 持久 Worker 已是单进程串行，前端并发只会增加 React 重渲染开销
  for (const assetId of assetIds) {
    if (abortSignal?.aborted) {
      stopped = assetIds.length - (success + failed);
      mattingService.cancelAllPending();
      break;
    }

    const result = await mattingService.cutoutAsset(assetId, options, { silentError: true });
    if (result.ok) {
      success += 1;
      replacedRefs += result.replacedRefs;
    } else {
      failed += 1;
    }

    // 给 React 一个渲染间隙，让每个素材的"抠图中→已抠图"状态变化可见
    if (assetIds.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    success,
    failed,
    stopped,
    replacedRefs,
    total: assetIds.length
  } satisfies BatchCutoutResult;
}

export const mattingService = {
  getDefaultOptions() {
    return { ...DEFAULT_OPTIONS };
  },

  getOptions() {
    return { ...sessionOptions };
  },

  updateOptions(options: Partial<MattingOptions>) {
    sessionOptions = { ...sessionOptions, ...options };
    return this.getOptions();
  },

  getCanvasAssetIds() {
    return getCanvasAssetIds();
  },

  getProcessedAssetIds() {
    return getProcessedAssetIds();
  },

  async getProviderStatus() {
    const response = (await window.fanDesktop.matting.getProviderStatus()) as MattingProviderStatusResponse;
    return response.providers as MattingProviderStatus[];
  },

  async cutoutAsset(
    assetId: string,
    options: Partial<MattingOptions> = {},
    behavior: { silentError?: boolean } = {}
  ): Promise<CutoutAssetResult> {
    const resolved = resolveAssetSource(assetId);
    if (!resolved) {
      if (!behavior.silentError) {
        window.alert('未找到要抠图的素材。');
      }
      return { ok: false, replacedRefs: 0, error: '未找到要抠图的素材。' };
    }

    const merged = { ...sessionOptions, ...options };
    editorStore.setAssetMattingPending(assetId, merged.provider);

    const response = (await window.fanDesktop.matting.run({
      assetPath: resolved.source,
      provider: merged.provider,
      threshold: merged.threshold,
      backgroundMode: merged.backgroundMode,
      createMask: merged.createMask,
      model: merged.model,
      alphaMatting: merged.alphaMatting,
      foregroundThreshold: merged.foregroundThreshold,
      backgroundThreshold: merged.backgroundThreshold,
      erodeSize: merged.erodeSize
    })) as MattingRunResponse;

    if (response.status === 'success') {
      const replacedRefs = editorStore.applyMattingResult(assetId, response.result) ?? 0;
      return { ok: true, replacedRefs, assetName: resolved.asset.name };
    }

    editorStore.markAssetMattingFailed(assetId, response.error);
    if (!behavior.silentError) {
      window.alert(`抠图失败：${response.error}`);
    }
    return { ok: false, replacedRefs: 0, assetName: resolved.asset.name, error: response.error };
  },

  async cutoutSelectedAssets(options: Partial<MattingOptions> = {}, abortSignal?: AbortSignal) {
    const selectedAssets = getSelectedAssetIds();

    if (!selectedAssets.length) {
      window.alert('请先勾选要抠图的素材。');
      return { success: 0, failed: 0, stopped: 0, replacedRefs: 0, total: 0 } satisfies BatchCutoutResult;
    }

    return runBatchByAssetIds(selectedAssets, options, abortSignal);
  },

  async reCutSelectedAssets(options: Partial<MattingOptions> = {}) {
    const selectedAssets = getSelectedAssetIds();
    if (!selectedAssets.length) {
      window.alert('请先勾选要重抠的素材。');
      return { success: 0, failed: 0, stopped: 0, replacedRefs: 0, total: 0 } satisfies BatchCutoutResult;
    }
    return runBatchByAssetIds(selectedAssets, options);
  },

  async reCutCanvasAssets(options: Partial<MattingOptions> = {}) {
    const assetIds = getCanvasAssetIds();
    if (!assetIds.length) {
      window.alert('当前画布里没有可重抠的素材引用。');
      return { success: 0, failed: 0, stopped: 0, replacedRefs: 0, total: 0 } satisfies BatchCutoutResult;
    }
    return runBatchByAssetIds(assetIds, options);
  },

  async reCutProcessedAssets(options: Partial<MattingOptions> = {}) {
    const assetIds = getProcessedAssetIds();
    if (!assetIds.length) {
      window.alert('当前还没有已抠图素材可供重抠。');
      return { success: 0, failed: 0, stopped: 0, replacedRefs: 0, total: 0 } satisfies BatchCutoutResult;
    }
    return runBatchByAssetIds(assetIds, options);
  },

  restoreAsset(assetId: string) {
    return editorStore.restoreAssetOriginal(assetId) ?? 0;
  },

  /** 停止抠图时立即重置所有 pending 素材状态，避免 UI 卡在"处理中" */
  cancelAllPending() {
    const pendingAssets = editorStore
      .getState()
      .sourceAssets.filter((asset) => asset.mattingStatus === 'pending');

    if (!pendingAssets.length) return 0;

    pendingAssets.forEach((asset) => {
      // 用轻量方法仅重置 mattingStatus，不清除已有的 cutoutPath/previewUrl
      editorStore.clearAssetMattingPending(asset.id);
    });

    return pendingAssets.length;
  },

  restoreSelectedAssets() {
    const selectedAssets = editorStore.getState().sourceAssets.filter((asset) => asset.selected && asset.cutoutPath);

    let replacedRefs = 0;
    selectedAssets.forEach((asset) => {
      replacedRefs += editorStore.restoreAssetOriginal(asset.id) ?? 0;
    });

    return {
      restored: selectedAssets.length,
      replacedRefs
    };
  },

  async downloadSelectedCutouts() {
    const assets = getSelectedCutoutAssets();
    if (!assets.length) {
      window.alert('请先选中已经完成抠图的素材。');
      return { ok: false, count: 0 };
    }

    const rootDir = await window.fanDesktop.file.pickDirectory();
    if (!rootDir) {
      return { ok: false, count: 0, cancelled: true };
    }

    const response = await window.fanDesktop.matting.exportCutouts({
      rootDir,
      items: assets
        .filter((asset) => asset.cutoutPath)
        .map((asset) => ({
          sourcePath: asset.cutoutPath as string,
          fileName: buildCutoutFileName(asset.name, asset.cutoutPath)
        }))
    });

    if (!response.ok) {
      window.alert(response.error);
      return { ok: false, count: 0 };
    }

    const skipped = ('skipped' in response ? response.skipped : 0) || 0;
    if (skipped > 0) {
      window.alert(`已导出 ${response.count} 张已选抠图素材。${skipped} 张源文件已不存在，已跳过。`);
    } else {
      window.alert(`已导出 ${response.count} 张已选抠图素材。`);
    }
    return { ok: true, count: response.count };
  },

  async downloadProcessedCutouts() {
    const assets = getProcessedCutoutAssets();
    if (!assets.length) {
      window.alert('当前没有可下载的已抠图素材。');
      return { ok: false, count: 0 };
    }

    const rootDir = await window.fanDesktop.file.pickDirectory();
    if (!rootDir) {
      return { ok: false, count: 0, cancelled: true };
    }

    const response = await window.fanDesktop.matting.exportCutouts({
      rootDir,
      items: assets
        .filter((asset) => asset.cutoutPath)
        .map((asset) => ({
          sourcePath: asset.cutoutPath as string,
          fileName: buildCutoutFileName(asset.name, asset.cutoutPath)
        }))
    });

    if (!response.ok) {
      window.alert(response.error);
      return { ok: false, count: 0 };
    }

    const skipped = ('skipped' in response ? response.skipped : 0) || 0;
    if (skipped > 0) {
      window.alert(`已导出 ${response.count} 张抠图素材。${skipped} 张源文件已不存在，已跳过。`);
    } else {
      window.alert(`已导出 ${response.count} 张抠图素材。`);
    }
    return { ok: true, count: response.count };
  }
};
