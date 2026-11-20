import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import { editorStore } from '@/app/store/editorStore';
import { llmService } from '@/services/llm.service';
import { assetService } from '@/services/asset.service';
import { sceneTemplateService } from '@/services/scene-template.service';
import { getSceneTemplateLabel, inferScenePlacementPreset } from '@/core/engines/scene-placement-engine';
import type { BackgroundRotationItem } from '@/core/models/project';
import type {
  LLMProviderId,
  LLMSettings,
  LLMSettingsPayload,
} from '@/core/models/llm';

const DEFAULT_SETTINGS: LLMSettings = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  imageModel: 'dall-e-3',
  temperature: 0.7,
};

interface AiPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AiPanel({ compact, collapsed, onToggleCollapse }: AiPanelProps) {
  const [settings, setSettings] = useState<LLMSettings>(DEFAULT_SETTINGS);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [providerStatus, setProviderStatus] = useState<
    Array<{ id: LLMProviderId; label: string; available: boolean; message: string }>
  >([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [sceneRunning, setSceneRunning] = useState(false);
  const [sceneBrief, setSceneBrief] = useState('高级感电商场景，适合摆放当前产品，保留清晰商品展示区。');
  const [compositionHint, setCompositionHint] = useState('中央或偏下方有展示台/留白，适合后续合成产品');
  const [referenceScene, setReferenceScene] = useState<{ name: string; dataUrl: string } | null>(null);
  const [generatedScenes, setGeneratedScenes] = useState<BackgroundRotationItem[]>([]);
  const [scenePrompt, setScenePrompt] = useState('');
  const [sceneReferenceSummary, setSceneReferenceSummary] = useState('');
  const [sceneSize, setSceneSize] = useState<'1024x1024' | '1536x1024' | '1024x1536'>('1024x1024');
  const [configExpanded, setConfigExpanded] = useState(false);

  const sourceAssets = useEditorStore((state) => state.sourceAssets);
  const backgroundRotationItems = useEditorStore((state) => state.backgroundRotationItems);
  const activeBgRotationIndex = useEditorStore((state) => state.activeBgRotationIndex);
  const currentBackground = backgroundRotationItems[activeBgRotationIndex];
  const currentSceneLabel = getSceneTemplateLabel(currentBackground?.sceneMeta?.preset);

  useEffect(() => {
    void (async () => {
      try {
        const response = await llmService.loadSettings();
        setSettings({
          provider: response.settings.provider,
          baseUrl: response.settings.baseUrl,
          model: response.settings.model,
          imageModel: response.settings.imageModel || 'dall-e-3',
          temperature: response.settings.temperature,
        });
        setHasApiKey(response.settings.hasApiKey);
        setProviderStatus(response.providers);
      } finally {
        setLoadingSettings(false);
      }
    })();
  }, []);

  const activeProvider = useMemo(
    () => providerStatus.find((item) => item.id === settings.provider),
    [providerStatus, settings.provider]
  );

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload: LLMSettingsPayload = {
        ...settings,
        apiKey: apiKeyInput.trim() || undefined,
      };
      const response = await llmService.saveSettings(payload);
      setProviderStatus(response.providers);
      setSettings({
        provider: response.settings.provider,
        baseUrl: response.settings.baseUrl,
        model: response.settings.model,
        imageModel: response.settings.imageModel || settings.imageModel || 'dall-e-3',
        temperature: response.settings.temperature,
      });
      setHasApiKey(response.settings.hasApiKey);
      setApiKeyInput('');
      window.alert('AI 配置已保存。');
    } finally {
      setSaving(false);
    }
  };

