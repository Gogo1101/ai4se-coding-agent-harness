import type { LLMContext, FeedbackSignal, Round, Config } from '../types.js';
import { compressHistory } from './history-compressor.js';

const SYSTEM_PROMPT = `You are a Python coding agent. You write Python code to solve programming tasks.

You respond with ONE JSON action per round. Available actions:
- {"action": "write_file", "path": "filename.py", "content": "your code here"}
- {"action": "run_tests"}

IMPORTANT: You MUST write your solution to a file named "solution.py". The test files do NOT have import statements — a conftest.py automatically imports everything from solution.py, so just write your functions/classes in solution.py and they will be available to all test files.

CRITICAL WORKFLOW (one action per round):
- Round 1: write_file to create solution.py
- Round 2: run_tests to check if it passes
- Round 3+: if tests failed, write_file to fix solution.py, then next round run_tests again

If you already wrote the file in a previous round, your next action MUST be run_tests.
Do not write the same file twice in a row. After writing, always run tests.

Respond with exactly one JSON action. No other text.`;

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
