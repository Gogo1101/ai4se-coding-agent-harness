# Task 7: Feedback Parser — Report

## What I Implemented

The feedback parser — the core of the feedback loop. A pure, deterministic function `parseTestResult(jsonReport: unknown): FeedbackSignal` that transforms a pytest `--json-report` object into the structured `FeedbackSignal` consumed by downstream modules (failure classifier, context assembler, agent loop).

Capabilities:
- Extracts `total` / `passed` / `failed` counts from the report summary (falling back to counting test entries when summary is absent).
- Extracts per-failure detail (`testName`, `assertion`, `expected`, `actual`, `traceback`) from each failed test's `call.longrepr` structure.
- Parses `assert <actual> == <expected>` messages to split expected vs. actual values.
- Classifies the dominant failure type via regex on the first failure's assertion (`COMPILE_ERROR`, `IMPORT_ERROR`, `TIMEOUT`, `ASSERTION_ERROR`, `RUNTIME_ERROR`).
- Handles pytest **collection errors** (`collectors[].outcome === 'failed'`) — distinguishing `IMPORT_ERROR` (ModuleNotFoundError/ImportError) from `COMPILE_ERROR` (e.g. SyntaxError).
- Preserves the original report as `rawReport` (JSON-stringified) for debugging/audit.
- No LLM, no I/O, no side effects — fully unit-testable.

## TDD Evidence

### RED (Step 2)
Wrote `tests/feedback-parser.test.ts` first (5 tests, verbatim from PLAN.md Step 1), then ran it before any implementation existed.

```
FAIL  tests/feedback-parser.test.ts
Error: Failed to load url ../src/feedback/feedback-parser.js
(resolved id: ../src/feedback/feedback-parser.js) in
D:/Codes/harness_project/tests/feedback-parser.test.ts. Does the file exist?
Test Files  1 failed (1)
     Tests  no tests
```
Confirmed RED: module-not-found, zero tests collected.

### GREEN (Step 4)
After writing `src/feedback/feedback-parser.ts` (verbatim from PLAN.md Step 3):

```
 ✓ tests/feedback-parser.test.ts (5 tests) 5ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```
All 5 tests pass.

### Full-suite regression check
Ran the entire vitest suite + `tsc --noEmit` to confirm no collateral damage:

```
 ✓ tests/feedback-parser.test.ts   (5 tests)
 ✓ tests/event-bus.test.ts         (3 tests)
 ✓ tests/config-loader.test.ts    (3 tests)
 ✓ tests/mock-llm.test.ts          (3 tests)
 ✓ tests/guardrail.test.ts         (8 tests)
 ✓ tests/hitl-state-machine.test.ts (6 tests)

 Test Files  6 passed (6)
      Tests  28 passed (28)
```
`tsc --noEmit` produced no output (clean). No regressions.

## Files Changed

| File | Status | Purpose |
|---|---|---|
| `src/feedback/feedback-parser.ts` | created (58 lines) | `parseTestResult()` pure function + helpers (`extractFailure`, `parseAssertion`, `inferFailureType`) |
| `tests/feedback-parser.test.ts` | created (29 lines) | 5 vitest cases covering: mixed pass/fail, all-pass, compile error, import error, empty report |

Implementation and tests are copied verbatim from PLAN.md Task 7 Steps 1 & 3, per the "follow the TDD steps exactly" directive.

## Self-Review Findings

I reviewed the implementation against the types and fixtures:

1. **Type alignment** — `FeedbackSignal` and `Failure` fields match `src/types.ts` exactly. `FailureType` union covers all 5 branches in `inferFailureType`. No type drift.
2. **Fixture alignment** — `samplePytestReport` exercises the `call.longrepr.reprtraceback.chains[0].content` path; `compileErrorReport` / `importErrorReport` exercise the `collectors` path. All three are covered by tests.
3. **`expectedFeedbackSignal` fixture note** — The shared fixture `expectedFeedbackSignal` (in `tests/helpers/fixtures.ts`) sets `rawReport: ''`, but the implementation sets `rawReport` to `JSON.stringify(report)`. The Task 7 tests do **not** assert against `expectedFeedbackSignal` (they assert field-by-field), so this discrepancy does not cause failures. The `rawReport: ''` in the fixture appears to be a placeholder; downstream Task 8+ tests that compare `rawReport` would need to account for this. Flagging for awareness.
4. **`parseAssertion` regex** — Uses `assert\s+(.+?)\s*==\s*(.+)`. For the fixture message `AssertionError: assert None == 1`, this yields `actual='None'`, `expected='1'` — matching `expectedFeedbackSignal`. Correct.
5. **`inferFailureType` ordering** — Checks `SyntaxError` before `AssertionError`. Since the fixture's assertion string is `assert stack.peek() == 1` (no `AssertionError` prefix in the assertion field itself, but `assert\s` matches), it correctly resolves to `ASSERTION_ERROR`. The compile/import collector path bypasses `inferFailureType` entirely (returns early), so no misclassification there.
6. **Defensive defaults** — Missing `summary`, `tests`, `call`, `longrepr`, `chains`, `content` are all guarded with `|| []` / `|| {}` / `|| 'Unknown error'`. The empty-report test (`{ tests: [], summary: {...} }`) passes, confirming graceful handling.
7. **No comments added** — per codebase convention, the file contains zero comments (matching the plan's source).

## Issues or Concerns

1. **Commit scope broader than Task 7's two files.** PLAN.md Step 5 specifies `git add -A`, which also staged pre-existing untracked artifacts from prior tasks: `.superpowers/sdd/progress.md` and `docs/superpowers/reports/task-{1..6}-{diff,report}.*`. These files were left untracked after Tasks 1–6 (their reports were written but never committed by those tasks' `git add -A` steps — likely because they were generated after the commit, or excluded). I followed the plan's `git add -A` instruction verbatim rather than selectively staging only `src/feedback/feedback-parser.ts` and `tests/feedback-parser.test.ts`. If a tighter commit is desired, the two Task-7 files can be cherry-picked into a clean commit; the extra files are documentation-only and do not affect the build or tests.

2. **`rawReport` semantics.** The implementation populates `rawReport` with `JSON.stringify(report)`, but the `expectedFeedbackSignal` fixture in `tests/helpers/fixtures.ts` declares `rawReport: ''`. No current test asserts on `rawReport` equality, so this is latent. Downstream tasks (e.g. Task 8 failure-classifier test, Task 9 history-compressor) construct `FeedbackSignal` literals with `rawReport: ''`, so they are self-consistent. Only if a future test compares a parser output against `expectedFeedbackSignal` wholesale would this mismatch surface. Not blocking.

3. **No TIMEOUT test path.** The plan's tests do not include a timeout-scenario fixture, so the `TIMEOUT` branch of `inferFailureType` is exercised only by regex, not by an integration-style test. This is per the plan (Task 7 Step 1 defines exactly 5 tests); the TIMEOUT classification is more thoroughly tested in Task 8 (failure-classifier). Not blocking — followed plan exactly.

## Verification Commands Run

- `npx vitest run tests/feedback-parser.test.ts` → 5 passed (GREEN)
- `npx vitest run` → 28 passed across 6 files (no regressions)
- `npx tsc --noEmit` → clean (no output)
- `git commit -m "feat: feedback parser for pytest JSON reports"` → d190e68
