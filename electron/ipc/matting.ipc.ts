import path from 'node:path';
import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { nativeImage } from 'electron';

const execFile = promisify(execFileCb);

type Deps = {
  ipcMain: Electron.IpcMain;
  fs: typeof import('node:fs/promises');
  app: Electron.App;
};

type MattingProviderId = 'edge-floodfill' | 'rembg-python' | 'api-matting';
type BackgroundMode = 'auto' | 'white' | 'black';
type RembgModelId = 'isnet-general-use' | 'u2net' | 'u2netp' | 'u2net_human_seg' | 'u2net_cloth_seg';

type RunPayload = {
  assetPath?: string;
  provider?: MattingProviderId;
  threshold?: number;
  backgroundMode?: BackgroundMode;
  createMask?: boolean;
  outputDir?: string;
  model?: RembgModelId;
  alphaMatting?: boolean;
  foregroundThreshold?: number;
  backgroundThreshold?: number;
  erodeSize?: number;
};

type ProviderStatus = {
  id: MattingProviderId;
  label: string;
  available: boolean;
  message: string;
};

type ExportCutoutsPayload = {
  rootDir?: string;
  items?: Array<{
    sourcePath: string;
    fileName?: string;
  }>;
};

type RGB = { r: number; g: number; b: number };

type PythonCandidate = {
  command: string;
  prefixArgs: string[];
  label: string;
};

const REMBG_PROBE_CODE = [
  'import importlib.util, json',
  "print(json.dumps({'rembg': importlib.util.find_spec('rembg') is not None, 'PIL': importlib.util.find_spec('PIL') is not None}))"
].join('; ');

const REMBG_RUN_CODE = `
import argparse
import base64
import io
import json
from PIL import Image
from rembg import remove, new_session

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--mask', default='')
parser.add_argument('--model', default='isnet-general-use')
parser.add_argument('--alpha-matting', action='store_true')
parser.add_argument('--foreground-threshold', type=int, default=240)
parser.add_argument('--background-threshold', type=int, default=12)
parser.add_argument('--erode-size', type=int, default=10)
args = parser.parse_args()

session = new_session(args.model) if args.model else None
with open(args.input, 'rb') as f:
    source = f.read()

kwargs = {}
if session is not None:
    kwargs['session'] = session
kwargs['alpha_matting'] = args.alpha_matting
kwargs['alpha_matting_foreground_threshold'] = args.foreground_threshold
kwargs['alpha_matting_background_threshold'] = args.background_threshold
kwargs['alpha_matting_erode_size'] = args.erode_size

result = remove(source, **kwargs)
with open(args.output, 'wb') as f:
    f.write(result)

image = Image.open(io.BytesIO(result)).convert('RGBA')
width, height = image.size
alpha = image.getchannel('A')
if args.mask:
    alpha.save(args.mask)

kept_pixels = 0
for value in alpha.getdata():
    if value > 0:
        kept_pixels += 1

preview = 'data:image/png;base64,' + base64.b64encode(result).decode('ascii')
print(json.dumps({
    'cutoutPath': args.output,
    'maskPath': args.mask if args.mask else None,
    'previewDataUrl': preview,
    'provider': 'rembg-python',
    'width': width,
    'height': height,
    'removedPixels': (width * height) - kept_pixels
}, ensure_ascii=False))
`.trim();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toOffset(index: number) {
  return index * 4;
}

function readRgb(bitmap: Buffer, index: number): RGB {
  const offset = toOffset(index);
  return {
    r: bitmap[offset + 2] ?? 0,
    g: bitmap[offset + 1] ?? 0,
    b: bitmap[offset] ?? 0
  };
}

function readAlpha(bitmap: Buffer, index: number) {
  return bitmap[toOffset(index) + 3] ?? 0;
}

