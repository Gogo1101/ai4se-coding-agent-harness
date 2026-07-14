import type { LLMContext, FeedbackSignal, Round, Config } from '../types.js';
import { compressHistory } from './history-compressor.js';

const SYSTEM_PROMPT = `You are a Python coding agent. You write Python code to solve programming tasks.
You receive a task description and test files. You must write code that passes all tests.

You respond with a JSON action. Available actions:
- {"action": "write_file", "path": "filename.py", "content": "your code here"}
- {"action": "run_tests"}

Workflow:
1. First, use write_file to write your solution code.
2. Then, use run_tests to run the tests.
3. If tests fail, read the feedback and fix your code with another write_file, then run_tests again.

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
