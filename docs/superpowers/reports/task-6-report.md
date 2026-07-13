# Task 6: HITL State Machine — Report

## What I Implemented

Created the Human-In-The-Loop (HITL) state machine that pauses agent execution when a dangerous command requires human approval, with a timeout that auto-rejects if no response arrives in time.

- **`src/guardrail/hitl-state-machine.ts`** — `HitlStateMachine` class + `HitlState` type.
  - `HitlState` = `'IDLE' | 'WAITING' | 'APPROVED' | 'REJECTED'`.
  - Constructor takes an `EventBus` and a `timeoutSeconds` number.
  - `getState(): HitlState` — returns current state.
  - `requestApproval(taskId, action, reason)` — guards on `IDLE`, transitions to `WAITING`, stores `currentTaskId`, emits `guardrail:approval_requested`, and arms a `setTimeout` that auto-calls `reject()` after `timeoutSeconds * 1000` ms (only if still `WAITING`).
  - `approve(taskId)` — guards on `WAITING` + taskId match, transitions to `APPROVED`, clears the timeout, emits `guardrail:approval_responded` with `approved: true`.
  - `reject(taskId)` — guards on `WAITING` + taskId match, transitions to `REJECTED`, clears the timeout, emits `guardrail:approval_responded` with `approved: false`.
  - `reset()` — returns to `IDLE`, clears `currentTaskId` and the timeout handle.
  - Private `clearTimeout()` helper nulls the stored handle after clearing.
- **`tests/hitl-state-machine.test.ts`** — 6 tests: IDLE start, IDLE→WAITING transition + emit spy, WAITING→APPROVED, WAITING→REJECTED, reset to IDLE, and async auto-reject on timeout (0.1s timeout, 200ms wait).

Implementation and tests match the PLAN.md Task 6 specification verbatim.

## TDD Evidence

### RED (Step 2)
Ran `npx vitest run tests/hitl-state-machine.test.ts` before writing the implementation. Result: suite failed to load with:
```
Error: Failed to load url ../src/guardrail/hitl-state-machine.js (resolved id: ../src/guardrail/hitl-state-machine.js)
in D:/Codes/harness_project/tests/hitl-state-machine.test.ts. Does the file exist?
```
0 tests collected — confirms the module did not exist yet (true RED, not a logic failure).

### GREEN (Step 4)
After writing `src/guardrail/hitl-state-machine.ts`, ran the same command:
```
✓ tests/hitl-state-machine.test.ts (6 tests) 221ms
Test Files  1 passed (1)
     Tests  6 passed (6)
```
All 6 tests pass.

### Typecheck
`npx tsc --noEmit` → exit code 0 (no errors).

### Full Suite (no regressions)
`npx vitest run` → 5 files, 23 tests passed (17 prior + 6 new):
```
✓ tests/event-bus.test.ts (3 tests)
✓ tests/guardrail.test.ts (8 tests)
✓ tests/config-loader.test.ts (3 tests)
✓ tests/mock-llm.test.ts (3 tests)
✓ tests/hitl-state-machine.test.ts (6 tests)
Test Files  5 passed (5)
     Tests  23 passed (23)
```

## Files Changed

| File | Status |
|------|--------|
| `src/guardrail/hitl-state-machine.ts` | created (43 lines) |
| `tests/hitl-state-machine.test.ts` | created (50 lines) |

## Commit

- `b56b6ae` — feat: HITL state machine with timeout auto-reject
  - 2 files changed, 93 insertions(+)

## Self-Review Findings

1. **Spec compliance** — Code and tests are byte-for-byte the PLAN.md Task 6 listing; no deviations.
2. **State guards** — `requestApproval` throws if not `IDLE`; `approve`/`reject` throw if not `WAITING` or if `taskId` mismatches `currentTaskId`. This prevents stale/duplicate responses from corrupting state.
3. **Timeout safety** — The `setTimeout` callback re-checks `this.state === 'WAITING' && this.currentTaskId` before calling `reject`, so a manual approve/reject that already resolved the state will not cause a spurious double-transition or throw. The manual `approve`/`reject` paths clear the timeout handle, so the timer is a no-op even if it fires late.
4. **Event contract** — Emits `guardrail:approval_requested` on request and `guardrail:approval_responded` on approve/reject (including auto-reject), matching the `EventTypes` interface in `src/types.ts:87-88`.
5. **Resource cleanup** — `reset()` and the resolution paths all call `clearTimeout()`, so no dangling timers leak across rounds. (Note: there is no explicit `dispose()`/`destroy()` method; a long-lived state machine that is discarded while `WAITING` would leave a timer pending until it fires. Acceptable for the plan's scope since `reset()` is the intended lifecycle hook.)
6. **Async test** — The auto-reject test uses a 0.1s timeout and waits 200ms, giving a 2x margin. Verified reliably green across runs (221ms total suite duration includes the wait).

## Issues or Concerns

- **Minor (naming):** The private method `clearTimeout()` shadows the global `clearTimeout` function name. Inside the method body, the unqualified call `clearTimeout(this.timeoutHandle)` resolves to the global (not `this.clearTimeout`), so behavior is correct, but the shadowing is a readability smell. Kept verbatim to match the plan; a future refactor could rename to `clearTimeoutHandle()`.
- **Minor (lifecycle):** No `dispose()` method to cancel a pending timer if the state machine is abandoned while `WAITING`. The auto-reject timer would still fire and call `reject` (which would emit `guardrail:approval_responded` on a possibly-discarded bus). Not blocking for Task 6; flagging for the agent-loop integration task (Task 17) to call `reset()` before discarding.
- No other concerns. Task 6 is complete and all tests green.
