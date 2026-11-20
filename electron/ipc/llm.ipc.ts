import type { App, IpcMain } from 'electron';
import { readConfig, writeConfig } from '../services/config.service';
import { getSecret, hasSecret, setSecret } from '../services/secure-store.service';

type LLMProviderId = 'openai' | 'openai-compatible' | 'ollama';
type LLMSettingsPayload = {
  provider: LLMProviderId;
  baseUrl: string;
  model: string;
  imageModel: string;
  apiKey?: string;
  clearApiKey?: boolean;
  temperature: number;
};

type Deps = {
  ipcMain: IpcMain;
  app: App;
};

type StoredLlmConfig = {
  provider: LLMProviderId;
  baseUrl: string;
  model: string;
  imageModel: string;
  temperature: number;
};

type GeneratePayload = {
  provider?: LLMProviderId;
  model?: string;
  imageModel?: string;
  temperature?: number;
  prompt: string;
  system?: string;
  images?: string[];
};

type GenerateImagePayload = {
  provider?: LLMProviderId;
  imageModel?: string;
  prompt: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  count?: number;
};

type LlmApiRequestPayload = {
  path?: string;
  body?: unknown;
};

const CONFIG_FILE = 'fan-generator.llm.json';
const SECRET_KEY = 'fan-generator.llm.api-key';

const DEFAULT_CONFIG: StoredLlmConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  imageModel: 'gpt-image-1',
  temperature: 0.7
};

async function loadConfig(app: App) {
  return readConfig<StoredLlmConfig>(app, CONFIG_FILE, DEFAULT_CONFIG);
}

function buildProviders(config: StoredLlmConfig, hasApiKey: boolean) {
  const openAiBase = config.provider === 'openai' ? 'https://api.openai.com/v1' : config.baseUrl || 'https://api.openai.com/v1';
  return [
    {
      id: 'openai' as const,
      label: 'OpenAI',
      available: hasApiKey,
      message: hasApiKey
        ? `已配置 API Key，当前对话模型：${config.model || '未设置'}，出图模型：${config.imageModel || '未设置'}。如需看图，请使用支持视觉的模型。`
        : '请填写 OpenAI API Key。'
    },
    {
      id: 'openai-compatible' as const,
      label: 'OpenAI-compatible',
      available: Boolean(hasApiKey && openAiBase),
      message: hasApiKey
        ? `当前地址：${openAiBase}。对话模型：${config.model || '未设置'}，出图模型：${config.imageModel || '未设置'}。如需看图，请确认兼容接口支持 image_url 与 images。`
        : '请填写兼容接口的 Base URL 和 API Key。'
    },
    {
      id: 'ollama' as const,
      label: 'Ollama 本地模型',
      available: true,
      message: `默认地址：${config.baseUrl || 'http://127.0.0.1:11434'}，对话模型：${config.model || 'qwen2.5:7b'}。当前未接本地出图能力，建议使用 OpenAI / 兼容接口出场景图。`
    }
  ];
}

async function getPublicSettings(app: App) {
  const config = await loadConfig(app);
  const configured = await hasSecret(app, SECRET_KEY);
  return {
    settings: {
      ...config,
      hasApiKey: configured
    },
    providers: buildProviders(config, configured)
  };
}

async function getRuntimeSettings(app: App) {
  const config = await loadConfig(app);
  return {
    config,
    apiKey: await getSecret(app, SECRET_KEY)
  };
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function resolveBaseUrl(config: StoredLlmConfig) {
  if (config.provider === 'openai') return 'https://api.openai.com/v1';
  if (config.provider === 'ollama') return trimSlash(config.baseUrl || 'http://127.0.0.1:11434');
  return trimSlash(config.baseUrl || 'https://api.openai.com/v1');
}

function buildOpenAiMessages(prompt: string, system?: string, images?: string[]) {
  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: prompt }
  ];

  (images || []).forEach((image) => {
    userContent.push({
      type: 'image_url',
      image_url: { url: image }
    });
  });

  return [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    {
      role: 'user' as const,
      content: images?.length ? userContent : prompt
    }
  ];
}

function dataUrlToBase64(value: string) {
  const match = value.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : value;
}

