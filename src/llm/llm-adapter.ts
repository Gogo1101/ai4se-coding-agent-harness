import type { LLMContext, LLMResponse } from '../types.js';

export interface LLMAdapter {
  generate(context: LLMContext): Promise<LLMResponse>;
}
