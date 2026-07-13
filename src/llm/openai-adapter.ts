import OpenAI from 'openai';
import type { LLMAdapter } from './llm-adapter.js';
import type { LLMContext, LLMResponse } from '../types.js';
import { parseAction } from '../agent/action-parser.js';

export interface OpenAIAdapterConfig { apiKey: string; apiBase: string; model: string; temperature: number; maxTokens: number }

export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: OpenAIAdapterConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.apiBase });
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async generate(context: LLMContext): Promise<LLMResponse> {
    const userPrompt = this.buildPrompt(context);
    const completion = await this.client.chat.completions.create({
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: 'system', content: context.systemPrompt }, { role: 'user', content: userPrompt }],
    });
    const content = completion.choices[0]?.message?.content || '';
    return { content, action: parseAction(content), usage: completion.usage ? { promptTokens: completion.usage.prompt_tokens, completionTokens: completion.usage.completion_tokens } : undefined };
  }

  private buildPrompt(ctx: LLMContext): string {
    const parts: string[] = [`## Task\n${ctx.task}\n`, `## Test Files\n`];
    for (const [filename, content] of Object.entries(ctx.testFiles)) parts.push(`### ${filename}\n\`\`\`python\n${content}\n\`\`\`\n`);
    if (ctx.historySummary) parts.push(`## Previous Attempts\n${ctx.historySummary}\n`);
    if (ctx.currentFailure) {
      parts.push(`## Current Failure\nType: ${ctx.currentFailure.failureType}\nPassed: ${ctx.currentFailure.passed}/${ctx.currentFailure.total}\n`);
      for (const f of ctx.currentFailure.failures) parts.push(`- ${f.testName}: ${f.assertion} (expected: ${f.expected}, actual: ${f.actual})\n  Traceback: ${f.traceback}\n`);
    }
    parts.push(`\n## Round ${ctx.roundNum} of ${ctx.maxRetries}\nRespond with a JSON action.`);
    return parts.join('\n');
  }
}
