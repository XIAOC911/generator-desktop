import path from 'node:path';

type Deps = {
  ipcMain: Electron.IpcMain;
  fs: typeof import('node:fs/promises');
  app: Electron.App;
};

type ExportJob = {
  folder: string;
  fileName: string;
  dataUrl: string;
};

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Buffer.from(base64, 'base64');
}

export function registerExportIpc({ ipcMain, fs }: Deps) {
  ipcMain.handle('export:write-jobs', async (_event, payload: { rootDir: string; jobs: ExportJob[] }) => {
    const jobs = payload.jobs ?? [];
    for (const job of jobs) {
      const folderPath = path.join(payload.rootDir, job.folder);
      await fs.mkdir(folderPath, { recursive: true });
      await fs.writeFile(path.join(folderPath, job.fileName), dataUrlToBuffer(job.dataUrl));
    }
    return { count: jobs.length };
  });
}
