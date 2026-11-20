import { useState, useEffect } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import { llmService } from '@/services/llm.service';
import type { LLMSettings } from '@/core/models/llm';

interface AiDetailPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const IMAGE_TYPES = [
  { key: 'hero', label: '主图(Hero)', icon: '🖼️' },
  { key: 'pain-point', label: '痛点 / 卖点图', icon: '💡' },
  { key: 'feature', label: '功能 / 结构图', icon: '🔧' },
  { key: 'size-spec', label: '尺寸规格图', icon: '📐' },
  { key: 'scene', label: '场景结果图', icon: '🏞️' },
  { key: 'value-diff', label: '差异化价值图', icon: '⭐' },
  { key: 'compare', label: '对比优势图', icon: '⚖️' },
  { key: 'aplus', label: 'A+ 收束图', icon: '🏆' },
  { key: 'price-a', label: '核价场景图 A', icon: '💰' },
  { key: 'price-b', label: '核价场景图 B', icon: '💎' },
] as const;

const RATIOS = ['1:1', '4:5', '3:4', '16:9', '9:16'] as const;

const GENERATE_COUNTS = [1, 2, 4, 6];

const PRODUCT_MODES = [
  { value: 'single-multi-angle', label: '单品多角度' },
  { value: 'multi-variant', label: '多SKU变体' },
  { value: 'multi-product', label: '多商品组合' },
];

const PROMPT_PRESETS: Record<string, Record<string, string>> = {
  v1: {
    hero: '电商主图，纯白背景，产品居中高清展示，专业影棚灯光，无文字无logo，分辨率300dpi，产品占画面80%，阴影自然柔和',
    'pain-point': '电商详情页痛点卖点图，产品展示+痛点文字标注，信息图表风格，干净清晰排版，左图右文或上图下文布局，卖点用icon+简短文字表达',
    feature: '电商详情页功能结构图，产品爆炸图或剖面图风格，展示产品内部结构/材质/功能分区，标注清晰，科技感简约风格',
    'size-spec': '电商详情页尺寸规格图，产品三视图+尺寸标注，网格背景，标注线清晰，数据可视化风格，简约专业',
    scene: '电商详情页场景结果图，产品置于真实使用场景中，自然光线，生活方式摄影风格，展示产品使用效果，氛围感强',
    'value-diff': '电商详情页差异化价值图，产品核心优势对比展示，信息图风格，用视觉元素突出独特卖点，干净专业排版',
    compare: '电商详情页对比优势图，产品与竞品/传统方案并排对比，左边Before右边After风格，差异点用颜色标注，信息图表风格',
    aplus: 'A+内容收束图，品牌调性图，高级质感，展示品牌logo+产品全家福+核心slogan，类似亚马逊A+页面底部横幅风格',
    'price-a': '核价场景图，产品+价格对比展示，突出性价比，信息图表风格，展示产品配置/套餐/价格阶梯',
    'price-b': '核价场景图B版，产品+赠品/配件展示，突出附加值，礼盒开箱风格，展示所有配件和赠品',
  },
  v2: {
    hero: 'Feature [product] centrally in a clean, minimalistic background with natural light to make the product stand out. Ensure the product\'s key design elements (e.g., shape, color, material) are clearly visible and the focal point of the image. Avoid any unnecessary distractions in the background. The image should highlight the product\'s quality and functionality with no text or clutter. If applicable, use subtle lighting or shadows to enhance the product\'s texture and form.',
    'pain-point': 'Visually highlight common problems or challenges faced by users that [product] addresses. Use clear comparisons (e.g., before/after, problem/solution) to demonstrate how the product provides a better alternative. Focus on specific selling points, such as durability, comfort, convenience, or aesthetics, and how it improves the user\'s life or experience. Add external annotations or icons to enhance understanding while keeping the product image unaltered.',
    feature: 'Showcase the key features and functions of [product] with close-up shots or detailed illustrations. Use annotations or arrows to explain how each part of the product works, such as material, mechanisms, or adjustable components. For products with multiple uses, demonstrate the product in different configurations to highlight its versatility and practicality. Ensure the original product image remains clear, with external text and annotations used for clarity.',
    'size-spec': 'Provide a clear visual showing the size and specifications of [product]. Use multiple angles (front, side, top) and comparisons with everyday objects to show scale. Include the exact dimensions (height, width, depth) in both metric and imperial units. If relevant, display the product\'s weight and packaging information to give users a complete understanding of size and fit. The product image must remain unaltered, with text and overlays kept minimal.',
    scene: 'Place [product] in a relatable, real-life setting where a person or model interacts with it. Show how the product fits into daily life, leisure, or specific activities, depending on the product category. The model should naturally interact with the product, such as holding, playing with, or displaying it. Ensure the product remains the focal point, with the model\'s role enhancing the scene without overshadowing the product itself.',
    'value-diff': 'Create a visual comparison between [product] and competitor products, emphasizing what sets [product] apart. Highlight features like durability, design, or functionality, showing why it\'s a superior choice. Use side-by-side images or diagrams to emphasize the product\'s unique qualities and competitive edge. Ensure the product image remains unaltered, with annotations and icons used to highlight differences.',
    compare: 'Display [product] next to similar products, focusing on the advantages it offers in terms of quality, features, or design. Include visual markers like arrows or labels to compare aspects such as size, material, or ease of use. Clearly highlight the benefits of choosing [product] over alternatives, while ensuring the product image remains unchanged and clearly visible.',
    aplus: 'Summarize the key selling points of [product] in a visually appealing layout. Use a combination of small product shots, icons, and brief text to highlight essential features such as quality, functionality, size, or material. Ensure the image is clean and easy to digest, with no overcrowding, so users can easily absorb the key selling points of the product. The product image must remain intact with minimal external additions.',
    'price-a': 'Show [product] in a context that highlights its value for money. Display key features that demonstrate why the product justifies its price, such as high-quality materials, durability, or multi-functionality. If applicable, include any promotional offers or discounts to further highlight its affordability. Use a clean, simple layout to focus attention on the product\'s value while maintaining its original image.',
    'price-b': 'Feature [product] alongside customer reviews or satisfaction ratings to build trust. Show the product being used in a relatable environment, and highlight positive user experiences. Include any special offers, discounts, or promotional elements to encourage purchases, while maintaining a professional and clean design. The product image remains unchanged, with customer-focused content enhancing the narrative.',
  },
};

