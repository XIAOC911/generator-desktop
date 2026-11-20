import { useMemo, useState, useEffect } from 'react';
import { exportService, estimateBatchSummary, type BatchFolderMode, getExportProgress, subscribeExportProgress, cancelExport, resetExportProgress } from '@/services/export.service';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import { psdService } from '@/services/psd.service';

interface ExportPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ExportPanel({ compact, collapsed, onToggleCollapse }: ExportPanelProps) {
  const [prefix, setPrefix] = useState('输出');
  const [progress, setProgress] = useState(getExportProgress());
  const state = useEditorStore();
  const folderMode = useMemo<BatchFolderMode>(() => {
    if (state.folderMode === 'split') return 'split';
    return 'chunk';
  }, [state.folderMode]);
  const itemsPerFolder = state.itemsPerFolder;
  const summary = useMemo(
    () => estimateBatchSummary(state, { folderMode, itemsPerFolder }),
    [state, folderMode, itemsPerFolder]
  );

  useEffect(() => {
    return subscribeExportProgress(() => setProgress(getExportProgress()));
  }, []);

  const selectedSceneCarouselTemplate = state.sceneCarouselTemplates.find(
    (item) => item.id === state.selectedSceneCarouselTemplateId
  );

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">📤</span>
          导出设置
        </div>
        <button
          className="icon-button panel-collapse-toggle"
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? '展开' : '收起'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {/* 文件名 */}
      <div className="panel-subtitle">文件名</div>
      <div className="row-start" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="field-label">文件前缀</label>
          <input
            className="input"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            placeholder="输出"
            style={{ marginTop: 4 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">文件名后缀</label>
          <input
            className="input"
            value={state.exportNameSuffix}
            onChange={(event) =>
              editorStore.patchExportSettings({ exportNameSuffix: event.target.value })
            }
            placeholder="可选后缀"
            style={{ marginTop: 4 }}
          />
        </div>
      </div>
      <label className="check-row" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={state.useImageNamePrefix}
          onChange={(event) =>
            editorStore.patchExportSettings({ useImageNamePrefix: event.target.checked })
          }
        />
        <span>使用图片名作为文件名前缀</span>
      </label>

      {/* 导出参数 */}
      <div className="panel-subtitle">导出参数</div>
      <div className="field-row" style={{ marginTop: 8 }}>
        <label className="field-label">导出组数</label>
        <input
          className="input"
          type="number"
          min={1}
          max={999}
          value={state.singleBatch || 20}
          onChange={(event) =>
            editorStore.patchExportSettings({
              singleBatch: Math.max(1, Math.min(999, Number(event.target.value) || 1))
            })
          }
          style={{ width: 100 }}
        />
        <span className="hint" style={{ marginLeft: 8 }}>组不同产品组合</span>
      </div>

      <div className="field-row" style={{ marginTop: 8 }}>
        <label className="field-label">导出方式</label>
        <select
          className="input"
          value={selectedSceneCarouselTemplate ? (state.sceneCarouselExportMode === 'per-product' ? 'per-product' : 'chunk') : 'chunk'}
          onChange={(event) => {
            const val = event.target.value;
            if (val === 'per-product') {
              editorStore.patchExportSettings({
                sceneCarouselExportMode: 'per-product',
                folderMode: 'chunk'
              });
            } else {
              editorStore.patchExportSettings({
                sceneCarouselExportMode: 'combo',
                folderMode: 'chunk'
              });
            }
          }}
        >
          <option value="chunk">每 N 张一个文件夹</option>
          {selectedSceneCarouselTemplate && (
            <option value="per-product">每个产品独立文件夹</option>
          )}
        </select>
      </div>

      {state.sceneCarouselExportMode !== 'per-product' && (
        <div className="field-row" style={{ marginTop: 8 }}>
          <label className="field-label">每文件夹张数</label>
          <input
            className="input"
            type="number"
            min={1}
            value={itemsPerFolder}
            onChange={(event) =>
              editorStore.patchExportSettings({
                itemsPerFolder: Math.max(1, Number(event.target.value) || 1)
              })
            }
            style={{ width: 100 }}
          />
        </div>
      )}

      {/* 随机组合标题 */}
      <div className="panel-subtitle" style={{ marginTop: 12 }}>随机组合标题</div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={state.enableRandomComboTitle}
          onChange={(event) =>
            editorStore.patchExportSettings({ enableRandomComboTitle: event.target.checked })
          }
        />
        <span>启用随机组合标题</span>
      </label>
      {state.enableRandomComboTitle && (
        <div style={{ marginTop: 6, padding: 8, background: 'var(--color-bg-secondary)', borderRadius: 4 }}>
          <label className="check-row" style={{ marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={state.titleRequiredFirst}
              onChange={(e) => editorStore.patchExportSettings({ titleRequiredFirst: e.target.checked })}
            />
            <span style={{ fontSize: 11 }}>必含词放最前</span>
          </label>
          <label className="check-row" style={{ marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={state.titleIncludeImageName}
              onChange={(e) => editorStore.patchExportSettings({ titleIncludeImageName: e.target.checked })}
            />
            <span style={{ fontSize: 11 }}>包含图片名</span>
          </label>
          <div style={{ marginBottom: 4 }}>
            <label className="field-label" style={{ fontSize: 10 }}>必含词（逗号分隔）</label>
            <input
              className="input"
              value={state.titleRequiredText}
              onChange={(e) => editorStore.patchExportSettings({ titleRequiredText: e.target.value })}
              placeholder="如：爆款,热卖"
              style={{ marginTop: 2, fontSize: 11 }}
            />
          </div>
          <div>
            <label className="field-label" style={{ fontSize: 10 }}>随机词库（逗号分隔）</label>
            <input
              className="input"
              value={state.titleRandomPool}
              onChange={(e) => editorStore.patchExportSettings({ titleRandomPool: e.target.value })}
              placeholder="如：爆款,热卖,新品,限时"
              style={{ marginTop: 2, fontSize: 11 }}
            />
          </div>
        </div>
      )}

      {/* 导出操作 */}
      <div className="panel-subtitle">导出操作</div>

      <button className="button button-sm" style={{ width: '100%' }} onClick={() => exportService.exportCurrentPreview(prefix)}>
        导出当前画布（单张）
      </button>

      {selectedSceneCarouselTemplate && (
        <>
          <div className="hint hint-info" style={{ marginTop: 10 }}>
            当前模板: {selectedSceneCarouselTemplate.name} · {selectedSceneCarouselTemplate.entries.length} 场景 · {selectedSceneCarouselTemplate.slotCount ?? 0} 槽位
          </div>

          <button
            className="button button-primary"
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => exportService.exportSceneCarousel(prefix, { folderMode, itemsPerFolder })}
          >
            导出套版结果
          </button>
        </>
      )}

      {/* PSD 套版导出 — 画布上有占位层时显示 */}
      {state.layers.some((l) => l.type === 'image' && (l as any).isPlaceholder) && (
        <>
          <div className="hint hint-info" style={{ marginTop: 10 }}>
            PSD 套版模式 · 占位层将被选中素材替换
          </div>
          <button
            className="button button-primary"
            style={{ marginTop: 8, width: '100%' }}
            onClick={async () => {
              const selected = state.sourceAssets.filter((a) => a.selected);
              if (!selected.length) { window.alert('请先在素材区选中要套用的素材。'); return; }
              psdService.applyLayoutTemplate(selected.map((a) => a.id));
              await exportService.exportCurrentPreview(prefix);
            }}
          >
            PSD 批量套版导出
          </button>
        </>
      )}

      {!selectedSceneCarouselTemplate && !state.layers.some((l) => l.type === 'image' && (l as any).isPlaceholder) && (
        <button
          className="button"
          style={{ marginTop: 8, width: '100%' }}
          onClick={() => exportService.exportBatch(prefix, { folderMode, itemsPerFolder })}
        >
          批量导出（无套版模板）
        </button>
      )}

      {/* 导出进度条 */}
      {progress.status !== 'idle' && (
        <div style={{
          marginTop: 12, padding: 10,
          background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {progress.status === 'running' ? '导出中...' : progress.status === 'cancelling' ? '取消中...' : progress.status === 'cancelled' ? '已取消' : '已完成'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              {progress.total > 0 ? `${progress.completed}/${progress.total}` : progress.message}
            </span>
          </div>

          {/* 进度条 */}
          <div style={{
            width: '100%', height: 6,
            background: 'var(--color-bg-tertiary)', borderRadius: 3,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: progress.total > 0 ? `${Math.round((progress.completed / progress.total) * 100)}%` : '0%',
              background: progress.status === 'cancelled' || progress.status === 'cancelling'
                ? 'var(--color-text-tertiary)'
                : progress.status === 'done'
                  ? '#22c55e'
                  : 'var(--color-accent)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>

          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            {progress.message}
          </div>

          {/* Cancel button */}
          {(progress.status === 'running' || progress.status === 'cancelling') && (
            <button
              className="button button-sm"
              style={{ marginTop: 8, width: '100%', color: '#ef4444' }}
              onClick={cancelExport}
              disabled={progress.status === 'cancelling'}
            >
              {progress.status === 'cancelling' ? '取消中...' : '取消导出'}
            </button>
          )}

          {/* Dismiss button after done/cancelled */}
          {(progress.status === 'done' || progress.status === 'cancelled') && (
            <button
              className="button button-sm"
              style={{ marginTop: 8, width: '100%' }}
              onClick={resetExportProgress}
            >
              关闭
            </button>
          )}
        </div>
      )}

      {/* 预计结果 */}
      <div className="result-card" style={{ marginTop: 16 }}>
        <div className="result-row">
          <span className="result-label">预计图片数</span>
          <span className="result-value result-value-strong">
            {summary.totalCount}
          </span>
        </div>
        <div className="result-row">
          <span className="result-label">背景数</span>
          <span className="result-value">{summary.backgroundCount || 0}</span>
        </div>
      </div>
    </section>
  );
}
