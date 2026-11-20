import { useState, useRef, useEffect, useCallback } from 'react';
import { CanvasStage } from '@/components/canvas/CanvasStage';
import { SourcePreviewPane } from '@/components/canvas/SourcePreviewPane';
import { CanvasSettingsPanel } from '@/components/panels/CanvasSettingsPanel';
import { LayoutPanel } from '@/components/panels/LayoutPanel';
import { LayerPanel } from '@/components/panels/LayerPanel';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { AiPanel } from '@/components/panels/AiPanel';
import { AiDetailPanel } from '@/components/panels/AiDetailPanel';
import { WatermarkPanel } from '@/components/panels/WatermarkPanel';
import { HistoryPanel } from '@/components/panels/HistoryPanel';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';

type RightTab = 'design' | 'ai' | 'ai-detail';

const MIN_CANVAS = 360;
const MIN_COL = 200;
const MIN_EXPORT = 200;

/** 分隔线拖拽手柄 */
function ResizeHandle({ onMouseDown, dragging }: { onMouseDown: (e: React.MouseEvent) => void; dragging: boolean }) {
  return (
    <div
      style={{
        width: 4, minWidth: 4, cursor: 'col-resize',
        background: dragging ? 'var(--color-accent)' : 'var(--color-border)',
        transition: dragging ? 'none' : 'background 0.15s',
        flexShrink: 0,
      }}
      onMouseDown={onMouseDown}
      title="拖拽调整宽度"
    />
  );
}