function getDefaultAiDetail() {
  return {
    selectedImageTypes: [] as string[],
    imageTypeCounts: {} as Record<string, number>,
    imageTypePrompts: {} as Record<string, string>,
    imageTypeStatuses: {} as Record<string, string>,
    imageTypeResults: {} as Record<string, string>,
    generationHistory: [] as any[],
    referenceImages: [] as any[],
    variableRows: [] as any[],
    generationMode: 'generate' as string,
    imageRatio: '1:1',
    generateCount: 1,
    perTypeCount: 1,
    productMode: 'single-multi-angle',
    country: 'US',
    productName: '',
    sellingPoints: '',
    tone: '',
    constraints: '',
    extraRequirements: '',
    variableCsv: '',
    multiSize: false,
    variableMode: false,
    replicateAnalysis: '',
    productSummaryCn: '',
    productSummaryEn: '',
    targetAudienceSegments: [] as any[],
    useScenarios: [] as any[],
    toneDirection: '',
    titleSuggestions: [] as any[],
    coreSellingPoints: [] as any[],
    copyAngles: [] as any[],
    sceneStrategy: '',
    complianceNotes: '',
    productIdentity: null as any,
    completedCount: 0,
    failedCount: 0,
    status: 'idle',
  };
}

/* ------------------------------------------------------------------ */
/*  shared button styles for the row selector group                   */
/* ------------------------------------------------------------------ */
const segBase: React.CSSProperties = {
  fontSize: 11,
  padding: '5px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  background: 'var(--color-bg-secondary)',
  cursor: 'pointer',
  transition: 'background 0.1s, border-color 0.1s',
};
const segActive: React.CSSProperties = {
  ...segBase,
  background: 'var(--color-accent-bg, #f3e8ff)',
  borderColor: 'var(--color-accent, #7c3aed)',
  color: 'var(--color-accent, #7c3aed)',
  fontWeight: 600,
};

