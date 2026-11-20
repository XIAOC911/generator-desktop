import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import type { WatermarkPosition, WatermarkType } from '@/core/models/project';

interface WatermarkPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const POSITIONS: { key: WatermarkPosition; label: string; row: number; col: number }[] = [
  { key: 'top-left', label: '左上', row: 0, col: 0 },
  { key: 'top-center', label: '中上', row: 0, col: 1 },
  { key: 'top-right', label: '右上', row: 0, col: 2 },
  { key: 'center-left', label: '左中', row: 1, col: 0 },
  { key: 'center', label: '居中', row: 1, col: 1 },
  { key: 'center-right', label: '右中', row: 1, col: 2 },
  { key: 'bottom-left', label: '左下', row: 2, col: 0 },
  { key: 'bottom-center', label: '中下', row: 2, col: 1 },
  { key: 'bottom-right', label: '右下', row: 2, col: 2 },
];

export function WatermarkPanel({ compact, collapsed, onToggleCollapse }: WatermarkPanelProps) {
  const wm = useEditorStore((s) => s.watermark);

  const set = (patch: Partial<typeof wm>) => {
    const current = editorStore.getState().watermark;
    editorStore.patch({ watermark: { ...current, ...patch } }, { markDirty: false });
  };

  return (
    <section className={`panel-card ${compact ? 'compact-canvas-settings' : ''} ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">💧</span>
          水印设置
        </div>
        <button
          className="icon-button panel-collapse-toggle"
          type="button"
          onClick={onToggleCollapse}
        >
          {collapsed ? '▶' : '▼'}
        </button>
      </div>

      {/* 启用开关 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={wm.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>启用水印</span>
      </label>

      {!wm.enabled && <div className="hint" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>开启后在画布和导出中叠加水印</div>}

      {wm.enabled && (
        <>
          {/* 水印类型 */}
          <div className="panel-subtitle">水印类型</div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
            {([
              { key: 'text' as WatermarkType, label: '文字' },
              { key: 'image' as WatermarkType, label: '图片' },
            ]).map((tab) => (
              <button
                key={tab.key}
                className={`button button-sm ${wm.type === tab.key ? 'button-primary' : ''}`}
                style={{ fontSize: 11, padding: '3px 10px', flex: 1 }}
                onClick={() => set({ type: tab.key })}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 文字水印设置 */}
          {wm.type === 'text' && (
            <>
              <div style={{ marginBottom: 8 }}>
                <span className="field-label">水印文字</span>
                <input
                  className="input"
                  value={wm.text}
                  onChange={(e) => set({ text: e.target.value })}
                  placeholder="输入水印文字…"
                  style={{ width: '100%', fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <span className="field-label">字号</span>
                  <input
                    className="input"
                    type="number"
                    value={wm.fontSize}
                    onChange={(e) => set({ fontSize: Number(e.target.value) || 24 })}
                    min={12} max={120}
                    style={{ width: '100%', fontSize: 12 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span className="field-label">颜色</span>
                  <input
                    className="color-input"
                    type="color"
                    value={wm.fontColor}
                    onChange={(e) => set({ fontColor: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {/* 图片水印设置 */}
          {wm.type === 'image' && (
            <>
              <button
                className="button button-sm"
                style={{ marginBottom: 8, width: '100%' }}
                onClick={async () => {
                  const results = await window.fanDesktop.file.openImages();
                  if (results.length > 0) {
                    set({ imageDataUrl: results[0].previewUrl });
                  }
                }}
              >
                {wm.imageDataUrl ? '更换水印图片' : '📤 导入水印图片'}
              </button>
              {wm.imageDataUrl && (
                <div style={{ marginBottom: 8, textAlign: 'center' }}>
                  <img src={wm.imageDataUrl} alt="水印预览" style={{ maxHeight: 60, maxWidth: '100%', borderRadius: 4, border: '1px solid var(--color-border)' }} />
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <span className="field-label">图片大小: {wm.imageScale}%</span>
                <input
                  type="range" min={5} max={30}
                  value={wm.imageScale}
                  onChange={(e) => set({ imageScale: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          {/* 位置 — 九宫格 */}
          <div className="panel-subtitle">位置</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
            marginBottom: 8,
            maxWidth: 150,
          }}>
            {POSITIONS.map((pos) => (
              <button
                key={pos.key}
                className={`button button-xs ${wm.position === pos.key ? 'button-primary' : ''}`}
                style={{ fontSize: 10, padding: '2px 4px', aspectRatio: '1' }}
                onClick={() => set({ position: pos.key })}
                title={pos.label}
              >
                {pos.label}
              </button>
            ))}
          </div>

          {/* 偏移量 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <span className="field-label">X偏移</span>
              <input
                className="input" type="number"
                value={wm.offsetX}
                onChange={(e) => set({ offsetX: Number(e.target.value) || 0 })}
                style={{ width: '100%', fontSize: 11 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span className="field-label">Y偏移</span>
              <input
                className="input" type="number"
                value={wm.offsetY}
                onChange={(e) => set({ offsetY: Number(e.target.value) || 0 })}
                style={{ width: '100%', fontSize: 11 }}
              />
            </div>
          </div>

          {/* 透明度和旋转 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <span className="field-label">透明度: {wm.opacity}%</span>
              <input
                type="range" min={5} max={100}
                value={wm.opacity}
                onChange={(e) => set({ opacity: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span className="field-label">旋转: {wm.rotation}°</span>
              <input
                type="range" min={-45} max={45}
                value={wm.rotation}
                onChange={(e) => set({ rotation: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* 平铺模式 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer', fontSize: 12 }}>
            <input type="checkbox" checked={wm.tileMode} onChange={(e) => set({ tileMode: e.target.checked })} />
            平铺模式（整图重复水印）
          </label>
          {wm.tileMode && (
            <div style={{ marginBottom: 8 }}>
              <span className="field-label">平铺间距: {wm.tileSpacing}px</span>
              <input
                type="range" min={80} max={500}
                value={wm.tileSpacing}
                onChange={(e) => set({ tileSpacing: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
