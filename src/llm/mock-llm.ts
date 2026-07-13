import type { LLMAdapter } from './llm-adapter.js';
import type { LLMContext, LLMResponse, Action } from '../types.js';

export class MockLLM implements LLMAdapter {
  private script: Action[];
  private index = 0;
  private _callCount = 0;
  private _lastContext: LLMContext | null = null;

  constructor(script: Action[]) { this.script = script; }
  get callCount(): number { return this._callCount; }
  get lastContext(): LLMContext | null { return this._lastContext; }

  async generate(context: LLMContext): Promise<LLMResponse> {
    if (this.index >= this.script.length) throw new Error('Mock LLM script exhausted');
    const action = this.script[this.index];
    this.index++;
    this._callCount++;
    this._lastContext = context;
    return { content: JSON.stringify(action), action };
  }
}
