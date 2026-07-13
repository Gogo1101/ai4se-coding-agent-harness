import { describe, it, expect, vi } from 'vitest';
import { ToolRouter } from '../src/tools/tool-router.js';
import type { Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: [], approvalPatterns: [] },
  docker: { image: 'test', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

vi.mock('../src/tools/docker-exec.js', () => ({
  DockerExec: vi.fn().mockImplementation(() => ({
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('file content'),
    exec: vi.fn().mockResolvedValue({ stdout: '{"tests":[],"summary":{"total":0,"passed":0,"failed":0}}', stderr: '', exitCode: 0 }),
    createContainer: vi.fn().mockResolvedValue('c1'),
    remove: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('ToolRouter', () => {
  it('dispatches write_file', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'write_file', path: '/workspace/stack.py', content: 'x' }, 'c1');
    expect(result).toEqual({ success: true });
  });
  it('dispatches read_file', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'read_file', path: '/workspace/stack.py' }, 'c1');
    expect(result).toEqual({ content: 'file content' });
  });
  it('dispatches run_shell', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'run_shell', command: 'echo hello' }, 'c1');
    expect(result).toHaveProperty('stdout');
  });
  it('dispatches run_tests and returns FeedbackSignal', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'run_tests' }, 'c1') as { feedbackSignal: { total: number; passed: number; failed: number } };
    expect(result.feedbackSignal).toBeDefined();
    expect(result.feedbackSignal.total).toBe(0);
  });
});
