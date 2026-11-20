import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';

const IMAGE_TYPE_LABELS: Record<string, string> = {
  hero: '主图(Hero)',
  'pain-point': '痛点/卖点图',
  feature: '功能/结构图',
  'size-spec': '尺寸规格图',
  scene: '场景结果图',
  'value-diff': '差异化价值图',
  compare: '对比优势图',
  aplus: 'A+收束图',
  'price-a': '核价场景图A',
  'price-b': '核价场景图B',
};

function buildDetailHtml(state: ReturnType<typeof import('@/app/store/useEditorStore').useEditorStore>): string {
  const ad = state.aiDetail;
  const resultKeys = Object.keys(ad.imageTypeResults || {}).filter((k) => ad.imageTypeResults[k]);
  const images = resultKeys.map((key) => {
    const baseKey = key.includes('_') ? key.split('_').slice(0, -1).join('_') : key;
    return {
      label: IMAGE_TYPE_LABELS[baseKey] || baseKey,
      url: ad.imageTypeResults[key] || '',
    };
  }).filter((i) => i.url);

  const title = ad.productIdentity?.nameCn || ad.productName || '商品详情';
  const copyLines = [
    ad.productSummaryCn,
    ad.productSummaryEn,
    ...ad.coreSellingPoints.map((sp, i) => `${i + 1}. ${sp.point}`),
    ...ad.copyAngles.map((ca) => `${ca.angle}：${ca.description}`),
    ad.sceneStrategy,
  ].filter(Boolean);
  const copy = copyLines.join('\n');

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#333;background:#f5f5f5;max-width:800px;margin:0 auto}
.header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:40px 20px;text-align:center}
.header h1{font-size:28px;margin-bottom:8px}
.header p{font-size:14px;opacity:.9}
.content{padding:20px}
.img-block{margin-bottom:20px;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);background:#fff}
.img-block img{width:100%;display:block}
.img-label{padding:10px 16px;font-size:13px;font-weight:600;color:#555;background:#fafafa;border-bottom:1px solid #eee}
.copy-section{background:#fff;padding:20px;margin:20px 0;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.copy-section h2{font-size:18px;margin-bottom:12px;color:#764ba2}
.copy-section p{font-size:14px;line-height:1.8;white-space:pre-wrap}
.footer{text-align:center;padding:20px;color:#999;font-size:12px}
</style>
</head>
<body>
<div class="header"><h1>${title}</h1><p>电商详情页</p></div>
<div class="content">
${copy ? `<div class="copy-section"><h2>商品介绍</h2><p>${copy}</p></div>` : ''}
${images.map((img) => `<div class="img-block"><div class="img-label">${img.label}</div><img src="${img.url}" alt="${img.label}"></div>`).join('\n')}
</div>
<div class="footer">由电商排版大师生成</div>
</body>
</html>`;
}

export function AiDetailWorkspace() {
  const state = useEditorStore();
  const raw = state.aiDetail;
  if (!raw) return <div className="empty-state" style={{padding: 60}}><div className="empty-state-icon">🪄</div><div className="hint">AI详情图数据加载中…</div></div>;

  // Normalize old field types to new structure
  const ad = {
    ...raw,
    selectedImageTypes: raw.selectedImageTypes || [],
    imageTypeCounts: raw.imageTypeCounts || {},
    imageTypePrompts: raw.imageTypePrompts || {},
    imageTypeStatuses: raw.imageTypeStatuses || {},
    imageTypeResults: raw.imageTypeResults || {},
    referenceImages: raw.referenceImages || [],
    variableRows: raw.variableRows || [],
    generationMode: raw.generationMode || 'generate',
    imageRatio: raw.imageRatio || '1:1',
    generateCount: raw.generateCount || 1,
    perTypeCount: raw.perTypeCount || 1,
    productName: raw.productName || '',
    sellingPoints: raw.sellingPoints || '',
    tone: raw.tone || '',
    constraints: raw.constraints || '',
    extraRequirements: raw.extraRequirements || '',
    variableCsv: raw.variableCsv || '',
    variableMode: raw.variableMode || false,
    replicateAnalysis: raw.replicateAnalysis || '',
    productSummaryCn: raw.productSummaryCn || (raw as any).productSummary || '',
    productSummaryEn: raw.productSummaryEn || '',
    targetAudienceSegments: Array.isArray(raw.targetAudienceSegments) ? raw.targetAudienceSegments : (raw as any).targetAudience ? [{ label: (raw as any).targetAudience, description: '' }] : [],
    useScenarios: Array.isArray(raw.useScenarios) ? raw.useScenarios : (raw as any).useScenarios ? [{ label: (raw as any).useScenarios, description: '' }] : [],
    toneDirection: raw.toneDirection || '',
    titleSuggestions: Array.isArray(raw.titleSuggestions) ? raw.titleSuggestions : [],
    coreSellingPoints: Array.isArray(raw.coreSellingPoints) ? raw.coreSellingPoints : [],
    copyAngles: Array.isArray(raw.copyAngles) ? raw.copyAngles : [],
    sceneStrategy: raw.sceneStrategy || '',
    complianceNotes: raw.complianceNotes || '',
    productIdentity: raw.productIdentity ? {
      nameCn: raw.productIdentity.nameCn || (raw.productIdentity as any).name || '',
      nameEn: raw.productIdentity.nameEn || '',
      categoryCn: raw.productIdentity.categoryCn || (raw.productIdentity as any).category || '',
      categoryEn: raw.productIdentity.categoryEn || '',
      materialCn: raw.productIdentity.materialCn || (raw.productIdentity as any).material || '',
      materialEn: raw.productIdentity.materialEn || '',
      colorCn: raw.productIdentity.colorCn || (raw.productIdentity as any).color || '',
      colorEn: raw.productIdentity.colorEn || '',
      sizeCn: raw.productIdentity.sizeCn || (raw.productIdentity as any).size || '',
      sizeEn: raw.productIdentity.sizeEn || '',
    } : null,
    completedCount: raw.completedCount || 0,
    failedCount: raw.failedCount || 0,
    status: raw.status || 'idle',
  };

  const selectedTypes = ad.selectedImageTypes;
  const selectedCount = selectedTypes.length;
  const totalImages = selectedTypes.reduce(
    (sum, key) => sum + (ad.imageTypeCounts[key] ?? 1),
    0
  );
  const sellingPointsCost = 3;
  const totalCost = totalImages + sellingPointsCost;
  const balance = 100 - totalCost;

  const isRunning = ad.status === 'analyzing' || ad.status === 'generating';
  const isAnalyzed = ad.status === 'analyzed';
  const isDone = ad.status === 'done';

  return (
    <main className="ai-detail-workspace" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* 顶部信息条 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--color-bg-primary)',
          borderBottom: '1px solid var(--color-border)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          已选{selectedCount}类 · 共{selectedCount}张 · 卖点{sellingPointsCost} · 出图{totalImages} · 合计{totalCost} · 余额{balance}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRunning && (
            <span style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 600 }}>
              ⏳ 分析中...
            </span>
          )}
          {isDone && (
            <>
              <span style={{ fontSize: 12, color: 'var(--color-success, #10b981)', fontWeight: 600 }}>
                ✅ 已完成
              </span>
              <button
                className="button button-sm button-primary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={async () => {
                  const html = buildDetailHtml(state);
                  const rootDir = await window.fanDesktop.file.pickDirectory();
                  if (!rootDir) return;
                  const dataUrl = `data:text/html;base64,${btoa(unescape(encodeURIComponent(html)))}`;
                  await window.fanDesktop.export.writeJobs({
                    rootDir,
                    jobs: [{
                      folder: '详情页导出',
                      fileName: `${(ad.productName || 'detail').slice(0, 20)}_详情页.html`,
                      dataUrl
                    }]
                  });
                  window.alert('详情页 HTML 导出完成！');
                }}
              >
                导出详情页
              </button>
            </>
          )}
          {ad.status === 'idle' && (
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              就绪
            </span>
          )}
          {isAnalyzed && (
            <span style={{ fontSize: 12, color: 'var(--color-accent, #7c3aed)', fontWeight: 600 }}>
              ✅ 分析完成，等待生成
            </span>
          )}
        </div>
      </header>

      {/* 分析状态追踪 */}
      {isRunning && (
        <section style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <div className="result-card" style={{ padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>状态</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)' }}>分析中</div>
            </div>
            <div className="result-card" style={{ padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>已完成</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ad.completedCount ?? 0}</div>
            </div>
            <div className="result-card" style={{ padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>失败</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ad.failedCount ?? 0}</div>
            </div>
            <div className="result-card" style={{ padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>目标尺寸</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ad.imageRatio}</div>
            </div>
          </div>

          {/* 进度条 */}
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: 'var(--color-border)',
              overflow: 'hidden',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, ((ad.completedCount ?? 0) / Math.max(1, selectedCount)) * 100)}%`,
                borderRadius: 3,
                background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {/* 日志 */}
          <div
            style={{
              maxHeight: 120,
              overflow: 'auto',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.8,
            }}
          >
            {['正在识别商品并整理卖点...', '分析商品类目与材质...', '提取目标人群特征...', '生成使用场景描述...', '开始生成详情图...'].map(
              (log, i) => (
                <div key={i} style={{ opacity: i <= (ad.completedCount ?? 0) ? 1 : 0.5 }}>
                  {i <= (ad.completedCount ?? 0) ? '✅' : '⏳'} {log}
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* 结果区域：左卖点 + 右图片 */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 0,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* 左栏：分析结果 */}
        <aside
          style={{
            borderRight: '1px solid var(--color-border)',
            padding: '12px',
            overflow: 'auto',
            background: 'var(--color-bg-primary)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>商品分析与文案方向</div>

          {/* 1. 产品总结（中英） */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>产品总结</div>
            <div style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              {ad.productSummaryEn || ad.productName || '等待分析...'}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              {ad.productSummaryCn || ad.sellingPoints || ''}
            </div>
          </div>

          {/* 2. 商品识别（5字段中英双语） */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>商品识别</div>
            {[
              { label: '商品名称', en: ad.productIdentity?.nameEn, cn: ad.productIdentity?.nameCn },
              { label: '商品类目', en: ad.productIdentity?.categoryEn, cn: ad.productIdentity?.categoryCn },
              { label: '材质/质感', en: ad.productIdentity?.materialEn, cn: ad.productIdentity?.materialCn },
              { label: '颜色/外观', en: ad.productIdentity?.colorEn, cn: ad.productIdentity?.colorCn },
              { label: '尺寸判断', en: ad.productIdentity?.sizeEn, cn: ad.productIdentity?.sizeCn },
            ].map((row) => (
              <div key={row.label} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 1 }}>{row.label}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>{row.en || ad.productName || '-'}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{row.cn || '-'}</div>
              </div>
            ))}
          </div>

          {/* 3. 目标人群（分段+标签） */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>目标人群</div>
            {(ad.targetAudienceSegments?.length
              ? ad.targetAudienceSegments
              : [{ label: ad.tone || '等待分析...', description: '' }]
            ).map((seg, i) => (
              <div key={i} style={{ marginBottom: i < (ad.targetAudienceSegments?.length || 1) - 1 ? 8 : 0 }}>
                <span className="badge badge-blue" style={{ marginBottom: 2, display: 'inline-block', fontSize: 10 }}>{seg.label}</span>
                {seg.description ? (
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{seg.description}</div>
                ) : null}
              </div>
            ))}
          </div>

          {/* 4. 使用场景 */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>使用场景</div>
            {(ad.useScenarios?.length
              ? ad.useScenarios
              : [{ label: ad.extraRequirements || '等待分析...', description: '' }]
            ).map((sc, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--color-text-primary)', marginBottom: 3 }}>
                • {sc.label}
              </div>
            ))}
          </div>

          {/* 5. 语气方向 */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>语气方向</div>
            <div style={{ fontSize: 11, color: ad.toneDirection ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
              {ad.toneDirection || '等待分析...'}
            </div>
          </div>

          {/* 6. 标题建议（3版本） */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>标题建议</div>
            {ad.titleSuggestions.length > 0
              ? ad.titleSuggestions.map((t, i) => (
                  <div key={i} style={{ marginBottom: i < ad.titleSuggestions.length - 1 ? 8 : 0 }}>
                    <span className="badge badge-gray" style={{ fontSize: 9, marginBottom: 2, display: 'inline-block' }}>{t.type}</span>
                    <div style={{ fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{t.text}</div>
                  </div>
                ))
              : <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>等待分析...</div>
            }
          </div>

          {/* 7. 核心卖点 */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>核心卖点</div>
            {ad.coreSellingPoints.length > 0
              ? ad.coreSellingPoints.map((sp, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--color-text-primary)', marginBottom: 3, lineHeight: 1.5 }}>
                    {i + 1}. {sp.point}
                  </div>
                ))
              : <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>等待分析...</div>
            }
          </div>

          {/* 8. 文案角度 */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>文案角度</div>
            {ad.copyAngles.length > 0
              ? ad.copyAngles.map((ca, i) => (
                  <div key={i} style={{ marginBottom: i < ad.copyAngles.length - 1 ? 6 : 0 }}>
                    <span className="badge badge-blue" style={{ fontSize: 9, marginBottom: 2, display: 'inline-block' }}>{ca.angle}</span>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{ca.description}</div>
                  </div>
                ))
              : <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>等待分析...</div>
            }
          </div>

          {/* 9. 场景策略 */}
          <div className="result-card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>场景策略</div>
            <div style={{ fontSize: 11, color: ad.sceneStrategy ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {ad.sceneStrategy || '等待分析...'}
            </div>
          </div>

          {/* 10. 合规提醒 */}
          <div className="result-card" style={{ border: '1px dashed var(--color-warning)', background: 'var(--color-warning-bg, #fff8e1)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-warning)', marginBottom: 4 }}>合规提醒</div>
            <div style={{ fontSize: 11, color: ad.complianceNotes ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {ad.complianceNotes || '等待分析...'}
            </div>
          </div>
        </aside>

        {/* 右栏：图片结果 */}
        <section style={{ padding: '12px 16px', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>详情图输出</span>
            {isDone && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="button button-sm" style={{ fontSize: 10, padding: '3px 8px' }}
                  onClick={async () => {
                    const rootDir = await window.fanDesktop.file.pickDirectory();
                    if (!rootDir) return;
                    const jobs = Object.entries(ad.imageTypeResults || {}).filter(([, url]) => url).map(([key, url]) => {
                      const baseKey = key.includes('_') ? key.split('_').slice(0, -1).join('_') : key;
                      return { folder: '详情图批量导出', fileName: `${IMAGE_TYPE_LABELS[baseKey] || baseKey}_${key}.jpg`, dataUrl: url };
                    });
                    if (!jobs.length) { window.alert('没有可导出的图片'); return; }
                    await window.fanDesktop.export.writeJobs({ rootDir, jobs });
                    window.alert(`已导出 ${jobs.length} 张图`);
                  }}>📥 全部下载</button>
                <button className="button button-sm" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--color-error)' }}
                  onClick={() => {
                    const st = { ...(ad.imageTypeStatuses || {}) };
                    const rs = { ...(ad.imageTypeResults || {}) };
                    let removed = 0;
                    Object.keys(st).forEach((k) => { if (st[k] === 'failed') { delete st[k]; delete rs[k]; removed++; } });
                    editorStore.patch({ aiDetail: { ...state.aiDetail, imageTypeStatuses: st, imageTypeResults: rs } });
                    if (removed) window.alert(`已清理 ${removed} 张失败图`);
                  }}>🗑 清理失败</button>
              </div>
            )}
          </div>

          {/* 生成提示词查看 */}
          {isDone && Object.keys(ad.imageTypePrompts || {}).length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 0' }}>
                查看生成提示词（点击展开）
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {Object.entries(ad.imageTypePrompts || {}).map(([key, prompt]) => (
                  <div key={key} className="result-card" style={{ padding: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-accent)', marginBottom: 4 }}>
                      {IMAGE_TYPE_LABELS[key.includes('_') ? key.split('_').slice(0, -1).join('_') : key] || key}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', lineHeight: 1.5, wordBreak: 'break-all', maxHeight: 80, overflow: 'auto' }}>
                      {prompt}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {selectedTypes.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-state-icon">🖼️</div>
              <div className="hint">请在左侧选择需要生成的图片类型</div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 10,
              }}
            >
              {(ad.variableRows?.length > 1
                ? Object.keys(ad.imageTypeStatuses || {}).filter((k) => selectedTypes.some((tk) => k === tk || k.startsWith(tk + '_')))
                : selectedTypes
              ).map((key) => {
                const baseTypeKey = key.includes('_') ? key.split('_').slice(0, -1).join('_') : key;
                const typeStatus = ad.imageTypeStatuses?.[key] ?? 'pending';
                const typeResult = ad.imageTypeResults?.[key];
                return (
                  <div
                    key={key}
                    className="result-card"
                    style={{
                      padding: 0,
                      overflow: 'hidden',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {/* 类型标题 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: 'var(--color-bg-primary)',
                        borderBottom: '1px solid var(--color-border)',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <span>{IMAGE_TYPE_LABELS[baseTypeKey] || baseTypeKey}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          background:
                            typeStatus === 'done'
                              ? 'var(--color-success-bg, #d1fae5)'
                              : typeStatus === 'running'
                                ? 'var(--color-accent-bg, #fff3e0)'
                                : typeStatus === 'failed'
                                  ? 'var(--color-danger-bg, #fee2e2)'
                                  : 'var(--color-bg-secondary)',
                          color:
                            typeStatus === 'done'
                              ? 'var(--color-success, #10b981)'
                              : typeStatus === 'running'
                                ? 'var(--color-accent, #f59e0b)'
                                : typeStatus === 'failed'
                                  ? 'var(--color-danger, #ef4444)'
                                  : 'var(--color-text-secondary)',
                        }}
                      >
                        {typeStatus === 'done'
                          ? 'Done'
                          : typeStatus === 'running'
                            ? 'Running'
                            : typeStatus === 'failed'
                              ? 'Failed'
                              : 'Pending'}
                      </span>
                    </div>

                    {/* 结果占位 */}
                    <div
                      style={{
                        aspectRatio: ad.imageRatio === '16:9' ? '16/9' : ad.imageRatio === '9:16' ? '9/16' : ad.imageRatio === '4:5' ? '4/5' : ad.imageRatio === '3:4' ? '3/4' : '1/1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--color-bg-primary)',
                        color: 'var(--color-text-secondary)',
                        fontSize: 12,
                      }}
                    >
                      {typeResult ? (
                        <img
                          src={typeResult}
                          alt={IMAGE_TYPE_LABELS[baseTypeKey] || baseTypeKey}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span>{typeStatus === 'running' ? '⏳ 生成中...' : '等待生成'}</span>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    {typeStatus === 'done' && (
                      <div style={{ display: 'flex', gap: 2, padding: '4px 6px' }}>
                        <button className="button button-sm" style={{ flex: 1, fontSize: 9, padding: '2px 4px' }}
                          onClick={async () => {
                            const imgUrl = ad.imageTypeResults?.[key];
                            if (!imgUrl) return;
                            const link = document.createElement('a');
                            link.href = imgUrl;
                            link.download = `${IMAGE_TYPE_LABELS[baseTypeKey] || baseTypeKey}_${key}.jpg`;
                            link.click();
                          }}>⬇</button>
                        <button className="button button-sm" style={{ flex: 1, fontSize: 9, padding: '2px 4px', color: 'var(--color-accent)' }}
                          onClick={async () => {
                            const st = editorStore.getState();
                            const refs = st.sourceAssets.filter((a: any) => a.selected).map((a: any) => a.previewUrl);
                            const prompt = ad.imageTypePrompts?.[key] || '';
                            const img = refs[0];
                            if (!img || !prompt) { window.alert('缺少素材图或提示词'); return; }
                            editorStore.patch({ aiDetail: { ...st.aiDetail, imageTypeStatuses: { ...(st.aiDetail.imageTypeStatuses || {}), [key]: 'running' } } });
                            try {
                              const url = await window.fanDesktop.llm.generateImage({ prompt, referenceImages: [img] });
                              const resultUrl = (url as any)?.images?.[0]?.dataUrl || (url as any)?.images?.[0]?.url;
                              if (resultUrl) {
                                editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, imageTypeStatuses: { ...(editorStore.getState().aiDetail.imageTypeStatuses || {}), [key]: 'done' }, imageTypeResults: { ...(st.aiDetail.imageTypeResults || {}), [key]: resultUrl } } });
                              } else { editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, imageTypeStatuses: { ...(editorStore.getState().aiDetail.imageTypeStatuses || {}), [key]: 'done' } } }); }
                            } catch { editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, imageTypeStatuses: { ...(editorStore.getState().aiDetail.imageTypeStatuses || {}), [key]: 'failed' } } }); }
                          }}>🔄</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 生成历史 */}
          {(ad.generationHistory || []).length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 0' }}>
                生成历史（{(ad.generationHistory || []).length} 次）
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {(ad.generationHistory || []).slice().reverse().map((h: any, hi: number) => (
                  <div key={hi} className="result-card" style={{ padding: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                      {new Date(h.time).toLocaleString()} · {Object.keys(h.results || {}).filter((k: string) => h.results[k]).length} 张成功
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {Object.entries(h.results || {}).filter(([, url]: any) => url).slice(0, 5).map(([key, url]: any) => (
                        <img key={key} src={url} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--color-border)', cursor: 'pointer' }}
                          onClick={() => {
                            editorStore.patch({ aiDetail: { ...state.aiDetail, imageTypeResults: { ...(h.results || {}) } } });
                          }} title="点击恢复此版本" />
                      ))}
                    </div>
                    {Object.keys(h.results || {}).filter((k: string) => (h.results || {})[k]).length > 5 && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>+{Object.keys(h.results || {}).filter((k: string) => (h.results || {})[k]).length - 5} 张...</div>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      </section>
    </main>
  );
}
