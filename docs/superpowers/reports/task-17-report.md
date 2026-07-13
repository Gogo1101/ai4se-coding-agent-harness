# Task 17: Agent Loop — Report

## Status: DONE_WITH_CONCERNS

## What Was Implemented

The `AgentLoop` class in `src/agent/agent-loop.ts` — the central orchestration loop that ties together all previous modules. The `run(task: Task): Promise<TaskStatus>` method executes the full agent cycle:

1. **Setup**: Emit `task:started`, create Docker container via `toolRouter.dockerExec.createContainer`, write test files into the container.
2. **Round loop** (1..maxRetries):
   - Emit `round:started`
   - **Assemble context** via `assembleContext` (Task 11) — includes task description, test files, compressed history, and current failure
   - Emit `llm:called`, call `llm.generate(context)` (Task 4 LLMAdapter), emit `llm:responded`
   - **Parse action** via `parseAction` (Task 12) with fallback to `response.action` (see Deviations below)
   - Emit `action:parsed`
   - **Guardrail check** via `guardrail.checkAction` (Task 5), emit `guardrail:checked`
   - If BLOCK: record failure feedback, save round, emit `round:completed`, `continue`
   - If REQUIRE_APPROVAL: trigger `HitlStateMachine.requestApproval` (Task 6), await approval response via EventBus, reset HITL
   - **Dispatch tool** via `toolRouter.dispatch` (Task 15), emit `tool:executed`
   - If `run_tests` action: extract `feedbackSignal`, **classify failure** via `classifyFailure` (Task 8)
     - If `failed === 0`: save round, update task status to `success`, emit `task:completed`, return `'success'`
     - Otherwise: set `currentFailure` for next round's context
   - Save round to `MemoryStore` (Task 13), emit `round:completed`
   - **Detect repetition** via `detectRepetition` (Task 10) — if detected, stop with `'failure'`
