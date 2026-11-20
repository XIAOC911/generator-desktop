import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';

export function SourcePreviewPane() {
  const state = useEditorStore();
  const selectedCount = state.sourceAssets.filter((asset) => asset.selected).length;

  if (state.sourceAssets.length === 0) {
    return (
      <section className="preview-panel source-preview-pane">
        <div className="panel-header">
          <div className="panel-title">素材预览模式</div>
          <button className="button button-primary" onClick={() => editorStore.setSourcePreviewMode(false)}>
            返回画布
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">图</div>
          <div className="hint">暂无素材可预览</div>
        </div>
      </section>
    );
  }

  return (
    <section className="preview-panel source-preview-pane">
      <div className="panel-header">
        <div>
          <div className="panel-title">素材预览模式</div>
          <div className="hint" style={{ marginTop: 8 }}>
            共 {state.sourceAssets.length} 个素材，已选 {selectedCount} 个。点击卡片可选择，右上角可删除。
          </div>
        </div>
        <button className="button button-primary" onClick={() => editorStore.setSourcePreviewMode(false)}>
          返回画布
        </button>
      </div>

      <div className="source-preview-grid">
        {state.sourceAssets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className={`source-preview-card ${asset.selected ? 'source-preview-card-active' : ''}`}
            onClick={() => editorStore.toggleAssetSelection(asset.id)}
          >
            <img src={asset.previewUrl} alt={asset.name} className="source-preview-image" />
            <div className="source-preview-footer">
              <div className="source-preview-name" title={asset.name}>
                {asset.name}
              </div>
              <div className="source-preview-check">{asset.selected ? '已选' : '未选'}</div>
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 32,
                left: 4,
                right: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                background: 'rgba(0,0,0,0.6)',
                borderRadius: 4,
                padding: '2px 4px',
              }}
              onClick={(event) => event.stopPropagation()}
              title="拖入画布时的默认缩放比例（%），留空则自适应"
            >
              <input
                type="number"
                min={10}
                max={500}
                value={asset.defaultScale ?? ''}
                placeholder="自适应"
                onChange={(event) => {
                  const val = event.target.value;
                  editorStore.updateAsset(
                    asset.id,
                    { defaultScale: val ? Math.max(10, Math.min(500, Number(val) || 100)) : undefined },
                    { markDirty: false }
                  );
                }}
                style={{
                  width: '100%',
                  fontSize: 10,
                  padding: '2px 4px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>%</span>
            </div>
            <button
              type="button"
              className="source-preview-remove"
              onClick={(event) => {
                event.stopPropagation();
                editorStore.removeAsset(asset.id);
              }}
            >
              ×
            </button>
          </button>
        ))}
      </div>
    </section>
  );
}
