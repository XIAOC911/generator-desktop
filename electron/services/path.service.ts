import path from 'node:path';

type AppLike = {
  getPath(name: 'userData'): string;
};

export function resolveAppDataDir(app: AppLike) {
  return app.getPath('userData');
}

export function resolveConfigPath(app: AppLike, fileName: string) {
  return path.join(resolveAppDataDir(app), fileName);
}
