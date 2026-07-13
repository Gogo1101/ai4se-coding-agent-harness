import { describe, it, expect, vi } from 'vitest';
import { OpenAIAdapter } from '../src/llm/openai-adapter.js';
import type { LLMContext } from '../src/types.js';

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"action": "run_tests"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }) } },
  })),
}));

describe('OpenAIAdapter', () => {
  it('calls the API and returns an LLMResponse', async () => {
    const adapter = new OpenAIAdapter({ apiKey: 'sk-test', apiBase: 'https://example.com/v1', model: 'deepseek-v4-pro', temperature: 0.3, maxTokens: 4096 });
    const ctx: LLMContext = { systemPrompt: 'test', task: 'Implement a stack', testFiles: {}, historySummary: '', roundNum: 1, maxRetries: 5 };
    const response = await adapter.generate(ctx);
    expect(response.content).toBe('{"action": "run_tests"}');
    expect(response.action.type).toBe('run_tests');
    expect(response.usage?.promptTokens).toBe(100);
  });
});
