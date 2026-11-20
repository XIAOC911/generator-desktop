import { editorStore } from '@/app/store/editorStore';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';
import { buildCopyPackLayers } from '@/core/engines/copy-layout-engine';
import type { TextLayer } from '@/core/models/layer';
import type {
  AiCopyPack,
  LLMGenerateResponse,
  LLMRequest,
  LLMSettings,
  LLMSettingsPayload,
  LLMSettingsResponse,
  LLMTaskId,
  SceneGenerateResponse,
  VisionComposeOptions,
  VisionContextSummary
} from '@/core/models/llm';
import { renderCanvasScene } from '@/core/renderer/canvas-renderer';

type LlmApiProxyResponse = {
  ok: boolean;
  status: number;
  text: string;
};

async function postLlmApi(path: '/chat/completions' | '/images/generations', body: unknown): Promise<LlmApiProxyResponse> {
  return window.fanDesktop.llm.request({ path, body });
}

async function postLlmJson(path: '/chat/completions' | '/images/generations', body: unknown): Promise<any> {
  const response = await postLlmApi(path, body);
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(response.text);
  } catch {
    throw new Error('API 返回了无效 JSON。');
  }
}

export type AiComposeInput = {
  productName: string;
  sellingPoints: string;
  tone: string;
  constraints: string;
  customPrompt: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createTextLayer(text: string, x: number, y: number, scale = 86): TextLayer {
  return {
    id: uid(),
    type: 'text',
    text,
    x,
    y,
    scale,
    rotation: 0,
    opacity: 100,
    filters: { ...DEFAULT_FILTERS },
    visible: true,
    color: '#111827',
    fontFamily: 'Microsoft YaHei',
    bold: true,
    stroke: false,
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.35)',
    strokeColor: '#ffffff',
    shadowBlur: 10
  };
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

function cleanAssetName(name: string) {
  return stripExtension(name)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function commonPrefix(a: string, b: string) {
  const length = Math.min(a.length, b.length);
  let index = 0;
  while (index < length && a[index] === b[index]) index += 1;
  return a.slice(0, index).trim();
}

function inferProductNameFromSelection() {
  const selectedAssets = editorStore.getState().sourceAssets.filter((asset) => asset.selected);
  if (!selectedAssets.length) return '';
  const names = selectedAssets.map((asset) => cleanAssetName(asset.name)).filter(Boolean);
  if (!names.length) return '';
  const prefix = names.slice(1).reduce((acc, current) => commonPrefix(acc, current), names[0]);
  return (prefix && prefix.length >= 2 ? prefix : names[0]).trim();
}

function buildProjectContext() {
  const state = editorStore.getState();
  const selectedAssets = state.sourceAssets.filter((asset) => asset.selected);
  const assetNames = selectedAssets.map((asset) => asset.name).slice(0, 12).join('、') || '未选择素材';
  const cutoutCount = selectedAssets.filter((asset) => asset.mattingStatus === 'success').length;
  const background = state.canvas.backgroundType === 'color' ? `纯色 ${state.canvas.backgroundValue}` : '图片背景';

  return [
    `当前项目名：${state.project.currentName}`,
    `画布尺寸：${state.canvas.size}x${state.canvas.size}`,
    `当前模式：${state.mode}`,
    `当前版式：${state.layoutId}`,
    `随机款数：${state.randomCount}`,
    `画布同款数量：${Math.max(1, state.sameProductCount || 1)}`,
    `已选素材：${selectedAssets.length} 张（${assetNames}）`,
    `已抠图素材：${cutoutCount} 张`,
    `背景：${background}`,
    `轮换背景数量：${state.backgroundRotationItems.length}`,
    `当前图层数：${state.layers.length}`
  ].join('\n');
}

function buildSharedContext(input: AiComposeInput) {
  const inferredProductName = inferProductNameFromSelection();
  const productName = input.productName || inferredProductName || '未填写产品名';
  const sellingPoints = input.sellingPoints || '未填写卖点';
  const tone = input.tone || '电商转化导向';
  const constraints = input.constraints || '保持简洁，适合主图展示';

  return {
    productName,
    inferredProductName,
    shared: [
      `产品名：${productName}`,
      `卖点：${sellingPoints}`,
      `风格/语气：${tone}`,
      `额外限制：${constraints}`,
      '项目上下文：',
      buildProjectContext()
    ].join('\n')
  };
}

function buildPrompt(task: LLMTaskId, input: AiComposeInput) {
  const { shared } = buildSharedContext(input);

  if (task === 'headline') {
    return `${shared}\n\n请生成 6 条适合电商主图的中文短标题。要求：每条尽量 6-14 个字，强调转化，避免空话。只输出结果，每行一条。`;
  }

  if (task === 'selling-points') {
    return `${shared}\n\n请输出 6 条适合贴在主图上的卖点短句。要求：每条尽量 8-18 个字，具体、有利益点，可直接用于电商主图。只输出结果，每行一条。`;
  }

  if (task === 'layout-suggestion') {
    return `${shared}\n\n请根据当前项目上下文，给出 1 份中文排版建议。需要包含：\n1. 推荐版式\n2. 推荐主标题位置\n3. 推荐卖点数量\n4. 推荐背景与配色\n5. 推荐是否先抠图再排版\n请用简洁分点输出。`;
  }

  if (task === 'campaign-pack') {
    return `${shared}\n\n请基于当前素材和排版模式，输出一份适合电商主图直接使用的中文文案包。\n要求：\n1. 严格只输出 JSON，不要 Markdown，不要解释。\n2. JSON 结构如下：\n{\n  "headline": "主标题，6-14字",\n  "subheadline": "副标题，可为空，8-18字",\n  "badge": "角标短句，可为空，2-8字",\n  "sellingPoints": ["卖点1", "卖点2", "卖点3"],\n  "cta": "行动词，可为空，4-10字",\n  "paletteHint": "建议配色，可为空"\n}\n3. sellingPoints 给 3 到 4 条。\n4. 文案必须具体、可贴图、避免空洞。\n5. 如果当前素材数量较多，标题要更偏合集/套组表达。`;
  }

  if (task === 'vision-campaign-pack') {
    return `${shared}\n\n我会额外提供“当前画布截图”和/或“当前选中素材缩略图”。请你结合这些视觉内容，输出一份更贴图的中文主图文案包。\n要求：\n1. 严格只输出 JSON，不要 Markdown，不要解释。\n2. JSON 结构如下：\n{\n  "headline": "主标题，6-14字",\n  "subheadline": "副标题，可为空，8-18字",\n  "badge": "角标短句，可为空，2-8字",\n  "sellingPoints": ["卖点1", "卖点2", "卖点3"],\n  "cta": "行动词，可为空，4-10字",\n  "paletteHint": "建议配色，可为空"\n}\n3. 文案要根据图片里的风格、产品数量、留白情况和促销感来调整，不要只复述输入。\n4. 如果画面已经很满，文案请更短；如果画面较空，可以给更完整的标题和副标题。\n5. 卖点给 3 到 4 条，必须适合直接贴图。`;
  }

  if (task === 'vision-layout-suggestion') {
    return `${shared}\n\n我会额外提供“当前画布截图”和/或“当前选中素材缩略图”。请你基于视觉内容，给出一份更贴近画面的中文排版建议。\n请重点判断：\n1. 文字是否会挡住主体\n2. 哪个区域更适合放标题\n3. 卖点数量应多还是少\n4. 配色是否与商品/背景协调\n5. 是否建议先抠图、换背景、减少文字\n输出请用 5-8 条简洁分点，务必可执行。`;
  }

  return `${shared}\n\n用户补充要求：${input.customPrompt || '请结合以上信息输出最适合当前电商主图工作的建议。'}`;
}

function buildSystemPrompt(task: LLMTaskId) {
  if (task === 'layout-suggestion' || task === 'vision-layout-suggestion') {
    return '你是一个电商主图创意总监，擅长把商品数量、版式、背景和文案结合成可落地的主图排版建议。输出务必简洁、明确、可执行。';
  }
  if (task === 'campaign-pack' || task === 'vision-campaign-pack') {
    return '你是一个电商主图文案总监。你的任务是根据商品信息、排版上下文以及可见的画面，输出一份可直接落到画布上的中文主图文案包。必须只返回合法 JSON。';
  }
  return '你是一个电商主图文案助手，擅长输出短促、有转化感、适合直接贴进主图的中文文案。避免空洞广告词，尽量具体。';
}

function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, '').trim())
    .filter(Boolean);
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSellingPoints(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => safeString(item)).filter(Boolean).slice(0, 4);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n、；;，,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  }
  return [];
}

