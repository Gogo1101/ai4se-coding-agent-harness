import keytar from 'keytar';

const SERVICE = 'coding-agent-harness';
const ACCOUNT = 'api-key';

export class CredentialManager {
  async hasKey(): Promise<boolean> { return (await keytar.getPassword(SERVICE, ACCOUNT)) !== null; }
  async getKey(): Promise<string | null> { return await keytar.getPassword(SERVICE, ACCOUNT); }
  async setKey(key: string): Promise<void> { await keytar.setPassword(SERVICE, ACCOUNT, key); }
  async clearKey(): Promise<void> { await keytar.deletePassword(SERVICE, ACCOUNT); }
  async getStatus(): Promise<string> {
    const key = await keytar.getPassword(SERVICE, ACCOUNT);
    if (!key) return 'API Key: not configured';
    return `API Key: ${maskKey(key)} (configured, source: keychain)`;
  }
}

function maskKey(key: string): string {
  if (key.length <= 11) return '****';
  return `${key.substring(0, 6)}****${key.substring(key.length - 5)}`;
}
