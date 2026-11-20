import path from 'node:path';

type Deps = {
  ipcMain: Electron.IpcMain;
  dialog: Electron.Dialog;
  fs: typeof import('node:fs/promises');
  app: Electron.App;
};

type RecentProject = {
  filePath: string;
  name: string;
  lastOpenedAt: number;
};

const RECENT_LIMIT = 8;

function recentProjectsPath(app: Electron.App) {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

function autosavePath(app: Electron.App) {
  return path.join(app.getPath('userData'), 'autosave-project.json');
}

async function readRecentProjects(fs: typeof import('node:fs/promises'), app: Electron.App): Promise<RecentProject[]> {
  try {
    const content = await fs.readFile(recentProjectsPath(app), 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

async function writeRecentProjects(
  fs: typeof import('node:fs/promises'),
  app: Electron.App,
  projects: RecentProject[]
) {
  const filePath = recentProjectsPath(app);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ projects }, null, 2), 'utf8');
}

async function rememberRecentProject(
  fs: typeof import('node:fs/promises'),
  app: Electron.App,
  filePath: string
): Promise<RecentProject[]> {
  const nextItem: RecentProject = {
    filePath,
    name: path.basename(filePath),
    lastOpenedAt: Date.now()
  };

  const projects = await readRecentProjects(fs, app);
  const nextProjects = [nextItem, ...projects.filter((item) => item.filePath !== filePath)].slice(0, RECENT_LIMIT);
  await writeRecentProjects(fs, app, nextProjects);
  return nextProjects;
}

export function registerProjectIpc({ ipcMain, dialog, fs, app }: Deps) {
  ipcMain.handle('project:save-as', async (_event, payload: unknown) => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Fan Project', extensions: ['fanproj', 'json'] }],
      defaultPath: 'project.fanproj.json'
    });

    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    const recentProjects = await rememberRecentProject(fs, app, result.filePath);
    return { filePath: result.filePath, recentProjects };
  });

  ipcMain.handle('project:save-to-path', async (_event, payload: { filePath: string; content: unknown }) => {
    if (!payload?.filePath) return null;
    await fs.writeFile(payload.filePath, JSON.stringify(payload.content, null, 2), 'utf8');
    const recentProjects = await rememberRecentProject(fs, app, payload.filePath);
    return { filePath: payload.filePath, recentProjects };
  });

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Fan Project', extensions: ['fanproj', 'json'] }]
    });

    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    const recentProjects = await rememberRecentProject(fs, app, filePath);
    return { filePath, content, recentProjects };
  });

  ipcMain.handle('project:open-recent', async (_event, filePath: string) => {
    if (!filePath) return null;
    const content = await fs.readFile(filePath, 'utf8');
    const recentProjects = await rememberRecentProject(fs, app, filePath);
    return { filePath, content, recentProjects };
  });

  ipcMain.handle('project:list-recent', async () => {
    return readRecentProjects(fs, app);
  });

  ipcMain.handle('project:save-autosave', async (_event, payload: unknown) => {
    const filePath = autosavePath(app);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { filePath, savedAt: Date.now() };
  });

  ipcMain.handle('project:load-autosave', async () => {
    try {
      const filePath = autosavePath(app);
      const content = await fs.readFile(filePath, 'utf8');
      const stats = await fs.stat(filePath);
      return { filePath, content, savedAt: stats.mtimeMs };
    } catch {
      return null;
    }
  });

  ipcMain.handle('project:clear-autosave', async () => {
    try {
      await fs.unlink(autosavePath(app));
      return true;
    } catch {
      return false;
    }
  });
}
