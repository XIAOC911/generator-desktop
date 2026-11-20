import { useRef, useState } from 'react';
import { editorStore } from '@/app/store/editorStore';
import { useEditorStore } from '@/app/store/useEditorStore';
import { createId } from '@/core/utils/id';
import type { TaotuReplicateSource } from '@/core/models/taotu';

interface TaotuPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TaotuPanel({ compact, collapsed, onToggleCollapse }: TaotuPanelProps) {
  const state = useEditorStore();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const replicateInputRef = useRef<HTMLInputElement>(null);
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const activePage = state.taotuPages[state.taotuActivePage];

  const handleAddPage = () => {
    editorStore.addTaotuPage();
  };

  const handleRemovePage = (index: number) => {
    if (state.taotuPages.length <= 1) return;
    editorStore.removeTaotuPage(index);
  };

  const handleSwitchPage = (index: number) => {
    editorStore.captureTaotuPage();
    editorStore.switchTaotuPage(index);
  };

  const handleRenameStart = (index: number, currentName: string) => {
    setRenameIndex(index);
    setRenameValue(currentName);
  };

  const handleRenameConfirm = () => {
    if (renameIndex !== null && renameValue.trim()) {
      editorStore.renameTaotuPage(renameIndex, renameValue.trim());
    }
    setRenameIndex(null);
  };

  const handleBrandColorChange = (color: string) => {
    editorStore.updateTaotuBrand({ primaryColor: color });
  };

  const handleBrandFontChange = (font: string) => {
    editorStore.updateTaotuBrand({ font });
  };

  const handleLogoUpload = () => {
    logoInputRef.current?.click();
  };

  const handleLogoFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      editorStore.updateTaotuBrand({ logoDataUrl: e.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    editorStore.updateTaotuBrand({ logoDataUrl: undefined });
  };

  const handleReplicateSources = () => {
    replicateInputRef.current?.click();
  };

  const handleReplicateFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const sources: TaotuReplicateSource[] = files.map((file) => ({
      id: createId('replicate'),
      name: file.name,
      dataUrl: URL.createObjectURL(file),
    }));
    editorStore.addTaotuReplicateSources(sources);
  };

  const handleClearReplicate = () => {
    editorStore.clearTaotuReplicateSources();
  };

  // Taotu export: renders each page with the current layers/background
  const handleTaotuExport = async () => {
    // Capture current page state first
    editorStore.captureTaotuPage();
    const currentState = editorStore.getState();
    const pages = currentState.taotuPages;
    if (!pages.length) {
      window.alert('请先配置套图页面');
      return;
    }

    const rootDir = await window.fanDesktop.file.pickDirectory();
    if (!rootDir) return;

    const prefix = currentState.taotuExportPrefix || '套图';
    const copies = currentState.taotuPerPageCopies || 1;
    const canvas = document.createElement('canvas');
    const { renderCanvasScene } = await import('@/core/renderer/canvas-renderer');

    // Build taotu scene
    const jobs: Array<{ folder: string; fileName: string; dataUrl: string }> = [];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const pageState = {
        ...currentState,
        layers: page.layers,
        canvas: {
          ...currentState.canvas,
          backgroundType: page.bg.type === 'image' ? 'image' : 'color',
          backgroundValue: page.bg.type === 'color' ? page.bg.value : '#ffffff',
          backgroundImageUrl: page.bg.type === 'image' ? page.bg.dataUrl : undefined,
        },
      };
      canvas.width = pageState.canvas.size;
      canvas.height = pageState.canvas.size;
      await renderCanvasScene(canvas, pageState);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      for (let c = 0; c < copies; c++) {
        const suffix = copies > 1 ? `_${String(c + 1).padStart(2, '0')}` : '';
        jobs.push({
          folder: `${prefix}_套图导出`,
          fileName: `${prefix}_${String(pageIdx + 1).padStart(2, '0')}${suffix}.jpg`,
          dataUrl,
        });
      }
    }

