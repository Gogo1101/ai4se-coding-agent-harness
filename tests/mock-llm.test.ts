import { describe, it, expect } from 'vitest';
import { MockLLM } from '../src/llm/mock-llm.js';
import type { LLMContext } from '../src/types.js';

const baseContext: LLMContext = {
  systemPrompt: 'You are a Python coding agent.',
  task: 'Implement a stack',
  testFiles: { 'test_stack.py': 'def test_push(): pass' },
  historySummary: '', roundNum: 1, maxRetries: 5,
};

describe('MockLLM', () => {
  it('returns scripted responses in order', async () => {
    const mock = new MockLLM([
      { type: 'write_file', path: 'stack.py', content: 'class Stack: ...' },
      { type: 'run_tests' },
    ]);
    const r1 = await mock.generate(baseContext);
    expect(r1.action.type).toBe('write_file');
    const r2 = await mock.generate(baseContext);
    expect(r2.action.type).toBe('run_tests');
  });

  it('throws when script is exhausted', async () => {
    const mock = new MockLLM([{ type: 'run_tests' }]);
    await mock.generate(baseContext);
    await expect(mock.generate(baseContext)).rejects.toThrow('Mock LLM script exhausted');
  });

  it('records call history', async () => {
    const mock = new MockLLM([{ type: 'run_tests' }]);
    await mock.generate(baseContext);
    expect(mock.callCount).toBe(1);
    expect(mock.lastContext).toEqual(baseContext);
  });
});