function distance(a: RGB, b: RGB) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function estimateBackground(bitmap: Buffer, width: number, height: number, backgroundMode: BackgroundMode): RGB {
  if (backgroundMode === 'white') {
    return { r: 245, g: 245, b: 245 };
  }

  if (backgroundMode === 'black') {
    return { r: 10, g: 10, b: 10 };
  }

  const step = Math.max(1, Math.floor(Math.min(width, height) / 60));
  const samples: RGB[] = [];
  // 向内偏移 2px，避免抗锯齿/边框干扰
  const inset = 2;

  const pushIfOpaque = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = y * width + x;
    if (readAlpha(bitmap, index) < 16) return;
    samples.push(readRgb(bitmap, index));
  };

  for (let x = 0; x < width; x += step) {
    pushIfOpaque(x, inset);
    pushIfOpaque(x, height - 1 - inset);
  }

  for (let y = 0; y < height; y += step) {
    pushIfOpaque(inset, y);
    pushIfOpaque(width - 1 - inset, y);
  }

  if (!samples.length) {
    return { r: 245, g: 245, b: 245 };
  }

  // 聚类：将颜色量化到 16 级，找最大簇的中位数
  const bucketSize = 16;
  const buckets = new Map<number, RGB[]>();
  let maxCount = 0;
  let maxKey = 0;

  for (const sample of samples) {
    const key =
      (Math.floor(sample.r / bucketSize) << 16) |
      (Math.floor(sample.g / bucketSize) << 8) |
      Math.floor(sample.b / bucketSize);
    const list = buckets.get(key) || [];
    list.push(sample);
    buckets.set(key, list);
    if (list.length > maxCount) {
      maxCount = list.length;
      maxKey = key;
    }
  }

  const cluster = buckets.get(maxKey) || samples;

  // 取最大簇的中位数（比均值更能抗异常值）
  const sortedR = cluster.map((c) => c.r).sort((a, b) => a - b);
  const sortedG = cluster.map((c) => c.g).sort((a, b) => a - b);
  const sortedB = cluster.map((c) => c.b).sort((a, b) => a - b);
  const mid = Math.floor(cluster.length / 2);

  return {
    r: sortedR[mid],
    g: sortedG[mid],
    b: sortedB[mid]
  };
}

function luminance(c: RGB) {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

// 检测背景是否为高亮（白底/浅灰底），触发边缘感知模式
function isLightBackground(bg: RGB) {
  return bg.r > 200 && bg.g > 200 && bg.b > 200;
}

// 预计算边缘强度图：用相邻像素亮度差标记"疑似轮廓"
function buildEdgeMap(bitmap: Buffer, width: number, height: number, edgeThreshold: number) {
  const edgeMap = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (readAlpha(bitmap, idx) < 16) continue;
      const center = luminance(readRgb(bitmap, idx));
      let maxDiff = 0;
      // 检查右、下、右下三个方向
      if (x + 1 < width) {
        const r = luminance(readRgb(bitmap, idx + 1));
        maxDiff = Math.max(maxDiff, Math.abs(center - r));
      }
      if (y + 1 < height) {
        const b = luminance(readRgb(bitmap, (y + 1) * width + x));
        maxDiff = Math.max(maxDiff, Math.abs(center - b));
      }
      if (x + 1 < width && y + 1 < height) {
        const br = luminance(readRgb(bitmap, (y + 1) * width + x + 1));
        maxDiff = Math.max(maxDiff, Math.abs(center - br));
      }
      if (maxDiff >= edgeThreshold) {
        edgeMap[idx] = 1;
      }
    }
  }
  return edgeMap;
}

function buildBackgroundMask(
  bitmap: Buffer,
  width: number,
  height: number,
  background: RGB,
  threshold: number,
  edgeMap?: Uint8Array
) {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;
  // 亮底模式下收紧阈值，防止漫入白色产品
  const effectiveThreshold = edgeMap ? Math.max(12, Math.round(threshold * 0.6)) : threshold;

  const tryEnqueue = (index: number) => {
    if (visited[index]) return;
    // 边缘像素作为围栏，不允许穿过
    if (edgeMap?.[index]) return;
    if (readAlpha(bitmap, index) < 16) {
      visited[index] = 1;
      queue[tail++] = index;
      return;
    }
    const pixel = readRgb(bitmap, index);
    if (distance(pixel, background) <= effectiveThreshold) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };

  // 从四边播种，内缩 1px 避免边框/抗锯齿干扰
  for (let x = 0; x < width; x += 1) {
    tryEnqueue(1 * width + x);
    tryEnqueue((height - 2) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    tryEnqueue(y * width + 1);
    tryEnqueue(y * width + (width - 2));
  }

  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);

    if (x > 0) tryEnqueue(current - 1);
    if (x < width - 1) tryEnqueue(current + 1);
    if (y > 0) tryEnqueue(current - width);
    if (y < height - 1) tryEnqueue(current + width);
  }

  return visited;
}

