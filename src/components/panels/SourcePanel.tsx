import { useMemo, useState, memo } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import { assetService } from '@/services/asset.service';
import { mattingService } from '@/services/matting.service';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';
import { VirtualGrid } from '@/components/common/VirtualGrid';
import type { SourceAsset } from '@/core/models/asset';

interface SourcePanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** 单个素材缩略图卡片（memo 避免无关重渲染） */
const AssetThumb = memo(function AssetThumb({
  asset,
  canvasSize,
  thumbFit,
}: {
  asset: SourceAsset;
  canvasSize: number;
  thumbFit: 'cover' | 'contain';
}) {
  return (
    <div
      className={`thumb-item ${asset.selected ? 'thumb-item-active' : ''}`}
      style={{
        padding: 0,
        border: asset.selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
        lineHeight: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
      }}
      draggable
      role="button"
      tabIndex={0}
      onClick={() => editorStore.toggleAssetSelection(asset.id)}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', `asset:${asset.id}`);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => {
        editorStore.addLayer({
          id: Math.random().toString(36).slice(2, 10),
          type: 'image',
          x: canvasSize / 2,
          y: canvasSize / 2,
          scale: 180,
          rotation: 0,
          opacity: 100,
          filters: { ...DEFAULT_FILTERS },
          visible: true,
          sourceFileId: asset.id,
          sourceName: asset.name,
          previewUrl: asset.previewUrl,
          freeSourceLayer: true,
        });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          editorStore.toggleAssetSelection(asset.id);
        }
      }}
    >
      <img
        src={asset.previewUrl}
        alt={asset.name}
        style={{ width: '100%', height: '100%', objectFit: thumbFit, display: 'block' }}
      />
      <div className="thumb-name" style={{ fontSize: 9 }}>{asset.name}</div>
      <span
        className={`matting-badge matting-${asset.mattingStatus ?? 'idle'}`}
        style={{ position: 'absolute', top: 6, left: 6, zIndex: 4, fontSize: 9 }}
      >
        {asset.mattingStatus === 'pending'
          ? '抠图中'
          : asset.mattingStatus === 'success'
            ? '已抠图'
            : asset.mattingStatus === 'failed'
              ? '失败'
              : '原图'}
      </span>
      <div className="thumb-actions">
        <span className="thumb-check">{asset.selected ? '✓' : '○'}</span>
        <button
          className="thumb-delete"
          onClick={(event) => {
            event.stopPropagation();
            editorStore.removeAsset(asset.id);
          }}
        >
          ×
        </button>
      </div>
      <div className="thumb-mini-actions" style={{ position: 'absolute', bottom: 20, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4, zIndex: 2 }}>
        <button
          className="button button-sm"
          disabled={asset.mattingStatus === 'pending'}
          onClick={(event) => {
            event.stopPropagation();
            void mattingService.cutoutAsset(asset.id).then((result) => {
              if (result.ok && result.replacedRefs > 0) {
                window.alert(`已完成 ${asset.name} 的抠图，并自动替换画布中的 ${result.replacedRefs} 处同源引用。`);
              }
            });
          }}
        >
          {asset.cutoutPath ? '重抠' : '抠图'}
        </button>
        <button
          className="button button-sm"
          disabled={!asset.cutoutPath || asset.mattingStatus === 'pending'}
          onClick={(event) => {
            event.stopPropagation();
            const replacedRefs = mattingService.restoreAsset(asset.id);
            if (replacedRefs > 0) {
              window.alert(`已还原 ${asset.name}，并同步恢复画布中的 ${replacedRefs} 处同源引用。`);
            }
          }}
        >
          还原
        </button>
      </div>
      {asset.mattingError ? (
        <div className="matting-error-overlay" style={{ fontSize: 9 }}>{asset.mattingError}</div>
      ) : null}
    </div>
  );
});

