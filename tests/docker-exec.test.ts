import { describe, it, expect, vi } from 'vitest';
import { DockerExec } from '../src/tools/docker-exec.js';
import type { Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: [], approvalPatterns: [] },
  docker: { image: 'python:3.12-slim', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

vi.mock('dockerode', () => {
  const mockStream = {
    on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
      if (event === 'data') handler(Buffer.from('ok'));
      if (event === 'end') handler();
    }),
  };
  const container = {
    id: 'container-123',
    start: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({
      start: vi.fn().mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: Error | null, stream: typeof mockStream) => void;
        cb(null, mockStream);
      }),
    }),
    putArchive: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: vi.fn().mockImplementation(() => ({
      createContainer: vi.fn().mockResolvedValue(container),
      getContainer: vi.fn().mockReturnValue(container),
    })),
  };
});

describe('DockerExec', () => {
  it('creates and removes a container', async () => {
    const exec = new DockerExec(config);
    const id = await exec.createContainer('test-1');
    expect(id).toBeDefined();
    await exec.remove(id);
  });
  it('writes files', async () => {
    const exec = new DockerExec(config);
    const id = await exec.createContainer('test-2');
    await expect(exec.writeFile(id, '/workspace/stack.py', 'class Stack: pass')).resolves.toBeUndefined();
    await exec.remove(id);
  });
  it('executes commands', async () => {
    const exec = new DockerExec(config);
    const id = await exec.createContainer('test-3');
    const result = await exec.exec(id, 'echo hello');
    expect(result).toBeDefined();
    await exec.remove(id);
  });
});
