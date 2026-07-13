import { describe, it, expect, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn((service: string, account: string) =>
      Promise.resolve(store.get(`${service}:${account}`) ?? null)),
    setPassword: vi.fn((service: string, account: string, password: string) => {
      store.set(`${service}:${account}`, password);
      return Promise.resolve(undefined);
    }),
    deletePassword: vi.fn((service: string, account: string) => {
      store.delete(`${service}:${account}`);
      return Promise.resolve(true);
    }),
  },
}));

import { CredentialManager } from '../src/credentials/credential-manager.js';

describe('CredentialManager', () => {
  it('returns false when no key exists', async () => {
    expect(await new CredentialManager().hasKey()).toBe(false);
  });
  it('stores and retrieves a key', async () => {
    const cm = new CredentialManager();
    await cm.setKey('sk-test-1234567890abcdef');
    expect(await cm.hasKey()).toBe(true);
    expect(await cm.getKey()).toBe('sk-test-1234567890abcdef');
  });
  it('masks key in status output', async () => {
    const cm = new CredentialManager();
    await cm.setKey('sk-1234567890abcdefghijklm');
    const status = await cm.getStatus();
    expect(status).toContain('sk-123');
    expect(status).toContain('ijklm');
    expect(status).not.toContain('1234567890abcdefghij');
  });
  it('clears the key', async () => {
    const cm = new CredentialManager();
    await cm.setKey('sk-test');
    await cm.clearKey();
    expect(await cm.hasKey()).toBe(false);
  });
  it('returns not configured status when no key', async () => {
    expect(await new CredentialManager().getStatus()).toContain('not configured');
  });
});
