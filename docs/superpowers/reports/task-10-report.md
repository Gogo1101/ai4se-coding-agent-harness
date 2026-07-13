# Task 10: Repetition Detector — Report

## Status: DONE

## What I Implemented

Created the repetition detector, a pure function that detects when the LLM is stuck in a loop repeating the same failure pattern. This is part of the feedback loop that prevents infinite retries.

- `src/feedback/repetition-detector.ts` — `detectRepetition(rounds: Round[], threshold: number): boolean`
- `tests/repetition-detector.test.ts` — 5 tests covering the detection logic

### Logic

`detectRepetition` returns `true` when the last `threshold` rounds all share the same failure signature. The signature (`failureKey`) is composed of:
1. The round's `failureType` (falling back to `'UNKNOWN'` when null)
2. The sorted, comma-joined list of failing test names from `round.feedback.failures`

If there are fewer rounds than the threshold, it returns `false` immediately. Otherwise it slices the last `threshold` rounds and checks that every round's key equals the first round's key.

## TDD Evidence

Followed the plan's TDD steps exactly:

1. **Step 1 (Write failing test):** Wrote `tests/repetition-detector.test.ts` with 5 test cases before any implementation existed.
2. **Step 2 (Verify RED):** Ran `npx vitest run tests/repetition-detector.test.ts` — failed as expected:
   ```
   Error: Failed to load url ../src/feedback/repetition-detector.js ... Does the file exist?
   ```
3. **Step 3 (Write minimal implementation):** Created `src/feedback/repetition-detector.ts` with `detectRepetition` + private `failureKey` helper.
4. **Step 4 (Verify GREEN):** Ran the same command — all 5 tests PASS.
5. **Step 5 (Commit):** Committed with the plan's message.

## Files Changed

| File | Action |
|------|--------|
| `src/feedback/repetition-detector.ts` | Created (12 lines) |
| `tests/repetition-detector.test.ts` | Created (22 lines) |

## Test Summary

- Targeted: `tests/repetition-detector.test.ts` — **5/5 passed**
- Full suite: **9 test files, 43 tests, all passed**
- Typecheck: `npx tsc --noEmit` — clean, no errors

### Test cases

| # | Case | Expected | Result |
|---|------|----------|--------|
| 1 | Fewer rounds than threshold | `false` | PASS |
| 2 | Different failures across rounds | `false` | PASS |
| 3 | 3 consecutive identical failures | `true` | PASS |
| 4 | Only 2 of 3 identical (first differs) | `false` | PASS |
| 5 | Last N identical after a differing earlier round | `true` | PASS |

## Self-Review Findings

- **Pure function:** No side effects, no I/O, no external state — matches the "pure function" contract in the plan.
- **Convention match:** Uses `.js` extension in imports and `import type` for type-only imports, consistent with sibling files (`history-compressor.ts`, `failure-classifier.ts`). No comments added, per instructions.
- **Edge cases handled:**
  - `rounds.length < threshold` → `false` (short-circuit, avoids slicing beyond array).
  - `round.failureType` is `null` → coerced to `'UNKNOWN'` so nulls don't break key equality.
  - `round.feedback` is `null` → optional chaining yields `''` for test names.
  - Test names are sorted before joining so order differences in `failures[]` don't cause false negatives.
- **Threshold semantics:** The plan's test #5 confirms "last N" semantics (a differing earlier round is ignored), which `slice(-threshold)` correctly implements.
- **No secrets, no hardcoded keys.** No new dependencies introduced.

## Issues / Concerns

None. The implementation matches the plan exactly, all tests pass, and the typecheck is clean. The function is a straightforward pure function with no external dependencies beyond the `Round` type.

One minor observation (not a concern for this task): the `failureKey` sorts test names, which means two rounds with the same failure type and same set of failing tests — but in different order — are considered identical. This is the desired behavior for loop detection (the LLM is "stuck" if the same tests keep failing the same way), and is consistent with the plan's intent.
