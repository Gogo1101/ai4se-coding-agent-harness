// tests/guardrail.test.ts
import { describe, it, expect } from 'vitest';
import { Guardrail } from '../src/guardrail/guardrail.js';
import type { Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: {
    enableHitl: true, hitlTimeoutSeconds: 30,
    blockedPatterns: ['rm\\s+-rf\\s+/', 'git\\s+push\\s+(-f|--force)'],
    approvalPatterns: ['sudo\\s+', 'chmod\\s+-R'],
  },
  docker: { image: 'test', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

describe('Guardrail', () => {
  it('allows safe commands', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'ls -la' }).decision).toBe('ALLOW');
  });
  it('blocks rm -rf /', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'rm -rf /' }).decision).toBe('BLOCK');
  });
  it('blocks git push --force', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'git push --force origin main' }).decision).toBe('BLOCK');
  });
  it('requires approval for sudo', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'sudo apt update' }).decision).toBe('REQUIRE_APPROVAL');
  });
  it('allows write_file to workspace', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'write_file', path: '/workspace/stack.py', content: 'x' }).decision).toBe('ALLOW');
  });
  it('blocks write_file to system directory', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'write_file', path: '/etc/passwd', content: 'x' }).decision).toBe('BLOCK');
  });
  it('blocks path traversal via ../', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'write_file', path: '../etc/passwd', content: 'x' }).decision).toBe('BLOCK');
  });
  it('allows run_tests', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_tests' }).decision).toBe('ALLOW');
  });
});
