import { useState, useRef, useEffect } from 'react';
import { editorStore, type HistoryEntry } from '@/app/store/editorStore';
import { useEditorStore } from '@/app/store/useEditorStore';

export function HistoryPanel() {
  const state = useEditorStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const undoStack = editorStore.getHistory();
  const redoStack = editorStore.getRedoHistory();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Show most recent entries first (newest at top)
  const displayEntries: { entry: HistoryEntry; index: number; type: 'undo' }[] = [...undoStack]
    .reverse()
    .map((entry, i) => ({ entry, index: undoStack.length - 1 - i, type: 'undo' as const }));

  // Redo entries as future states (greyed out)
  const redoEntries: HistoryEntry[] = [...redoStack].reverse();

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
      <button
        title="撤销 Ctrl+Z"
        onClick={() => editorStore.undo()}
        disabled={!canUndo}
        style={{
          fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center',
          border: '1px solid var(--color-border)', borderRadius: 4,
          background: canUndo ? 'var(--color-bg-secondary)' : 'var(--color-bg-tertiary)',
          cursor: canUndo ? 'pointer' : 'default', opacity: canUndo ? 1 : 0.4,
        }}
      >↩</button>
      <button
        title="重做 Ctrl+Shift+Z"
        onClick={() => editorStore.redo()}
        disabled={!canRedo}
        style={{
          fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center',
          border: '1px solid var(--color-border)', borderRadius: 4,
          background: canRedo ? 'var(--color-bg-secondary)' : 'var(--color-bg-tertiary)',
          cursor: canRedo ? 'pointer' : 'default', opacity: canRedo ? 1 : 0.4,
        }}
      >↪</button>
      <button
        title="操作历史"
        onClick={() => setOpen(!open)}
        style={{
          fontSize: 11, padding: '0 8px', height: 24, lineHeight: '24px',
          border: '1px solid var(--color-border)', borderRadius: 4,
          background: open ? 'var(--color-accent-subtle)' : 'var(--color-bg-secondary)',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        历史 {undoStack.length > 0 ? `(${undoStack.length})` : ''}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          width: 280, maxHeight: 360, overflow: 'hidden',
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          zIndex: 100, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '4px 10px', fontSize: 10, fontWeight: 600,
            color: 'var(--color-text-tertiary)',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
          }}>
            操作历史 · {undoStack.length} 步
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {/* Redo (future) entries — greyed out */}
            {redoEntries.length > 0 && (
              <>
                <div style={{ padding: '2px 10px', fontSize: 9, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                  可重做的步骤
                </div>
                {redoEntries.map((entry, i) => (
                  <div key={`redo-${i}`} style={{
                    padding: '4px 10px', fontSize: 11, color: 'var(--color-text-tertiary)',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: 0.5, cursor: 'pointer',
                  }}
                    onClick={() => {
                      editorStore.redo();
                      setOpen(false);
                    }}
                  >
                    <span style={{ fontSize: 10 }}>↪</span>
                    <span style={{ flex: 1 }}>{entry.description}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--color-border)', margin: '2px 8px' }} />
              </>
            )}

            {/* Current position marker */}
            {displayEntries.length > 0 && (
              <div style={{
                padding: '2px 10px', fontSize: 9, color: 'var(--color-accent)', fontWeight: 600,
                background: 'var(--color-accent-subtle)',
              }}>
                ▼ 当前位置
              </div>
            )}

            {/* Undo history entries */}
            {displayEntries.length === 0 && redoEntries.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                暂无操作历史
              </div>
            ) : (
              displayEntries.map(({ entry, index }) => (
                <div key={`undo-${index}`} style={{
                  padding: '4px 10px', fontSize: 11, color: 'var(--color-text-primary)',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  cursor: 'pointer',
                  background: index === displayEntries.length - 1 ? 'var(--color-bg-secondary)' : 'transparent',
                }}
                  onClick={() => {
                    editorStore.jumpToHistory(index);
                    setOpen(false);
                  }}
                  title="点击恢复到该步骤"
                >
                  <span style={{
                    fontSize: 9, color: 'var(--color-text-tertiary)',
                    minWidth: 20, textAlign: 'center',
                  }}>
                    #{undoStack.length - index}
                  </span>
                  <span style={{ flex: 1 }}>{entry.description}</span>
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                    {entry.layers.length} 层
                  </span>
                </div>
              ))
            )}
          </div>
          {undoStack.length > 0 && (
            <div style={{
              padding: '4px 10px', fontSize: 9, color: 'var(--color-text-tertiary)',
              borderTop: '1px solid var(--color-border)',
              textAlign: 'center',
            }}>
              点击历史步骤即可跳转 · {undoStack.length}/{50} 步
            </div>
          )}
        </div>
      )}
    </div>
  );
}