  const clearApiKey = async () => {
    if (!window.confirm('确认清除已保存的 API Key？')) return;
    setSaving(true);
    try {
      const response = await llmService.clearApiKey();
      setProviderStatus(response.providers);
      setHasApiKey(response.settings.hasApiKey);
      setApiKeyInput('');
      window.alert('已清除保存的 API Key。');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setRunning(true);
    try {
      const response = await llmService.testConnection(settings);
      if (response.status === 'success') {
        window.alert('连接测试成功。');
      } else {
        window.alert(`连接测试失败：${response.error}`);
      }
    } finally {
      setRunning(false);
    }
  };

  const pickReferenceScene = async () => {
    const images = await window.fanDesktop.file.openImages();
    if (!images.length) return;
    setReferenceScene({ name: images[0].name, dataUrl: images[0].previewUrl });
  };

  const runSceneGeneration = async (mode: 'generate-scenes' | 'replicate-scenes') => {
    if (mode === 'replicate-scenes' && !referenceScene) {
      window.alert('请先选择一张参考场景图。');
      return;
    }
    setSceneRunning(true);
    try {
      const response = await llmService.generateSceneSet(
        mode,
        {
          productName: '',
          sellingPoints: '',
          tone: '',
          constraints: '',
          customPrompt: '',
          sceneBrief,
          compositionHint,
        },
        settings,
        {
          referenceImage: referenceScene?.dataUrl,
          count: 5,
          size: sceneSize,
        }
      );
      if (response.status === 'error') {
        window.alert(`场景图生成失败：${response.error}`);
        return;
      }
      const images = response.images.map((item) => item.dataUrl);
      const sceneMeta = {
        preset: inferScenePlacementPreset(compositionHint),
        source: mode === 'replicate-scenes' ? ('replicate-scene' as const) : ('scene' as const),
        compositionHint,
      };
      const imported = assetService.importGeneratedBackgrounds(images, {
        prefix: mode === 'replicate-scenes' ? 'replicate-scene' : 'scene',
        sceneMeta,
      });
      setGeneratedScenes(imported);
      setScenePrompt(response.prompt);
      setSceneReferenceSummary(response.referenceSummary || '');
      window.alert(
        `已生成 ${images.length} 张场景图，并自动导入 ${imported.length} 张到轮换背景。当前预设：${getSceneTemplateLabel(sceneMeta.preset)}。`
      );
    } finally {
      setSceneRunning(false);
    }
  };

  const applySceneTemplate = (mode: 'single' | 'multi') => {
    const selectedCount = sourceAssets.filter((item) => item.selected).length;
    const result = sceneTemplateService.applyCurrentSceneTemplate(mode);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    window.alert(`已将 ${result.count} 个商品自动摆到${result.label}。`);
  };

  const applyGeneratedSceneById = (itemId: string) => {
    assetService.applyBackgroundRotationItem(itemId);
  };

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">🤖</span>
          AI 助手
        </div>
        <div className="panel-actions">
          <span className="badge badge-gray">{loadingSettings ? '读取中…' : activeProvider?.label || '未配置'}</span>
          <button
            className="icon-button panel-collapse-toggle"
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? '展开' : '收起'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      <div className="panel-subtitle clickable" onClick={() => setConfigExpanded(!configExpanded)} style={{ cursor: 'pointer' }}>
        <div className="row-between">
          <span>模型配置 {configExpanded ? '▼' : '▶'}</span>
          <span className="badge badge-gray">{loadingSettings ? '读取中…' : activeProvider?.label || '未配置'}</span>
        </div>
      </div>

      {configExpanded ? (
        <>
          <div className="field-stack">
            <label className="field-label">Provider</label>
            <select
              className="input"
              value={settings.provider}
              onChange={(event) => {
                const provider = event.target.value as LLMProviderId;
                setSettings((prev) => ({
                  ...prev,
                  provider,
                  baseUrl:
                    provider === 'ollama'
                      ? 'http://127.0.0.1:11434'
                      : provider === 'openai'
                        ? 'https://api.openai.com/v1'
                        : prev.baseUrl || 'https://api.openai.com/v1',
                  model: provider === 'ollama' ? 'qwen2.5:7b' : 'gpt-4.1-mini',
                  imageModel: provider === 'ollama' ? '暂不支持' : 'dall-e-3',
                }));
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="ollama">Ollama</option>
            </select>

            <label className="field-label">Base URL</label>
            <input
              className="input"
              value={settings.baseUrl}
              onChange={(event) => setSettings((prev) => ({ ...prev, baseUrl: event.target.value }))}
            />

            <div className="field-row">
              <div className="field-grow">
                <label className="field-label">对话模型</label>
                <input
                  className="input"
                  value={settings.model}
                  onChange={(event) => setSettings((prev) => ({ ...prev, model: event.target.value }))}
                />
              </div>
              <div className="field-grow">
                <label className="field-label">出图模型</label>
                <input
                  className="input"
                  value={settings.imageModel}
                  onChange={(event) => setSettings((prev) => ({ ...prev, imageModel: event.target.value }))}
                  disabled={settings.provider === 'ollama'}
                />
              </div>
            </div>

            <label className="field-label">API Key</label>
            <input
              className="input"
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder={hasApiKey ? '已保存，留空表示不修改' : '请输入 API Key'}
            />
            <div className="hint">
              {hasApiKey
                ? '已保存 API Key（不会回显），输入新值可替换。'
                : '保存后由系统安全存储加密，不会写入项目文件。'}
            </div>

            <label className="field-label">温度 {settings.temperature.toFixed(1)}</label>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={settings.temperature}
              onChange={(event) => setSettings((prev) => ({ ...prev, temperature: Number(event.target.value) }))}
            />
          </div>

          <div className="hint hint-info" style={{ marginTop: 8 }}>
            {activeProvider?.message || '请先配置可用的大模型服务。'}
          </div>

          <div className="row-start" style={{ marginTop: 12 }}>
            <button className="button" onClick={() => void saveSettings()} disabled={saving}>
              {saving ? '⏳ 保存中…' : '💾 保存配置'}
            </button>
            <button className="button" onClick={() => void testConnection()} disabled={running}>
              {running ? '⏳ 测试中…' : '🔗 测试连接'}
            </button>
            <button className="button" onClick={() => void clearApiKey()} disabled={saving || !hasApiKey}>
              清除 Key
            </button>
          </div>
        </>
      ) : (
        <div className="hint" style={{ marginTop: 8 }}>
          当前配置: {settings.provider} · {settings.model}
          {settings.imageModel && settings.provider !== 'ollama' ? ` · ${settings.imageModel}` : ''}
          {settings.baseUrl && settings.provider === 'openai-compatible' && (() => {
            try {
              return ` · ${new URL(settings.baseUrl).hostname}`;
            } catch {
              return ` · ${settings.baseUrl.substring(0, 20)}${settings.baseUrl.length > 20 ? '...' : ''}`;
            }
          })()}
        </div>
      )}

      <div className="panel-subtitle">AI 场景图</div>
      <div className="field-stack">
        <label className="field-label">场景需求</label>
        <textarea
          className="textarea"
          value={sceneBrief}
          onChange={(event) => setSceneBrief(event.target.value)}
          placeholder="例如：奶油色浴室台面、柔光、玻璃与大理石材质、适合放补水喷雾"
        />
        <label className="field-label">构图/留白</label>
        <input
          className="input"
          value={compositionHint}
          onChange={(event) => setCompositionHint(event.target.value)}
          placeholder="例如：中间留白，前景有展示台，适合后续合成产品"
        />
        <label className="field-label">输出尺寸</label>
        <select
          className="input"
          value={sceneSize}
          onChange={(event) => setSceneSize(event.target.value as '1024x1024' | '1536x1024' | '1024x1536')}
        >
          <option value="1024x1024">正方形 1024x1024</option>
          <option value="1536x1024">横图 1536x1024</option>
          <option value="1024x1536">竖图 1024x1536</option>
        </select>
      </div>

      <div className="row-start" style={{ marginTop: 12 }}>
        <button
          className="button button-primary"
          onClick={() => void runSceneGeneration('generate-scenes')}
          disabled={sceneRunning}
        >
          🎨 生成 5 张场景图
        </button>
        <button className="button" onClick={() => void pickReferenceScene()} disabled={sceneRunning}>
          📷 选择参考图
        </button>
        <button
          className="button"
          onClick={() => void runSceneGeneration('replicate-scenes')}
          disabled={sceneRunning}
        >
          🔄 复刻场景
        </button>
      </div>

      <div className="hint hint-info" style={{ marginTop: 8 }}>
        当前背景预设：{currentSceneLabel}
      </div>

      {referenceScene && (
        <div className="result-card" style={{ marginTop: 12 }}>
          <div className="result-row">
            <span className="result-label">参考图</span>
            <span className="result-value">{referenceScene.name}</span>
          </div>
          <img src={referenceScene.dataUrl} alt={referenceScene.name} className="scene-ref-preview" />
        </div>
      )}

      {sceneReferenceSummary && <div className="hint hint-info">参考图解析：{sceneReferenceSummary}</div>}

      {scenePrompt && <textarea className="textarea ai-output" value={scenePrompt} readOnly />}

      <div className="row-start" style={{ marginTop: 12 }}>
        <button className="button button-primary" onClick={() => applySceneTemplate('single')} disabled={!sourceAssets.filter((item) => item.selected).length}>
          🎯 单品自动上场景
        </button>
        <button className="button" onClick={() => applySceneTemplate('multi')} disabled={sourceAssets.filter((item) => item.selected).length < 2}>
          📦 多商品上场景
        </button>
      </div>

      {generatedScenes.length > 0 && (
        <div className="thumb-list thumb-list-2" style={{ marginTop: 12 }}>
          {generatedScenes.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`thumb-item scene-thumb-item ${currentBackground?.id === item.id ? 'scene-thumb-item-active' : ''}`}
              onClick={() => applyGeneratedSceneById(item.id)}
            >
              <img src={item.dataUrl} alt={`scene-${index + 1}`} />
              <div className="thumb-name">场景图 {index + 1}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