export function Workspace() {
  const state = useEditorStore();
  const mode = state.workspaceMode || 'design';
  const [rightTab, setRightTab] = useState<RightTab>(mode as RightTab);

  // 可拖拽面板宽度
  const [canvasWidth, setCanvasWidth] = useState(500);
  const [col1Width, setCol1Width] = useState(250);
  const [exportWidth, setExportWidth] = useState(300);

  // 拖拽状态
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const dragRef = useRef({ startX: 0, startW: 0 });

  const onHandleDown = useCallback((handle: string, currentW: number) => (e: React.MouseEvent) => {
    setDragHandle(handle);
    dragRef.current = { startX: e.clientX, startW: currentW };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragHandle) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - dragRef.current.startX;
      let newW = dragRef.current.startW + delta;
      switch (dragHandle) {
        case 'canvas': newW = Math.max(MIN_CANVAS, newW); setCanvasWidth(newW); break;
        case 'col1': newW = Math.max(MIN_COL, newW); setCol1Width(newW); break;
        case 'export': newW = Math.max(MIN_EXPORT, Math.min(newW, 500)); setExportWidth(newW); break;
      }
    };
    const onUp = () => setDragHandle(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragHandle]);

  const switchMode = (tab: RightTab) => {
    editorStore.patch({ workspaceMode: tab });
    setRightTab(tab);
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 顶栏：左侧图层工具栏 + 右侧面板 tab 切换 */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 12px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-primary)', gap: 8, flexShrink: 0,
      }}>
        {/* 左侧：图层操作工具栏（设计模式下可用） */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <HistoryPanel />
          <span style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 2px' }} />
          <button title="上移" onClick={() => editorStore.moveSelectedLayers(1)}
            style={{ fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-secondary)', cursor: 'pointer' }}>⬆</button>
          <button title="下移" onClick={() => editorStore.moveSelectedLayers(-1)}
            style={{ fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-secondary)', cursor: 'pointer' }}>⬇</button>
          <button title="置顶" onClick={() => editorStore.moveSelectedLayersToFront()}
            style={{ fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-secondary)', cursor: 'pointer' }}>⏫</button>
          <button title="置底" onClick={() => editorStore.moveSelectedLayersToBack()}
            style={{ fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-secondary)', cursor: 'pointer' }}>⏬</button>
          <span style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 4px' }} />
          <button title="隐藏/显示" onClick={() => editorStore.toggleSelectedLayersVisibility()}
            style={{ fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-secondary)', cursor: 'pointer' }}>👁</button>
          <button title="复制" onClick={() => editorStore.duplicateSelectedLayers()}
            style={{ fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-secondary)', cursor: 'pointer' }}>📋</button>
          <button title="删除" onClick={() => editorStore.removeSelectedLayers()}
            style={{ fontSize: 12, width: 24, height: 24, lineHeight: '24px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-secondary)', cursor: 'pointer', color: '#ef4444' }}>✕</button>
        </div>
      </header>

      {/* 内容区：画布 + 分隔线 + 右侧面板 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ============ 画布（可拖拽宽度） ============ */}
        <div style={{
          width: canvasWidth, minWidth: canvasWidth,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '8px 8px 16px',
          flexShrink: 0,
        }}>
          {state.sourcePreviewMode ? <SourcePreviewPane /> : <CanvasStage />}
        </div>

        {/* 分隔线：画布 ↔ 右侧面板 */}
        <ResizeHandle onMouseDown={onHandleDown('canvas', canvasWidth)} dragging={dragHandle === 'canvas'} />

        {/* ============ 右侧面板区域 ============ */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 右侧内部 tab 切换栏 */}
          <div style={{
            display: 'flex', gap: 1,
            padding: '4px 8px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-primary)',
            flexShrink: 0,
          }}>
            {([
              { id: 'design' as const, label: '设计', icon: '🎨' },
              { id: 'ai' as const, label: 'AI助手', icon: '🤖' },
              { id: 'ai-detail' as const, label: 'AI详情图', icon: '🪄' },
            ]).map((btn) => (
              <button
                key={btn.id}
                className={`button button-sm ${rightTab === btn.id ? 'button-primary' : ''}`}
                onClick={() => switchMode(btn.id)}
                style={{ fontSize: 12, padding: '4px 14px' }}
              >
                <span style={{ marginRight: 4 }}>{btn.icon}</span>
                {btn.label}
              </button>
            ))}
          </div>

          {/* 右侧面板内容 */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {rightTab === 'design' && (
              <DesignPanels
                col1Width={col1Width}
                exportWidth={exportWidth}
                onCol1Down={onHandleDown('col1', col1Width)}
                onExportDown={onHandleDown('export', exportWidth)}
                dragHandle={dragHandle}
              />
            )}
            {rightTab === 'ai' && (
              <div style={{ height: '100%', overflow: 'auto', padding: 12 }}>
                <AiPanel compact={false} collapsed={false} />
              </div>
            )}
            {rightTab === 'ai-detail' && (
              <div style={{ height: '100%', overflow: 'auto', padding: 12 }}>
                <AiDetailPanel compact={false} collapsed={false} />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** 设计模式右侧面板：画布设置 | 图层+排版 | 导出（三列可拖拽） */
function DesignPanels({
  col1Width, exportWidth,
  onCol1Down, onExportDown,
  dragHandle,
}: {
  col1Width: number;
  exportWidth: number;
  onCol1Down: (e: React.MouseEvent) => void;
  onExportDown: (e: React.MouseEvent) => void;
  dragHandle: string | null;
}) {
  const [collapsedMap, setCollapsedMap] = useState({
    layer: true,
    layout: true,
    export: true,
    watermark: true,
  });

  const togglePanel = (key: keyof typeof collapsedMap) => {
    setCollapsedMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 第1列：画布设置（可拖拽宽度） */}
      <div style={{
        width: col1Width, minWidth: col1Width,
        background: 'var(--color-bg-primary)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <CanvasSettingsPanel compact />
        <WatermarkPanel
          compact
          collapsed={collapsedMap.watermark}
          onToggleCollapse={() => togglePanel('watermark')}
        />
      </div>

      {/* 分隔线：画布设置 ↔ 图层+排版 */}
      <ResizeHandle onMouseDown={onCol1Down} dragging={dragHandle === 'col1'} />

      {/* 第2列：图层管理 + 排版方式（自动填充剩余空间） */}
      <div style={{
        flex: 1, minWidth: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <LayerPanel
            compact
            collapsed={collapsedMap.layer}
            onToggleCollapse={() => togglePanel('layer')}
          />
        </div>
        <div style={{
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          borderTop: '1px solid var(--color-border)',
        }}>
          <LayoutPanel
            compact
            collapsed={collapsedMap.layout}
            onToggleCollapse={() => togglePanel('layout')}
          />
        </div>
      </div>

      {/* 分隔线：图层 ↔ 导出 */}
      <ResizeHandle onMouseDown={onExportDown} dragging={dragHandle === 'export'} />

      {/* 第3列：导出（可拖拽宽度） */}
      <div style={{
        width: exportWidth, minWidth: exportWidth,
        background: 'var(--color-bg-primary)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <ExportPanel
          compact
          collapsed={collapsedMap.export}
          onToggleCollapse={() => togglePanel('export')}
        />
      </div>
    </div>
  );
}
