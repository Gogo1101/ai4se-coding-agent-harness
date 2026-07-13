import type { LLMContext, FeedbackSignal, Round, Config } from '../types.js';
import { compressHistory } from './history-compressor.js';

const SYSTEM_PROMPT = `You are a Python coding agent. You write Python code to solve programming tasks.
You receive a task description and test files. You must write code that passes all tests.

You respond with a JSON action. Available actions:
- {"action": "write_file", "path": "filename.py", "content": "your code here"}
- {"action": "run_tests"}

Always respond with exactly one JSON action. Do not include any other text.`;

export function assembleContext(params: { task: string; testFiles: Record<string, string>; config: Config; rounds: Round[]; currentFailure?: FeedbackSignal }): LLMContext {
  const { task, testFiles, config, rounds, currentFailure } = params;
  return {
    systemPrompt: SYSTEM_PROMPT,
    task, testFiles,
    historySummary: compressHistory(rounds, config.agent.maxHistoryTokens),
    currentFailure,
    roundNum: rounds.length + 1,
    maxRetries: config.agent.maxRetries,
  };
}
