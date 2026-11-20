import { useMemo, useRef, useState } from 'react';
import { editorStore } from '@/app/store/editorStore';
import { useEditorStore } from '@/app/store/useEditorStore';
import { assetService } from '@/services/asset.service';
import { psdService } from '@/services/psd.service';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';
import type { ImageLayer, TextLayer } from '@/core/models/layer';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createTextLayer(): TextLayer {
  return {
    id: uid(),
    type: 'text',
    text: '请输入文案',
    x: 540,
    y: 540,
    scale: 88,
    rotation: 0,
    opacity: 100,
    filters: { ...DEFAULT_FILTERS },
    visible: true,
    color: '#111827',
    fontFamily: 'Microsoft YaHei',
    fontSize: 48,
    textAlign: 'center',
    bold: true,
    stroke: false,
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.35)',
    strokeColor: '#ffffff',
    shadowBlur: 10
  };
}

interface LayerPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function LayerPanel({ compact, collapsed, onToggleCollapse }: LayerPanelProps) {
  const state = useEditorStore();
  const activeLayer = useMemo(
    () => state.layers.find((layer) => layer.id === state.activeLayerId),
    [state.layers, state.activeLayerId]
  );
  const selectedCount = state.selectedLayerIds.length;

  // Drag-to-reorder state
  const dragLayerIdRef = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  // 显示用图层列表：顶部 = 最上层（数组反序）
  const displayLayers = useMemo(() => [...state.layers].reverse(), [state.layers]);

  const handleDragStart = (layerId: string) => {
    dragLayerIdRef.current = layerId;
  };

  const handleDragOver = (targetLayerId: string, event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!dragLayerIdRef.current || dragLayerIdRef.current === targetLayerId) return;

