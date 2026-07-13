# Task 11: Context Assembler — Report

## Status: DONE

## What I Implemented

Created the context assembler, a pure function that assembles all components of the feedback loop into the `LLMContext` object consumed by the LLM adapter. This is the final piece of the feedback module — it wires together the task description, test files, config, prior rounds (via the history compressor from Task 9), and the current failure signal into a single context payload.

- `src/feedback/context-assembler.ts` — `assembleContext(params): LLMContext`
- `tests/context-assembler.test.ts` — 2 tests covering initial and history+failure assembly

### Logic

`assembleContext` accepts a params object (`task`, `testFiles`, `config`, `rounds`, `currentFailure?`) and returns an `LLMContext` with:

1. **`systemPrompt`** — a static prompt instructing the LLM it is a Python coding agent that must respond with exactly one JSON action (`write_file` or `run_tests`).
2. **`task`** / **`testFiles`** — passed through from params.
3. **`historySummary`** — delegated to `compressHistory(rounds, config.agent.maxHistoryTokens)` from Task 9, which returns `''` for empty rounds and a compressed/truncated summary otherwise.
4. **`currentFailure`** — the optional `FeedbackSignal` passed through verbatim.
5. **`roundNum`** — computed as `rounds.length + 1` (next round to run).
6. **`maxRetries`** — pulled from `config.agent.maxRetries`.

## TDD Evidence

Followed the plan's TDD steps exactly:

1. **Step 1 (Write failing test):** Wrote `tests/context-assembler.test.ts` with 2 test cases before any implementation existed.
2. **Step 2 (Verify RED):** Ran `npx vitest run tests/context-assembler.test.ts` — failed as expected:
   ```
   Error: Failed to load url ../src/feedback/context-assembler.js ... Does the file exist?
   ```
3. **Step 3 (Write minimal implementation):** Created `src/feedback/context-assembler.ts` with `assembleContext` + the `SYSTEM_PROMPT` constant.
4. **Step 4 (Verify GREEN):** Ran the same command — all 2 tests PASS.
5. **Step 5 (Commit):** Committed with the plan's message `feat: context assembler for LLM context construction`.

## Files Changed

| File | Action |
|------|--------|
| `src/feedback/context-assembler.ts` | Created (23 lines) |
| `tests/context-assembler.test.ts` | Created (31 lines) |

## Test Summary

- Targeted: `tests/context-assembler.test.ts` — **2/2 passed**
- Full suite: **10 test files, 45 tests, all passed**
- Typecheck: `npx tsc --noEmit` — clean, no errors

### Test cases

| # | Case | Expected | Result |
|---|------|----------|--------|
| 1 | Initial context with no history | `roundNum=1`, `historySummary=''`, `task` echoed | PASS |
| 2 | Context with 1 prior round + current failure | `roundNum=2`, `historySummary` contains `'Round 1'` | PASS |

## Self-Review Findings

- **Pure function:** No side effects, no I/O, no external state — matches the "pure function" contract in the plan. The only external call is to `compressHistory`, itself a pure function.
- **Convention match:** Uses `.js` extension in imports and `import type` for type-only imports, consistent with sibling files (`history-compressor.ts`, `repetition-detector.ts`, `failure-classifier.ts`). No comments added, per instructions.
- **Dependency wiring correct:** Imports `compressHistory` from `./history-compressor.js` (Task 9) and types from `../types.js` (Task 1) — both verified to exist before implementation.
- **`roundNum` semantics:** `rounds.length + 1` correctly yields `1` for the first round (empty history) and `2` after one completed round, matching the plan's test assertions.
- **`historySummary` delegation:** By delegating to `compressHistory`, the assembler automatically inherits the truncation behavior (keeps recent rounds when exceeding `maxHistoryTokens`) and the empty-string-on-no-rounds behavior, both verified by the tests.
- **`currentFailure` passthrough:** The optional `FeedbackSignal` is forwarded as-is; the LLM adapter (Task 18) is responsible for formatting it into the user prompt. This keeps the assembler a thin, testable composition layer.
- **Static system prompt:** The `SYSTEM_PROMPT` is a module-level constant, so it is stable across calls and does not leak per-task state.
- **No secrets, no hardcoded keys.** No new dependencies introduced.

## Issues / Concerns

None. The implementation matches the plan exactly, all tests pass, and the typecheck is clean. The function is a thin pure composition layer over `compressHistory` and the input params, with no behavior beyond what the plan specifies.

One minor observation (not a concern for this task): the `SYSTEM_PROMPT` advertises only `write_file` and `run_tests` actions, while the `Action` type also includes `read_file` and `run_shell`. This matches the plan's text verbatim and is consistent with the action parser (Task 12) which supports all four; the prompt is intentionally restrictive to steer the LLM toward the safe, common actions. Downstream tasks may extend the prompt if needed.