    await window.fanDesktop.export.writeJobs({ rootDir, jobs });
    window.alert(`套图导出完成！共 ${pages.length} 页，每页 ${copies} 张，总计 ${jobs.length} 张。`);
  };

  // Replicate: apply current layout to replicate sources
  const handleReplicateRun = async () => {
    editorStore.captureTaotuPage();
    const currentState = editorStore.getState();
    const sources = currentState.taotuReplicateSources;
    const pages = currentState.taotuPages;

    if (!pages.length) {
      window.alert('请先配置套图页面');
      return;
    }
    if (!sources.length) {
      window.alert('请先选择复刻商品素材');
      return;
    }

    const rootDir = await window.fanDesktop.file.pickDirectory();
    if (!rootDir) return;

    const prefix = currentState.taotuExportPrefix || '套图';
    const copies = currentState.taotuPerPageCopies || 1;
    const canvas = document.createElement('canvas');
    const { renderCanvasScene } = await import('@/core/renderer/canvas-renderer');

    const jobs: Array<{ folder: string; fileName: string; dataUrl: string }> = [];

    for (let srcIdx = 0; srcIdx < sources.length; srcIdx++) {
      const source = sources[srcIdx];
      // For each source, replace image layers' previewUrl with the source dataUrl
      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx];
        const replacedLayers = page.layers.map((layer) => {
          if (layer.type === 'image') {
            return { ...layer, previewUrl: source.dataUrl, sourceName: source.name };
          }
          return layer;
        });

        const pageState = {
          ...currentState,
          layers: replacedLayers,
          canvas: {
            ...currentState.canvas,
            backgroundType: page.bg.type === 'image' ? 'image' : 'color',
            backgroundValue: page.bg.type === 'color' ? page.bg.value : '#ffffff',
            backgroundImageUrl: page.bg.type === 'image' ? page.bg.dataUrl : undefined,
          },
        };
        canvas.width = pageState.canvas.size;
        canvas.height = pageState.canvas.size;
        await renderCanvasScene(canvas, pageState);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

        for (let c = 0; c < copies; c++) {
          const suffix = copies > 1 ? `_${String(c + 1).padStart(2, '0')}` : '';
          jobs.push({
            folder: `${prefix}_复刻_${source.name.replace(/[\\/:*?"<>|]/g, '_')}`,
            fileName: `${prefix}_${String(srcIdx + 1).padStart(2, '0')}_${String(pageIdx + 1).padStart(2, '0')}${suffix}.jpg`,
            dataUrl,
          });
        }
      }
    }

    await window.fanDesktop.export.writeJobs({ rootDir, jobs });
    window.alert(`复刻完成！${sources.length} 款商品 × ${pages.length} 页，总计 ${jobs.length} 张。`);
  };

  const handleSaveTemplate = () => {
    editorStore.captureTaotuPage();
    const currentState = editorStore.getState();
    if (!currentState.taotuPages.length) {
      window.alert('套图页面为空，请先编辑');
      return;
    }
    const name = window.prompt('保存套图模板，请输入名称：', `套图模板_${new Date().toLocaleString().replace(/[/:]/g, '-')}`);
    if (!name) return;
    editorStore.saveTaotuTemplate(name);
    window.alert(`套图模板「${name}」已保存`);
  };

  const handleLoadTemplate = () => {
    const templates = editorStore.getState().taotuTemplates;
    if (!templates.length) {
      window.alert('暂无保存的套图模板');
      return;
    }
    const names = templates.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
    const input = window.prompt(`已保存的套图模板：\n${names}\n\n请输入编号加载：`, '1');
    if (!input) return;
    const idx = parseInt(input, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= templates.length) return;
    editorStore.loadTaotuTemplate(templates[idx].id);
    window.alert(`已加载套图模板：${templates[idx].name}`);
  };

  const handleDeleteTemplate = () => {
    const templateId = window.prompt('请输入要删除的套图模板ID（在控制台查看）：');
    if (!templateId) return;
    editorStore.deleteTaotuTemplate(templateId);
  };

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">📋</span>
          套图页面管理
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

      {/* Temlate save/load buttons */}
      <div className="row-start" style={{ marginBottom: 10 }}>
        <button className="button button-sm" onClick={handleSaveTemplate}>
          💾 保存套图模板
        </button>
        <button className="button button-sm" onClick={handleLoadTemplate}>
          📂 加载套图模板
        </button>
      </div>

      {/* Page Navigation */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {state.taotuPages.map((page, index) => (
          <div
            key={page.id}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${index === state.taotuActivePage ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: index === state.taotuActivePage ? 'var(--color-accent-subtle)' : 'var(--color-bg-tertiary)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: index === state.taotuActivePage ? 600 : 400,
              color: 'var(--color-text-primary)',
              transition: 'all var(--transition-fast)',
            }}
            onClick={() => handleSwitchPage(index)}
          >
            {renameIndex === index ? (
              <input
                className="input"
                style={{ width: 60, padding: '2px 4px', fontSize: 11 }}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameConfirm}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameConfirm();
                  if (e.key === 'Escape') setRenameIndex(null);
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span onDoubleClick={() => handleRenameStart(index, page.name)}>
                {page.name || `页面${index + 1}`}
              </span>
            )}
            {state.taotuPages.length > 1 && (
              <button
                className="icon-button"
                style={{ width: 16, height: 16, fontSize: 10, lineHeight: '16px', padding: 0, border: 'none', background: 'transparent', color: 'var(--color-error)', opacity: 0.6 }}
                onClick={(e) => { e.stopPropagation(); handleRemovePage(index); }}
                title="删除页面"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          className="button button-sm button-ghost"
          style={{ fontSize: 14, padding: '4px 8px' }}
          onClick={handleAddPage}
          title="添加页面"
        >
          +
        </button>
      </div>

      <div className="hint" style={{ marginBottom: 12, fontSize: 11 }}>
        套图共 {state.taotuPages.length} 页，当前第 {state.taotuActivePage + 1} 页。每页独立编辑，品牌设置全局生效。
      </div>

      {/* Brand Settings */}
      <div className="panel-subtitle">品牌设置</div>
      <div className="row-start" style={{ gap: 8 }}>
        <div className="field-stack" style={{ flex: 1 }}>
          <label className="field-label">主色</label>
          <input
            type="color"
            className="color-input"
            value={state.taotuBrand.primaryColor}
            onChange={(e) => handleBrandColorChange(e.target.value)}
          />
        </div>
        <div className="field-stack" style={{ flex: 2 }}>
          <label className="field-label">字体</label>
          <select
            className="input"
            value={state.taotuBrand.font}
            onChange={(e) => handleBrandFontChange(e.target.value)}
            style={{ fontSize: 12 }}
          >
            <option value="Microsoft YaHei">微软雅黑</option>
            <option value="SimSun">宋体</option>
            <option value="SimHei">黑体</option>
            <option value="KaiTi">楷体</option>
            <option value="FangSong">仿宋</option>
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="PingFang SC">苹方</option>
          </select>
        </div>
        <div className="field-stack">
          <label className="field-label">LOGO</label>
          <div className="row-start">
            <button className="button button-sm" onClick={handleLogoUpload}>
              {state.taotuBrand.logoDataUrl ? '更换' : '上传'}
            </button>
            {state.taotuBrand.logoDataUrl && (
              <button className="button button-sm button-danger" onClick={handleRemoveLogo}>
                清除
              </button>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleLogoFile}
          />
        </div>
      </div>
      {state.taotuBrand.logoDataUrl && (
        <img
          src={state.taotuBrand.logoDataUrl}
          alt="LOGO"
          style={{ maxWidth: 80, maxHeight: 40, marginTop: 6, borderRadius: 'var(--radius-sm)' }}
        />
      )}

      {/* Export Settings */}
      <div className="panel-subtitle">导出设置</div>
      <div className="row-start" style={{ gap: 8 }}>
        <div className="field-stack">
          <label className="field-label">前缀</label>
          <input
            className="input"
            type="text"
            value={state.taotuExportPrefix}
            onChange={(e) => editorStore.setTaotuExportPrefix(e.target.value)}
            style={{ width: 70, fontSize: 12 }}
          />
        </div>
        <div className="field-stack">
          <label className="field-label">每页出图</label>
          <input
            className="input"
            type="number"
            min={1}
            value={state.taotuPerPageCopies}
            onChange={(e) => editorStore.setTaotuPerPageCopies(Number(e.target.value) || 1)}
            style={{ width: 50, fontSize: 12 }}
          />
        </div>
        <div className="field-stack" style={{ alignSelf: 'flex-end' }}>
          <button className="button button-primary button-sm" onClick={handleTaotuExport}>
            🚀 导出套图
          </button>
        </div>
      </div>

      {/* Replicate */}
      <div className="panel-subtitle">🔄 复刻商品</div>
      <div className="hint" style={{ marginBottom: 8, fontSize: 11 }}>
        将当前套图版式应用到其他商品素材，每款商品生成一套完整套图。
      </div>
      <div className="row-start" style={{ gap: 6 }}>
        <button className="button button-sm" onClick={handleReplicateSources}>
          📁 选择复刻素材
        </button>
        <button className="button button-primary button-sm" onClick={handleReplicateRun}>
          🚀 开始复刻
        </button>
        {state.taotuReplicateSources.length > 0 && (
          <button className="button button-sm button-danger" onClick={handleClearReplicate}>
            清除
          </button>
        )}
      </div>
      <input
        ref={replicateInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleReplicateFiles}
      />
      <div className="hint" style={{ marginTop: 6, fontSize: 11 }}>
        {state.taotuReplicateSources.length > 0
          ? `已选择 ${state.taotuReplicateSources.length} 个商品素材`
          : '暂未选择复刻素材'}
      </div>

      {/* Replicate source thumbnails */}
      {state.taotuReplicateSources.length > 0 && (
        <div className="thumb-list" style={{ marginTop: 8 }}>
          {state.taotuReplicateSources.map((src) => (
            <div key={src.id} className="thumb-item" style={{ aspectRatio: '1/1' }}>
              <img
                src={src.dataUrl}
                alt={src.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
              />
              <div className="thumb-name">{src.name}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
