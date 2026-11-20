import { useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import { assetService } from '@/services/asset.service';
import { psdService } from '@/services/psd.service';
import { templateService } from '@/services/template.service';
import type { PsdLayerNode, PsdLayerRole, PsdLayerEffects } from '@/core/models/psd';

interface CanvasSettingsPanelProps {
  compact?: boolean;
}

/** 在模板的图层树中递归查找并更新指定 layer 的 maskDataUrl 和 layerDataUrl */
function patchLayerMaskInTemplate(
  layers: PsdLayerNode[],
  targetId: string,
  maskDataUrl: string,
  layerDataUrl?: string
): PsdLayerNode[] {
  return layers.map((layer) => {
    if (layer.id === targetId) {
      return { ...layer, maskDataUrl, ...(layerDataUrl ? { layerDataUrl } : {}) };
    }
    if (layer.children) {
      return { ...layer, children: patchLayerMaskInTemplate(layer.children, targetId, maskDataUrl, layerDataUrl) };
    }
    return layer;
  });
}

/** 在模板的图层树中递归查找并更新指定 layer 的效果配置 */
function patchLayerEffectsInTemplate(
  layers: PsdLayerNode[],
  targetId: string,
  effects: PsdLayerEffects
): PsdLayerNode[] {
  return layers.map((layer) => {
    if (layer.id === targetId) {
      return { ...layer, effects: effects.dropShadow || effects.stroke ? effects : undefined };
    }
    if (layer.children) {
      return { ...layer, children: patchLayerEffectsInTemplate(layer.children, targetId, effects) };
    }
    return layer;
  });
}

function LayerTreeRow({
  node,
  templateId,
  depth = 0,
}: {
  node: PsdLayerNode;
  templateId: string;
  depth?: number;
}) {
  const state = useEditorStore();
  const template = state.psdTemplates.find((t) => t.id === templateId);
  const role: PsdLayerRole | undefined = template?.layerRoles?.[node.id];
  const currentBinding = template?.slotBindings?.[node.id];
  const primarySelectedAsset = state.sourceAssets.find((asset) => asset.selected);

  const [effectsOpen, setEffectsOpen] = useState(false);

  const bindAsset = (assetId: string) => {
    editorStore.bindAssetToPsdSlot(templateId, node.id, assetId);
  };

  const handleAssetDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('text/plain');
    if (!raw?.startsWith('asset:')) return;
    const assetId = raw.slice('asset:'.length);
    if (!assetId) return;
    bindAsset(assetId);
  };

  const setRole = (next: PsdLayerRole | undefined) => {
    const currentState = editorStore.getState();
    const t = currentState.psdTemplates.find((item) => item.id === templateId);
    if (!t) return;
    const nextRoles = { ...t.layerRoles };
    if (next) {
      nextRoles[node.id] = next;
    } else {
      delete nextRoles[node.id];
    }
    const firstProduct = Object.entries(nextRoles).find(([, r]) => r === 'placeholder')?.[0];
    editorStore.patch({
      psdTemplates: editorStore.getState().psdTemplates.map((item) =>
        item.id === templateId
          ? { ...item, layerRoles: nextRoles, selectedProductLayerId: firstProduct }
          : item
      ),
    }, { markDirty: false });

    if (next !== 'placeholder') {
      editorStore.unbindAssetFromPsdSlot(templateId, node.id);
    }

    if (next === 'placeholder' || next === 'foreground') {
      void psdService.setProductSlot(templateId, node.id, next);
    }

    // 设置为占位层时自动提取像素遮罩（支持不规则形状裁剪）
    if (next === 'placeholder' && node.kind !== 'group') {
      void (async () => {
        const mask = await psdService.getLayerMask(templateId, node.id);
        if (!mask) return;
        const s = editorStore.getState();
        editorStore.patch({
          psdTemplates: s.psdTemplates.map((tmpl) =>
            tmpl.id === templateId
              ? {
                  ...tmpl,
                  layers: patchLayerMaskInTemplate(tmpl.layers, node.id, mask.maskDataUrl, mask.layerDataUrl),
                }
              : tmpl
          ),
        }, { markDirty: false });
      })();
    }

    // 设置为前景层时自动提取完整 RGBA 图层数据，用于遮挡占位图。
    if (next === 'foreground' && node.kind !== 'group') {
      void psdService.fetchAndStoreForegroundData(templateId, node.id);
    }
  };

  /** 更新当前图层的效果配置到 store */
  const setLayerEffects = (effects: PsdLayerEffects) => {
    const s = editorStore.getState();
    editorStore.patch({
      psdTemplates: s.psdTemplates.map((tmpl) =>
        tmpl.id === templateId
          ? { ...tmpl, layers: patchLayerEffectsInTemplate(tmpl.layers, node.id, effects) }
          : tmpl
      ),
    }, { markDirty: false });
  };

  const setDropShadow = (patch: Partial<PsdLayerEffects['dropShadow']>) => {
    const currentEffects = node.effects ?? {};
    setLayerEffects({
      ...currentEffects,
      dropShadow: { ...{ enabled: true, color: '#000000', blur: 8, offsetX: 2, offsetY: 2, opacity: 0.5 }, ...currentEffects.dropShadow, ...patch },
    });
  };

  const setStroke = (patch: Partial<PsdLayerEffects['stroke']>) => {
    const currentEffects = node.effects ?? {};
    setLayerEffects({
      ...currentEffects,
      stroke: { ...{ enabled: true, color: '#ffffff', width: 2, opacity: 1 }, ...currentEffects.stroke, ...patch },
    });
  };

  return (
    <div style={{ marginLeft: depth * 14 }}>
      <div className="row-between" style={{ padding: '3px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          <button
            className="button button-xs"
            style={{
              fontSize: 9, padding: '0 3px', lineHeight: '16px',
              opacity: node.visible ? 1 : 0.4,
              flexShrink: 0
            }}
            onClick={() => editorStore.setPsdLayerVisibility(templateId, node.id, !node.visible)}
            title={node.visible ? '隐藏此图层' : '显示此图层'}
          >
            {node.visible ? '显示' : '隐藏'}
          </button>
          <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.children ? '组' : '层'} {node.name}
            {!node.visible ? ' (隐藏)' : ''}
          </span>
          {role === 'placeholder' && (
            <button
              className="button button-xs"
              type="button"
              style={{
                fontSize: 10,
                padding: '1px 5px',
                marginLeft: 4,
                background: state.selectedPsdSlotId === node.id ? 'var(--color-accent)' : undefined,
                color: state.selectedPsdSlotId === node.id ? '#fff' : undefined
              }}
              onClick={() => editorStore.setSelectedPsdSlotId(node.id)}
              title="在画布上高亮这个占位槽位"
            >
              选槽位
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(!role || role === 'background') && (
            <button className="button button-xs" style={{ fontSize: 10, padding: '1px 5px' }}
              onClick={() => setRole('placeholder')} title="设为占位替换层">
              占位
            </button>
          )}
          {role === 'placeholder' && (
            <button className="button button-xs button-primary" style={{ fontSize: 10, padding: '1px 5px' }}
              onClick={() => setRole(undefined)} title="取消占位层">
              占位 ✓
            </button>
          )}
          {role === 'foreground' && (
            <button className="button button-xs" style={{ fontSize: 10, padding: '1px 5px', background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
              onClick={() => setRole(undefined)} title="取消前景层">
              前景 ✓
            </button>
          )}
          {(!role || role === 'background') && node.kind !== 'group' && (
            <button className="button button-xs" style={{ fontSize: 10, padding: '1px 5px' }}
              onClick={() => setRole('foreground')} title="设为前景遮挡层">
              前景
            </button>
          )}
        </div>
      </div>

      {/* 占位层效果配置 */}
      {role === 'placeholder' && node.kind !== 'group' && (
        <div style={{ marginLeft: depth * 14, marginTop: 4, fontSize: 10 }}>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleAssetDrop}
            style={{
              marginBottom: 6,
              padding: '6px 8px',
              border: '1px dashed var(--color-border)',
              borderRadius: 4,
              background: 'var(--color-bg-secondary)'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>素材图层</div>
            {currentBinding ? (
              <>
                <div className="hint" style={{ fontSize: 10 }}>当前绑定：{currentBinding.assetName}</div>
                <div className="row-start" style={{ gap: 4, marginTop: 6 }}>
                  {primarySelectedAsset && primarySelectedAsset.id !== currentBinding.assetId && (
                    <button className="button button-xs" type="button" onClick={() => bindAsset(primarySelectedAsset.id)}>
                      用当前选中替换
                    </button>
                  )}
                  <button
                    className="button button-xs button-danger"
                    type="button"
                    onClick={() => editorStore.unbindAssetFromPsdSlot(templateId, node.id)}
                  >
                    解绑
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="hint" style={{ fontSize: 10 }}>
                  从左侧素材区拖图片到这里，系统会绑定为当前占位槽位的素材图层。
                </div>
                {primarySelectedAsset && (
                  <button className="button button-xs" type="button" style={{ marginTop: 6 }} onClick={() => bindAsset(primarySelectedAsset.id)}>
                    绑定当前选中：{primarySelectedAsset.name}
                  </button>
                )}
              </>
            )}
          </div>
          <div
            style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', userSelect: 'none' }}
            onClick={() => setEffectsOpen(!effectsOpen)}
          >
            {effectsOpen ? '收起' : '展开'} 效果配置{node.effects?.dropShadow?.enabled || node.effects?.stroke?.enabled ? ' · 已启用' : ''}
          </div>

          {effectsOpen && (
            <div style={{ marginTop: 4, padding: '4px 6px', background: 'var(--color-bg-secondary)', borderRadius: 4, border: '1px solid var(--color-border)' }}>

              {/* ===== 鎶曞奖 ===== */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <input type="checkbox" checked={node.effects?.dropShadow?.enabled ?? false}
                  onChange={(e) => setDropShadow({ enabled: e.target.checked })} />
                <span style={{ fontWeight: 600 }}>鎶曞奖</span>
              </label>
              {node.effects?.dropShadow?.enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 6px', marginBottom: 6, paddingLeft: 8 }}>
                  <span>颜色</span>
                  <input type="color" value={node.effects.dropShadow.color}
                    onChange={(e) => setDropShadow({ color: e.target.value })} style={{ width: '100%', height: 18, padding: 0, border: 'none' }} />
                  <span>不透明度</span>
                  <input type="range" min={0} max={100} value={Math.round((node.effects.dropShadow.opacity ?? 0.5) * 100)}
                    onChange={(e) => setDropShadow({ opacity: Number(e.target.value) / 100 })} />
                  <span>模糊</span>
                  <input type="range" min={0} max={30} value={node.effects.dropShadow.blur ?? 8}
                    onChange={(e) => setDropShadow({ blur: Number(e.target.value) })} />
                  <span>X 偏移</span>
                  <input type="range" min={-50} max={50} value={node.effects.dropShadow.offsetX ?? 2}
                    onChange={(e) => setDropShadow({ offsetX: Number(e.target.value) })} />
                  <span>Y 偏移</span>
                  <input type="range" min={-50} max={50} value={node.effects.dropShadow.offsetY ?? 2}
                    onChange={(e) => setDropShadow({ offsetY: Number(e.target.value) })} />
                </div>
              )}

              {/* ===== 描边 ===== */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <input type="checkbox" checked={node.effects?.stroke?.enabled ?? false}
                  onChange={(e) => setStroke({ enabled: e.target.checked })} />
                <span style={{ fontWeight: 600 }}>描边</span>
              </label>
              {node.effects?.stroke?.enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 6px', paddingLeft: 8 }}>
                  <span>颜色</span>
                  <input type="color" value={node.effects.stroke.color}
                    onChange={(e) => setStroke({ color: e.target.value })} style={{ width: '100%', height: 18, padding: 0, border: 'none' }} />
                  <span>不透明度</span>
                  <input type="range" min={0} max={100} value={Math.round((node.effects.stroke.opacity ?? 1) * 100)}
                    onChange={(e) => setStroke({ opacity: Number(e.target.value) / 100 })} />
                  <span>宽度</span>
                  <input type="range" min={0} max={20} value={node.effects.stroke.width ?? 2}
                    onChange={(e) => setStroke({ width: Number(e.target.value) })} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {node.children?.map((child) => (
        <LayerTreeRow key={child.id} node={child} templateId={templateId} depth={depth + 1} />
      ))}
    </div>
  );
}

export function CanvasSettingsPanel({ compact }: CanvasSettingsPanelProps) {
  const state = useEditorStore();
  const rotationCount = state.backgroundRotationItems.length;
  const activePsdTemplate = state.psdTemplates.find((item) => item.id === state.canvas.backgroundPsdTemplateId);
  const dragIdRef = useRef<string>('');

  const selectedPsdTemplate = state.selectedPsdTemplateId
    ? state.psdTemplates.find((t) => t.id === state.selectedPsdTemplateId)
    : null;
  const productLayerIds = selectedPsdTemplate
    ? Object.entries(selectedPsdTemplate.layerRoles ?? {})
        .filter(([, r]) => r === 'placeholder')
        .map(([id]) => id)
    : selectedPsdTemplate?.selectedProductLayerId
      ? [selectedPsdTemplate.selectedProductLayerId]
      : [];
  const foregroundLayerIds = selectedPsdTemplate
    ? Object.entries(selectedPsdTemplate.layerRoles ?? {})
        .filter(([, r]) => r === 'foreground')
        .map(([id]) => id)
    : [];

  const handleDragStart = useCallback((event: React.DragEvent, itemId: string) => {
    dragIdRef.current = itemId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemId);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!dragIdRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent, toIndex: number) => {
      event.preventDefault();
      const dragId = dragIdRef.current;
      dragIdRef.current = '';
      if (!dragId) return;
      const fromIndex = state.backgroundRotationItems.findIndex((item) => item.id === dragId);
      if (fromIndex < 0 || toIndex < 0 || toIndex >= state.backgroundRotationItems.length || fromIndex === toIndex) return;
      assetService.moveBackgroundRotationItemToIndex(fromIndex, toIndex);
    },
    [state.backgroundRotationItems]
  );

  const handleDragEnd = useCallback(() => {
    dragIdRef.current = '';
  }, []);

  const bgType = state.canvas.backgroundType;

  return (
    <section className={`panel-card ${compact ? 'compact-canvas-settings' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">🎨</span>
          画布设置
        </div>
      </div>

      {/* 画布尺寸 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="field-label" style={{ whiteSpace: 'nowrap' }}>尺寸</span>
        <input
          className="input"
          type="number"
          value={state.canvas.size}
          onChange={(event) => {
            editorStore.patchCanvas({ size: Number(event.target.value) || 1080 });
          }}
          style={{ width: 70 }}
        />
        <span className="hint" style={{ fontSize: 11 }}>px</span>
      </div>

      {/* 背景类型 — 标签切换 */}
      <div className="panel-subtitle">背景类型</div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
        {([
          { key: 'color', label: '颜色' },
          { key: 'image', label: '图片' },
          { key: 'psd', label: 'PSD' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            className={`button button-sm ${bgType === tab.key ? 'button-primary' : ''}`}
            style={{ fontSize: 11, padding: '3px 10px', flex: 1 }}
            onClick={() => editorStore.patchCanvas({
              backgroundType: tab.key,
              ...(tab.key !== 'psd' ? { backgroundPsdTemplateId: undefined } : {}),
            })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== 颜色 ========== */}
      {bgType === 'color' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="field-label">底色</span>
          <input
            className="color-input"
            type="color"
            value={state.canvas.backgroundValue}
            onChange={(event) => {
              editorStore.patchCanvas({ backgroundType: 'color', backgroundValue: event.target.value, backgroundPsdTemplateId: undefined });
            }}
          />
        </div>
      )}

      {/* ========== 图片 ========== */}
      {bgType === 'image' && (
        <>
          <div className="row-start" style={{ gap: 4 }}>
            <button className="button button-sm" onClick={() => assetService.importBackgroundImage()}>
              📤 导入背景
            </button>
            {rotationCount > 0 && (
              <button className="button button-danger button-sm" onClick={() => assetService.clearBackgroundRotation()}>
                清空轮换
              </button>
            )}
          </div>

          {rotationCount > 0 ? (
            <>
              <div className="hint" style={{ marginTop: 8 }}>
                已加入 <strong>{rotationCount}</strong> 张轮换背景
              </div>
              <div className={`thumb-list ${compact ? '' : 'thumb-list-4'} bg-rotation-list`}>
                {state.backgroundRotationItems.map((item, index) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    className={`thumb-item bg-rotation-item ${index === state.activeBgRotationIndex ? 'thumb-item-active' : ''}`}
                    data-bg-index={index}
                    onClick={() => assetService.applyBackgroundRotationIndex(index)}
                    onDragStart={(event) => handleDragStart(event, item.id)}
                    onDragOver={handleDragOver}
                    onDrop={(event) => handleDrop(event, index)}
                    onDragEnd={handleDragEnd}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        assetService.applyBackgroundRotationIndex(index);
                      }
                    }}
                  >
                    <div className="thumb-actions">
                      <button type="button" className="thumb-action" title="删除"
                        onClick={(event) => { event.stopPropagation(); assetService.removeBackgroundRotationItem(item.id); }}>×</button>
                    </div>
                    <div className="thumb-move">
                      <button type="button" className="thumb-action" title="上一个"
                        onClick={(event) => { event.stopPropagation(); assetService.moveBackgroundRotationItem(item.id, -1); }}>↑</button>
                      <button type="button" className="thumb-action" title="下一个"
                        onClick={(event) => { event.stopPropagation(); assetService.moveBackgroundRotationItem(item.id, 1); }}>↓</button>
                    </div>
                    <img src={item.dataUrl} alt={item.name} />
                    <div className="thumb-name">{item.name}</div>
                  </div>
                ))}
              </div>
            </>
          ) : state.canvas.backgroundImageUrl ? (
            <div className="hint" style={{ marginTop: 8 }}>当前背景</div>
          ) : (
            <div className="empty-state" style={{ padding: '16px 0' }}>
              <div className="empty-state-icon">图片</div>
              <div className="hint">点击上方按钮添加背景图片</div>
            </div>
          )}

          {/* 轮换模板操作 */}
          <div className="panel-subtitle" style={{ marginTop: 12 }}>轮换模板</div>
          <div className="row-start" style={{ gap: 4 }}>
            <button className="button button-sm" onClick={() => templateService.saveBgRotationTemplate()}>保存</button>
            <button className="button button-sm" onClick={() => templateService.applyBgRotationTemplate()}>套用</button>
            <button className="button button-danger button-sm" onClick={() => templateService.deleteBgRotationTemplate()}>删除</button>
          </div>
          <select
            className="input"
            style={{ marginTop: 6 }}
            value={state.selectedBgRotationTemplateId ?? ''}
            onChange={(event) => editorStore.patch({ selectedBgRotationTemplateId: event.target.value || undefined })}
          >
            <option value="">请选择背景模板</option>
            {state.bgRotationTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </>
      )}

      {/* ========== PSD ========== */}
      {bgType === 'psd' && (
        <>
          <div className="row-start" style={{ gap: 4 }}>
            <button className="button button-sm button-primary" onClick={() => psdService.importPsdTemplates()}>
              导入 PSD
            </button>
            {selectedPsdTemplate && (
              <button className="button button-danger button-sm" onClick={() => {
                if (window.confirm(`确定要删除"${selectedPsdTemplate.name}" 吗？`)) {
                  psdService.clearCache(selectedPsdTemplate.id);
                  editorStore.removePsdTemplate(selectedPsdTemplate.id);
                }
              }}>
                删除选中
              </button>
            )}
          </div>

          {/* 手动排版模式切换 */}
          {state.psdTemplates.length > 0 && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 8px',
              background: state.psdManualMode ? 'var(--color-accent-bg, #e8f5e9)' : 'var(--color-bg-secondary)',
              borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 500,
              border: state.psdManualMode ? '1px solid #4caf50' : '1px solid transparent',
            }}>
              <input type="checkbox" checked={state.psdManualMode}
                onChange={(e) => editorStore.patch({ psdManualMode: e.target.checked })} />
              <span>手动排版模式</span>
              {state.psdManualMode && (
                <span className="hint" style={{ fontSize: 10 }}>
                  （隐藏PSD占位层 → 拖素材自由排版 → 批量套用）
                </span>
              )}
            </label>
          )}

          {state.psdTemplates.length === 0 ? (
            <div className="empty-state" style={{ padding: '16px 0' }}>
              <div className="empty-state-icon">PSD</div>
              <div className="hint">尚未导入 PSD 模板</div>
            </div>
          ) : (
            <>
              <select
                className="input"
                style={{ marginTop: 8 }}
                value={state.selectedPsdTemplateId ?? ''}
                onChange={(event) => editorStore.setSelectedPsdTemplateId(event.target.value || undefined)}
              >
                <option value="">选择 PSD 模板</option>
                {state.psdTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>

              {/* 当前背景指示 */}
              {activePsdTemplate && (
                <div className="hint hint-info" style={{ marginTop: 8 }}>
                  当前画布背景: {activePsdTemplate.name}
                  {productLayerIds.length > 0 && ` · ${productLayerIds.length} 个占位层`}
                  {foregroundLayerIds.length > 0 && ` · ${foregroundLayerIds.length} 个前景层`}
                </div>
              )}

              {/* 操作按钮 — 操作对象是下拉框选中的 PSD */}
              <div className="row-start" style={{ marginTop: 8, gap: 4, flexWrap: 'wrap' }}>
                <button className="button button-sm"
                  onClick={() => {
                    if (!state.selectedPsdTemplateId) return;
                    psdService.applyPsdBackground(state.selectedPsdTemplateId);
                  }}
                  disabled={!state.selectedPsdTemplateId}>
                  设为背景
                </button>
                <button className="button button-sm"
                  onClick={() => {
                    if (!state.selectedPsdTemplateId) return;
                    psdService.addPsdToBackgroundRotation(state.selectedPsdTemplateId);
                  }}
                  disabled={!state.selectedPsdTemplateId}>
                  加入切换
                </button>
                <button className="button button-sm button-primary"
                  onClick={async () => {
                    if (!state.selectedPsdTemplateId) return;
                    const result = await psdService.enterPsdDocumentMode(state.selectedPsdTemplateId);
                    window.alert(result.message);
                  }}
                  disabled={!state.selectedPsdTemplateId}>
                  进入文档模式
                </button>
              </div>

              {/* 套版操作 — 画布上有 PSD 图层时可用 */}
              {state.layers.some((l) => l.type === 'image' && (l as any).psdTemplateId) && (
                <div className="row-start" style={{ marginTop: 8, gap: 4, flexWrap: 'wrap' }}>
                  <button className="button button-sm button-primary"
                    onClick={() => {
                      const name = window.prompt('请输入套版名称：');
                      if (!name) return;
                      const result = psdService.saveLayoutTemplate(name);
                      if (result) window.alert(`套版"${name}"已保存。`);
                    }}>
                    保存套版
                  </button>
                  <button className="button button-sm"
                    onClick={() => {
                      const selected = state.sourceAssets.filter((a) => a.selected);
                      if (!selected.length) { window.alert('请先在素材区选中要套用的图片。'); return; }
                      const result = psdService.applyLayoutTemplate(selected.map((a) => a.id));
                      if (result.ok) window.alert(`已替换 ${result.replaced} 个占位层。`);
                    }}>
                    批量套用
                  </button>
                </div>
              )}

              {selectedPsdTemplate && (
                <div style={{ marginTop: 10 }}>
                  <div className="panel-subtitle">
                    图层角色
                    <span className="hint" style={{ fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                      占位层=商品替换位 · 前景层=遮挡商品
                    </span>
                  </div>
                  <div className="panel-subtitle">
                    场景层总览
                    <span className="hint" style={{ fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                      背景 → 占位槽位 → 前景遮挡
                    </span>
                  </div>
                  <div style={{
                    marginTop: 4,
                    marginBottom: 10,
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    padding: 8,
                    background: 'var(--color-bg-secondary)'
                  }}>
                    <div className="hint" style={{ marginBottom: 4 }}>背景层：当前 PSD 场景</div>
                    {productLayerIds.length > 0 ? productLayerIds.map((id) => {
                      const layer = findLayerById(selectedPsdTemplate.layers, id);
                      const binding = selectedPsdTemplate.slotBindings?.[id];
                      return (
                        <div key={`slot-${id}`} style={{ fontSize: 11, marginBottom: 4 }}>
                          占位槽位：{layer?.name ?? id}
                          <span className="hint" style={{ marginLeft: 6 }}>
                            {binding ? '素材图层 = ' + binding.assetName : '未绑定素材'}
                          </span>
                        </div>
                      );
                    }) : <div className="hint" style={{ marginBottom: 4 }}>还没有占位槽位</div>}
                    {foregroundLayerIds.length > 0 ? foregroundLayerIds.map((id) => {
                      const layer = findLayerById(selectedPsdTemplate.layers, id);
                      return <div key={'fg-' + id} style={{ fontSize: 11, color: 'var(--color-warning)' }}>前景遮挡：{layer?.name ?? id}</div>;
                    }) : <div className="hint">还没有前景遮挡层</div>}
                  </div>

                  <div className="panel-content" style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    padding: 6,
                    marginTop: 4,
                  }}>
                    {selectedPsdTemplate.layers.map((layer) => (
                      <LayerTreeRow key={layer.id} node={layer} templateId={selectedPsdTemplate.id} />
                    ))}
                    {selectedPsdTemplate.layers.length === 0 && (
                      <div className="hint">此 PSD 没有图层</div>
                    )}
                  </div>
                  {productLayerIds.length > 0 && (
                    <div className="hint hint-info" style={{ marginTop: 6 }}>
                      占位层: {productLayerIds.map((id) => {
                        const layer = findLayerById(selectedPsdTemplate.layers, id);
                        const binding = selectedPsdTemplate.slotBindings?.[id];
                        return `${layer?.name ?? id}${binding ? ` → ${binding.assetName}` : ''}`;
                      }).join(', ')}
                    </div>
                  )}
                  {foregroundLayerIds.length > 0 && (
                    <div className="hint" style={{ marginTop: 4, color: 'var(--color-warning)' }}>
                      前景层: {foregroundLayerIds.map((id) => {
                        const layer = findLayerById(selectedPsdTemplate.layers, id);
                        return layer?.name ?? id;
                      }).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* PSD 缩略图 */}
              <div className="thumb-list thumb-list-2" style={{ marginTop: 10 }}>
                {state.psdTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className={`thumb-item ${state.selectedPsdTemplateId === tpl.id ? 'thumb-item-active' : ''}`}
                    onClick={() => editorStore.setSelectedPsdTemplateId(tpl.id)}
                    style={{ position: 'relative' }}
                  >
                    <div className="thumb-actions">
                      <button type="button" className="thumb-action" title={`删除 ${tpl.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`确定要删除"${tpl.name}" 吗？`)) {
                            psdService.clearCache(tpl.id);
                            editorStore.removePsdTemplate(tpl.id);
                          }
                        }}
                      >×</button>
                    </div>
                    <img src={tpl.previewDataUrl} alt={tpl.name} />
                    <div className="thumb-name">{tpl.name}</div>
                    {activePsdTemplate?.id === tpl.id && (
                      <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 8, background: 'var(--color-primary)', color: '#fff', padding: '0 3px', borderRadius: 2, lineHeight: '14px' }}>背景</span>
                    )}
                    <div className="hint psd-meta">{tpl.width}×{tpl.height} · {tpl.layers.length} 层</div>
                  </div>
                ))}
              </div>

              {/* AI 配置入口（预留） */}
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  🤖 AI 智能填充（预留）
                </summary>
                <div style={{ marginTop: 6, padding: 8, background: 'var(--color-bg-secondary)', borderRadius: 4 }}>
                  {selectedPsdTemplate?.aiConfig?.enabled ? (
                    <div className="hint hint-info">
                      AI 已启用 · 服务: {selectedPsdTemplate.aiConfig.provider ?? '未设置'}
                      {selectedPsdTemplate.aiConfig.prompt && <span> · 提示词已配置</span>}
                    </div>
                  ) : (
                    <div className="hint">
                      AI 智能填充可根据占位层形状自动重构商品图，使其更自然贴合目标区域。
                      <br />功能开发中，敬请期待。
                    </div>
                  )}
                </div>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}

function findLayerById(layers: PsdLayerNode[], id: string): PsdLayerNode | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (layer.children) {
      const found = findLayerById(layer.children, id);
      if (found) return found;
    }
  }
  return undefined;
}