/* ------------------------------------------------------------------ */
/*  component                                                         */
/* ------------------------------------------------------------------ */
export function AiDetailPanel({ compact, collapsed, onToggleCollapse }: AiDetailPanelProps) {
  const state = useEditorStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptPreset, setPromptPreset] = useState('v2');
  const [llmSettings, setLlmSettings] = useState<(LLMSettings & { hasApiKey: boolean }) | null>(null);

  const raw = state.aiDetail;
  if (!raw) return <div className="empty-state"><div className="empty-state-icon">🪄</div><div className="hint">AI详情图数据加载中…</div></div>;

  // normalize + defaults
  const ad = {
    ...raw,
    selectedImageTypes: raw.selectedImageTypes || [],
    imageTypeCounts: raw.imageTypeCounts || {},
    imageTypePrompts: raw.imageTypePrompts || {},
    imageTypeStatuses: raw.imageTypeStatuses || {},
    imageTypeResults: raw.imageTypeResults || {},
    generationHistory: raw.generationHistory || [],
    referenceImages: raw.referenceImages || [],
    variableRows: raw.variableRows || [],
    generationMode: raw.generationMode || 'generate',
    imageRatio: raw.imageRatio || '1:1',
    generateCount: raw.generateCount || 1,
    perTypeCount: raw.perTypeCount || 1,
    productMode: raw.productMode || 'single-multi-angle',
    country: raw.country || 'US',
    productName: raw.productName || '',
    sellingPoints: raw.sellingPoints || '',
    tone: raw.tone || '',
    constraints: raw.constraints || '',
    extraRequirements: raw.extraRequirements || '',
    variableCsv: raw.variableCsv || '',
    multiSize: raw.multiSize || false,
    variableMode: raw.variableMode || false,
    replicateAnalysis: raw.replicateAnalysis || '',
    productSummaryCn: raw.productSummaryCn || '',
    productSummaryEn: raw.productSummaryEn || '',
    targetAudienceSegments: raw.targetAudienceSegments || [],
    useScenarios: raw.useScenarios || [],
    toneDirection: raw.toneDirection || '',
    titleSuggestions: raw.titleSuggestions || [],
    coreSellingPoints: raw.coreSellingPoints || [],
    copyAngles: raw.copyAngles || [],
    sceneStrategy: raw.sceneStrategy || '',
    complianceNotes: raw.complianceNotes || '',
    productIdentity: raw.productIdentity || null,
    completedCount: raw.completedCount || 0,
    failedCount: raw.failedCount || 0,
    status: raw.status || 'idle',
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.fanDesktop?.llm) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await llmService.loadSettings();
        if (!cancelled) setLlmSettings(r.settings);
      } catch { /* unavailable */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---- helpers ---- */
  const selectedTypes = ad.selectedImageTypes;
  const selectedCount = selectedTypes.length;

  const toggleAll = () => {
    const next = selectedCount === IMAGE_TYPES.length ? [] : IMAGE_TYPES.map((t) => t.key);
    editorStore.patch({ aiDetail: { ...state.aiDetail, selectedImageTypes: next } });
  };

  const toggleType = (key: string) => {
    const next = selectedTypes.includes(key) ? selectedTypes.filter((k) => k !== key) : [...selectedTypes, key];
    editorStore.patch({ aiDetail: { ...state.aiDetail, selectedImageTypes: next } });
  };

  const setCount = (key: string, v: number) => {
    const n = Math.max(1, Math.min(9, v));
    editorStore.patch({ aiDetail: { ...state.aiDetail, imageTypeCounts: { ...state.aiDetail.imageTypeCounts, [key]: n } } });
  };
  const getCount = (key: string) => ad.imageTypeCounts[key] ?? 1;

  const totalImages = selectedTypes.reduce((s, k) => s + getCount(k), 0);

  const handleReset = () => {
    if (!window.confirm('确定要重置所有AI详情图设置吗？这将清空类型选择、提示词、商品信息等。')) return;
    editorStore.patch({ aiDetail: { ...state.aiDetail, ...getDefaultAiDetail() } });
    setPromptPreset('v2');
  };

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      {/* ---- header ---- */}
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">🪄</span>
          生成设置
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="button button-sm" onClick={handleReset} title="重置所有设置"
            style={{ fontSize: 10, padding: '2px 8px', color: 'var(--color-text-secondary)' }}>
            ↺ 重置
          </button>
          <button className="icon-button panel-collapse-toggle" type="button" onClick={onToggleCollapse} title={collapsed ? '展开' : '收起'}>
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/*  1. 生成模式                                                       */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
        <button
          style={ad.generationMode === 'generate' ? { ...segActive, flex: 1, borderRadius: '4px 0 0 4px' } : { ...segBase, flex: 1, borderRadius: '4px 0 0 4px' }}
          onClick={() => editorStore.patch({ aiDetail: { ...state.aiDetail, generationMode: 'generate' } })}>
          🪄 常规生成
        </button>
        <button
          style={ad.generationMode === 'replicate' ? { ...segActive, flex: 1, borderRadius: '0 4px 4px 0', borderLeft: 0 } : { ...segBase, flex: 1, borderRadius: '0 4px 4px 0', borderLeft: 0 }}
          onClick={() => editorStore.patch({ aiDetail: { ...state.aiDetail, generationMode: 'replicate' } })}>
          📸 复刻详情
        </button>
      </div>

      {/* 复刻模式 — 参考图上传 */}
      {ad.generationMode === 'replicate' && (
        <div style={{ marginBottom: 16, padding: 10, background: '#faf5ff', borderRadius: 6, border: '1px dashed #c4b5fd', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>上传参考详情图</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            上传一套已市场验证的详情图，AI 将分析其风格并复刻。
          </div>
          <label style={{ display: 'inline-flex', cursor: 'pointer', padding: '4px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--color-border)', background: '#fff' }}>
            + 选择参考图
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => {
              const files = Array.from(e.target.files || []);
              const refs = files.map((f) => ({ id: Math.random().toString(36).slice(2, 10), name: f.name, dataUrl: URL.createObjectURL(f) }));
              editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, referenceImages: [...editorStore.getState().aiDetail.referenceImages, ...refs] } });
              e.target.value = '';
            }} />
          </label>
          {ad.referenceImages.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {ad.referenceImages.map((ref: any) => (
                <div key={ref.id} style={{ position: 'relative', width: 52, height: 52, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                  <img src={ref.dataUrl} alt={ref.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '0 0 0 4px', cursor: 'pointer', fontSize: 10, lineHeight: '16px' }}
                    onClick={() => editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, referenceImages: editorStore.getState().aiDetail.referenceImages.filter((r: any) => r.id !== ref.id) } })}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/*  2. 图像类型 — 核心交互，单列舒展                                    */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>图像类型</span>
        <button className="button button-sm" onClick={toggleAll} style={{ fontSize: 10, padding: '2px 10px' }}>
          {selectedCount === IMAGE_TYPES.length ? '取消全选' : '全选'}
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        {IMAGE_TYPES.map((item) => {
          const isSel = selectedTypes.includes(item.key);
          const cnt = getCount(item.key);
          return (
            <div
              key={item.key}
              onClick={() => toggleType(item.key)}
              role="button"
              tabIndex={0}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', marginBottom: 1,
                borderRadius: 4, cursor: 'pointer', fontSize: 12,
                border: isSel ? '1px solid var(--color-accent, #7c3aed)' : '1px solid transparent',
                background: isSel ? 'var(--color-accent-bg, #f3e8ff)' : 'transparent',
                transition: 'background 0.1s, border-color 0.1s',
              }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, opacity: isSel ? 1 : 0.5 }}>{item.icon}</span>
                <span style={{ fontWeight: isSel ? 600 : 400, color: isSel ? 'var(--color-accent, #7c3aed)' : 'var(--color-text-primary)' }}>
                  {item.label}
                </span>
              </span>
              {isSel ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={(e) => e.stopPropagation()}>
                  <button className="button" onClick={() => setCount(item.key, cnt - 1)} disabled={cnt <= 1}
                    style={{ width: 22, height: 22, padding: 0, fontSize: 14, lineHeight: '22px', textAlign: 'center' }}>−</button>
                  <span style={{ minWidth: 18, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{cnt}</span>
                  <button className="button" onClick={() => setCount(item.key, cnt + 1)} disabled={cnt >= 9}
                    style={{ width: 22, height: 22, padding: 0, fontSize: 14, lineHeight: '22px', textAlign: 'center' }}>+</button>
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>1</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/*  3. 比例 · 数量 — 内联选择器                                        */}
      {/* ================================================================ */}
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>比例与数量</div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        {RATIOS.map((r) => (
          <button key={r}
            style={ad.imageRatio === r ? { ...segActive, flex: 1 } : { ...segBase, flex: 1 }}
            onClick={() => editorStore.patch({ aiDetail: { ...state.aiDetail, imageRatio: r } })}>
            {r}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 3, flex: 1 }}>
          {GENERATE_COUNTS.map((n) => (
            <button key={n}
              style={ad.generateCount === n ? { ...segActive, flex: 1 } : { ...segBase, flex: 1 }}
              onClick={() => editorStore.patch({ aiDetail: { ...state.aiDetail, generateCount: n } })}>
              {n}张
            </button>
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>各类型</span>
        <input className="input" type="number" min={1} max={9} value={ad.perTypeCount}
          onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, perTypeCount: Math.max(1, Math.min(9, Number(e.target.value) || 1)) } })}
          style={{ width: 40, fontSize: 11, padding: '4px 6px', textAlign: 'center' }} />
        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>张</span>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 20, cursor: 'pointer' }}>
        <input type="checkbox" checked={ad.multiSize}
          onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, multiSize: e.target.checked } })} />
        一键多尺寸（选中比例各出一张）
      </label>

      {/* ================================================================ */}
      {/*  4. 商品信息                                                       */}
      {/* ================================================================ */}
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>商品信息</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <input className="input" value={ad.productName}
          onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, productName: e.target.value } })}
          placeholder="产品名" style={{ fontSize: 11, padding: '5px 8px' }} />
        <input className="input" value={ad.tone}
          onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, tone: e.target.value } })}
          placeholder="文案风格（如：高级感）" style={{ fontSize: 11, padding: '5px 8px' }} />
      </div>
      <input className="input" value={ad.sellingPoints}
        onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, sellingPoints: e.target.value } })}
        placeholder="卖点（如：补水、舒缓、清爽不黏腻）" style={{ fontSize: 11, padding: '5px 8px', marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button className="button button-sm" style={{ fontSize: 11, flex: 1 }}
          onClick={async () => {
            const srcs = editorStore.getState().sourceAssets.filter((a: any) => a.selected);
            if (!srcs.length) { window.alert('请先在素材管理中导入并勾选商品图片。'); return; }
            if (!llmSettings || (llmSettings.provider !== 'ollama' && !llmSettings.hasApiKey)) {
              window.alert('请先在AI助手Tab配置API Key。');
              return;
            }
            editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, status: 'analyzing' } });
            try {
              const urls = srcs.slice(0, 3).map((a: any) => a.previewUrl);
              const result = await llmService.recognizeProduct(urls, { ...llmSettings });
              editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail,
                productName: result.nameCn || result.nameEn,
                productIdentity: { nameCn: result.nameCn, nameEn: result.nameEn, categoryCn: result.categoryCn, categoryEn: result.categoryEn, materialCn: result.materialCn, materialEn: result.materialEn, colorCn: result.colorCn, colorEn: result.colorEn, sizeCn: result.sizeCn, sizeEn: result.sizeEn },
                productSummaryCn: result.summaryCn, productSummaryEn: result.summaryEn, status: 'idle' } });
              window.alert(`已识别：${result.nameCn || result.nameEn || '未知商品'}`);
            } catch (err: any) { window.alert(`识别失败：${err.message}`); editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, status: 'idle' } }); }
          }}>📸 拍照识别商品</button>
      </div>
      <textarea className="textarea" value={ad.extraRequirements}
        onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, extraRequirements: e.target.value } })}
        placeholder="补充要求（例如：背景阳光明媚，突出产品质感...）"
        rows={2} style={{ fontSize: 11, marginBottom: 20 }} />

      {/* ================================================================ */}
      {/*  5. 高级设置 — 可折叠，低频使用                                      */}
      {/* ================================================================ */}
      <div
        role="button" tabIndex={0}
        onClick={() => setAdvancedOpen(!advancedOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAdvancedOpen(!advancedOpen); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer', borderTop: '1px solid var(--color-border)', userSelect: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {advancedOpen ? '▾' : '▸'} 高级设置
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {ad.country === 'US' ? '美国' : ad.country} · {PRODUCT_MODES.find((m) => m.value === ad.productMode)?.label}
        </span>
      </div>
      {advancedOpen && (
        <div style={{ paddingBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2 }}>国家/语言</div>
              <select className="input" value={ad.country}
                onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, country: e.target.value } })}
                style={{ fontSize: 11, padding: '5px 8px', width: '100%' }}>
                <option value="US">美国 / English</option>
                <option value="JP">日本 / 日本語</option>
                <option value="DE">德国 / Deutsch</option>
                <option value="FR">法国 / Français</option>
                <option value="UK">英国 / English</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2 }}>商品模式</div>
              <select className="input" value={ad.productMode}
                onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, productMode: e.target.value } })}
                style={{ fontSize: 11, padding: '5px 8px', width: '100%' }}>
                {PRODUCT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <input className="input" value={ad.constraints}
            onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, constraints: e.target.value } })}
            placeholder="限制条件（如：不要夸张承诺）" style={{ fontSize: 11, padding: '5px 8px', marginBottom: 8 }} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={ad.variableMode}
              onChange={(e) => editorStore.patch({ aiDetail: { ...state.aiDetail, variableMode: e.target.checked } })} />
            启用批量变量替换（{'模板中用 {name} 占位'}）
          </label>
          {ad.variableMode && (
            <textarea className="textarea" value={ad.variableCsv} onChange={(e) => {
              const csv = e.target.value; const lines = csv.trim().split('\n').filter(Boolean);
              const headers = lines[0]?.split(',').map((h: string) => h.trim()) || [];
              const rows = lines.slice(1).map((line: string) => { const vals = line.split(',').map((v: string) => v.trim()); const row: Record<string, string> = {}; headers.forEach((h: string, i: number) => { row[h] = vals[i] || ''; }); return row; });
              editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, variableCsv: csv, variableRows: rows } });
            }} rows={3} placeholder={`name,color\n喷雾,白色\n面霜,蓝色`} style={{ fontSize: 11, fontFamily: 'monospace' }} />
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/*  6. 提示词模板 — 可折叠                                              */}
      {/* ================================================================ */}
      <div
        role="button" tabIndex={0}
        onClick={() => setPromptOpen(!promptOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPromptOpen(!promptOpen); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer', borderTop: '1px solid var(--color-border)', userSelect: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {promptOpen ? '▾' : '▸'} 提示词模板
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{selectedCount} 类已选</span>
      </div>
      {promptOpen && (
        <div style={{ paddingBottom: 12 }}>
          <select className="input" value={promptPreset} onChange={(e) => {
            const preset = e.target.value;
            setPromptPreset(preset);
            if (preset === 'v1' || preset === 'v2') {
              editorStore.patch({ aiDetail: { ...state.aiDetail, imageTypePrompts: { ...PROMPT_PRESETS[preset] } } });
            }
          }} style={{ fontSize: 11, marginBottom: 10 }}>
            <option value="v2">英文专业版</option>
            <option value="v1">中文简洁版</option>
            <option value="custom">自定义</option>
          </select>
          {selectedTypes.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>
              请先在上方选择图片类型
            </div>
          ) : (
            IMAGE_TYPES.filter((t) => selectedTypes.includes(t.key)).map((item) => (
              <div key={item.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3 }}>{item.icon} {item.label}</div>
                <textarea className="textarea" value={ad.imageTypePrompts[item.key] || ''}
                  onChange={(e) => {
                    setPromptPreset('custom');
                    editorStore.patch({ aiDetail: { ...state.aiDetail, imageTypePrompts: { ...state.aiDetail.imageTypePrompts, [item.key]: e.target.value } } });
                  }} rows={2} style={{ fontSize: 10 }} placeholder="输入自定义提示词…" />
              </div>
            ))
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/*  7. 底部操作 — 两阶段：先分析 → 再生成                                 */}
      {/* ================================================================ */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 11, color: 'var(--color-text-secondary)' }}>
          <span>已选 <strong>{selectedCount}</strong> 类 · 共 <strong>{totalImages}</strong> 张</span>
          <span>
            {ad.status === 'analyzed'
              ? <span style={{ color: 'var(--color-accent, #7c3aed)', fontWeight: 600 }}>分析完成，可生成</span>
              : <span>余额 <strong>{100 - totalImages - 3}</strong></span>
            }
          </span>
        </div>

        {/* ---- 阶段逻辑 ---- */}
        {ad.status === 'analyzing' || ad.status === 'generating' ? (
          /* 处理中 */
          <button className="button button-primary"
            style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, borderRadius: 6, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', color: '#fff', letterSpacing: '0.02em', opacity: 0.7, cursor: 'not-allowed' }}
            disabled>
            ⏳ {ad.status === 'analyzing' ? '分析中…' : '生成中…'}
          </button>
        ) : ad.status === 'analyzed' ? (
          /* 阶段二：已分析完成 → 点击生成图片 */
          <button className="button button-primary"
            style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, borderRadius: 6, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', color: '#fff', letterSpacing: '0.02em' }}
            onClick={async () => {
              if (!llmSettings) { window.alert('请先在「AI助手」Tab 中配置模型。'); return; }
              const sel = editorStore.getState().aiDetail;
              if (!sel) return;
              const refImages = editorStore.getState().sourceAssets.filter((a: any) => a.selected).slice(0, 3).map((a: any) => a.previewUrl);
              if (!refImages.length) { window.alert('请先在素材管理中导入并勾选商品图片。'); return; }
              const prompts = sel.imageTypePrompts || {};

              editorStore.patch({ aiDetail: { ...sel, status: 'generating', completedCount: 0, failedCount: 0 } });

              const ratioList = (sel as any).multiSize ? RATIOS : [sel.imageRatio || '1:1'];
              const st: Record<string, string> = {}; const rs: Record<string, string> = {}; const ps: Record<string, string> = {};
              const tasks: Array<{ key: string; imageUrl: string; prompt: string }> = [];
              for (const tk of sel.selectedImageTypes) {
                const n = sel.imageTypeCounts[tk] || sel.perTypeCount || 1;
                const pr = prompts[tk] || '';
                for (let vi = 0; vi < n; vi++) {
                  for (const ratio of ratioList) {
                    const ratioLabel = ratioList.length > 1 ? `_${ratio.replace(':', 'x')}` : '';
                    const key = n > 1 ? `${tk}_${vi}${ratioLabel}` : tk + ratioLabel;
                    st[key] = 'running'; ps[key] = pr;
                    tasks.push({ key, imageUrl: refImages[vi % refImages.length], prompt: pr + `。图片比例：${ratio}` });
                  }
                }
              }
              editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, imageTypeStatuses: { ...st }, imageTypePrompts: { ...ps } } });

              const results = await Promise.all(tasks.map(async ({ key, imageUrl, prompt }) => {
                try {
                  const url = await llmService.generateDetailImage({ productImageUrl: imageUrl, prompt, settings: { ...llmSettings } });
                  return { key, ok: !!url, url: url || '' };
                } catch { return { key, ok: false, url: '' }; }
              }));

              let ok = 0; let fail = 0;
              for (const r of results) {
                if (r.ok) { rs[r.key] = r.url; st[r.key] = 'done'; ok++; }
                else { st[r.key] = 'failed'; fail++; }
              }
              const final = editorStore.getState().aiDetail;
              editorStore.patch({ aiDetail: { ...final, imageTypeStatuses: { ...st }, imageTypeResults: { ...rs }, completedCount: ok, failedCount: fail, status: 'done', generationHistory: [...(final.generationHistory || []), { time: Date.now(), prompts: { ...ps }, results: { ...rs } }].slice(-10) } });
            }}>
            ✦ 生成图片（{totalImages}张）
          </button>
        ) : ad.status === 'done' ? (
          /* 已完成 → 可重新生成（跳过分析）或重新分析 */
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button button-primary"
              style={{ flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600, borderRadius: 6, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', color: '#fff', letterSpacing: '0.02em' }}
              onClick={async () => {
                if (!llmSettings) { window.alert('请先在「AI助手」Tab 中配置模型。'); return; }
                const sel = editorStore.getState().aiDetail;
                if (!sel) return;
                const refImages = editorStore.getState().sourceAssets.filter((a: any) => a.selected).slice(0, 3).map((a: any) => a.previewUrl);
                if (!refImages.length) { window.alert('请先在素材管理中导入并勾选商品图片。'); return; }
                const prompts = sel.imageTypePrompts || {};

                editorStore.patch({ aiDetail: { ...sel, status: 'generating', completedCount: 0, failedCount: 0 } });

                const ratioList = (sel as any).multiSize ? RATIOS : [sel.imageRatio || '1:1'];
                const st: Record<string, string> = {}; const rs: Record<string, string> = {}; const ps: Record<string, string> = {};
                const tasks: Array<{ key: string; imageUrl: string; prompt: string }> = [];
                for (const tk of sel.selectedImageTypes) {
                  const n = sel.imageTypeCounts[tk] || sel.perTypeCount || 1;
                  const pr = prompts[tk] || '';
                  for (let vi = 0; vi < n; vi++) {
                    for (const ratio of ratioList) {
                      const ratioLabel = ratioList.length > 1 ? `_${ratio.replace(':', 'x')}` : '';
                      const key = n > 1 ? `${tk}_${vi}${ratioLabel}` : tk + ratioLabel;
                      st[key] = 'running'; ps[key] = pr;
                      tasks.push({ key, imageUrl: refImages[vi % refImages.length], prompt: pr + `。图片比例：${ratio}` });
                    }
                  }
                }
                editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, imageTypeStatuses: { ...st }, imageTypePrompts: { ...ps } } });

                const results = await Promise.all(tasks.map(async ({ key, imageUrl, prompt }) => {
                  try {
                    const url = await llmService.generateDetailImage({ productImageUrl: imageUrl, prompt, settings: { ...llmSettings } });
                    return { key, ok: !!url, url: url || '' };
                  } catch { return { key, ok: false, url: '' }; }
                }));

                let ok = 0; let fail = 0;
                for (const r of results) {
                  if (r.ok) { rs[r.key] = r.url; st[r.key] = 'done'; ok++; }
                  else { st[r.key] = 'failed'; fail++; }
                }
                const final = editorStore.getState().aiDetail;
                editorStore.patch({ aiDetail: { ...final, imageTypeStatuses: { ...st }, imageTypeResults: { ...rs }, completedCount: ok, failedCount: fail, status: 'done', generationHistory: [...(final.generationHistory || []), { time: Date.now(), prompts: { ...ps }, results: { ...rs } }].slice(-10) } });
              }}>
              🔄 重新生成（{totalImages}张）
            </button>
            <button className="button"
              style={{ padding: '10px 14px', fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, status: 'idle' } })}>
              🔍 重新分析
            </button>
          </div>
        ) : (
          /* 阶段一：idle → 仅分析，不生成图片 */
          <button className="button button-primary"
            style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, borderRadius: 6, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', color: '#fff', letterSpacing: '0.02em' }}
            onClick={async () => {
              if (!llmSettings) { window.alert('请先在「AI助手」Tab 中配置模型。'); return; }
              const sel = editorStore.getState().aiDetail;
              if (!sel) return;
              const refImages = editorStore.getState().sourceAssets.filter((a: any) => a.selected).slice(0, 3).map((a: any) => a.previewUrl);
              if (!refImages.length) { window.alert('请先在素材管理中导入并勾选商品图片。'); return; }
              editorStore.patch({ aiDetail: { ...sel, status: 'analyzing', completedCount: 0, failedCount: 0 } });

              const isReplicate = sel.generationMode === 'replicate' && sel.referenceImages.length > 0;

              if (isReplicate) {
                try {
                  const urls = refImages.slice(0, 3);
                  const result = await llmService.recognizeProduct(urls, { ...llmSettings });
                  editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail,
                    productName: result.nameCn || result.nameEn,
                    productIdentity: { nameCn: result.nameCn || '', nameEn: result.nameEn || '', categoryCn: result.categoryCn || '', categoryEn: result.categoryEn || '', materialCn: result.materialCn || '', materialEn: result.materialEn || '', colorCn: result.colorCn || '', colorEn: result.colorEn || '', sizeCn: result.sizeCn || '', sizeEn: result.sizeEn || '' },
                    productSummaryCn: result.summaryCn || '', productSummaryEn: result.summaryEn || '' } });
                } catch { /* optional */ }
                try {
                  const refStyle = await llmService.analyzeReferenceStyle(
                    sel.referenceImages.map((r: any) => r.dataUrl).slice(0, 5), refImages.slice(0, 2),
                    sel.selectedImageTypes, { ...llmSettings }
                  );
                  const prompts = refStyle.prompts || {};
                  editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail,
                    replicateAnalysis: refStyle.styleSummary || '',
                    imageTypePrompts: { ...sel.imageTypePrompts, ...prompts },
                    completedCount: 1, status: 'analyzed' } });
                } catch (err: any) { window.alert(`风格分析失败：${err.message}`); editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, status: 'idle' } }); return; }
              } else {
                try {
                  const analyzed = await llmService.analyzeAndCompose({
                    productImages: refImages, selectedTypes: sel.selectedImageTypes,
                    typeTemplates: sel.imageTypePrompts || {}, productName: sel.productName || llmService.inferProductNameFromSelection(),
                    sellingPoints: sel.sellingPoints, tone: sel.tone, imageRatio: sel.imageRatio || '1:1', settings: { ...llmSettings }
                  });
                  const p = analyzed.product || {};
                  const prompts = analyzed.prompts || {};
                  editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail,
                    productIdentity: { nameCn: p.nameCn || '', nameEn: p.nameEn || '', categoryCn: p.categoryCn || '', categoryEn: p.categoryEn || '', materialCn: p.materialCn || '', materialEn: p.materialEn || '', colorCn: p.colorCn || '', colorEn: p.colorEn || '', sizeCn: p.sizeCn || '', sizeEn: p.sizeEn || '' },
                    productName: p.nameCn || p.nameEn || sel.productName, productSummaryCn: p.summaryCn || '', productSummaryEn: p.summaryEn || '',
                    targetAudienceSegments: analyzed.targetAudienceSegments || [], useScenarios: analyzed.useScenarios || [],
                    titleSuggestions: analyzed.titleSuggestions || [], coreSellingPoints: analyzed.coreSellingPoints || [],
                    copyAngles: analyzed.copyAngles || [], sceneStrategy: analyzed.sceneStrategy || '', complianceNotes: analyzed.complianceNotes || '',
                    imageTypePrompts: { ...sel.imageTypePrompts, ...prompts }, completedCount: 1, status: 'analyzed' } });
                } catch (err: any) { window.alert(`分析失败：${err.message}`); editorStore.patch({ aiDetail: { ...editorStore.getState().aiDetail, status: 'idle' } }); return; }
              }
            }}>
            🔍 分析商品并生成提示词
          </button>
        )}
      </div>
    </section>
  );
}
