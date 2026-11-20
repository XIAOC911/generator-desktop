import { useState } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import { sceneCarouselTemplateService } from '@/services/scene-carousel-template.service';

interface TemplatePanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TemplatePanel({ compact, collapsed, onToggleCollapse }: TemplatePanelProps) {
  const state = useEditorStore();
  const [showSceneEntries, setShowSceneEntries] = useState(false);

  const selectedSceneCarouselTemplate = state.sceneCarouselTemplates.find(
    (item) => item.id === state.selectedSceneCarouselTemplateId
  );

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">🔄</span>
          轮换套版
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

      <div className="row-start" style={{ marginTop: 12 }}>
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
        <>
          <div className="hint" style={{ marginTop: 8 }}>
            当前模板共 {selectedSceneCarouselTemplate.entries.length} 张场景，最大槽位 {selectedSceneCarouselTemplate.slotCount ?? 0}
          </div>
          <button
            className="button button-sm"
            style={{ marginTop: 8 }}
            onClick={() => setShowSceneEntries((prev) => !prev)}
          >
            {showSceneEntries ? '隐藏场景预览' : '显示场景预览'}
          </button>
        </>
      )}

      {showSceneEntries && selectedSceneCarouselTemplate && (
        <div className="thumb-list thumb-list-2" style={{ marginTop: 12 }}>
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
              <img src={entry.background.dataUrl} alt={entry.name} />
              <div className="thumb-name">
                {index + 1}. {entry.name}
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {entry.slotCount ?? 0} 个商品槽位
                {entry.background.sourceType === 'psd' ? ' · PSD 背景' : ' · 图片背景'}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