export function SourcePanel({ compact, collapsed, onToggleCollapse }: SourcePanelProps) {
  // 精确订阅：仅 sourceAssets 变化时重渲染
  const sourceAssets = useEditorStore((s) => s.sourceAssets);
  const canvasSize = useEditorStore((s) => s.canvas.size);
  const sourcePreviewMode = useEditorStore((s) => s.sourcePreviewMode);
  const layers = useEditorStore((s) => s.layers);

  const [batchScale, setBatchScale] = useState(100);
  const [thumbFit, setThumbFit] = useState<'cover' | 'contain'>('cover');

  // memo 缓存 count，避免每次 render 遍历 500+ 数组
  const selectedCount = useMemo(
    () => sourceAssets.filter((a) => a.selected).length,
    [sourceAssets]
  );

  const applySourceBatchScale = (scale: number) => {
    const safeScale = Math.max(5, Math.min(1000, scale));
    const selectedIds = new Set(sourceAssets.filter((a) => a.selected).map((a) => a.id));
    if (selectedIds.size === 0) {
      window.alert('请先选择要调整的素材');
      return;
    }
    const prevScales = new Map(sourceAssets.filter((a) => selectedIds.has(a.id)).map((a) => [a.id, a.defaultScale ?? 100]));
    const updatedAssets = sourceAssets.map((asset) =>
      selectedIds.has(asset.id) ? { ...asset, defaultScale: safeScale } : asset
    );
    const updatedLayers = layers.map((layer) => {
      if (layer.type !== 'image' || !layer.freeSourceLayer || !selectedIds.has(layer.sourceFileId ?? '')) return layer;
      const prevScale = prevScales.get(layer.sourceFileId ?? '') ?? 100;
      const ratio = safeScale / Math.max(1, prevScale);
      return { ...layer, scale: Math.max(5, Math.min(1000, Math.round((layer.scale ?? 100) * ratio))) };
    });
    editorStore.patch({ sourceAssets: updatedAssets, layers: updatedLayers });
  };

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">🖼️</span>
          素材管理
        </div>
        <div className="panel-actions">
          {selectedCount > 0 && <span className="badge badge-blue">已选 {selectedCount}</span>}
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
        <button className="button button-primary" onClick={() => assetService.importImages()}>
          导入图片
        </button>
        <button
          className={`button ${sourcePreviewMode ? 'button-primary' : ''}`}
          onClick={() => editorStore.setSourcePreviewMode(!sourcePreviewMode)}
          disabled={sourceAssets.length === 0}
        >
          {sourcePreviewMode ? '返回画布' : '预览'}
        </button>
        <button
          className="button"
          onClick={() => editorStore.replaceAssets([])}
          disabled={sourceAssets.length === 0}
        >
          清空
        </button>
      </div>

      <div className="row-start" style={{ marginTop: 8, gap: 4, alignItems: 'center' }}>
        <span className="field-label" style={{ fontSize: 11, marginRight: 4 }}>缩略图:</span>
        <button className={`button button-sm ${thumbFit === 'cover' ? 'button-primary' : ''}`} onClick={() => setThumbFit('cover')} style={{ fontSize: 11, padding: '2px 10px' }}>裁切填充</button>
        <button className={`button button-sm ${thumbFit === 'contain' ? 'button-primary' : ''}`} onClick={() => setThumbFit('contain')} style={{ fontSize: 11, padding: '2px 10px' }}>完整显示</button>
      </div>

      <details style={{ margin: '10px 0' }}>
        <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>📐 批量缩放素材</summary>
        <div style={{ marginTop: 8, padding: 8, background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-md)' }}>
          <div className="range-group">
            <label className="field-label">缩放比例 {batchScale}%</label>
            <input type="range" min={5} max={500} value={batchScale} onChange={(e) => setBatchScale(Number(e.target.value))} />
          </div>
          <div className="row-start" style={{ marginTop: 6 }}>
            <input className="input" type="number" min={5} max={1000} value={batchScale} onChange={(e) => setBatchScale(Math.max(5, Math.min(1000, Number(e.target.value) || 100)))} style={{ width: 70, fontSize: 12 }} />
            <button className="button button-sm button-primary" onClick={() => applySourceBatchScale(batchScale)}>应用</button>
            <button className="button button-sm" onClick={() => { setBatchScale(100); applySourceBatchScale(100); }}>重置 100%</button>
          </div>
          <div className="hint" style={{ marginTop: 6, fontSize: 11 }}>
            {selectedCount > 0 ? `当前已选 ${selectedCount} 张素材，调整比例后会同步缩放画布中对应的图层。` : '请先勾选素材再调整批量缩放。'}
          </div>
        </div>
      </details>

      <div className="hint" style={{ marginTop: 12 }}>
        共 <strong>{sourceAssets.length}</strong> 个素材
        {selectedCount > 0 && `，已选中 ${selectedCount} 个`}
      </div>
      <div className="hint" style={{ marginTop: 4 }}>
        拖拽素材到 PSD 产品层下方的"素材图层"区域，即可完成绑定替换。
      </div>

      {sourceAssets.length > 0 && (
        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={selectedCount === sourceAssets.length && sourceAssets.length > 0}
            ref={(el) => {
              if (el) el.indeterminate = selectedCount > 0 && selectedCount < sourceAssets.length;
            }}
            onChange={() => {
              const allSelected = selectedCount === sourceAssets.length;
              editorStore.patch({ sourceAssets: sourceAssets.map((a) => ({ ...a, selected: !allSelected })) });
            }}
            style={{ cursor: 'pointer' }}
          />
          {selectedCount === sourceAssets.length ? '取消全选' : '全选'}
        </label>
      )}

      {sourceAssets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">图</div>
          <div className="hint">暂无素材，点击上方按钮导入</div>
        </div>
      ) : (
        <VirtualGrid
          items={sourceAssets}
          itemHeight={92}
          itemWidth={70}
          columns={5}
          gap={2}
          overscan={3}
          containerHeight={compact ? 280 : 420}
          renderItem={(asset) => <AssetThumb asset={asset} canvasSize={canvasSize} thumbFit={thumbFit} />}
        />
      )}
    </section>
  );
}
