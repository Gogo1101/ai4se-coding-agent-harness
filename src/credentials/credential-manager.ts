import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import keytar from 'keytar';

const SERVICE = 'coding-agent-harness';
const ACCOUNT = 'api-key';
const KEY_FILE = join(homedir(), '.harness', 'auth.json');

function fileSetKey(key: string): void {
  const dir = join(homedir(), '.harness');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify({ apiKey: key }), 'utf-8');
}

function fileGetKey(): string | null {
  if (!existsSync(KEY_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(KEY_FILE, 'utf-8')) as { apiKey: string };
    return data.apiKey || null;
  } catch {
    return null;
  }
}

function fileDeleteKey(): void {
  if (existsSync(KEY_FILE)) writeFileSync(KEY_FILE, '{}', 'utf-8');
}

export class CredentialManager {
  async hasKey(): Promise<boolean> {
    try {
      const key = await keytar.getPassword(SERVICE, ACCOUNT);
      if (key) return true;
    } catch { /* keytar unavailable */ }
    return fileGetKey() !== null;
  }

  async getKey(): Promise<string | null> {
    try {
      const key = await keytar.getPassword(SERVICE, ACCOUNT);
      if (key) return key;
    } catch { /* keytar unavailable */ }
    return fileGetKey();
  }

  async setKey(key: string): Promise<void> {
    try {
      await keytar.setPassword(SERVICE, ACCOUNT, key);
    } catch {
      fileSetKey(key);
    }
  }

  async clearKey(): Promise<void> {
    try {
      await keytar.deletePassword(SERVICE, ACCOUNT);
    } catch { /* keytar unavailable */ }
    fileDeleteKey();
  }

  async getStatus(): Promise<string> {
    const key = await this.getKey();
    if (!key) return 'API Key: not configured';
    return `API Key: ${maskKey(key)} (configured)`;
  }
}

function maskKey(key: string): string {
  if (key.length <= 11) return '****';
  return `${key.substring(0, 6)}****${key.substring(key.length - 5)}`;
}