async function generateWithOpenAICompatible(
  payload: GeneratePayload & { apiKey: string; baseUrl: string; model: string; temperature: number }
) {
  const baseUrl = trimSlash(payload.baseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payload.apiKey}`
    },
    body: JSON.stringify({
      model: payload.model,
      temperature: payload.temperature,
      messages: buildOpenAiMessages(payload.prompt, payload.system, payload.images)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return {
    text: json.choices?.[0]?.message?.content?.trim() || '',
    raw: json
  };
}

async function generateWithOllama(payload: GeneratePayload & { baseUrl: string; model: string; temperature: number }) {
  const baseUrl = trimSlash(payload.baseUrl);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: payload.model,
      stream: false,
      messages: [
        ...(payload.system ? [{ role: 'system', content: payload.system }] : []),
        {
          role: 'user',
          content: payload.prompt,
          ...(payload.images?.length ? { images: payload.images.map(dataUrlToBase64) } : {})
        }
      ],
      options: {
        temperature: payload.temperature
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    message?: { content?: string };
  };

  return {
    text: json.message?.content?.trim() || '',
    raw: json
  };
}

function normalizeImageDataUrl(value: string) {
  if (value.startsWith('data:')) return value;
  return `data:image/png;base64,${value}`;
}

async function generateImageWithOpenAICompatible(
  payload: GenerateImagePayload & { apiKey: string; baseUrl: string; imageModel: string }
) {
  const baseUrl = trimSlash(payload.baseUrl);
  const count = Math.max(1, Math.min(5, payload.count || 1));
  const images: Array<{ dataUrl: string; revisedPrompt?: string }> = [];

  for (let index = 0; index < count; index += 1) {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payload.apiKey}`
      },
      body: JSON.stringify({
        model: payload.imageModel || 'gpt-image-1',
        prompt: payload.prompt,
        size: payload.size || '1024x1024'
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };

    const item = json.data?.[0];
    if (!item) continue;

    if (item.b64_json) {
      images.push({ dataUrl: normalizeImageDataUrl(item.b64_json), revisedPrompt: item.revised_prompt });
      continue;
    }

    if (item.url) {
      const imageResponse = await fetch(item.url);
      const arrayBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = imageResponse.headers.get('content-type') || 'image/png';
      images.push({ dataUrl: `data:${mimeType};base64,${base64}`, revisedPrompt: item.revised_prompt });
    }
  }

  return images;
}

export function registerLlmIpc({ ipcMain, app }: Deps) {
  ipcMain.handle('llm:get-settings', async () => {
    return getPublicSettings(app);
  });

  ipcMain.handle('llm:save-settings', async (_event, payload: LLMSettingsPayload) => {
    const current = await loadConfig(app);
    const provider = payload.provider || current.provider;
    const normalized: StoredLlmConfig = {
      provider,
      baseUrl: payload.baseUrl || (provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1'),
      model:
        payload.model ||
        (provider === 'ollama' ? 'qwen2.5:7b' : 'gpt-4.1-mini'),
      imageModel: payload.imageModel || 'gpt-image-1',
      temperature: Number.isFinite(payload.temperature) ? Number(payload.temperature) : 0.7
    };

    if (payload.clearApiKey) {
      await setSecret(app, SECRET_KEY, '');
    } else if (typeof payload.apiKey === 'string' && payload.apiKey.trim()) {
      await setSecret(app, SECRET_KEY, payload.apiKey.trim());
    }
    await writeConfig(app, CONFIG_FILE, normalized);
    return getPublicSettings(app);
  });

  ipcMain.handle('llm:clear-api-key', async () => {
    await setSecret(app, SECRET_KEY, '');
    return getPublicSettings(app);
  });

  ipcMain.handle('llm:generate', async (_event, payload: GeneratePayload) => {
    try {
      const { config, apiKey } = await getRuntimeSettings(app);
      const provider = config.provider;
      const baseUrl = resolveBaseUrl(config);
      const model = payload.model || config.model;
      const temperature = Number.isFinite(payload.temperature) ? Number(payload.temperature) : config.temperature;

      if (provider !== 'ollama' && !apiKey) {
        return {
          status: 'error',
          error: '请先在 AI 面板中填写 API Key。'
        };
      }

      const runnerPayload = {
        ...payload,
        provider,
        baseUrl,
        model,
        apiKey,
        temperature,
        prompt: payload.prompt,
        images: payload.images || []
      };

      const result =
        provider === 'ollama'
          ? await generateWithOllama(runnerPayload)
          : await generateWithOpenAICompatible(runnerPayload);

      return {
        status: 'success',
        result: {
          ...result,
          provider,
          model
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : '大模型调用失败。'
      };
    }
  });

  ipcMain.handle('llm:generate-image', async (_event, payload: GenerateImagePayload) => {
    try {
      const { config, apiKey } = await getRuntimeSettings(app);
      const provider = config.provider;
      const baseUrl = resolveBaseUrl(config);
      const imageModel = payload.imageModel || config.imageModel || 'gpt-image-1';

      if (provider === 'ollama') {
        return {
          status: 'error',
          error: '当前版本暂不支持通过 Ollama 直接生成场景图。请切换到 OpenAI 或兼容接口。'
        };
      }

      if (!apiKey) {
        return {
          status: 'error',
          error: '请先在 AI 面板中填写 API Key。'
        };
      }

      const images = await generateImageWithOpenAICompatible({
        ...payload,
        provider,
        baseUrl,
        apiKey,
        imageModel
      });

      return {
        status: 'success',
        images
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : '场景图生成失败。'
      };
    }
  });

  ipcMain.handle('llm:request', async (_event, payload: LlmApiRequestPayload) => {
    try {
      const requestPath = typeof payload?.path === 'string' ? payload.path : '';
      if (requestPath !== '/chat/completions' && requestPath !== '/images/generations') {
        return { ok: false, status: 400, text: '不允许的 AI 接口路径。' };
      }

      const { config, apiKey } = await getRuntimeSettings(app);
      if (config.provider === 'ollama') {
        return { ok: false, status: 400, text: '当前 Provider 不支持该接口。' };
      }
      if (!apiKey) {
        return { ok: false, status: 401, text: '请先在 AI 面板中填写 API Key。' };
      }

      const response = await fetch(`${resolveBaseUrl(config)}${requestPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload.body ?? {})
      });

      return {
        ok: response.ok,
        status: response.status,
        text: await response.text()
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        text: error instanceof Error ? error.message : 'AI 请求失败。'
      };
    }
  });
}
