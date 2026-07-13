# Task 22 Report: Mechanism Demos

## What I Implemented

Implemented Task 22 (Mechanism Demos) from PLAN.md, creating `tests/mechanism-demo.test.ts` with three deterministic end-to-end demos that exercise the harness's core mechanisms through the `AgentLoop`. These demos satisfy course §A.6 and consume all previously-built modules (Tasks 1–21).

### The three demos

1. **D1: Guardrail intercepts dangerous action** — The MockLLM scripts a `run_shell` action with `rm -rf /`. The `Guardrail.checkAction()` matches the blocked pattern `rm\s+-rf\s+/` and returns `BLOCK`. The `AgentLoop` records the blocked round (with a `RUNTIME_ERROR` feedback signal) and continues to the next scripted action. The LLM then writes a valid file and runs tests, which pass. The test asserts `status === 'success'` and that the `guardrail:checked` event stream contains `BLOCK:run_shell`. This demonstrates the guardrail interception mechanism: dangerous commands are blocked, the round is recorded as failed, and the loop continues to the next attempt.

2. **D2: Feedback loop drives self-correction** — The MockLLM scripts: write_file (v1) → run_tests (fail) → write_file (v2) → run_tests (pass). The mock tool router returns a failing `FeedbackSignal` (1 failed, `ASSERTION_ERROR`) on the first `run_tests` call and a passing signal on the second. The `AgentLoop` feeds the failure back into the context via `assembleContext()` (which uses `compressHistory` + `currentFailure`), the LLM generates a corrected write_file, and the second test run passes. The test asserts `status === 'success'` and `callCount === 2` (exactly two test executions). This demonstrates the full feedback loop: parse pytest report → classify failure → feed back to LLM → self-correct → succeed.

3. **D3: Repetition detection terminates early** — The MockLLM scripts three consecutive `run_tests` actions. The mock tool router always returns the same failing `FeedbackSignal` (`ASSERTION_ERROR`, `test_a`). After the 3rd round, `detectRepetition(rounds, 3)` returns `true` because the last 3 rounds all have the same failure key (`ASSERTION_ERROR:test_a`). The `AgentLoop` emits `agent:stopped` with reason "Repetition detected" and returns `failure`. The test asserts `status === 'failure'` and that an `agent:stopped` event with "Repetition" in the reason was emitted. This demonstrates the repetition-detection safety mechanism: the loop terminates before `maxRetries` when it detects it's stuck in a loop.

## Files Changed

- `tests/mechanism-demo.test.ts` — new (111 lines, 3 tests: D1, D2, D3)

Commit: `e2d636c` — "feat: mechanism demos (D1 guardrail, D2 feedback loop, D3 repetition)"

## Self-Review Findings

### Plan adherence

The test file was written from PLAN.md Task 22 Step 1. The structure, imports, config, `makeTask()`, `mockToolRouter()`, and all three demo `describe`/`it` blocks match the plan's code. Three deviations were necessary to make the tests pass (Step 2 expects "3 tests PASS"); each is documented below with root cause and rationale.

### Deviation 1: Added `memory.close()` before `rmSync(dbPath)` in all three demos

- **Root cause**: The plan's test code calls `rmSync(dbPath)` to clean up the temp SQLite database, but never calls `memory.close()` first. On Windows, the SQLite file handle (opened by `better-sqlite3` in `MemoryStore` constructor) is still open when `rmSync` runs, causing `EPERM: Permission denied`. D1 and D2 both failed at the `rmSync` line (after their assertions passed) with this error.
- **Fix**: Added `memory.close();` before `rmSync(dbPath)` in all three demos, matching the exact convention used in the existing `tests/agent-loop.test.ts` (e.g., line 45: `memory.close(); rmSync(dbPath);`).
- **Verification**: D1 and D2 now pass cleanly. The assertions themselves were already passing before the fix — only the cleanup was broken.

### Deviation 2: Changed D3 mockLLM script from alternating write_file/run_tests to 3 consecutive run_tests

- **Root cause**: The plan's D3 script is `[write_file v1, run_tests, write_file v2, run_tests, write_file v3, run_tests]` (6 actions). This cannot trigger repetition detection for two reasons:
  1. **Alternating feedback keys**: In the `AgentLoop`, `write_file` actions produce rounds with `feedback: null, failureType: null`. The `failureKey()` function in `repetition-detector.ts` maps these to `'UNKNOWN:'`. `run_tests` actions (failing) produce rounds with `failureType: 'ASSERTION_ERROR'` and `testName: 'test_a'`, mapping to `'ASSERTION_ERROR:test_a'`. The rounds alternate between these two keys, so `detectRepetition(rounds, 3)` (which requires the last 3 rounds to be identical) never returns `true`.
  2. **Exceeds maxRetries**: The 6-action script requires 6 rounds, but `config.agent.maxRetries = 5`. The loop exits after round 5 with reason "Max retries (5) reached", not "Repetition detected". The `stopped` flag (which checks for "Repetition" in the reason) is therefore `false`, failing the assertion `expect(stopped).toBe(true)`.
