import type { SourceAsset } from '@/core/models/project';

function combinationNumber(n: number, k: number) {
  if (k < 0 || n < 0) return 0;
  if (k === 0) return 1;
  if (n < k) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

function countWithRepeat(n: number, k: number) {
  return combinationNumber(n + k - 1, k);
}

export function computeArrangementCount(
  layoutId: string,
  sourceAssets: SourceAsset[],
  mode: 'random' | 'scene' = 'random',
  repeatMode: 'unique' | 'repeat' = 'unique',
  randomCount = 1,
  options: { layoutSlots?: number; sceneSlots?: number } = {}
) {
  const selected = sourceAssets.filter((asset) => asset.selected);
  const n = selected.length;
  const slots =
    mode === 'scene'
      ? Math.max(1, options.sceneSlots || 0)
      : Math.max(1, options.layoutSlots || 0);
  if (!slots && mode !== 'random') return 0;

  if (mode === 'random') {
    const count = Math.max(1, randomCount || 1);
    return repeatMode === 'repeat' ? countWithRepeat(n, count) : combinationNumber(n, count);
  }

  return repeatMode === 'repeat' ? countWithRepeat(n, slots) : combinationNumber(n, slots);
}

export function updateQueue(
  layoutId: string,
  sourceAssets: SourceAsset[],
  mode: 'random' | 'scene' = 'random',
  repeatMode: 'unique' | 'repeat' = 'unique',
  maxCombinations = 120,
  options: {
    randomCount?: number;
    layoutSlots?: number;
    sceneSlots?: number;
  } = {}
) {
  const selected = sourceAssets.filter((asset) => asset.selected);
  const n = selected.length;

  if (mode === 'random') {
    const count = Math.max(1, options.randomCount || 1);
    if (n < count && repeatMode !== 'repeat') return [] as SourceAsset[][];

    const result: SourceAsset[][] = [];
    const combineRandom = (start: number, current: SourceAsset[]) => {
      if (result.length >= maxCombinations) return;
      if (current.length === count) {
        result.push([...current]);
        return;
      }

      for (let index = start; index < n; index += 1) {
        current.push(selected[index]);
        combineRandom(repeatMode === 'repeat' ? index : index + 1, current);
        current.pop();
        if (result.length >= maxCombinations) return;
      }
    };

    combineRandom(0, []);
    return result;
  }

  const slots =
    mode === 'scene'
      ? Math.max(1, options.sceneSlots || 0)
      : Math.max(1, options.layoutSlots || 0);
  if (!slots) return [] as SourceAsset[][];

  if (n < slots && repeatMode !== 'repeat') return [] as SourceAsset[][];

  const result: SourceAsset[][] = [];

  const combine = (start: number, current: SourceAsset[]) => {
    if (result.length >= maxCombinations) return;
    if (current.length === slots) {
      result.push([...current]);
      return;
    }

    for (let index = start; index < n; index += 1) {
      current.push(selected[index]);
      combine(repeatMode === 'repeat' ? index : index + 1, current);
      current.pop();
      if (result.length >= maxCombinations) return;
    }
  };

  combine(0, []);
  return result;
}
