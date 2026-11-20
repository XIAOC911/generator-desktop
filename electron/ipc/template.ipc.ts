import path from 'node:path';

type Deps = {
  ipcMain: Electron.IpcMain;
  fs: typeof import('node:fs/promises');
  app: Electron.App;
};

function templatePath(app: Electron.App) {
  return path.join(app.getPath('userData'), 'templates.json');
}

export function registerTemplateIpc({ ipcMain, fs, app }: Deps) {
  ipcMain.handle('template:load', async () => {
    const filePath = templatePath(app);
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return JSON.stringify({ templates: [], bgRotationTemplates: [] }, null, 2);
    }
  });

  ipcMain.handle('template:save', async (_event, payload: unknown) => {
    const filePath = templatePath(app);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return filePath;
  });
}
