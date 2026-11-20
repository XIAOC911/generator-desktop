import { useEffect, useRef, useState } from 'react';
import { editorStore } from '@/app/store/editorStore';
import { useEditorStore } from '@/app/store/useEditorStore';
import { sceneCarouselTemplateService } from '@/services/scene-carousel-template.service';
import { buildRandomFreeLayers, remapFreeLayers, normalizeFreeLayerScales, type GridLayoutConfig } from '@/core/engines/free-layout-engine';
import { updateQueue } from '@/core/engines/queue-engine';

interface LayoutPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function LayoutPanel({ compact, collapsed, onToggleCollapse }: LayoutPanelProps) {
  const state = useEditorStore();
  const [showSceneEntries, setShowSceneEntries] = useState(false);
  const selectedAssets = state.sourceAssets.filter((asset) => asset.selected);
  const selectedSceneCarouselTemplate = state.sceneCarouselTemplates.find(
    (item) => item.id === state.selectedSceneCarouselTemplateId
  );
  const sameProductCount = Math.max(1, state.sameProductCount || 1);
  const previewLayerCount = Math.max(1, state.randomCount || 1) * sameProductCount;
  const orderedDraftEntries = [...state.sceneCarouselDraftEntries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const modeGuide =
    state.mode === 'random'
      ? '自由排版：调整随机款数和同款数量自动排版。每换一个背景摆好后点"保存当前场景"收集草稿，最后点"保存为组合版式"打包成套版模板。'
      : '';

  const queue = updateQueue(state.layoutId, selectedAssets, state.mode, state.repeatMode, 120, {
    randomCount: state.randomCount,
    layoutSlots: 0,
    sceneSlots: 0
  });

  const families = state.preferredLayoutFamilies.length > 0 ? state.preferredLayoutFamilies : ['center'];
  const activeFamily = (families[0] || 'center') as 'triangle' | 'sides' | 'vertical' | 'center' | 'grid';
  const gridConfig: GridLayoutConfig = {
    columns: state.gridColumns || 3,
    rows: state.gridRows || 2,
    spacing: state.gridSpacing || 20,
    alignX: state.gridAlignX || 'center',
    alignY: state.gridAlignY || 'center',
  };

  const toggleFamily = (family: string) => {
    const next = state.preferredLayoutFamilies.includes(family)
      ? state.preferredLayoutFamilies.filter((f) => f !== family)
      : [...state.preferredLayoutFamilies, family];
    editorStore.patch({ preferredLayoutFamilies: next.length > 0 ? next : ['center'] });
  };

  const runRandomFreeLayout = () => {
    const count = Math.max(1, state.randomCount || 1);
    const pickedAssets = selectedAssets.slice(0, count);
    const expandedAssets = pickedAssets.flatMap((asset) =>
      Array.from({ length: sameProductCount }, () => asset)
    );
    const layers = buildRandomFreeLayers(expandedAssets, activeFamily, {
      resolveCollisions: activeFamily !== 'grid',
      tighten: activeFamily !== 'grid',
      gridConfig: activeFamily === 'grid' ? gridConfig : undefined,
    });
    editorStore.patch({ mode: 'random', layers, activeLayerId: layers[0]?.id });
  };

  const rerunRandomFreeLayout = () => {
    const remapped = remapFreeLayers(
      state.layers.filter((layer) => layer.type === 'image') as any,
      { gridConfig: activeFamily === 'grid' ? gridConfig : undefined }
    );
    editorStore.patch({ layers: remapped, activeLayerId: remapped[0]?.id ?? state.activeLayerId });
  };

  // 自动排版：随机款数或同款数量变化时自动重新排版（仅自由排版模式）
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (state.mode !== 'random') return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (selectedAssets.length === 0) return;

    const timer = setTimeout(() => {
      const count = Math.max(1, state.randomCount || 1);
      const pickedAssets = selectedAssets.slice(0, count);
      const expandedAssets = pickedAssets.flatMap((asset) =>
        Array.from({ length: sameProductCount }, () => asset)
      );
      const layers = buildRandomFreeLayers(expandedAssets, activeFamily, {
        resolveCollisions: activeFamily !== 'grid',
        tighten: activeFamily !== 'grid',
        gridConfig: activeFamily === 'grid' ? gridConfig : undefined,
      });
      editorStore.patch({ mode: 'random', layers, activeLayerId: layers[0]?.id });
    }, 200);

    return () => clearTimeout(timer);
  }, [state.randomCount, sameProductCount, state.mode]);

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">📐</span>
          排版方式
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

      <div className="row-start">
        <button
          className={`button ${state.mode === 'random' ? 'button-primary' : ''}`}
          onClick={() => editorStore.patch({ mode: 'random' })}
        >
          自由排版
        </button>
        <button
          className={`button ${state.mode === 'scene' ? 'button-primary' : ''}`}
          onClick={() => editorStore.patch({ mode: 'scene' })}
        >
          轮换套版
        </button>
      </div>

      {modeGuide && (
        <div className="hint" style={{ marginTop: 12, padding: 8, background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-md)' }}>
          {modeGuide}
        </div>
      )}

      {state.mode === 'scene' && (
        <>
          <div className="panel-subtitle">套版模板</div>
          <select
            className="input"
            value={state.selectedSceneCarouselTemplateId ?? ''}
            onChange={(event) =>
              editorStore.patch({ selectedSceneCarouselTemplateId: event.target.value || undefined })
            }
          >
            <option value="">请选择套版模板</option>
            {state.sceneCarouselTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>

          <div className="row-start" style={{ marginTop: 8 }}>
            <button
              className="button button-sm"
              onClick={() => {
                const result = sceneCarouselTemplateService.applyTemplate();
                window.alert(result.ok ? `已套用模板：${result.name}` : result.error);
              }}
            >
              套用
            </button>
            <button
              className="button button-sm"
              onClick={() => {
                const result = sceneCarouselTemplateService.previewEntry(0);
                if (!result.ok) window.alert(result.error);
              }}
            >
              预览首张
            </button>
            <button
              className="button button-danger button-sm"
              onClick={async () => {
                const result = await sceneCarouselTemplateService.deleteTemplate();
                if (!result.ok) window.alert(result.error);
              }}
            >
              删除
            </button>
          </div>

          {selectedSceneCarouselTemplate && (
            <div className="hint" style={{ marginTop: 8 }}>
              {selectedSceneCarouselTemplate.entries.length} 场景 · {selectedSceneCarouselTemplate.slotCount ?? 0} 槽位
              <button
                className="button button-sm"
                style={{ marginLeft: 8 }}
                onClick={() => setShowSceneEntries((prev) => !prev)}
              >
                {showSceneEntries ? '收起预览' : '场景预览'}
              </button>
            </div>
          )}

          {showSceneEntries && selectedSceneCarouselTemplate && (
            <div className="thumb-list thumb-list-2" style={{ marginTop: 8 }}>
              {selectedSceneCarouselTemplate.entries.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`thumb-item ${
                    state.backgroundRotationItems[state.activeBgRotationIndex]?.id === entry.background.id
                      ? 'thumb-item-active'
                      : ''
                  }`}
                  onClick={() => {
                    const result = sceneCarouselTemplateService.previewEntry(index);
                    if (!result.ok) window.alert(result.error);
                  }}
                >
                  <img src={entry.previewDataUrl || entry.background.dataUrl} alt={entry.name} />
                  <div className="thumb-name">
                    {index + 1}. {entry.name}
                  </div>
                  <div className="hint" style={{ marginTop: 6 }}>
                    {entry.slotCount ?? 0} 槽位{entry.background.sourceType === 'psd' ? ' · PSD' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {state.mode === 'random' && (
        <>
          <div className="panel-subtitle">排版参数</div>

          <div className="field-row">
            <label className="field-label" style={{ fontSize: 11 }}>随机款数</label>
            <input
              className="input"
              type="number"
              min={1}
              value={state.randomCount}
              onChange={(event) => editorStore.patch({ randomCount: Number(event.target.value) || 1 })}
              style={{ width: 72, fontSize: 11 }}
            />
            <label className="field-label" style={{ marginLeft: 12, fontSize: 11 }}>同款数量</label>
            <input
              className="input"
              type="number"
              min={1}
              value={sameProductCount}
              onChange={(event) => editorStore.patch({ sameProductCount: Math.max(1, Number(event.target.value) || 1) })}
              style={{ width: 72, fontSize: 11 }}
            />
          </div>

          <div className="field-row" style={{ marginTop: 8 }}>
            <label className="field-label">重复规则</label>
            <button
              className={`button button-sm ${state.repeatMode === 'unique' ? 'button-primary' : ''}`}
              onClick={() => editorStore.patch({ repeatMode: 'unique' })}
            >
              不重复
            </button>
            <button
              className={`button button-sm ${state.repeatMode === 'repeat' ? 'button-primary' : ''}`}
              onClick={() => editorStore.patch({ repeatMode: 'repeat' })}
            >
              可重复
            </button>
          </div>

          <div className="field-row" style={{ marginTop: 8 }}>
            <label className="field-label">排版风格</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(['center', 'triangle', 'sides', 'vertical', 'grid'] as const).map((family) => (
                <button
                  key={family}
                  className={`button button-sm ${state.preferredLayoutFamilies.includes(family) ? 'button-primary' : ''}`}
                  onClick={() => toggleFamily(family)}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  {{ center: '居中', triangle: '三角', sides: '两侧', vertical: '竖排', grid: '网格' }[family]}
                </button>
              ))}
            </div>
          </div>

          {/* 网格布局参数 — 仅选中网格时显示 */}
          {activeFamily === 'grid' && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--color-bg-secondary)', borderRadius: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <label className="field-label" style={{ width: 36 }}>列</label>
                <input className="input" type="number" min={1} max={10}
                  value={state.gridColumns ?? 3}
                  onChange={(e) => editorStore.patch({ gridColumns: Math.max(1, Math.min(10, Number(e.target.value) || 3)) })}
                  style={{ width: 50 }} />
                <label className="field-label" style={{ width: 36, marginLeft: 8 }}>行</label>
                <input className="input" type="number" min={1} max={10}
                  value={state.gridRows ?? 2}
                  onChange={(e) => editorStore.patch({ gridRows: Math.max(1, Math.min(10, Number(e.target.value) || 2)) })}
                  style={{ width: 50 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <label className="field-label" style={{ width: 36 }}>间距</label>
                <input className="input" type="number" min={0} max={200}
                  value={state.gridSpacing ?? 20}
                  onChange={(e) => editorStore.patch({ gridSpacing: Math.max(0, Math.min(200, Number(e.target.value) || 20)) })}
                  style={{ width: 60 }} />
                <span className="hint">px</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>单元格对齐</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <label className="field-label" style={{ width: 36, fontSize: 10 }}>水平</label>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      className={`button button-xs ${(state.gridAlignX || 'center') === align ? 'button-primary' : ''}`}
                      onClick={() => editorStore.patch({ gridAlignX: align })}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                    >
                      {{ left: '左', center: '中', right: '右' }[align]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label className="field-label" style={{ width: 36, fontSize: 10 }}>垂直</label>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['top', 'center', 'bottom'] as const).map((align) => (
                    <button
                      key={align}
                      className={`button button-xs ${(state.gridAlignY || 'center') === align ? 'button-primary' : ''}`}
                      onClick={() => editorStore.patch({ gridAlignY: align })}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                    >
                      {{ top: '上', center: '中', bottom: '下' }[align]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 统一缩放 — 画布有自由图层时可用 */}
          {state.layers.some((l) => l.type === 'image' && (l as any).freeSourceLayer) && (
            <div style={{ marginTop: 8 }}>
              <button className="button button-sm"
                onClick={() => {
                  const updated = normalizeFreeLayerScales(state.layers as any);
                  editorStore.patch({ layers: updated });
                }}
                style={{ fontSize: 11 }}>
                📐 统一缩放（设为平均尺寸）
              </button>
            </div>
          )}

          <div className="hint" style={{ marginTop: 8 }}>
            预计 {previewLayerCount} 张图层（{Math.max(1, state.randomCount || 1)} 款 × {sameProductCount} 份）
          </div>

          <div className="row-start" style={{ marginTop: 8, gap: 6 }}>
            <button className="button button-primary" style={{ flex: 1, fontSize: 13 }} onClick={runRandomFreeLayout}>
              排版
            </button>
            <button className="button" style={{ flex: 1, fontSize: 13 }} onClick={rerunRandomFreeLayout}>
              重排
            </button>
          </div>

          <div className="panel-subtitle" style={{ marginTop: 12 }}>草稿</div>
          <div className="row-start">
            <button className="button button-sm" onClick={async () => {
              const result = await sceneCarouselTemplateService.captureCurrentSceneToDraft();
              window.alert(result.ok
                ? `${result.updated ? '已更新' : '已保存'}场景 ${result.name}，当前草稿共 ${result.count} 张。`
                : result.error);
            }}>保存当前场景</button>
            <button className="button button-sm" onClick={() => sceneCarouselTemplateService.clearDraft()}>清空</button>
            <span className="hint" style={{ fontSize: 11, marginLeft: 4 }}>{orderedDraftEntries.length} 张</span>
          </div>

          <div style={{ marginTop: 8 }}>
            <button className="button button-primary button-sm" style={{ width: '100%' }}
              onClick={async () => {
                const result = await sceneCarouselTemplateService.saveDraftAsTemplate();
                window.alert(result.ok ? `已保存：${result.name}（${result.count} 张）` : `保存失败: ${result.error}`);
              }}>保存草稿为套版模板</button>
            {orderedDraftEntries.length > 0 ? (
              <div className="thumb-list scene-draft-list" style={{ marginTop: 8 }}>
                {orderedDraftEntries.map((entry: any, index: number) => (
                  <div key={entry.id} className="thumb-item scene-draft-item"
                    onClick={() => { const r = sceneCarouselTemplateService.previewDraftEntry(index); if (!r.ok) window.alert(r.error); }}>
                    <div className="thumb-actions">
                      <button type="button" className="thumb-action" title="删除"
                        onClick={(e) => { e.stopPropagation(); sceneCarouselTemplateService.removeDraftEntry(entry.id); }}>×</button>
                    </div>
                    <div className="thumb-move">
                      <button type="button" className="thumb-action" title="预览"
                        onClick={(e) => { e.stopPropagation(); const r = sceneCarouselTemplateService.previewDraftEntry(index); if (!r.ok) window.alert(r.error); }}>预</button>
                    </div>
                    <img src={entry.previewDataUrl || entry.background.dataUrl} alt={entry.name} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>暂无草稿，请先在画布上排版后点击「保存当前场景」</div>
            )}
          </div>
        </>
      )}

      <div className="hint" style={{ marginTop: 12 }}>
        当前可生成组合数: {queue.length}
      </div>
    </section>
  );
}