function hasBackgroundNeighbor(mask: Uint8Array, width: number, height: number, x: number, y: number) {
  if (x > 0 && mask[y * width + (x - 1)]) return true;
  if (x < width - 1 && mask[y * width + (x + 1)]) return true;
  if (y > 0 && mask[(y - 1) * width + x]) return true;
  if (y < height - 1 && mask[(y + 1) * width + x]) return true;
  return false;
}

function applyMask(bitmap: Buffer, width: number, height: number, backgroundMask: Uint8Array, background: RGB, threshold: number) {
  const output = Buffer.from(bitmap);
  let removedPixels = 0;

  for (let index = 0; index < width * height; index += 1) {
    const offset = toOffset(index);
    if (backgroundMask[index]) {
      output[offset + 3] = 0;
      removedPixels += 1;
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    if (!hasBackgroundNeighbor(backgroundMask, width, height, x, y)) continue;

    const pixel = readRgb(bitmap, index);
    const dist = distance(pixel, background);
    const feather = 24;
    if (dist <= threshold + feather) {
      const ratio = clamp((dist - threshold) / feather, 0, 1);
      output[offset + 3] = Math.round((output[offset + 3] ?? 255) * ratio);
    }
  }

  return { output, removedPixels };
}

function buildMaskBitmap(backgroundMask: Uint8Array, width: number, height: number) {
  const maskBitmap = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = toOffset(index);
    const value = backgroundMask[index] ? 0 : 255;
    maskBitmap[offset] = value;
    maskBitmap[offset + 1] = value;
    maskBitmap[offset + 2] = value;
    maskBitmap[offset + 3] = 255;
  }
  return maskBitmap;
}

function loadSourceImage(source: string) {
  if (source.startsWith('data:')) {
    return nativeImage.createFromDataURL(source);
  }
  return nativeImage.createFromPath(source);
}

function getPythonCandidates(): PythonCandidate[] {
  const envCommand = process.env.FAN_MATTING_PYTHON?.trim();
  const candidates: PythonCandidate[] = [];
  if (envCommand) {
    candidates.push({ command: envCommand, prefixArgs: [], label: envCommand });
  }

  if (process.platform === 'win32') {
    candidates.push({ command: 'py', prefixArgs: ['-3'], label: 'py -3' });
    const versions = ['313', '312', '311', '310', '39'];
    const installRoots = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python') : '',
      process.env.ProgramFiles || '',
      process.env['ProgramFiles(x86)'] || '',
    ].filter(Boolean);
    const commonPaths = Array.from(new Set(installRoots.flatMap((root) =>
      versions.map((version) => path.join(root, `Python${version}`, 'python.exe'))
    )));
    for (const pyPath of commonPaths) {
      candidates.push({ command: pyPath, prefixArgs: [], label: pyPath });
    }
  }

  candidates.push(
    { command: 'python', prefixArgs: [], label: 'python' },
    { command: 'python3', prefixArgs: [], label: 'python3' }
  );

  return candidates;
}

// probe 结果缓存，避免每张图都启动 Python 检测环境
let cachedProbe: {
  available: boolean;
  candidate: { command: string; prefixArgs: string[]; label: string } | null;
  message: string;
} | null = null;

async function probeRembgPython() {
  if (cachedProbe) return cachedProbe;

  const candidates = getPythonCandidates();
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFile(candidate.command, [...candidate.prefixArgs, '-u', '-c', REMBG_PROBE_CODE], {
        timeout: 12_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      const stdoutText = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}';
      const parsed = JSON.parse(stdoutText) as { rembg?: boolean; PIL?: boolean };
      if (parsed.rembg && parsed.PIL) {
        cachedProbe = {
          available: true,
          candidate,
          message: `已检测到 ${candidate.label}，持久 Worker 模式，首张加载模型后批量极速。`
        };
        return cachedProbe;
      }
    } catch {
      // try next candidate
    }
  }

  cachedProbe = {
    available: false,
    candidate: null,
    message: '未检测到可用的 Python/rembg 环境。请先安装 Python，并执行 pip install rembg pillow onnxruntime。'
  };
  return cachedProbe;
}

