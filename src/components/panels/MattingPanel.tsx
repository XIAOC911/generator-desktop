import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import { mattingService } from '@/services/matting.service';
import type {
  MattingBackgroundMode,
  MattingProviderId,
  MattingProviderStatus,
  RembgModelId
} from '@/core/models/matting';

interface MattingPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function MattingPanel({ compact, collapsed, onToggleCollapse }: MattingPanelProps) {
  const state = useEditorStore();
  const defaults = useMemo(() => mattingService.getOptions(), []);
  const [provider, setProvider] = useState<MattingProviderId>(defaults.provider);
  const [threshold, setThreshold] = useState(defaults.threshold);
  const [backgroundMode, setBackgroundMode] = useState<MattingBackgroundMode>(defaults.backgroundMode);
  const [createMask, setCreateMask] = useState(defaults.createMask);
  const [model, setModel] = useState<RembgModelId>(defaults.model);
  const [alphaMatting, setAlphaMatting] = useState(defaults.alphaMatting);
  const [foregroundThreshold, setForegroundThreshold] = useState(defaults.foregroundThreshold);
  const [backgroundThreshold, setBackgroundThreshold] = useState(defaults.backgroundThreshold);
  const [erodeSize, setErodeSize] = useState(defaults.erodeSize);
  const [providerStatus, setProviderStatus] = useState<MattingProviderStatus[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      setStatusLoading(true);
      try {
        const providers = await mattingService.getProviderStatus();
        setProviderStatus(providers);
      } finally {
        setStatusLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    mattingService.updateOptions({
      provider,
      threshold,
      backgroundMode,
      createMask,
      model,
      alphaMatting,
      foregroundThreshold,
      backgroundThreshold,
      erodeSize
    });
  }, [
    provider,
    threshold,
    backgroundMode,
    createMask,
    model,
    alphaMatting,
    foregroundThreshold,
    backgroundThreshold,
    erodeSize
  ]);

  const selectedCount = state.sourceAssets.filter((asset) => asset.selected).length;
  const successCount = state.sourceAssets.filter((asset) => asset.mattingStatus === 'success').length;
  const pendingCount = state.sourceAssets.filter((asset) => asset.mattingStatus === 'pending').length;
  const canvasAssetCount = mattingService.getCanvasAssetIds().length;
  const processedCount = mattingService.getProcessedAssetIds().length;
  const activeProvider = providerStatus.find((item) => item.id === provider);
  const isRembg = provider === 'rembg-python';

  const refreshProviderStatus = async () => {
    setStatusLoading(true);
    try {
      const providers = await mattingService.getProviderStatus();
      setProviderStatus(providers);
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">抠</span>
          智能抠图
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

      <div className="result-card">
        <div className="result-row">
          <span className="result-label">已选素材</span>
          <span className="result-value">{selectedCount} 张</span>
        </div>
        <div className="result-row">
          <span className="result-label">画布引用</span>
          <span className="result-value">{canvasAssetCount} 张</span>
        </div>
        <div className="result-row">
          <span className="result-label">已完成</span>
          <span className="result-value result-value-strong" style={{ color: 'var(--color-success)' }}>
            {successCount} 张
          </span>
        </div>
        <div className="result-row">
          <span className="result-label">处理中</span>
          <span className="result-value" style={{ color: pendingCount > 0 ? 'var(--color-warning)' : undefined }}>
            {pendingCount} 张
          </span>
        </div>
        <div className="result-row">
          <span className="result-label">已抠图素材</span>
          <span className="result-value">{processedCount} 张</span>
        </div>
      </div>

      <div className="panel-subtitle">抠图方式</div>
      <div className="field-stack">
        <select className="input" value={provider} onChange={(event) => setProvider(event.target.value as MattingProviderId)}>
          <option value="edge-floodfill">快速去底（适合纯底商品图）</option>
          <option value="rembg-python">高精度（Python / rembg）</option>
          <option value="api-matting" disabled>
            第三方 API（预留）
          </option>
        </select>
        <div className={`hint ${activeProvider?.available === false ? 'hint-warning' : 'hint-info'}`}>
          {statusLoading ? '正在检测 Provider 环境…' : activeProvider?.message || '请选择要使用的抠图 Provider。'}
        </div>
        <button className="button button-sm" onClick={() => void refreshProviderStatus()}>
          重新检测环境
        </button>
      </div>

      {isRembg ? (
        <>
          <div className="panel-subtitle">高精度参数</div>
          <div className="hint" style={{ marginBottom: 12 }}>
            推荐使用 <strong>u2netp</strong> 轻量模型，加载快、CPU 推理速度快约 40%。
          </div>
          <div className="field-stack">
            <label className="field-label">模型</label>
            <select className="input" value={model} onChange={(event) => setModel(event.target.value as RembgModelId)}>
              <option value="u2netp">u2netp（推荐·轻量快速）</option>
              <option value="isnet-general-use">isnet-general-use（高精度）</option>
              <option value="u2net">u2net</option>
              <option value="u2net_human_seg">u2net_human_seg（人物）</option>
              <option value="u2net_cloth_seg">u2net_cloth_seg（服饰）</option>
            </select>
          </div>

          <label className="check-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={alphaMatting} onChange={(event) => setAlphaMatting(event.target.checked)} />
            <span>启用 alpha matting 精修边缘</span>
          </label>

          <div className="range-group">
            <label className="field-label">前景阈值：{foregroundThreshold}</label>
            <input type="range" min={150} max={255} step={1} value={foregroundThreshold} onChange={(event) => setForegroundThreshold(Number(event.target.value))} />
          </div>
          <div className="range-group">
            <label className="field-label">背景阈值：{backgroundThreshold}</label>
            <input type="range" min={0} max={80} step={1} value={backgroundThreshold} onChange={(event) => setBackgroundThreshold(Number(event.target.value))} />
          </div>
          <div className="range-group">
            <label className="field-label">腐蚀尺寸：{erodeSize}</label>
            <input type="range" min={0} max={32} step={1} value={erodeSize} onChange={(event) => setErodeSize(Number(event.target.value))} />
            <div className="hint">复杂边缘或轻微阴影可适当提高腐蚀尺寸，减少边缘残底。</div>
          </div>
        </>
      ) : (
        <>
          <div className="panel-subtitle">快速去底参数</div>
          <div className="field-stack">
            <label className="field-label">背景判断</label>
            <select
              className="input"
              value={backgroundMode}
              onChange={(event) => setBackgroundMode(event.target.value as MattingBackgroundMode)}
            >
              <option value="auto">自动</option>
              <option value="white">偏白背景</option>
              <option value="black">偏深背景</option>
            </select>
          </div>

          <div className="range-group">
            <label className="field-label">背景容差：{threshold}</label>
            <input type="range" min={12} max={80} step={1} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
            <div className="hint">容差越高，去底越激进；白底商品图建议从 32-42 开始。</div>
          </div>
        </>
      )}

      <label className="check-row" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={createMask} onChange={(event) => setCreateMask(event.target.checked)} />
        <span>同时输出黑白蒙版</span>
      </label>

    </section>
  );
}