    // 根据鼠标在元素中的位置判断插到目标前还是后
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = event.clientY < midY ? 'before' : 'after';
    setDropTargetId(targetLayerId);
    setDropPosition(pos);
  };

  const handleDrop = (targetLayerId: string, event: React.DragEvent) => {
    event.preventDefault();
    const draggedId = dragLayerIdRef.current;
    if (!draggedId || draggedId === targetLayerId) {
      clearDragState();
      return;
    }

    // 直接在显示层列表中操作：移除拖拽层 → 插入目标位置 → 反转回数组顺序
    const displayLayersCopy = [...state.layers].reverse();
    const fromDisplayIdx = displayLayersCopy.findIndex((l) => l.id === draggedId);
    const targetDisplayIdx = displayLayersCopy.findIndex((l) => l.id === targetLayerId);
    if (fromDisplayIdx < 0 || targetDisplayIdx < 0) { clearDragState(); return; }

    const [item] = displayLayersCopy.splice(fromDisplayIdx, 1);
    let insertAt = dropPosition === 'before' ? targetDisplayIdx : targetDisplayIdx + 1;
    if (insertAt > fromDisplayIdx) insertAt = Math.max(0, insertAt - 1);
    displayLayersCopy.splice(Math.max(0, Math.min(displayLayersCopy.length, insertAt)), 0, item);

    // 反转回数组顺序（底层→顶层）
    editorStore.patch({ layers: displayLayersCopy.reverse() });
    clearDragState();
  };

  const clearDragState = () => {
    dragLayerIdRef.current = null;
    setDropTargetId(null);
    setDropPosition(null);
  };

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">📑</span>
          图层管理
        </div>
        <div className="panel-actions">
          <span className="badge badge-gray">
            {state.layers.length} 个图层{selectedCount > 1 ? ` · 已选 ${selectedCount}` : ''}
          </span>
          <button
            className="icon-button panel-collapse-toggle"
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? '展开' : '收起'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      <div className="row-start">
        <button className="button button-primary" onClick={() => editorStore.addLayer(createTextLayer())}>
          ➕ 文字图层
        </button>
        <button className="button" onClick={() => assetService.importStickerLayer()}>
          🎭 贴纸
        </button>
        {activeLayer?.type === 'image' && (
          <button
            className={`button ${(activeLayer as ImageLayer).freeSourceLayer ? 'button-primary' : ''}`}
            onClick={() =>
              editorStore.updateLayer(activeLayer.id, {
                freeSourceLayer: !(activeLayer as ImageLayer).freeSourceLayer,
                sourceName: !(activeLayer as ImageLayer).freeSourceLayer
                  ? ((activeLayer as ImageLayer).sourceName || '素材图层')
                  : (activeLayer as ImageLayer).sourceName
              } as Partial<ImageLayer>)
            }
            title="选中图片层后，点击这里把它设为批量导出时要替换的素材槽位"
          >
            {(activeLayer as ImageLayer).freeSourceLayer ? '取消素材槽位' : '设为素材槽位'}
          </button>
        )}
      </div>

      {/* ===== 图层列表面板 ===== */}
      {state.layers.length > 0 && (
        <div style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '4px 8px', background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            图层列表（拖动排序）
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {displayLayers.map((layer) => {
              const isActive = layer.id === state.activeLayerId;
              const isSelected = state.selectedLayerIds.includes(layer.id);
              const isDropTarget = dropTargetId === layer.id;
              const showBefore = isDropTarget && dropPosition === 'before';
              const showAfter = isDropTarget && dropPosition === 'after';

              return (
                <div key={layer.id}>
                  {/* 插在前面的指示线 */}
                  {showBefore && (
                    <div style={{ height: 2, background: 'var(--color-accent)', margin: '0 8px', borderRadius: 1 }} />
                  )}
                  <div
                    className={`layer-item ${isActive ? 'layer-item-active' : ''}`}
                    draggable
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 8px',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      borderRadius: 0,
                      background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                      cursor: 'pointer',
                      opacity: layer.visible !== false ? 1 : 0.45,
                      transition: 'all 0.1s',
                    }}
                    onClick={(clickEvent) => {
                      if (clickEvent.ctrlKey || clickEvent.metaKey) {
                        editorStore.toggleLayerSelection(layer.id);
                        editorStore.setActiveLayerId(layer.id);
                      } else {
                        editorStore.setActiveLayerId(layer.id);
                      }
                    }}
                    onDragStart={() => handleDragStart(layer.id)}
                    onDragOver={(e) => handleDragOver(layer.id, e)}
                    onDrop={(e) => handleDrop(layer.id, e)}
                    onDragEnd={clearDragState}
                  >
                    {/* 拖动手柄 */}
                    <span
                      style={{
                        cursor: 'grab',
                        color: 'var(--color-text-tertiary)',
                        fontSize: 13,
                        padding: '2px 0',
                        userSelect: 'none',
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                      title="拖动排序"
                    >
                      ⋮⋮
                    </span>

                    {/* 图层类型图标 */}
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--color-bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {layer.type === 'text' ? (
                        'T'
                      ) : 'previewUrl' in layer && layer.previewUrl ? (
                        <img
                          src={layer.previewUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        '🖼'
                      )}
                    </span>

                    {/* 图层名称 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? 600 : 400,
                          color: 'var(--color-text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {layer.type === 'text'
                          ? (layer as TextLayer).text || '文字'
                          : 'sourceName' in layer && layer.sourceName
                            ? layer.sourceName
                            : layer.type === 'image'
                              ? '图片'
                              : '图层'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                        {layer.type === 'image' && (layer as ImageLayer).freeSourceLayer && <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>素材槽位 · </span>}
                        {layer.type === 'text' ? '文字' : '图片'}
                        {isSelected && ' · 已选'}
                      </div>
                    </div>

                    {/* 锁定切换 */}
                    <button
                      style={{
                        width: 26,
                        height: 26,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        background: layer.locked ? 'var(--color-accent-subtle)' : 'transparent',
                        color: layer.locked ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        fontSize: 12,
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        flexShrink: 0,
                        transition: 'all 0.15s',
                        fontWeight: layer.locked ? 700 : 400,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        editorStore.updateLayer(layer.id, { locked: !layer.locked });
                      }}
                      title={layer.locked ? '解锁图层' : '锁定图层（锁定后不可拖拽编辑）'}
                    >
                      {layer.locked ? '🔒' : '🔓'}
                    </button>

                    {/* 可见性切换 */}
                    <button
                      style={{
                        width: 26,
                        height: 26,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--color-text-secondary)',
                        fontSize: 13,
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        flexShrink: 0,
                        transition: 'all 0.15s',
                        opacity: layer.visible !== false ? 1 : 0.35,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        editorStore.updateLayer(layer.id, { visible: !(layer.visible ?? true) });
                      }}
                      title={layer.visible !== false ? '隐藏图层' : '显示图层'}
                    >
                      {layer.visible !== false ? '👁' : '🚫'}
                    </button>
                  </div>
                  {/* 插在后面的指示线 */}
                  {showAfter && (
                    <div style={{ height: 2, background: 'var(--color-accent)', margin: '0 8px', borderRadius: 1 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 多选批量操作 */}
      {selectedCount > 1 ? (
        <div className="layer-editor">
          <div className="panel-subtitle">已选 {selectedCount} 个图层</div>
          <div className="row-start" style={{ marginTop: 8, gap: 4, flexWrap: 'wrap' }}>
            <button className="button" onClick={() => editorStore.moveSelectedLayers(1)} title="上移图层">
              ⬆ 上移
            </button>
            <button className="button" onClick={() => editorStore.moveSelectedLayers(-1)} title="下移图层">
              ⬇ 下移
            </button>
            <button className="button" onClick={() => editorStore.toggleSelectedLayersVisibility()} title="切换显示/隐藏">
              👁 隐藏
            </button>
            <button
              className="button"
              onClick={() => editorStore.removeSelectedLayers()}
              title="删除选中图层"
              style={{ color: '#ef4444' }}
            >
              ✕ 删除
            </button>
          </div>
        </div>
      ) : activeLayer && activeLayer.type === 'text' ? (
        <div className="layer-editor">
          <div className="panel-subtitle">文字样式</div>
          <div className="field-stack">
            <label className="field-label">文本内容</label>
            <input
              className="input"
              type="text"
              value={activeLayer.text}
              onChange={(event) => editorStore.updateLayer(activeLayer.id, { text: event.target.value })}
            />
          </div>

          <div className="field-row">
            <div className="field-grow">
              <label className="field-label">字体</label>
              <select
                className="input"
                value={activeLayer.fontFamily}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { fontFamily: event.target.value })}
              >
                <option value="Microsoft YaHei">微软雅黑</option>
                <option value="SimHei">黑体</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
              </select>
            </div>
            <div>
              <label className="field-label">颜色</label>
              <input
                className="color-input"
                type="color"
                value={activeLayer.color}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { color: event.target.value })}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field-grow">
              <label className="field-label">字号</label>
              <input
                className="input"
                type="number"
                min={8}
                max={300}
                value={activeLayer.fontSize}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { fontSize: Math.max(8, Math.min(300, Number(event.target.value) || 48)) })}
                style={{ width: 72 }}
              />
            </div>
            <div className="field-grow">
              <label className="field-label">对齐</label>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    className={`button button-xs ${(activeLayer.textAlign || 'center') === align ? 'button-primary' : ''}`}
                    onClick={() => editorStore.updateLayer(activeLayer.id, { textAlign: align })}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    {{ left: '左', center: '中', right: '右' }[align]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="row-start" style={{ marginTop: 8 }}>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!activeLayer.bold}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { bold: event.target.checked })}
              />
              <span>粗体</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!activeLayer.stroke}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { stroke: event.target.checked })}
              />
              <span>描边</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!activeLayer.shadow}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { shadow: event.target.checked })}
              />
              <span>阴影</span>
            </label>
          </div>

          <div className="field-row">
            <div className="field-grow">
              <label className="field-label">描边色</label>
              <input
                className="color-input"
                type="color"
                value={activeLayer.strokeColor || '#ffffff'}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { strokeColor: event.target.value })}
              />
            </div>
            <div className="field-grow">
              <label className="field-label">阴影色</label>
              <input
                className="color-input"
                type="color"
                value={activeLayer.shadowColor?.startsWith('#') ? activeLayer.shadowColor : '#000000'}
                onChange={(event) => editorStore.updateLayer(activeLayer.id, { shadowColor: event.target.value })}
              />
            </div>
          </div>
        </div>
      ) : activeLayer && (
        <div className="layer-editor">
          <div className="panel-subtitle">图片滤镜</div>
          {(activeLayer as ImageLayer).psdLayerId && (
            <>
              <div className="panel-subtitle">PSD 占位层</div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                <label className="check-row" style={{ alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={!!(activeLayer as ImageLayer).isPlaceholder}
                    onChange={() => psdService.toggleLayerPlaceholder(activeLayer.id)}
                  />
                  <span>
                    标记为占位层（批量套模板时被素材替换）
                    <div className="hint" style={{ fontSize: 10, marginTop: 2 }}>
                      勾选后，该图层会在批量套模板时被素材图替换。未勾选的 PSD 图层保持原位不变。
                    </div>
                  </span>
                </label>
                <div className="hint hint-info" style={{ fontSize: 10 }}>
                  来源 PSD：{(activeLayer as ImageLayer).sourceName}
                </div>
              </div>
            </>
          )}
          <div className="range-group">
            <label className="field-label">亮度 {Math.round(activeLayer.filters.brightness)}%</label>
            <input
              type="range"
              min={0}
              max={200}
              value={activeLayer.filters.brightness}
              onChange={(event) =>
                editorStore.updateLayer(activeLayer.id, {
                  filters: { ...activeLayer.filters, brightness: Number(event.target.value) }
                })
              }
            />
          </div>
          <div className="range-group">
            <label className="field-label">对比度 {Math.round(activeLayer.filters.contrast)}%</label>
            <input
              type="range"
              min={0}
              max={200}
              value={activeLayer.filters.contrast}
              onChange={(event) =>
                editorStore.updateLayer(activeLayer.id, {
                  filters: { ...activeLayer.filters, contrast: Number(event.target.value) }
                })
              }
            />
          </div>
          <div className="range-group">
            <label className="field-label">饱和度 {Math.round(activeLayer.filters.saturate)}%</label>
            <input
              type="range"
              min={0}
              max={200}
              value={activeLayer.filters.saturate}
              onChange={(event) =>
                editorStore.updateLayer(activeLayer.id, {
                  filters: { ...activeLayer.filters, saturate: Number(event.target.value) }
                })
              }
            />
          </div>
          <div className="range-group">
            <label className="field-label">色相 {Math.round(activeLayer.filters.hue)}°</label>
            <input
              type="range"
              min={0}
              max={360}
              value={activeLayer.filters.hue}
              onChange={(event) =>
                editorStore.updateLayer(activeLayer.id, {
                  filters: { ...activeLayer.filters, hue: Number(event.target.value) }
                })
              }
            />
          </div>
          <div className="range-group">
            <label className="field-label">透明度 {Math.round(activeLayer.opacity)}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={activeLayer.opacity}
              onChange={(event) => editorStore.updateLayer(activeLayer.id, { opacity: Number(event.target.value) })}
            />
          </div>
        </div>
      )}
    </section>
  );
}