async function ensureSourceOnDisk(fs: typeof import('node:fs/promises'), app: Electron.App, source: string) {
  if (!source.startsWith('data:')) {
    return { filePath: source, cleanup: async () => {} };
  }

  const matches = source.match(/^data:(.+?);base64,(.+)$/);
  if (!matches) {
    throw new Error('不支持的 Data URL，无法写入临时文件。');
  }

  const mime = matches[1] || 'image/png';
  const base64 = matches[2] || '';
  const extension = mime.includes('jpeg') ? '.jpg' : mime.includes('webp') ? '.webp' : '.png';
  const tempDir = path.join(app.getPath('userData'), 'matting-cache', 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `matting-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`);
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
  return {
    filePath,
    cleanup: async () => {
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
  };
}
async function runFastMatting({ fs, app }: Pick<Deps, 'fs' | 'app'>, payload: RunPayload) {
  const assetPath = payload.assetPath as string;
  const image = loadSourceImage(assetPath);
  if (image.isEmpty()) {
    throw new Error('图片读取失败，请确认原图路径仍然有效。');
  }

  const { width, height } = image.getSize();
  if (!width || !height) {
    throw new Error('图片尺寸异常，无法执行抠图。');
  }

  const bitmap = image.toBitmap();
  const threshold = clamp(Math.round(payload.threshold ?? 38), 8, 120);
  const backgroundMode = payload.backgroundMode ?? 'auto';
  const background = estimateBackground(bitmap, width, height, backgroundMode);

  // 白底/浅灰底自动启用边缘感知，防止漫入白色产品
  const edgeMap = isLightBackground(background)
    ? buildEdgeMap(bitmap, width, height, 18)
    : undefined;

  const backgroundMask = buildBackgroundMask(bitmap, width, height, background, threshold, edgeMap);
  const { output, removedPixels } = applyMask(bitmap, width, height, backgroundMask, background, threshold);

  const outputDir = payload.outputDir || path.join(app.getPath('userData'), 'matting-cache');
  await fs.mkdir(outputDir, { recursive: true });

  const sourceName = assetPath.startsWith('data:') ? 'cutout.png' : assetPath;
  const baseName = path.basename(sourceName, path.extname(sourceName));
  const stamp = Date.now();
  const cutoutPath = path.join(outputDir, `${baseName}-${stamp}.png`);
  const outputImage = nativeImage.createFromBitmap(output, { width, height });
  await fs.writeFile(cutoutPath, outputImage.toPNG());

  let maskPath: string | undefined;
  if (payload.createMask) {
    const maskBitmap = buildMaskBitmap(backgroundMask, width, height);
    const maskImage = nativeImage.createFromBitmap(maskBitmap, { width, height });
    maskPath = path.join(outputDir, `${baseName}-${stamp}-mask.png`);
    await fs.writeFile(maskPath, maskImage.toPNG());
  }

  return {
    cutoutPath,
    maskPath,
    previewDataUrl: outputImage.toDataURL(),
    provider: 'edge-floodfill',
    width,
    height,
    removedPixels,
    backgroundColor: background
  };
}
async function runRembgMatting({ fs, app }: Pick<Deps, 'fs' | 'app'>, payload: RunPayload) {
  const probe = await probeRembgPython();
  if (!probe.available || !probe.candidate) {
    throw new Error(probe.message);
  }

  const outputDir = payload.outputDir || path.join(app.getPath('userData'), 'matting-cache');
  await fs.mkdir(outputDir, { recursive: true });

  const materialized = await ensureSourceOnDisk(fs, app, payload.assetPath as string);
  try {
    const sourceName = materialized.filePath;
    const baseName = path.basename(sourceName, path.extname(sourceName));
    const stamp = Date.now();
    const cutoutPath = path.join(outputDir, `${baseName}-${stamp}-rembg.png`);
    const maskPath = payload.createMask ? path.join(outputDir, `${baseName}-${stamp}-rembg-mask.png`) : '';

    const model = payload.model || 'isnet-general-use';
    const foregroundThreshold = clamp(Math.round(payload.foregroundThreshold ?? 200), 1, 255);
    const backgroundThreshold = clamp(Math.round(payload.backgroundThreshold ?? 20), 0, 255);
    const erodeSize = clamp(Math.round(payload.erodeSize ?? 8), 0, 64);

    const args = [
      ...probe.candidate.prefixArgs,
      '-c',
      REMBG_RUN_CODE,
      '--input',
      materialized.filePath,
      '--output',
      cutoutPath,
      '--mask',
      maskPath,
      '--model',
      model,
      '--foreground-threshold',
      String(foregroundThreshold),
      '--background-threshold',
      String(backgroundThreshold),
      '--erode-size',
      String(erodeSize)
    ];

    if (payload.alphaMatting) {
      args.push('--alpha-matting');
    }

    const { stdout, stderr } = await execFile(probe.candidate.command, args, {
      timeout: 180_000,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024
    });

    const raw = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
    if (!raw) {
      throw new Error(String(stderr || 'rembg 未返回结果。'));
    }

    const parsed = JSON.parse(raw) as {
      cutoutPath: string;
      maskPath?: string | null;
      previewDataUrl: string;
      provider: string;
      width: number;
      height: number;
      removedPixels?: number;
    };

    return {
      ...parsed,
      maskPath: parsed.maskPath || undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'rembg 抠图失败。';
    throw new Error(`rembg 抠图失败：${message}`);
  } finally {
    await materialized.cleanup();
  }
}

// —— 持久化 Python Worker：模型只加载一次，持续处理多张图 ——

const REMBG_WORKER_CODE = `
import sys, json, base64, io, traceback
from PIL import Image
from rembg import remove, new_session

model = sys.stdin.readline().strip() or 'isnet-general-use'
session = new_session(model)
print(json.dumps({'ready': True, 'model': model}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        task = json.loads(line)
        tid = task.get('id', 0)
        with open(task['input'], 'rb') as f:
            source = f.read()
        kwargs = {'session': session}
        kwargs['alpha_matting'] = task.get('alpha_matting', True)
        kwargs['alpha_matting_foreground_threshold'] = task.get('foreground_threshold', 200)
        kwargs['alpha_matting_background_threshold'] = task.get('background_threshold', 20)
        kwargs['alpha_matting_erode_size'] = task.get('erode_size', 8)
        result = remove(source, **kwargs)
        with open(task['output'], 'wb') as f:
            f.write(result)
        image = Image.open(io.BytesIO(result)).convert('RGBA')
        width, height = image.size
        alpha = image.getchannel('A')
        mask_path = task.get('mask', '')
        if mask_path:
            alpha.save(mask_path)
        kept = sum(1 for v in alpha.getdata() if v > 0)
        preview = 'data:image/png;base64,' + base64.b64encode(result).decode('ascii')
        print(json.dumps({
            'id': tid,
            'ok': True,
            'cutoutPath': task['output'],
            'maskPath': mask_path or None,
            'previewDataUrl': preview,
            'provider': 'rembg-python',
            'width': width,
            'height': height,
            'removedPixels': (width * height) - kept
        }, ensure_ascii=False), flush=True)
    except Exception as e:
        print(json.dumps({'id': task.get('id', 0) if 'task' in dir() else 0, 'ok': False, 'error': str(e)}, ensure_ascii=False), flush=True)
`.trim();

type RembgTask = {
  id: number;
  input: string;
  output: string;
  mask?: string;
  alphaMatting?: boolean;
  foregroundThreshold?: number;
  backgroundThreshold?: number;
  erodeSize?: number;
};

type RembgTaskResult =
  | { id: number; ok: true; cutoutPath: string; maskPath?: string | null; previewDataUrl: string; provider: string; width: number; height: number; removedPixels?: number }
  | { id: number; ok: false; error: string };

class RembgWorker {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, { resolve: (r: RembgTaskResult) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }>();
  private taskId = 0;
  private model = 'isnet-general-use';

  async start(cmd: string, args: string[], model: string) {
    this.model = model;
    // -u 强制 Python stdout/stderr 无缓冲，避免 Worker 通信延迟
    // stderr 必须消费，否则 rembg 下载进度写满管道缓冲区会导致进程卡死
    this.proc = spawn(cmd, [...args, '-u', '-c', REMBG_WORKER_CODE], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    // 持续消费 stderr，防止管道缓冲区阻塞 Python 进程
    if (this.proc.stderr) {
      this.proc.stderr.on('data', () => {
        // 仅消费，不输出（rembg 的下载进度/警告量很大）
      });
    }

    this.proc.stdin?.write(model + '\n');

    // 逐行读取 stdout，匹配 taskId 分发结果
    const rl = createInterface({ input: this.proc.stdout!, crlfDelay: Infinity });
    rl.on('line', (line: string) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed.ready) return; // 初始化完成信号
        // 按 task id 匹配结果
        const taskId: number = parsed.id;
        const handler = this.pending.get(taskId);
        if (handler) {
          this.pending.delete(taskId);
          clearTimeout(handler.timeout);
          handler.resolve(parsed.ok ? parsed : { id: taskId, ok: false, error: parsed.error || 'unknown' });
        }
      } catch {
        // 忽略非 JSON 行
      }
    });

    this.proc.on('exit', (code) => {
      // 进程异常退出时，拒绝所有等待中的任务
      for (const [, h] of this.pending) {
        clearTimeout(h.timeout);
        h.reject(new Error(`rembg worker 意外退出 (code=${code})`));
      }
      this.pending.clear();
      this.proc = null;
    });

    // 等待 ready 信号，首次模型加载可能较慢，给 120 秒
    try {
      await new Promise<void>((resolve, reject) => {
        const onLine = (line: string) => {
          try {
            const p = JSON.parse(line);
            if (p.ready) {
              rl.off('line', onLine);
              resolve();
            }
          } catch { /* skip */ }
        };
        rl.on('line', onLine);
        setTimeout(() => reject(new Error('rembg worker 启动超时（120s），请检查网络或模型是否已下载。')), 120_000);
      });
    } catch (err) {
      // start 失败时清理进程，避免僵尸 worker
      await this.destroy();
      throw err;
    }
  }

  async run(task: Omit<RembgTask, 'id'>): Promise<RembgTaskResult> {
    if (!this.proc) {
      throw new Error('rembg worker 未启动');
    }
    const id = ++this.taskId;
    return new Promise<RembgTaskResult>((resolve, reject) => {
      // 单张图片超时 180 秒，防止大图或异常卡死
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('rembg worker 处理超时（180s）。'));
      }, 180_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.proc!.stdin?.write(JSON.stringify({ ...task, id }) + '\n');
    });
  }

  isAlive() {
    return this.proc !== null && this.proc.exitCode === null;
  }

  getModel() {
    return this.model;
  }

  async destroy() {
    if (this.proc) {
      try { this.proc.stdin?.end(); } catch { /* ignore */ }
      try { this.proc.kill(); } catch { /* ignore */ }
      this.proc = null;
    }
    // 清理所有等待中的任务
    for (const [, h] of this.pending) {
      clearTimeout(h.timeout);
      h.reject(new Error('rembg worker 已销毁。'));
    }
    this.pending.clear();
  }
}

