# Task 12: Action Parser — Report

## Status: DONE

## What I Implemented

Created the action parser — a deterministic pure function that converts LLM output text into typed `Action` objects.

- **`src/agent/action-parser.ts`** — exports `parseAction(content: string): Action`
  - `extractJson(content)` helper strips markdown code fences (```` ```json ```` or plain ```` ``` ````) and trims surrounding text; falls back to the trimmed raw content when no code block is present.
  - `parseAction` JSON-parses the extracted string, validates the presence of an `action` field, then dispatches on the action type:
    - `write_file` → requires `path` and `content` (empty-string content allowed via `=== undefined` check)
    - `read_file` → requires `path`
    - `run_shell` → requires `command`
    - `run_tests` → no extra fields
  - Throws descriptive errors on: invalid JSON, missing `action` field, unknown action type, and missing required per-type fields.
- **`tests/action-parser.test.ts`** — 8 tests covering all four action types plus the three error cases and markdown code-block extraction.

Implementation and tests were copied verbatim from `PLAN.md` (Task 12, Steps 1 & 3), with no added comments.

## TDD Evidence

Followed the plan's red → green steps exactly:

1. **Step 1 (Write failing test):** Created `tests/action-parser.test.ts` with 8 tests.
2. **Step 2 (Verify red):** `npx vitest run tests/action-parser.test.ts` → FAIL: `Failed to load url ../src/agent/action-parser.js ... Does the file exist?` (module not yet created).
3. **Step 3 (Write implementation):** Created `src/agent/action-parser.ts`.
4. **Step 4 (Verify green):** `npx vitest run tests/action-parser.test.ts` → **8 tests PASS**.
5. **Step 5 (Commit):** `8b1f6bb feat: action parser for LLM JSON output`.

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/agent/action-parser.ts` | new | 30 |
| `tests/action-parser.test.ts` | new | 19 |

Commit: `8b1f6bb` — `feat: action parser for LLM JSON output` (2 files changed, 49 insertions).

## Verification

- `npx tsc --noEmit` → clean (no errors).
- `npx vitest run` (full suite) → **11 test files, 53 tests, all passing**. No regressions in Tasks 1–11.

## Self-Review Findings

- **Code matches plan exactly.** The `parseAction` and `extractJson` functions are identical to the plan's Step 3 listing; the test file is identical to the plan's Step 1 listing.
- **Empty-content edge case handled correctly.** `write_file` uses `obj.content === undefined` (not `!obj.content`), so `content: ""` is accepted — important for creating empty files. This is the correct, more permissive validation.
- **Non-object JSON inputs degrade gracefully.** Inputs like `parseAction('null')` or `parseAction('123')` parse successfully but then throw on property access (`obj.action`), producing a TypeError rather than the descriptive "missing action field" error. Behavior is still "throws" (acceptable), only the message differs. Not covered by tests and not in the plan's scope.
- **Code-block regex is non-greedy** (`([\s\S]*?)`), so it extracts the first fenced block and ignores trailing prose — correct for typical LLM outputs that wrap a single JSON action in a code block.
- **No comments added** to either file, per project constraint.

## Issues / Concerns

None blocking. Minor observations (out of scope for this task's tests):

1. `run_shell`/`read_file` reject empty-string `command`/`path` via truthiness (`!obj.command`). An empty command is arguably invalid anyway, so this is reasonable but worth noting if semantics ever need to distinguish empty vs. missing.
2. Non-object valid JSON (e.g. `"null"`, `"42"`) throws a less descriptive TypeError instead of the "missing action field" message. Could be hardened with an `typeof parsed !== 'object' || parsed === null` guard, but no test requires it and the plan does not specify it.

Both are pre-existing characteristics of the plan-provided implementation; I did not deviate from the plan.
