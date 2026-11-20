import type { SourceAsset } from '@/core/models/project';

export function computeArrangementCount(_layoutId: string, sourceAssets: SourceAsset[], layoutSlots = 0) {
  if (!layoutSlots) return 0;
  return sourceAssets.length >= layoutSlots ? sourceAssets.length : 0;
}
