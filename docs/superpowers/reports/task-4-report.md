# Task 4: LLM Adapter Interface + Mock LLM — Report

## What I Implemented

An `LLMAdapter` interface defining the contract every LLM backend must
satisfy, plus a `MockLLM` class that implements it by replaying a scripted
sequence of `Action` objects. The mock enables deterministic unit testing
of all core mechanisms (agent loop, guardrail, feedback, tool router)
without any network or real LLM dependency.

**Files created:**
- `src/llm/llm-adapter.ts` — `LLMAdapter` interface (`generate(context): Promise<LLMResponse>`)
- `src/llm/mock-llm.ts` — `MockLLM` class with `callCount` / `lastContext` getters
- `tests/mock-llm.test.ts` — 3 tests (ordered replay, exhaustion error, call history)

## TDD Evidence

### RED (failing test)

Wrote `tests/mock-llm.test.ts` first and ran it before any implementation
existed. Failed as expected because the module could not be resolved:

```
FAIL  tests/mock-llm.test.ts [ tests/mock-llm.test.ts ]
Error: Failed to load url ../src/llm/mock-llm.js (resolved id:
../src/llm/mock-llm.js) in D:/Codes/harness_project/tests/mock-llm.test.ts.
Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

### GREEN (passing test)

After writing both implementation files, all 3 tests pass:

```
 ✓ tests/mock-llm.test.ts (3 tests) 4ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Full suite also green (9 tests across 3 files) and `tsc --noEmit` clean
(exit code 0).

## Files Changed

| File | Change |
|------|--------|
| `src/llm/llm-adapter.ts` | Created — `LLMAdapter` interface |
| `src/llm/mock-llm.ts` | Created — `MockLLM` class |
| `tests/mock-llm.test.ts` | Created — 3 tests |

## Self-Review Findings

### Conformance to plan

The implementation matches PLAN.md Task 4 exactly — both the interface
and the `MockLLM` class are written verbatim from the plan, and the test
file is the plan's test verbatim. No deviations were required; the plan's
code compiled and passed its own tests on the first run.

### Type safety

- `LLMAdapter` is typed against `LLMContext` / `LLMResponse` from
  `src/types.ts`.
- `MockLLM implements LLMAdapter`, so it is structurally substitutable
  anywhere an `LLMAdapter` is expected (agent loop, openai-adapter tests,
  mechanism demos).
- `tsc --noEmit` passes with zero errors.

### Design notes (not issues)

1. **`content` field is `JSON.stringify(action)`.** A real LLM returns
   free-form text that the action parser (Task 12) must parse into an
   `Action`. The mock short-circuits this by returning the action
   directly in the `action` field and a JSON string in `content`. This is
   the correct design for a mock: downstream code that reads
   `response.action` works unchanged, and any future code that parses
   `response.content` will get valid JSON.

2. **`lastContext` holds a reference, not a copy.** If a caller mutates
   the context object after passing it to `generate()`, `lastContext`
   would reflect the mutation. This is acceptable for a test-only mock
   and matches the plan's code. The test uses `toEqual` (deep equality),
   which passes.

3. **No `reset()` method.** The mock cannot rewind its script index.
   Tests that need to replay create a new `MockLLM` instance. This
   matches the plan; adding `reset()` would be a future convenience but
   is not required by any current or planned test.

## Issues or Concerns

None. The plan's code for Task 4 is correct as written — unlike Task 3
(whose `EventEmitter` `'error'` handling required a deviation), Task 4's
implementation compiled and passed all tests on the first attempt. The
`LLMAdapter` interface is minimal and stable; downstream tasks (17 agent
loop, 18 openai-adapter, 22 mechanism demos) can depend on it.