function fallbackCopyPack(text: string): AiCopyPack {
  const lines = parseLines(text);
  return {
    headline: lines[0] || '主图标题',
    subheadline: lines[1] || '',
    badge: '',
    sellingPoints: lines.slice(2, 5),
    cta: lines[5] || ''
  };
}

function parseCopyPack(text: string): AiCopyPack {
  const cleaned = stripCodeFence(text);
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const sellingPoints = normalizeSellingPoints(parsed.sellingPoints);
    const pack: AiCopyPack = {
      headline: safeString(parsed.headline) || '主图标题',
      subheadline: safeString(parsed.subheadline),
      badge: safeString(parsed.badge),
      sellingPoints: sellingPoints.length ? sellingPoints : fallbackCopyPack(text).sellingPoints,
      cta: safeString(parsed.cta),
      paletteHint: safeString(parsed.paletteHint)
    };
    return pack;
  } catch {
    return fallbackCopyPack(text);
  }
}

async function renderCurrentCanvasSnapshot() {
  const state = editorStore.getState();
  const canvas = document.createElement('canvas');
  canvas.width = state.canvas.size;
  canvas.height = state.canvas.size;
  await renderCanvasScene(canvas, state);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function collectSelectedAssetImages(limit = 4) {
  const selected = editorStore
    .getState()
    .sourceAssets.filter((asset) => asset.selected)
    .slice(0, limit);
  return selected.map((asset) => asset.previewUrl);
}

async function buildVisionImages(options: VisionComposeOptions) {
  const images: string[] = [];
  const sources: VisionContextSummary['sources'] = [];
  let usedSelectedAssetCount = 0;
  const selectedAssetCount = editorStore.getState().sourceAssets.filter((asset) => asset.selected).length;

  if (options.includeCanvas) {
    const canvasImage = await renderCurrentCanvasSnapshot();
    images.push(canvasImage);
    sources.push('canvas');
  }

  if (options.includeSelectedAssets) {
    const assetImages = collectSelectedAssetImages(options.maxSelectedAssetImages || 4);
    if (assetImages.length) {
      images.push(...assetImages);
      sources.push('selected-assets');
      usedSelectedAssetCount = assetImages.length;
    }
  }

  return {
    images,
    summary: {
      imageCount: images.length,
      sources,
      selectedAssetCount,
      usedSelectedAssetCount
    } satisfies VisionContextSummary
  };
}



type SceneComposeInput = AiComposeInput & {
  sceneBrief: string;
  compositionHint?: string;
};

function sanitizeSceneSummary(value: string) {
  return value.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
}

async function analyzeReferenceScene(referenceImage: string, input: AiComposeInput, settings: LLMSettings) {
  const response = await window.fanDesktop.llm.generate({
    provider: settings.provider,
    model: settings.model,
    temperature: 0.4,
    images: [referenceImage],
    system:
      '你是电商场景图导演。请阅读参考图，提炼可用于图像生成的场景描述。输出必须简洁、具体，适合直接当出图提示词的组成部分。',
    prompt: `${buildProjectContext()}

请分析这张参考场景图，输出 1 段中文场景摘要，必须包含：空间/场景、材质、光线、色调、道具、机位、留白位置。不要出现品牌名、不要描述图片中的文字。`
  }) as LLMGenerateResponse;

  if (response.status === 'error') {
    throw new Error(response.error);
  }

  return sanitizeSceneSummary(response.result.text);
}

function buildSceneGenerationPrompt(mode: 'generate-scenes' | 'replicate-scenes', input: SceneComposeInput, referenceSummary?: string) {
  const { productName } = buildSharedContext(input);
  const selectedAssets = editorStore.getState().sourceAssets.filter((asset) => asset.selected);
  const selectedNames = selectedAssets.map((asset) => cleanAssetName(asset.name)).filter(Boolean).slice(0, 6).join('、');
  const modeHint =
    mode === 'replicate-scenes'
      ? '请根据参考场景风格做同类型变体，不要完全复制，不要生成品牌 logo 或水印。'
      : '请为电商主图生成适合后续摆放商品的场景背景变体，重点是氛围和留白。';
  const referenceHint = referenceSummary ? `参考场景摘要：${referenceSummary}` : '';
  return [
    `为电商主图生成方形场景背景。`,
    `产品：${productName}${selectedNames ? `；当前素材名：${selectedNames}` : ''}`,
    `场景需求：${input.sceneBrief || '高级感电商场景，适合摆放商品。'}`,
    input.compositionHint ? `构图要求：${input.compositionHint}` : '构图要求：主体展示区居中或偏下，保留清晰留白，用于后续摆放抠好图的商品。',
    `文案限制：不要出现文字、logo、水印、人物脸部特写、手持商品。`,
    `画面要求：质感真实、商业摄影棚级灯光、适合电商主图合成。`,
    modeHint,
    referenceHint
  ]
    .filter(Boolean)
    .join('；');
}
export const llmService = {
  async loadSettings() {
    const response = (await window.fanDesktop.llm.getSettings()) as LLMSettingsResponse;
    return response;
  },

  async saveSettings(settings: LLMSettingsPayload) {
    const response = (await window.fanDesktop.llm.saveSettings(settings)) as LLMSettingsResponse;
    return response;
  },

  async clearApiKey() {
    const response = (await window.fanDesktop.llm.clearApiKey()) as LLMSettingsResponse;
    return response;
  },

  async generate(request: LLMRequest) {
    const response = (await window.fanDesktop.llm.generate(request)) as LLMGenerateResponse;
    return response;
  },

  async generateImage(request: { prompt: string; provider?: LLMSettings['provider']; imageModel?: string; count?: number; size?: '1024x1024' | '1536x1024' | '1024x1536'; referenceImages?: string[] }) {
    return (await window.fanDesktop.llm.generateImage(request)) as SceneGenerateResponse;
  },

  async testConnection(settings: LLMSettings) {
    return this.generate({
      provider: settings.provider,
      model: settings.model,
      temperature: settings.temperature,
      system: '你是连接测试助手。',
      prompt: '请只回复：连接成功'
    });
  },

  async runTask(task: LLMTaskId, input: AiComposeInput, settings: LLMSettings) {
    return this.generate({
      provider: settings.provider,
      model: settings.model,
      temperature: settings.temperature,
      system: buildSystemPrompt(task),
      prompt: buildPrompt(task, input),
      task
    });
  },

  async runVisionTask(task: 'vision-campaign-pack' | 'vision-layout-suggestion', input: AiComposeInput, settings: LLMSettings, options: VisionComposeOptions) {
    const { images, summary } = await buildVisionImages(options);
    if (!images.length) {
      return {
        status: 'error',
        error: '没有可提供给模型的图片。请勾选“当前画布截图”或“当前选中素材缩略图”。'
      } satisfies LLMGenerateResponse;
    }

    const response = await this.generate({
      provider: settings.provider,
      model: settings.model,
      temperature: settings.temperature,
      system: buildSystemPrompt(task),
      prompt: `${buildPrompt(task, input)}\n\n视觉输入说明：共 ${summary.imageCount} 张图；来源：${summary.sources.join(' + ')}；当前选中素材 ${summary.selectedAssetCount} 张，本次送入 ${summary.usedSelectedAssetCount} 张。`,
      task,
      images
    });

    return {
      ...response,
      visionSummary: summary
    } as LLMGenerateResponse & { visionSummary: VisionContextSummary };
  },



  async generateSceneSet(mode: 'generate-scenes' | 'replicate-scenes', input: SceneComposeInput, settings: LLMSettings, options?: { referenceImage?: string; referenceImages?: string[]; count?: number; size?: '1024x1024' | '1536x1024' | '1024x1536' }) {
    let referenceSummary = '';
    if (mode === 'replicate-scenes' && options?.referenceImage) {
      referenceSummary = await analyzeReferenceScene(options.referenceImage, input, settings);
    }

    const prompt = buildSceneGenerationPrompt(mode, input, referenceSummary);
    const response = await this.generateImage({
      prompt,
      provider: settings.provider,
      imageModel: settings.imageModel,
      count: options?.count || 5,
      size: options?.size || '1024x1024',
      referenceImages: options?.referenceImages,
    });

    return {
      ...response,
      referenceSummary,
      prompt
    } as SceneGenerateResponse & { referenceSummary?: string; prompt: string };
  },

  async runDetailAnalysis(input: {
    productName: string;
    sellingPoints: string;
    tone: string;
    constraints: string;
    extraRequirements: string;
    country: string;
    imageRatio: string;
  }, settings: LLMSettings, visionOptions: VisionComposeOptions) {
    const { productName, sellingPoints, tone, constraints, extraRequirements, country } = input;
    const title = productName || inferProductNameFromSelection() || '未填写产品名';

    // Compose vision images (product photos for analysis)
    const { images, summary } = await buildVisionImages(visionOptions);
    const hasImages = images.length > 0;

    const systemPrompt = `你是一个跨境电商详情页分析专家。你的任务是分析商品并输出结构化报告。${hasImages ? '请仔细观察我提供的商品图片。' : '请基于我提供的商品信息进行分析。'}

分析要求：
1. 只描述可观测到的内容，不虚构材质、规格、认证或功效
2. 所有字段同时提供英文和中文，英文在上、中文在下
3. 严格按以下格式输出，每个标题独占一行，内容紧跟其后

产品总结
[2-3句英文概括]
[2-3句中文概括]

商品名称
[全量描述式英文名称]
[等效中文名称]

商品类目
[英文类目]
[中文类目]

材质/质感
[英文材质]
[中文材质]

颜色/外观
[英文颜色]
[中文颜色]

尺寸判断
[尺寸]

目标人群
[标签1], [描述]
[标签2], [描述]
[标签3], [描述]

使用场景
[场景1]
[场景2]
[场景3]
[场景4]
[场景5]

语气方向
[英文语气], [中文语气]

标题建议
关键词优化版：[英文], [中文]
卖点突出版：[英文], [中文]
简洁精炼版：[英文], [中文]

核心卖点
[英文卖点1], [中文卖点1]
[英文卖点2], [中文卖点2]
[英文卖点3], [中文卖点3]
[英文卖点4], [中文卖点4]

文案角度
[角度1]：[英文], [中文]
[角度2]：[英文], [中文]
[角度3]：[英文], [中文]
[角度4]：[英文], [中文]

场景策略
[英文策略]
[中文策略]

合规提醒
[约束1]
[约束2]
[约束3]`;

    const userPrompt = [
      `产品名：${title}`,
      `卖点：${sellingPoints || '从上下文推断'}`,
      `风格：${tone || '电商转化导向'}`,
      `限制：${constraints || '简洁直接'}`,
      `补充：${extraRequirements || '请深度分析'}`,
      `国家：${country}`,
      hasImages ? `附带 ${summary.usedSelectedAssetCount} 张商品图片。` : '',
      '',
      '只输出分析结果，不要前言。',
    ].filter(Boolean).join('\n');

    // Use the proven code path — same as Ai助手's runTask
    try {
      const result = await window.fanDesktop.llm.generate({
        provider: settings.provider,
        model: settings.model,
        temperature: 0.4,
        system: systemPrompt,
        prompt: userPrompt,
        task: 'custom' as const,
        ...(hasImages ? { images } : {}),
      }) as LLMGenerateResponse;

      return { ...result, visionSummary: summary };
    } catch (err: any) {
      return {
        status: 'error' as const,
        error: err?.message || String(err),
        visionSummary: summary,
      } as LLMGenerateResponse & { visionSummary: VisionContextSummary };
    }
  },

  async recognizeProduct(imageDataUrls: string[], settings: LLMSettings) {
    const base64Images = imageDataUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'high' as const }
    }));

    const systemPrompt = `你是一个商品识别专家。请分析图片中的商品，只输出JSON格式结果，不要任何其他文字。JSON格式：{"nameCn":"中文商品名","nameEn":"English product name","categoryCn":"中文类目","categoryEn":"English category","materialCn":"材质","materialEn":"material","colorCn":"颜色","colorEn":"color","sizeCn":"尺寸","sizeEn":"size","summaryCn":"一句话中文描述","summaryEn":"one-line English description"}`;

    const data = await postLlmJson('/chat/completions', {
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请识别图片中的商品，输出JSON。' },
              ...base64Images,
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0.1,
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API返回空内容');

    try {
      const result = JSON.parse(content);
      return {
        nameCn: result.nameCn || '',
        nameEn: result.nameEn || '',
        categoryCn: result.categoryCn || '',
        categoryEn: result.categoryEn || '',
        materialCn: result.materialCn || '',
        materialEn: result.materialEn || '',
        colorCn: result.colorCn || '',
        colorEn: result.colorEn || '',
        sizeCn: result.sizeCn || '',
        sizeEn: result.sizeEn || '',
        summaryCn: result.summaryCn || '',
        summaryEn: result.summaryEn || '',
      };
    } catch {
      // JSON parse failed, try to extract from text
      return {
        nameCn: content.slice(0, 80),
        nameEn: '',
        categoryCn: '',
        categoryEn: '',
        materialCn: '',
        materialEn: '',
        colorCn: '',
        colorEn: '',
        sizeCn: '',
        sizeEn: '',
        summaryCn: content.slice(0, 200),
        summaryEn: '',
      };
    }
  },

  async generateDetailImage(params: {
    productImageUrl: string;
    prompt: string;
    settings: LLMSettings;
  }): Promise<string | null> {
    const { productImageUrl, prompt, settings } = params;
    const fullPrompt = `${prompt}。保持参考图中的商品外观、颜色、形状完全不变，只改变背景、排版、标注和装饰元素。`;

    // Try Images API with reference image (seedream-compatible)
    const response = await postLlmApi('/images/generations', {
        model: settings.imageModel || settings.model,
        prompt: fullPrompt,
        n: 1,
        size: '1024x1024',
        image: productImageUrl,
        response_format: 'url',
    });

    if (!response.ok) return null;

    try {
      const data = JSON.parse(response.text);
      const item = data.data?.[0];
      if (item?.url) return item.url;
      if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    } catch {
      return null;
    }

    return null;
  },

  async analyzeAndCompose(params: {
    productImages: string[];
    selectedTypes: string[];
    typeTemplates: Record<string, string>;
    productName: string;
    sellingPoints: string;
    tone: string;
    imageRatio: string;
    settings: LLMSettings;
  }) {
    const { productImages, selectedTypes, typeTemplates, productName, sellingPoints, tone, imageRatio, settings } = params;
    const base64Images = productImages.map((url) => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'high' as const }
    }));

    const typeList = selectedTypes.map((tk) => {
      const labels: Record<string, string> = {
        hero: '主图(Hero)', 'pain-point': '痛点/卖点图', feature: '功能/结构图',
        'size-spec': '尺寸规格图', scene: '场景结果图', 'value-diff': '差异化价值图',
        compare: '对比优势图', aplus: 'A+收束图', 'price-a': '核价场景图A', 'price-b': '核价场景图B',
      };
      return `${tk}（${labels[tk] || tk}）: "${typeTemplates[tk] || ''}"`;
    }).join('\n');

    const systemPrompt = `你是电商详情图专家。先仔细看商品图片识别商品，然后为每种详情图类型写定制的图像生成提示词。

要求：
1. 每个提示词必须融入从图片中观察到的具体细节（颜色、材质、造型、纹理）
2. 用英文写提示词，具体描述该类型图应如何展示这个商品
3. 每类提示词结尾加 "Keep the product appearance identical to the reference image"
4. 图片比例：${imageRatio}

只返回JSON：{"product":{"nameCn":"","nameEn":"","categoryCn":"","categoryEn":"","materialCn":"","materialEn":"","colorCn":"","colorEn":"","sizeCn":"","sizeEn":"","summaryCn":"","summaryEn":""},"targetAudience":[{"label":"","description":""}],"useScenarios":[{"label":"","description":""}],"toneDirection":"","titleSuggestions":[{"type":"","text":""}],"coreSellingPoints":[{"point":""}],"copyAngles":[{"angle":"","description":""}],"sceneStrategy":"","complianceNotes":"","prompts":{"typeKey":"customized prompt"}}`;

    const userPrompt = [
      `商品名：${productName || '从图片识别'}`,
      `卖点：${sellingPoints || '从图片分析'}`,
      `风格：${tone || '电商转化导向'}`,
      `比例：${imageRatio}`,
      '',
      '类型模板（参考结构，请根据实际商品重写）：',
      typeList,
      '',
      '请识别商品并重写每个类型的提示词。',
    ].join('\n');

    const data = await postLlmJson('/chat/completions', {
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [{ type: 'text', text: userPrompt }, ...base64Images] }
        ],
        max_tokens: 4096,
        temperature: 0.3,
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API返回空内容');

    // Clean markdown code fences
    const jsonStr = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(jsonStr);

    return {
      product: result.product || {},
      targetAudienceSegments: result.targetAudience || [],
      useScenarios: result.useScenarios || [],
      toneDirection: result.toneDirection || '',
      titleSuggestions: result.titleSuggestions || [],
      coreSellingPoints: result.coreSellingPoints || [],
      copyAngles: result.copyAngles || [],
      sceneStrategy: result.sceneStrategy || '',
      complianceNotes: result.complianceNotes || '',
      prompts: result.prompts || {},
    };
  },

  async analyzeReferenceStyle(refImages: string[], productImages: string[], selectedTypes: string[], settings: LLMSettings) {
    // Convert blob URLs to base64
    const toBase64 = async (url: string): Promise<string> => {
      if (url.startsWith('data:')) return url;
      const resp = await fetch(url);
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    };
    const refBase64 = await Promise.all(refImages.slice(0, 3).map(toBase64));
    const prodBase64 = await Promise.all(productImages.slice(0, 1).map(toBase64));
    const refInputs = refBase64.map((url) => ({ type: 'image_url' as const, image_url: { url, detail: 'high' as const } }));
    const prodInputs = prodBase64.map((url) => ({ type: 'image_url' as const, image_url: { url, detail: 'high' as const } }));

    const labels: Record<string, string> = {
      hero: '主图(Hero)', 'pain-point': '痛点/卖点图', feature: '功能/结构图',
      'size-spec': '尺寸规格图', scene: '场景结果图', 'value-diff': '差异化价值图',
      compare: '对比优势图', aplus: 'A+收束图', 'price-a': '核价场景图A', 'price-b': '核价场景图B',
    };

    const data = await postLlmJson('/chat/completions', {
        model: settings.model,
        messages: [
          { role: 'system', content: `你是电商详情图复刻专家。你的任务是：仔细观察参考图的所有视觉细节，然后为每种图片类型写出能精确复刻该风格的英文生图提示词。

必须从参考图中提取并写入提示词的具体元素：
1. 色彩：背景色、主色调、强调色、渐变方向（如"warm beige background with dark brown accent borders"）
2. 排版：文字的字体风格、大小层级、位置（如top-left/centered/bottom-strip）、颜色
3. 构图：产品占比、留白区域、是否有人物/手部、图片分区方式
4. 装饰：图标风格、边框样式、阴影、角标位置
5. 光影：光源方向、阴影软硬、是否高光
6. 质感：背景材质（纯色/渐变/纹理/场景）、产品展示方式

每条提示词必须以这些具体描述开头，然后把新产品信息填入。格式：
"Replicate this exact style: [从参考图提取的具体视觉描述]。Now apply to [产品名]：[该类型的生成要求]。Keep the product appearance identical to reference."

只返回JSON：{"styleSummary":"从参考图提取的具体风格描述（100字以上，包含色彩/排版/构图细节）","prompts":{"typeKey":"完整的英文生图提示词，包含风格描述+产品信息+类型要求"}}` },
          { role: 'user', content: [
            { type: 'text', text: `前面${refBase64.length}张是参考详情图（已被市场验证），最后1张是新产品图。\n\n请仔细看参考图中每一张的：背景颜色、文字位置和风格、图标样式、装饰元素、产品占比、留白方式。\n\n要为以下类型写提示词：${selectedTypes.map((t) => labels[t] || t).join('、')}。\n\n每条提示词必须把参考图的视觉DNA和新产品结合起来。` },
            ...refInputs,
            ...prodInputs,
          ]}
        ],
        max_tokens: 4096,
        temperature: 0.3,
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('空响应');
    const jsonStr = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(jsonStr);
  },

  parseLines,
  parseCopyPack,
  inferProductNameFromSelection,

  insertLinesToCanvas(text: string) {
    const lines = parseLines(text).slice(0, 6);
    if (!lines.length) return 0;
    const size = editorStore.getState().canvas.size;
    const centerX = Math.round(size / 2);
    const startY = Math.round(size * 0.18);
    lines.forEach((line, index) => {
      editorStore.addLayer(createTextLayer(line, centerX, startY + index * 96, index === 0 ? 98 : 76));
    });
    return lines.length;
  },

  insertFirstLineToCanvas(text: string) {
    const line = parseLines(text)[0];
    if (!line) return false;
    const size = editorStore.getState().canvas.size;
    editorStore.addLayer(createTextLayer(line, Math.round(size / 2), Math.round(size * 0.18), 96));
    return true;
  },

  applyCopyPackToCanvas(pack: AiCopyPack) {
    const state = editorStore.getState();
    const layers = buildCopyPackLayers(state, pack);
    if (!layers.length) return 0;
    editorStore.setLayers([...state.layers, ...layers]);
    editorStore.setActiveLayerId(layers[0]?.id);
    return layers.length;
  }
};
