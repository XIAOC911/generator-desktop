import path from 'node:path';
import { nativeImage } from 'electron';

type Deps = {
  ipcMain: Electron.IpcMain;
  dialog: Electron.Dialog;
  fs: typeof import('node:fs/promises');
  app: Electron.App;
};

/** 生成缩略图并返回原始尺寸。PNG 保留原格式以保护透明通道；JPG/JPEG/WEBP 使用 JPEG 减小体积。 */
function createThumbnail(buffer: Buffer, mime: string): { dataUrl: string; width: number; height: number } {
  try {
    const image = nativeImage.createFromBuffer(buffer);
    const size = image.getSize();
    const isPng = mime === 'image/png';
    const maxEdge = 600;
    if (size.width <= maxEdge && size.height <= maxEdge) {
      // 小图：PNG 保留原格式保护透明通道，其他用 JPEG
      if (isPng) {
        const png = image.toPNG();
        return {
          dataUrl: `data:image/png;base64,${png.toString('base64')}`,
          width: size.width,
          height: size.height
        };
      }
      const jpeg = image.toJPEG(92);
      return {
        dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
        width: size.width,
        height: size.height
      };
    }
    const ratio = maxEdge / Math.max(size.width, size.height);
    const thumb = image.resize({
      width: Math.round(size.width * ratio),
      height: Math.round(size.height * ratio),
    });
    // PNG 保留原格式保护透明通道；其他用 JPEG 减小体积
    if (isPng) {
      const pngBuffer = thumb.toPNG();
      return {
        dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
        width: size.width,
        height: size.height
      };
    }
    const jpegBuffer = thumb.toJPEG(85);
    return {
      dataUrl: `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`,
      width: size.width,
      height: size.height
    };
  } catch {
    return {
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      width: 0,
      height: 0
    };
  }
}

export function registerFileIpc({ ipcMain, dialog, fs }: Deps) {
  ipcMain.handle('file:open-images', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });

    if (result.canceled) return [];

    return Promise.all(
      result.filePaths.map(async (filePath) => {
        const buffer = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const thumb = createThumbnail(buffer, mime);
        return {
          id: path.basename(filePath) + ':' + Date.now(),
          name: path.basename(filePath),
          originalPath: filePath,
          previewUrl: thumb.dataUrl,
          naturalWidth: thumb.width,
          naturalHeight: thumb.height
        };
      })
    );
  });

  ipcMain.handle('file:open-json', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    return { filePath, content };
  });

  ipcMain.handle('file:read-image', async (_event, filePath: string) => {
    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      // 导出用：直接使用原始文件数据，不转码，保证清晰度不变
      const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      // 仍需解析尺寸供布局计算
      const image = nativeImage.createFromBuffer(buffer);
      const size = image.getSize();
      return { dataUrl, width: size.width, height: size.height };
    } catch {
      return null;
    }
  });

  ipcMain.handle('file:pick-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
}
