import { safeStorage, type App } from 'electron';
import fs from 'node:fs/promises';
import { readJsonFile, writeJsonFile } from './fs.service';
import { resolveConfigPath } from './path.service';

type SecretState = Record<string, string>;

const SECRET_FILE = 'fan-generator.secrets.json';
const ENCRYPTED_PREFIX = 'enc:v1:';

function decodeLegacy(value: string) {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

async function readSecrets(app: App) {
  return readJsonFile<SecretState>(resolveConfigPath(app, SECRET_FILE), {});
}

async function writeSecrets(app: App, secrets: SecretState) {
  const filePath = resolveConfigPath(app, SECRET_FILE);
  await writeJsonFile(filePath, secrets);
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Windows 上 ACL 不一定支持 chmod；密钥本身仍由 safeStorage 加密。
  }
}

function encrypt(value: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法安全保存 API Key。');
  }
  return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(value).toString('base64')}`;
}

function decrypt(value: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法读取已加密的 API Key。');
  }
  return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'));
}

export async function hasSecret(app: App, key: string) {
  const secrets = await readSecrets(app);
  return typeof secrets[key] === 'string' && secrets[key].length > 0;
}

export async function getSecret(app: App, key: string) {
  const secrets = await readSecrets(app);
  const raw = secrets[key];
  if (!raw) return '';

  if (raw.startsWith(ENCRYPTED_PREFIX)) {
    return decrypt(raw);
  }

  // Migrate legacy Base64 values to OS-backed encryption on first read.
  const legacyValue = decodeLegacy(raw);
  if (!legacyValue) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('检测到旧版未加密 API Key，但系统安全存储不可用，无法安全迁移。请先启用系统凭据存储后重试。');
  }
  secrets[key] = encrypt(legacyValue);
  await writeSecrets(app, secrets);
  return legacyValue;
}

export async function setSecret(app: App, key: string, value: string) {
  const secrets = await readSecrets(app);
  if (!value) {
    delete secrets[key];
  } else {
    secrets[key] = encrypt(value);
  }
  await writeSecrets(app, secrets);
}