3. **Max retries reached**: emit `agent:stopped`, update status to `failure`, emit `task:completed`, return `'failure'`
4. **Cleanup**: `finally` block removes the Docker container via `toolRouter.dockerExec.remove`

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/agent/agent-loop.ts` | Created | AgentLoop class with `run()` method, AgentLoopDeps interface |
| `tests/agent-loop.test.ts` | Created | 3 test cases with MockLLM and mocked ToolRouter |

## TDD Evidence

### RED Phase (Step 2)
```
Error: Failed to load url ../src/agent/agent-loop.js (resolved id: ../src/agent/agent-loop.js)
in tests/agent-loop.test.ts. Does the file exist?
Test Files: 1 failed (1)
Tests: no tests
```
Test failed because `src/agent/agent-loop.ts` did not exist — confirmed RED.

### GREEN Phase (Step 4)
After writing the implementation (with fixes described below):
```
tests/agent-loop.test.ts (3 tests) 88ms
Test Files: 1 passed (1)
Tests: 3 passed (3)
```

### Full Suite Verification
```
Test Files: 16 passed (16)
Tests: 73 passed (73)
Duration: 2.21s
```

### TypeScript Typecheck
```
npx tsc --noEmit  →  (no errors)
```

## Deviations from Plan (with Justification)

### Deviation 1: `parseAction` fallback to `response.action`

**Plan code:**
```typescript
try { action = parseAction(response.content); } catch (err) {
  currentFailure = { ... rawReport: `Parse error: ${(err as Error).message}` };
  ... continue;
}
```

**Problem:** `MockLLM.generate()` returns `{ content: JSON.stringify(action), action }` where the action object uses a `type` field (e.g., `{"type":"write_file","path":"...","content":"..."}`). However, `parseAction` (Task 12) expects an `action` field in the JSON (e.g., `{"action":"write_file",...}`). This means `parseAction(response.content)` **always throws** for MockLLM output, causing every round to hit the parse-error path and `continue` — the loop would never dispatch any action and would always exhaust max retries returning `'failure'`. All three tests would fail (tests 1 and 3 expect `'success'`).

**Fix:** Fall back to `response.action` (which the LLM adapter already provides as a parsed `Action` object) when `parseAction` fails:
```typescript
let action: Action;
try {
  action = parseAction(response.content);
} catch {
  action = response.action;
}
```

**Rationale:** This is architecturally correct — the `LLMResponse` interface includes an `action` field precisely so consumers don't need to re-parse. For real LLM adapters (e.g., `OpenAIAdapter` in Task 18), `parseAction` is called inside the adapter to produce `response.action`, and the agent loop's `parseAction` call would succeed (real LLM output uses the `action` field format). For `MockLLM`, `parseAction` fails and the fallback provides the pre-parsed action. `parseAction` remains integrated as the primary parsing path.

### Deviation 2: `FailureType` import and variable typing

**Plan code:**
```typescript
let failureType: string | null = null;
...
failureType: failureType as Round['failureType'],
```

**Problem:** TypeScript error TS2322: `Type 'string' is not assignable to type 'FailureType | null'`. The `as` cast from `string | null` to `FailureType | null` is rejected because `string` is wider than `FailureType`.

**Fix:** Import `FailureType` and declare the variable with the correct type:
```typescript
import type { ..., FailureType } from '../types.js';
...
let failureType: FailureType | null = null;
...
failureType,  // no cast needed
```

### Deviation 3: Added `memory.close()` before `rmSync(dbPath)` in tests

**Problem:** The plan's test calls `rmSync(dbPath)` without closing the SQLite database handle first. On Windows, this causes `EPERM: Permission denied` because the file is still open by the `better-sqlite3` process. All three tests failed at the `rmSync` line (the assertions themselves passed).

**Fix:** Added `memory.close()` before `rmSync(dbPath)` in each test case, matching the cleanup pattern already used in `tests/memory-store.test.ts` (line 11: `afterEach(() => { store.close(); rmSync(dbPath); })`).

## Self-Review Findings

### Correctness
- **Test 1 (success on first pass):** Round 1 writes file (no feedback), Round 2 runs tests (passing feedback, `failed === 0`) → returns `'success'`. ✓
- **Test 2 (failure after max retries):** 5 rounds of alternating write_file/run_tests, all run_tests return failing feedback. No repetition triggered (alternating failure types). Loop exhausts `maxRetries=5` → returns `'failure'`. ✓
- **Test 3 (blocks dangerous commands):** Round 1 `rm -rf /` → guardrail BLOCK → `continue`. Round 2 writes file. Round 3 runs tests (passing) → returns `'success'`. ✓

### Event Coverage
All `EventTypes` events are emitted at appropriate points: `task:started`, `round:started`, `llm:called`, `llm:responded`, `action:parsed`, `guardrail:checked`, `round:completed`, `tool:executed`, `agent:stopped`, `task:completed`. The `error` event is not emitted (no uncaught error path). `guardrail:approval_requested`/`guardrail:approval_responded` are emitted by the `HitlStateMachine` internally.

### Resource Cleanup
The `finally` block ensures the Docker container is removed even if the loop throws an unexpected error. The `memory.close()` in tests ensures the SQLite handle is released.

## Issues and Concerns

1. **HITL rejection not handled:** When `gr.decision === 'REQUIRE_APPROVAL'`, the loop waits for approval but does **not** check whether approval was granted or rejected. After `hitl.reset()`, it proceeds to dispatch the action regardless of the HITL outcome. If rejected, the action should be skipped. This is a pre-existing design issue in the plan's code and is not covered by any test case (no test action triggers `REQUIRE_APPROVAL`). Recommend adding a check: `if (hitl.getState() === 'REJECTED') { ... continue; }` before dispatch.

2. **`parseAction` effectively bypassed for MockLLM:** The try/catch fallback means `parseAction` is called but always fails for MockLLM (whose content uses `type` not `action`). This is correct behavior (the adapter pre-parses), but means the parse-error handling path from the plan is never exercised in tests. A future test with a malformed LLM response (no `action` field, no `response.action`) would be needed to verify error handling.

3. **No `error` event emission:** The plan's code does not emit the `error` event on any failure path. Unexpected exceptions in `llm.generate()` or `toolRouter.dispatch()` would propagate up to the caller without an `error` event being emitted. Consider wrapping the loop body in a try/catch that emits `error` and continues or aborts.

4. **`codeFiles` not populated:** The `Round` objects saved to memory have `codeFiles: {}` (empty). For `write_file` actions, the written file path and content could be recorded in `codeFiles` for better history tracking. This is a minor enhancement, not a bug.

5. **Windows-specific test fix:** The `memory.close()` addition is necessary for Windows but deviates from the plan's exact test code. On Linux/macOS, `rmSync` might succeed even with an open file handle, so the plan's code might work there without the fix.

---

## Fix Report (Post-Review)

### Status: DONE

### Fixes Applied

#### Critical 1: HITL rejection path fixed

**Problem:** The HITL approval handler only checked `p.taskId === task.id` but ignored the `approved: boolean` field. After `hitl.reset()`, the loop proceeded to `toolRouter.dispatch(action, ...)` regardless of approval outcome — a rejected action still executed (safety violation).

**Fix:** The promise handler now captures `p.approved` into an `approved` variable. After `hitl.reset()`, if `!approved`, the loop sets `currentFailure` to a rejection feedback signal (`Rejected: <reason>`), saves the round, emits `round:completed`, and `continue`s to the next round without dispatching the action.

**File:** `src/agent/agent-loop.ts` — REQUIRE_APPROVAL block.

#### Critical 2: HITL flow tests added

**Problem:** No test triggered `REQUIRE_APPROVAL`.

**Fix:** Added two tests:
- `executes action after HITL approval` — MockLLM emits `sudo apt-get install foo` (matches `sudo\s+` approval pattern). A `guardrail:approval_requested` listener calls `hitl.approve(task.id)` via `setTimeout(..., 0)` (ensuring the response handler is registered first). Verifies `router.dispatch` was called with the sudo command.
- `skips action after HITL rejection` — Same setup but calls `hitl.reject(task.id)`. Verifies `router.dispatch` was **not** called with the sudo command (action skipped).

**File:** `tests/agent-loop.test.ts`

#### Important 1: Error event emission added

**Problem:** `EventTypes` defines `'error': { taskId: string; error: string }`, but the agent loop never emitted it. Unexpected exceptions propagated without notification.

**Fix:** Wrapped the entire round body (context assembly through repetition detection) in a `try/catch`. On catch: emits `error` with the error message, sets `currentFailure` to an error feedback signal, saves a round (using `lastAction` captured before the error), emits `round:completed`, and `continue`s. A `lastAction` variable is tracked outside the try so the catch block can record which action was in progress when the error occurred.

**File:** `src/agent/agent-loop.ts` — round body try/catch.

#### Important 2: Repetition detection test added

**Problem:** No test exercised the repetition threshold path.

**Fix:** Added test `detects repetition and terminates early` — MockLLM emits `run_tests` 3 times (N = `repetitionThreshold = 3`). The mock tool router returns the same failing feedback each time (same failure type, same test name). After 3 rounds, `detectRepetition` returns true, the loop emits `agent:stopped` and returns `'failure'`. Verified by asserting `mockLLM.callCount === 3` (early termination before `maxRetries = 5`).

**File:** `tests/agent-loop.test.ts`

### Additional Test: Error event

Added test `emits error event on round failure and continues` — `router.dispatch.mockImplementationOnce` throws on the first call. Verifies the `error` event is emitted with the error message and the loop continues to succeed on subsequent rounds.

### Verification

```
npx vitest run tests/agent-loop.test.ts
  tests/agent-loop.test.ts (7 tests) 200ms
  Test Files: 1 passed (1)
  Tests: 7 passed (7)

npx vitest run
  Test Files: 16 passed (16)
  Tests: 77 passed (77)
  Duration: 1.94s

npx tsc --noEmit
  (no errors)
```
