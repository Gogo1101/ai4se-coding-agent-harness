# Task 8: Failure Classifier — Report

## Status: DONE

## What I Implemented

Created a pure function `classifyFailure(feedback: FeedbackSignal): FailureType` that categorizes test failures into one of five types based on the assertion text of the first failure:

- `COMPILE_ERROR` — matches `SyntaxError` / `syntax error`
- `IMPORT_ERROR` — matches `ModuleNotFoundError` / `ImportError`
- `TIMEOUT` — matches `Timeout` / `timed out`
- `ASSERTION_ERROR` — matches `AssertionError` / `assert `
- `RUNTIME_ERROR` — fallback for everything else

When `feedback.failures` is empty, the function returns the existing `feedback.failureType` (defaulting to `RUNTIME_ERROR` if unset), preserving any classification already attached to the signal (e.g. a collection-level COMPILE_ERROR detected by the feedback parser).

## TDD Evidence

Followed the red-green-refactor cycle exactly as specified in PLAN.md Task 8:

1. **Red** — Wrote `tests/failure-classifier.test.ts` (6 tests) before any implementation existed. Ran `npx vitest run tests/failure-classifier.test.ts` and confirmed failure with `Error: Failed to load url ../src/feedback/failure-classifier.js ... Does the file exist?` — the expected "module not found" red state.
2. **Green** — Wrote `src/feedback/failure-classifier.ts` (minimal implementation from the plan). Re-ran the test file: all 6 tests passed.
3. **Refactor** — No refactor needed; the implementation is already minimal and matches the plan's reference implementation. No comments added (per repo convention).

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/feedback/failure-classifier.ts` | created | 11 |
| `tests/failure-classifier.test.ts` | created | 21 |

Total: 2 files, 32 insertions.

## Test Summary

- Targeted: `npx vitest run tests/failure-classifier.test.ts` → **6/6 passed** (3ms)
- Full suite: `npx vitest run` → **34/34 passed** across 7 test files (no regressions)
- Type check: `npx tsc --noEmit` → **clean, no errors**

New tests:
1. classifies SyntaxError as COMPILE_ERROR
2. classifies AssertionError as ASSERTION_ERROR
3. classifies ModuleNotFoundError as IMPORT_ERROR
4. classifies Timeout as TIMEOUT
5. classifies unknown as RUNTIME_ERROR
6. returns existing type when no failures

## Commits

- `46be4b4` — feat: failure classifier for categorizing test failures

## Self-Review Findings

- **Pure function**: `classifyFailure` has no side effects, no I/O, no external dependencies beyond the type imports — matches the "pure function" contract in the plan.
- **Pattern ordering**: The regex checks are ordered COMPILE → IMPORT → TIMEOUT → ASSERTION → fallback. This matches the plan's reference implementation and the feedback parser's `inferFailureType`. Note: a message like `"SyntaxError: assert x"` would be classified as COMPILE_ERROR (first match wins), which is the intended precedence.
- **Empty-failures branch**: Returns `feedback.failureType || 'RUNTIME_ERROR'`. This preserves classifications set upstream (e.g. the feedback parser sets `COMPILE_ERROR`/`IMPORT_ERROR` for collector failures with an empty `failures` array). The 6th test covers this path.
- **Type safety**: Uses `import type` for `FeedbackSignal` / `FailureType` (type-only, erased at compile time) consistent with the rest of the `src/feedback/` module.
- **Consistency with Task 7**: The classification logic is intentionally duplicated from `feedback-parser.ts`'s `inferFailureType` helper. This is per the plan — the classifier operates on a `FeedbackSignal` (post-parse) whereas the parser's helper operates on `Failure[]` during parsing. The two are kept independent so the classifier can be reused on signals from other sources (e.g. loaded from memory store) without coupling to the parser.
- **No comments added** — follows the repo's "DO NOT ADD ANY COMMENTS" convention.

## Issues / Concerns

- **Minor: regex duplication** — The classification regexes are duplicated between `feedback-parser.ts` (`inferFailureType`) and `failure-classifier.ts`. This is per the plan's design (each module is independently usable), but if the classification rules ever need to change, both files must be updated in lockstep. Not blocking; flagging for awareness. A future refactor could extract a shared `failure-patterns.ts` constant module, but that is out of scope for Task 8.
- **Only first failure inspected** — `classifyFailure` looks at `feedback.failures[0].assertion` only. If a feedback signal has mixed failure types (e.g. one IMPORT_ERROR and one ASSERTION_ERROR), the classification reflects only the first. This matches the plan's reference implementation and the test suite; acceptable for the current single-failure-type-per-round model.
- No other concerns. Task is complete and ready for downstream consumers (Task 11 context assembler may use `classifyFailure` to label rounds).