- **Fix**: Changed the D3 script to `[run_tests, run_tests, run_tests]` (3 actions). This produces 3 consecutive rounds with identical failure keys (`'ASSERTION_ERROR:test_a'`), triggering `detectRepetition` after round 3 — well before `maxRetries=5`. The loop emits `agent:stopped` with reason "Repetition detected" and returns `failure`.
- **Rationale**: This matches the exact pattern used in the existing `tests/agent-loop.test.ts` "detects repetition and terminates early" test (line 118: `new MockLLM([{ type: 'run_tests' }, { type: 'run_tests' }, { type: 'run_tests' }])`). The intent — "detects 3 identical failures and stops before max_retries" — is fully preserved.
- **Verification**: D3 now passes. `status === 'failure'` and `stopped === true`.

### Type and interface consistency

- `AgentLoop` constructor deps (`{ llm, guardrail, hitl, toolRouter, memory, bus, config }`) match `AgentLoopDeps` in `src/agent/agent-loop.ts:14`.
- `MockLLM` constructor takes `Action[]` — matches `src/llm/mock-llm.ts:10`.
- `MemoryStore` constructor takes `dbPath: string` — matches `src/memory/memory-store.ts:6`.
- `Guardrail` constructor takes `Config` — matches `src/guardrail/guardrail.ts:12`.
- `HitlStateMachine` constructor takes `(bus, timeoutSeconds)` — matches `src/guardrail/hitl-state-machine.ts:12`.
- The mock `toolRouter` shape (`{ dockerExec: { createContainer, remove, writeFile }, dispatch }`) matches what `AgentLoop.run()` accesses: `toolRouter.dockerExec.createContainer`, `toolRouter.dockerExec.writeFile`, `toolRouter.dockerExec.remove`, `toolRouter.dispatch`.
- The `FeedbackSignal` objects returned by the mock router match the `FeedbackSignal` interface in `src/types.ts`.

### No comments added

Per the project constraint, no comments were added to the test file.

## Issues / Concerns

1. **Plan's D3 test code is buggy (fixed)**: As described in Deviation 2 above, the plan's D3 script cannot trigger repetition detection due to (a) alternating null/failing feedback keys and (b) exceeding `maxRetries`. The fix (3 consecutive `run_tests` actions) matches the existing `agent-loop.test.ts` pattern and preserves the test's stated intent. This is a plan-level bug, not an implementation defect. The production code (`repetition-detector.ts`, `agent-loop.ts`) is correct — the issue is solely in the plan's test script.

2. **Plan's test code omits `memory.close()` (fixed)**: The plan's demo tests call `rmSync(dbPath)` without first closing the SQLite handle, causing `EPERM` on Windows. The existing `agent-loop.test.ts` correctly calls `memory.close()` first. This is a plan-level omission, fixed to match the established convention.

3. **D3 demo is less narratively rich than intended**: The plan's D3 script told a story of "agent writes v1, tests fail; writes v2, tests fail; writes v3, tests fail → repetition detected". The fix uses 3 bare `run_tests` actions, which is less illustrative of the self-correction loop but correctly demonstrates the repetition-detection mechanism. A richer fix would require changing the `repetition-detector.ts` to skip rounds with null feedback (only compare rounds that have `feedback`), but that's a production-code change outside Task 22's scope and would risk breaking the existing `repetition-detector.test.ts` expectations. The current fix is the minimal, safe choice.

4. **Task brief vs. plan discrepancy**: The task brief describes D1 as "Feedback loop", D2 as "Guardrail interception", and D3 as "HITL approval flow". The actual PLAN.md labels them as D1=Guardrail, D2=Feedback loop, D3=Repetition detection. I followed the PLAN.md exactly (as instructed), not the task brief's labels. No HITL approval demo is included in the plan's Task 22 — HITL approval is already tested in `tests/agent-loop.test.ts` ("executes action after HITL approval" and "skips action after HITL rejection").

## Verification Summary

- `npx vitest run tests/mechanism-demo.test.ts` → 3 tests PASS (D1, D2, D3)
- `npx vitest run` (full suite) → 19 files, 85 tests, all passing (no regressions; +3 from the new demo tests)
- `npx tsc --noEmit` → exit 0 (lint clean)