let rembgWorker: RembgWorker | null = null;

async function getOrCreateWorker(
  candidate: { command: string; prefixArgs: string[] },
  model: string
): Promise<RembgWorker> {
  if (rembgWorker?.isAlive() && rembgWorker.getModel() === model) {
    return rembgWorker;
  }
  // 模型变了或进程挂了，重建
  await rembgWorker?.destroy();
  rembgWorker = new RembgWorker();
  await rembgWorker.start(candidate.command, candidate.prefixArgs, model);
  return rembgWorker;
}

async function runRembgMattingPersistent(
  { fs, app }: Pick<Deps, 'fs' | 'app'>,
  payload: RunPayload
) {
  const probe = await probeRembgPython();
  if (!probe.available || !probe.candidate) {
    throw new Error(probe.message);
  }

  const outputDir = payload.outputDir || path.join(app.getPath('userData'), 'matting-cache');
  await fs.mkdir(outputDir, { recursive: true });

  const materialized = await ensureSourceOnDisk(fs, app, payload.assetPath as string);
  try {
    const sourceName = materialized.filePath;
    const baseName = path.basename(sourceName, path.extname(sourceName));
    const stamp = Date.now();
    const cutoutPath = path.join(outputDir, `${baseName}-${stamp}-rembg.png`);
    const maskPath = payload.createMask ? path.join(outputDir, `${baseName}-${stamp}-rembg-mask.png`) : '';

    const model = payload.model || 'isnet-general-use';
    const foregroundThreshold = clamp(Math.round(payload.foregroundThreshold ?? 200), 1, 255);
    const backgroundThreshold = clamp(Math.round(payload.backgroundThreshold ?? 20), 0, 255);
    const erodeSize = clamp(Math.round(payload.erodeSize ?? 8), 0, 64);

    const worker = await getOrCreateWorker(probe.candidate, model);
    const taskResult = await worker.run({
      input: materialized.filePath,
      output: cutoutPath,
      mask: maskPath,
      alphaMatting: payload.alphaMatting,
      foregroundThreshold,
      backgroundThreshold,
      erodeSize
    });

    if (!taskResult.ok) {
      throw new Error((taskResult as { error: string }).error || 'rembg 抠图失败。');
    }

    return {
      ...taskResult,
      maskPath: taskResult.maskPath || undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'rembg 抠图失败。';
    throw new Error(`rembg 抠图失败：${message}`);
  } finally {
    await materialized.cleanup();
  }
}

function buildProviderStatuses(rembgMessage: string, rembgAvailable: boolean): ProviderStatus[] {
  return [
    {
      id: 'edge-floodfill',
      label: '快速去底',
      available: true,
      message: '适合纯底、浅底、电商主图素材的快速预处理。'
    },
    {
      id: 'rembg-python',
      label: '高精度（Python / rembg）',
      available: rembgAvailable,
      message: rembgMessage
    },
    {
      id: 'api-matting',
      label: '第三方 API（预留）',
      available: false,
      message: '当前版本暂未接入第三方抠图 API，可后续扩展。'
    }
  ];
}
export function registerMattingIpc({ ipcMain, fs, app }: Deps) {
  ipcMain.handle('matting:get-provider-status', async () => {
    const probe = await probeRembgPython();
    return {
      providers: buildProviderStatuses(probe.message, probe.available)
    };
  });

  ipcMain.handle('matting:run', async (_event, payload: RunPayload) => {
    const assetPath = payload?.assetPath?.trim();
    if (!assetPath) {
      return {
        status: 'error' as const,
        error: '缺少素材路径或数据源。'
      };
    }

    const provider = payload.provider || 'edge-floodfill';

    try {
      let result;
      if (provider === 'edge-floodfill') {
        result = await runFastMatting({ fs, app }, payload);
      } else if (provider === 'rembg-python') {
        // execFile 模式：每张图独立 Python 进程，稳定可靠
        result = await runRembgMatting({ fs, app }, payload);
      } else {
        throw new Error(`当前版本尚未接入 ${provider} Provider。`);
      }

      return {
        status: 'success' as const,
        result
      };
    } catch (error) {
      return {
        status: 'error' as const,
        error: error instanceof Error ? error.message : '抠图失败。'
      };
    }
  });

  ipcMain.handle('matting:export-cutouts', async (_event, payload: ExportCutoutsPayload) => {
    const rootDir = payload?.rootDir?.trim();
    const items = payload?.items ?? [];

    if (!rootDir) {
      return { ok: false as const, error: '未选择导出目录。', count: 0 };
    }

    if (!items.length) {
      return { ok: false as const, error: '没有可导出的抠图文件。', count: 0 };
    }

    await fs.mkdir(rootDir, { recursive: true });

    let count = 0;
    let skipped = 0;
    const usedNames = new Set<string>();

    for (const item of items) {
      const sourcePath = item.sourcePath?.trim();
      if (!sourcePath) continue;

      // 检查源文件是否存在，不存在则跳过
      try {
        await fs.access(sourcePath);
      } catch {
        skipped += 1;
        continue;
      }

      const rawName = (item.fileName?.trim() || path.basename(sourcePath)).replace(/[<>:"/\\|?*]+/g, '_');
      let nextName = rawName || `cutout-${Date.now()}-${count + 1}.png`;
      let suffix = 1;
      while (usedNames.has(nextName)) {
        const ext = path.extname(rawName);
        const base = rawName.slice(0, rawName.length - ext.length) || 'cutout';
        nextName = `${base}-${suffix}${ext || '.png'}`;
        suffix += 1;
      }
      usedNames.add(nextName);

      try {
        await fs.copyFile(sourcePath, path.join(rootDir, nextName));
        count += 1;
      } catch (err) {
        console.error(`[matting] copy cutout failed: ${sourcePath}`, err);
        skipped += 1;
      }
    }

    return { ok: true as const, count, skipped };
  });
}
