import { describe, it, expect } from 'vitest';
import { assembleContext } from '../src/feedback/context-assembler.js';
import type { Round, Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: [], approvalPatterns: [] },
  docker: { image: 'test', workDir: '/ws', memoryLimit: '256m' },
  debug: false,
};

describe('ContextAssembler', () => {
  it('assembles initial context with no history', () => {
    const ctx = assembleContext({ task: 'Implement a stack', testFiles: { 'test_stack.py': 'def test_push(): pass' }, config, rounds: [], currentFailure: undefined });
    expect(ctx.task).toBe('Implement a stack');
    expect(ctx.roundNum).toBe(1);
    expect(ctx.historySummary).toBe('');
  });
  it('assembles context with history and current failure', () => {
    const rounds: Round[] = [{
      id: 1, taskId: 't1', roundNum: 1, codeFiles: { 'stack.py': 'x' },
      action: { type: 'write_file', path: 'stack.py', content: 'x' } as never,
      feedback: { total: 1, passed: 0, failed: 1, failures: [{ testName: 'test_a', assertion: 'assert x', expected: '1', actual: '0', traceback: '' }], failureType: 'ASSERTION_ERROR', rawReport: '' },
      failureType: 'ASSERTION_ERROR', createdAt: '',
    }];
    const ctx = assembleContext({ task: 'Implement a stack', testFiles: {}, config, rounds, currentFailure: { total: 1, passed: 0, failed: 1, failures: [{ testName: 'test_a', assertion: 'assert x', expected: '1', actual: '0', traceback: '' }], failureType: 'ASSERTION_ERROR', rawReport: '' } });
    expect(ctx.roundNum).toBe(2);
    expect(ctx.historySummary).toContain('Round 1');
  });
});
