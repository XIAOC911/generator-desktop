import { useEffect, useMemo, useRef, useState } from 'react';
import { SourcePanel } from '@/components/panels/SourcePanel';
import { MattingPanel } from '@/components/panels/MattingPanel';
import { AttachmentPanel } from '@/components/panels/AttachmentPanel';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import { mattingService } from '@/services/matting.service';
import type { MattingProviderStatus } from '@/core/models/matting';

interface SidebarProps {
  compact?: boolean;
}

export function Sidebar({ compact }: SidebarProps) {
  // 精确订阅：仅需要计数
  const selectedCount = useEditorStore((s) => s.sourceAssets.filter((a) => a.selected).length);
  const successCount = useEditorStore((s) => s.sourceAssets.filter((a) => a.mattingStatus === 'success').length);

  const [collapsedPanels, setCollapsedPanels] = useState({
    source: false,
    batch: false,
    matting: true,
    attachment: true,
    templates: true,
  });
  const [running, setRunning] = useState(false);
  const [providerStatus, setProviderStatus] = useState<MattingProviderStatus[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const providers = await mattingService.getProviderStatus();
        setProviderStatus(providers);
      } catch {
        // provider status unavailable
      }
    })();
  }, []);

  const defaults = useMemo(() => mattingService.getOptions(), []);
  const activeProvider = providerStatus.find((item) => item.id === defaults.provider);

  const announceBatchResult = (
    title: string,
    result: { success: number; failed: number; stopped?: number; replacedRefs: number; total: number }
  ) => {
    if (!result.total) return;
    const parts: string[] = [`${title}完成：成功 ${result.success} 张，失败 ${result.failed} 张`];
    if (result.stopped && result.stopped > 0) {
      parts.push(`，已停止（剩余 ${result.stopped} 张未处理）`);
    }
    parts.push('。');
    if (result.replacedRefs > 0) {
      parts.push(`\n已自动同步替换画布中的 ${result.replacedRefs} 处同源引用。`);
    }
    window.alert(parts.join(''));
  };

  const togglePanel = (key: keyof typeof collapsedPanels) => {
    setCollapsedPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div className="sidebar-content">
        <SourcePanel
          compact={compact}
          collapsed={collapsedPanels.source}
          onToggleCollapse={() => togglePanel('source')}
        />

        {/* 批量抠图操作 — 提取到 PSD 模板上方 */}
        <section className={`panel-card ${collapsedPanels.batch ? 'panel-collapsed' : ''}`}>
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-title-icon">✂️</span>
              批量抠图
            </div>
            <button
              className="icon-button panel-collapse-toggle"
              type="button"
              onClick={() => togglePanel('batch')}
              title={collapsedPanels.batch ? '展开' : '收起'}
            >
              {collapsedPanels.batch ? '▸' : '▾'}
            </button>
          </div>

          <div className="result-card">
            <div className="result-row">
              <span className="result-label">已选素材</span>
              <span className="result-value">{selectedCount} 张</span>
            </div>
            <div className="result-row">
              <span className="result-label">已抠图</span>
              <span className="result-value result-value-strong" style={{ color: successCount > 0 ? 'var(--color-success)' : undefined }}>
                {successCount} 张
              </span>
            </div>
          </div>

          <div className="row-start" style={{ marginTop: 8 }}>
            <button
              className="button button-primary"
              disabled={running || selectedCount === 0 || activeProvider?.available === false}
              onClick={async () => {
                const controller = new AbortController();
                abortRef.current = controller;
                setRunning(true);
                try {
                  const allCut = selectedCount > 0 && selectedCount === successCount;
                  // 不传 options，由 cutoutAsset 内部从 sessionOptions 读取最新参数
                  const result = await mattingService.cutoutSelectedAssets({}, controller.signal);
                  announceBatchResult(allCut ? '重抠' : '抠图', result);
                } finally {
                  abortRef.current = null;
                  setRunning(false);
                }
              }}
            >
              {running ? '处理中…' : selectedCount > 0 && selectedCount === successCount ? '重抠' : '抠图'}
            </button>
            {running && (
              <button className="button button-danger" onClick={() => {
                abortRef.current?.abort();
                // 立即重置所有 pending 素材状态，避免 UI 卡在"处理中"
                mattingService.cancelAllPending();
              }}>
                停止抠图
              </button>
            )}
            <button className="button" disabled={running || successCount === 0} onClick={() => {
              const result = mattingService.restoreSelectedAssets();
              if (!result.restored) {
                window.alert('当前没有可还原的已抠图素材。');
                return;
              }
              window.alert(
                `已还原 ${result.restored} 张素材。` +
                  (result.replacedRefs > 0 ? `\n并已同步恢复画布中的 ${result.replacedRefs} 处同源引用。` : '')
              );
            }}>
              还原
            </button>
            <button className="button" disabled={running || successCount === 0} onClick={() => void mattingService.downloadProcessedCutouts()}>
              下载
            </button>
          </div>
        </section>

        <MattingPanel
          compact={compact}
          collapsed={collapsedPanels.matting}
          onToggleCollapse={() => togglePanel('matting')}
        />
        <AttachmentPanel
          compact={compact}
          collapsed={collapsedPanels.attachment}
          onToggleCollapse={() => togglePanel('attachment')}
        />

        {/* 模板库管理 */}
        <section className={`panel-card ${collapsedPanels.templates ? 'panel-collapsed' : ''}`}>
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-title-icon">🗂️</span>
              模板库管理
            </div>
            <button
              className="icon-button panel-collapse-toggle"
              type="button"
              onClick={() => togglePanel('templates')}
              title={collapsedPanels.templates ? '展开' : '收起'}
            >
              {collapsedPanels.templates ? '▸' : '▾'}
            </button>
          </div>
          <div className="hint" style={{ marginBottom: 8, fontSize: 11 }}>
            导出所有模板为 JSON 文件，或从 JSON 文件导入模板库。
          </div>
          <div className="row-start">
            <button className="button button-sm" onClick={async () => {
              const state = editorStore.getState();
              const rootDir = await window.fanDesktop.file.pickDirectory();
              if (!rootDir) return;
              const payload = {
                version: 2,
                exportedAt: Date.now(),
                memoryTemplates: state.memoryTemplates,
                bgRotationTemplates: state.bgRotationTemplates,
                sceneCarouselTemplates: state.sceneCarouselTemplates,
                psdTemplates: state.psdTemplates,
              };
              const json = JSON.stringify(payload, null, 2);
              const dataUrl = `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
              await window.fanDesktop.export.writeJobs({
                rootDir,
                jobs: [{ folder: '模板库导出', fileName: `电商排版大师-模板库_${new Date().toISOString().slice(0, 10)}.json`, dataUrl }]
              });
              window.alert('模板库导出完成！');
            }}>
              导出模板库
            </button>
            <label className="button button-sm" style={{ cursor: 'pointer' }}>
              导入模板库
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const raw = await file.text();
                    const payload = JSON.parse(raw);
                    const nextMemory = Array.isArray(payload.memoryTemplates) ? payload.memoryTemplates : [];
                    const nextBg = Array.isArray(payload.bgRotationTemplates) ? payload.bgRotationTemplates : [];
                    const nextScene = Array.isArray(payload.sceneCarouselTemplates) ? payload.sceneCarouselTemplates : [];
                    const nextPsd = Array.isArray(payload.psdTemplates) ? payload.psdTemplates : [];
                    if (!nextMemory.length && !nextBg.length && !nextScene.length && !nextPsd.length) {
                      window.alert('导入文件里没有可用模板');
                      return;
                    }
                    if (!window.confirm('导入模板库会替换当前所有模板数据，是否继续？')) return;
                    editorStore.patch({
                      memoryTemplates: nextMemory,
                      bgRotationTemplates: nextBg,
                      sceneCarouselTemplates: nextScene,
                      psdTemplates: nextPsd,
                    }, { markDirty: false });
                    window.alert(`模板库导入成功！共 ${nextMemory.length + nextBg.length + nextScene.length + nextPsd.length} 个模板。`);
                  } catch (err) {
                    console.error('IMPORT_TEMPLATE_LIBRARY_FAILED', err);
                    window.alert('导入模板库失败，请确认文件格式正确。');
                  }
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </section>
      </div>
    </aside>
  );
}
