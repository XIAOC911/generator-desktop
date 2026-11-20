import { useMemo } from 'react';
import { editorStore } from '@/app/store/editorStore';
import { useEditorStore } from '@/app/store/useEditorStore';
import type { TextLayer } from '@/core/models/layer';

export function LayerPropertyBar() {
  const state = useEditorStore();

  const activeLayer = useMemo(
    () => state.layers.find((layer) => layer.id === state.activeLayerId),
    [state.layers, state.activeLayerId]
  );

  if (!activeLayer) {
    return (
      <div
        className="layer-property-bar"
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: '10px 12px',
          minHeight: 42,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 12,
          background: 'var(--color-bg-secondary)',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
        }}
      >
        选择图层以编辑属性
      </div>
    );
  }

  return (
    <div
      className="layer-property-bar"
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '10px 12px',
        background: 'var(--color-bg-secondary)',
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
      }}
    >
      {/* ===== 位置 & 变换 ===== */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 65, flexShrink: 0 }}>
          <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>X</label>
          <input
            className="input"
            type="number"
            style={{ padding: '4px 6px', fontSize: 13, height: 30 }}
            value={Math.round(activeLayer.x)}
            onChange={(e) => editorStore.updateLayer(activeLayer.id, { x: Number(e.target.value) || 0 })}
          />
        </div>
        <div style={{ width: 65, flexShrink: 0 }}>
          <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>Y</label>
          <input
            className="input"
            type="number"
            style={{ padding: '4px 6px', fontSize: 13, height: 30 }}
            value={Math.round(activeLayer.y)}
            onChange={(e) => editorStore.updateLayer(activeLayer.id, { y: Number(e.target.value) || 0 })}
          />
        </div>
        <div style={{ width: 72, flexShrink: 0 }}>
          <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>大小</label>
          <input
            className="input"
            type="number"
            style={{ padding: '4px 6px', fontSize: 13, height: 30 }}
            value={Math.round(activeLayer.scale)}
            onChange={(e) => editorStore.updateLayer(activeLayer.id, { scale: Number(e.target.value) || 100 })}
          />
        </div>
        <div style={{ width: 65, flexShrink: 0 }}>
          <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>旋转</label>
          <input
            className="input"
            type="number"
            style={{ padding: '4px 6px', fontSize: 13, height: 30 }}
            value={Math.round(activeLayer.rotation)}
            onChange={(e) => editorStore.updateLayer(activeLayer.id, { rotation: Number(e.target.value) || 0 })}
          />
        </div>
        <div style={{ width: 65, flexShrink: 0 }}>
          <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>透明</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            style={{ padding: '4px 6px', fontSize: 13, height: 30 }}
            value={Math.round(activeLayer.opacity)}
            onChange={(e) =>
              editorStore.updateLayer(activeLayer.id, {
                opacity: Math.max(0, Math.min(100, Number(e.target.value)))
              })
            }
          />
        </div>
      </div>

      {/* ===== 分隔线 ===== */}
      <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0' }} />

      {/* ===== 文本内容 / 滤镜 ===== */}
      {activeLayer.type === 'text' ? (
        <>
          {/* 文本内容 */}
          <div className="field-stack" style={{ gap: 2, marginBottom: 8 }}>
            <label className="field-label" style={{ fontSize: 11 }}>文本内容</label>
            <input
              className="input"
              type="text"
              style={{ padding: '6px 8px', fontSize: 13, height: 32 }}
              value={(activeLayer as TextLayer).text}
              onChange={(e) => editorStore.updateLayer(activeLayer.id, { text: e.target.value })}
            />
          </div>

          {/* 字体样式 */}
          <div className="field-row" style={{ marginTop: 0, gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>字体</label>
              <select
                className="input"
                style={{ padding: '4px 6px', fontSize: 13, height: 30 }}
                value={activeLayer.fontFamily}
                onChange={(e) => editorStore.updateLayer(activeLayer.id, { fontFamily: e.target.value })}
              >
                <option value="Microsoft YaHei">微软雅黑</option>
                <option value="SimHei">黑体</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
              </select>
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>颜色</label>
              <input
                className="color-input"
                type="color"
                style={{ width: 40, height: 30, padding: 2 }}
                value={activeLayer.color}
                onChange={(e) => editorStore.updateLayer(activeLayer.id, { color: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', paddingBottom: 2 }}>
              <label className="check-row" style={{ padding: '2px 6px', gap: 4 }}>
                <input type="checkbox" style={{ width: 14, height: 14, margin: 0 }}
                  checked={!!activeLayer.bold}
                  onChange={(e) => editorStore.updateLayer(activeLayer.id, { bold: e.target.checked })}
                />
                <span style={{ fontSize: 12 }}>粗体</span>
              </label>
              <label className="check-row" style={{ padding: '2px 6px', gap: 4 }}>
                <input type="checkbox" style={{ width: 14, height: 14, margin: 0 }}
                  checked={!!activeLayer.stroke}
                  onChange={(e) => editorStore.updateLayer(activeLayer.id, { stroke: e.target.checked })}
                />
                <span style={{ fontSize: 12 }}>描边</span>
              </label>
              <label className="check-row" style={{ padding: '2px 6px', gap: 4 }}>
                <input type="checkbox" style={{ width: 14, height: 14, margin: 0 }}
                  checked={!!activeLayer.shadow}
                  onChange={(e) => editorStore.updateLayer(activeLayer.id, { shadow: e.target.checked })}
                />
                <span style={{ fontSize: 12 }}>阴影</span>
              </label>
            </div>
          </div>

          {/* 描边色/阴影色 — 仅在启用时显示 */}
          {(activeLayer.stroke || activeLayer.shadow) && (
            <div className="field-row" style={{ marginTop: 6, gap: 8 }}>
              {activeLayer.stroke && (
                <div>
                  <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>描边色</label>
                  <input className="color-input" type="color" style={{ width: 40, height: 30, padding: 2 }}
                    value={activeLayer.strokeColor || '#ffffff'}
                    onChange={(e) => editorStore.updateLayer(activeLayer.id, { strokeColor: e.target.value })}
                  />
                </div>
              )}
              {activeLayer.shadow && (
                <div>
                  <label className="field-label" style={{ fontSize: 11, marginBottom: 2, display: 'block' }}>阴影色</label>
                  <input className="color-input" type="color" style={{ width: 40, height: 30, padding: 2 }}
                    value={activeLayer.shadowColor?.startsWith('#') ? activeLayer.shadowColor : '#000000'}
                    onChange={(e) => editorStore.updateLayer(activeLayer.id, { shadowColor: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="range-group" style={{ flex: 1, minWidth: 0 }}>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 2 }}>
                亮度 {Math.round(activeLayer.filters.brightness)}%
              </label>
              <input
                type="range"
                min={0}
                max={200}
                style={{ height: 5 }}
                value={activeLayer.filters.brightness}
                onChange={(e) =>
                  editorStore.updateLayer(activeLayer.id, {
                    filters: { ...activeLayer.filters, brightness: Number(e.target.value) }
                  })
                }
              />
            </div>
            <div className="range-group" style={{ flex: 1, minWidth: 0 }}>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 2 }}>
                对比度 {Math.round(activeLayer.filters.contrast)}%
              </label>
              <input
                type="range"
                min={0}
                max={200}
                style={{ height: 5 }}
                value={activeLayer.filters.contrast}
                onChange={(e) =>
                  editorStore.updateLayer(activeLayer.id, {
                    filters: { ...activeLayer.filters, contrast: Number(e.target.value) }
                  })
                }
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <div className="range-group" style={{ flex: 1, minWidth: 0 }}>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 2 }}>
                饱和度 {Math.round(activeLayer.filters.saturate)}%
              </label>
              <input
                type="range"
                min={0}
                max={200}
                style={{ height: 5 }}
                value={activeLayer.filters.saturate}
                onChange={(e) =>
                  editorStore.updateLayer(activeLayer.id, {
                    filters: { ...activeLayer.filters, saturate: Number(e.target.value) }
                  })
                }
              />
            </div>
            <div className="range-group" style={{ flex: 1, minWidth: 0 }}>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 2 }}>
                色相 {Math.round(activeLayer.filters.hue)}°
              </label>
              <input
                type="range"
                min={0}
                max={360}
                style={{ height: 5 }}
                value={activeLayer.filters.hue}
                onChange={(e) =>
                  editorStore.updateLayer(activeLayer.id, {
                    filters: { ...activeLayer.filters, hue: Number(e.target.value) }
                  })
                }
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
