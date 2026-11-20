import type { App } from 'electron';
import { readJsonFile, writeJsonFile } from './fs.service';
import { resolveConfigPath } from './path.service';

export async function readConfig<T>(app: App, fileName: string, fallback: T): Promise<T> {
  return readJsonFile(resolveConfigPath(app, fileName), fallback);
}

export async function writeConfig(app: App, fileName: string, value: unknown) {
  await writeJsonFile(resolveConfigPath(app, fileName), value);
}
