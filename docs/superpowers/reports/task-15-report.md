# Task 15: Tool Router — Report

## Status: DONE

## What I Implemented

Created the `ToolRouter` class — a dispatcher that routes `Action` objects to the appropriate `DockerExec` method inside a running container.

- `src/tools/tool-router.ts` — `ToolRouter` class with `dispatch(action, containerId)` method
- `tests/tool-router.test.ts` — 4 tests with a mocked `DockerExec`

### Behavior

`ToolRouter.dispatch(action, containerId)` switches on `action.type`:

| Action type     | DockerExec call                          | Return value                                    |
|-----------------|------------------------------------------|-------------------------------------------------|
| `write_file`    | `writeFile(containerId, path, content)`  | `{ success: true }`                             |
| `read_file`     | `readFile(containerId, path)`            | `{ content: <string> }`                         |
| `run_shell`     | `exec(containerId, command)`             | `ExecResult { stdout, stderr, exitCode }`       |
| `run_tests`     | `exec(containerId, 'pytest --json-report --tb=short 2>/dev/null || true')` then `parseTestResult` | `{ feedbackSignal: FeedbackSignal }` |
| default          | —                                        | throws `Unknown action type`                     |

For `run_tests`, the stdout is JSON-parsed; if parsing fails it falls back to an empty report so `parseTestResult` still returns a valid `FeedbackSignal`.

The `dockerExec` field is public so the agent loop (Task 17) can call `createContainer` / `writeFile` / `remove` directly.

## TDD Evidence

Followed the red → green → refactor cycle exactly as specified in PLAN.md Task 15.

1. **Red** — Wrote `tests/tool-router.test.ts` (4 tests) before any implementation existed.
   - Ran `npx vitest run tests/tool-router.test.ts`
   - Result: FAIL — `Failed to load url ../src/tools/tool-router.js ... Does the file exist?`
2. **Green** — Wrote `src/tools/tool-router.ts` (minimal implementation from the plan).
   - Ran `npx vitest run tests/tool-router.test.ts`
   - Result: **4 tests PASS** (4 ms)
3. **Refactor** — No refactor needed; implementation is already minimal and matches the plan verbatim.

## Files Changed

| File | Status | Lines |
|------|--------|-------|
| `src/tools/tool-router.ts` | created | 30 |
| `tests/tool-router.test.ts` | created | 51 |

## Verification

- `npx vitest run tests/tool-router.test.ts` → 4 passed (4 ms)
- `npx vitest run` (full suite) → **14 test files, 65 tests, all passed**
- `npx tsc --noEmit` → no errors

## Self-Review Findings

- The implementation matches the plan's reference implementation exactly; no deviations.
- The `dockerExec` field is intentionally public (per the plan) because Task 17's `AgentLoop` accesses `toolRouter.dockerExec.createContainer(...)` and `toolRouter.dockerExec.remove(...)` directly. This is confirmed by the Task 17 test fixture `mockToolRouter` which exposes a `dockerExec` property.
- The `run_tests` command uses `2>/dev/null || true` so a non-zero pytest exit (tests failing) does not abort the shell; the JSON report is still emitted on stdout and parsed.
- The `default` branch cast `(action as Action).type` is a safe no-op since the switch is exhaustive over the `Action` union; it exists purely to satisfy the exhaustiveness check and would only trigger if the type system were bypassed.
- No comments were added to the source files (per project constraint).

## Issues / Concerns

None. The task is self-contained, depends only on Task 14 (`DockerExec`) and Task 7 (`parseTestResult`), both of which are complete and unchanged. The mocked `DockerExec` in the test isolates this task from real Docker, so no Docker daemon is required.
