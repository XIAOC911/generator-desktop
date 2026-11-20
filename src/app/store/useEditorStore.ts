import { useRef, useSyncExternalStore } from 'react';
import { editorStore } from './editorStore';
import type { AppState } from '@/core/models/project';

/** 浅比较两个值，用于 selector 结果判等 */
function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
  }
  return true;
}

/**
 * 订阅 editorStore。支持 selector + 浅比较，避免无关状态变更导致重渲染。
 *
 * @example
 * const assets = useEditorStore(s => s.sourceAssets, shallow);        // 仅 sourceAssets 变化时重渲染
 * const count = useEditorStore(s => s.sourceAssets.filter(a => a.selected).length); // 数量变化时重渲染
 * const all = useEditorStore();                                         // 全量订阅（旧行为）
 */
export function useEditorStore<T = AppState>(
  selector?: (state: AppState) => T,
  isEqual: (a: T, b: T) => boolean = shallowEqual
): T {
  const prevRef = useRef<{ snapshot: T } | null>(null);

  function getSnapshot(): T {
    const state = editorStore.getState();
    const next = selector ? selector(state) : (state as unknown as T);
    const prev = prevRef.current;
    if (prev && isEqual(prev.snapshot, next)) {
      return prev.snapshot; // 返回同一个引用 → Object.is 为 true → 不重渲染
    }
    prevRef.current = { snapshot: next };
    return next;
  }

  // 服务端快照（浏览器端不会调用，但占位确保类型正确）
  const ssrSnapshot = getSnapshot();

  return useSyncExternalStore(editorStore.subscribe, getSnapshot, () => ssrSnapshot);
}
