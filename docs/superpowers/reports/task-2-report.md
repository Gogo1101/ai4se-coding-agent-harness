# Task 2 Report: Config Loader

## Status: DONE

## What I Implemented

Task 2 creates the configuration loader for the Coding Agent Harness. It reads a YAML config file, validates the schema (mapping snake_case YAML keys to camelCase TypeScript fields), applies defaults for missing values, returns defaults when the file is missing, and throws on invalid types.

Three files were created:
- `src/config/config-loader.ts` — `loadConfig(path: string): Config` plus internal `validateConfig` helper
- `config.yaml` — default config file shipped with the project
- `tests/config-loader.test.ts` — 3 tests covering valid load, missing-file defaults, and invalid-schema throw

## TDD Evidence

### RED (failing test, before implementation)

Command: `npx vitest run tests/config-loader.test.ts`

```
 FAIL  tests/config-loader.test.ts [ tests/config-loader.test.ts ]
Error: Failed to load url ../src/config/config-loader.js (resolved id: ../src/config/config-loader.js) in D:/Codes/harness_project/tests/config-loader.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

This matches the plan's expected "FAIL with 'Cannot find module'".

### GREEN (passing test, after implementation)

Command: `npx vitest run tests/config-loader.test.ts`

```
 ✓  tests/config-loader.test.ts (3 tests) 11ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

All 3 tests pass:
1. `loads a valid config file` — PASS
2. `uses defaults when file is missing` — PASS
3. `throws on invalid config schema` — PASS

### Additional verification

- `npx tsc --noEmit` → exit 0 (TypeScript compiles cleanly)
- `npx vitest run` (full suite) → 3 passed (1 file)

## Files Changed

| File | Action |
|------|--------|
| `tests/config-loader.test.ts` | Created (failing test, then passing) |
| `src/config/config-loader.ts` | Created (implementation) |
| `config.yaml` | Created (default config) |
| `docs/superpowers/reports/task-2-report.md` | Created (this report) |

## Self-Review Findings

- **Implementation matches plan exactly**: The `loadConfig` function and `validateConfig` helper were copied verbatim from the plan's Step 3. No deviations.
- **Test matches plan exactly**: The 3 tests were copied verbatim from the plan's Step 1, including the YAML escaping in the `blocked_patterns` / `approval_patterns` strings.
- **Defaults are consistent**: `DEFAULT_CONFIG` in `config-loader.ts` and `config.yaml` use identical values (model `deepseek-v4-pro`, temperature `0.3`, maxTokens `4096`, maxRetries `5`, etc.).
- **Snake_case → camelCase mapping is correct**: YAML uses `max_tokens`, `api_base`, `max_retries`, `timeout_seconds`, `repetition_threshold`, `max_history_tokens`, `enable_hitl`, `hitl_timeout_seconds`, `blocked_patterns`, `approval_patterns`, `work_dir`, `memory_limit`; these map to the `Config` interface's camelCase fields.
- **Type safety**: `llm.model` and `llm.temperature` have explicit type checks that throw on mismatch (this is what the "throws on invalid config schema" test exercises — `model: 123` is a number, not a string).
- **Shallow copy of defaults**: `loadConfig` returns `{ ...DEFAULT_CONFIG }` for missing files and `validateConfig` starts from `{ ...DEFAULT_CONFIG }`. This is a shallow copy, so nested objects (e.g. `llm`, `agent`) are shared references. For this task's tests this is fine since the tests only read values, but a future refactor might use deep clone to prevent accidental mutation of the shared default. Not a blocker for Task 2.
- **`.superpowers/` excluded from commit**: This directory contains internal tooling state (subagent-driven-development session data) and is not part of the project deliverable. It was deliberately not staged.

## Issues or Concerns

- **Minor (non-blocking)**: The shallow-copy of `DEFAULT_CONFIG` means nested objects are shared across calls. If a downstream consumer mutates `config.llm.model`, it would corrupt the default for subsequent calls. This is acceptable for Task 2's scope but worth noting for the agent-loop integration in later tasks. A one-line fix (`structuredClone(DEFAULT_CONFIG)`) would address it if it becomes a problem.
- **No concern** regarding the test/implementation correctness — all tests pass and TypeScript compiles cleanly.

## Fix Report: Deep Copy of DEFAULT_CONFIG

### Issue

In `src/config/config-loader.ts`, `loadConfig` returned `{ ...DEFAULT_CONFIG }` and `validateConfig` started from `{ ...DEFAULT_CONFIG }`. Both are shallow copies, so nested objects (`llm`, `agent`, `guardrail`, `docker`) were shared references to `DEFAULT_CONFIG`'s children. Any downstream consumer that mutated `config.llm.model` would corrupt the default for all subsequent calls.

### Fix Applied

Replaced the shallow spread copy with `structuredClone(DEFAULT_CONFIG)` in both places:

1. `loadConfig` (line 19): `return { ...DEFAULT_CONFIG }` → `return structuredClone(DEFAULT_CONFIG)`
2. `validateConfig` (line 26): `const config = { ...DEFAULT_CONFIG }` → `const config = structuredClone(DEFAULT_CONFIG)`

### Verification

Command: `npx vitest run tests/config-loader.test.ts`

```
 ✓  tests/config-loader.test.ts (3 tests) 11ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

All 3 existing tests still pass:
1. `loads a valid config file` — PASS
2. `uses defaults when file is missing` — PASS
3. `throws on invalid config schema` — PASS

### Resolution of Self-Review Finding

This fix resolves the "Minor (non-blocking)" concern noted in the Self-Review Findings above. The shallow-copy issue is eliminated; nested objects are now deep-cloned on every `loadConfig` / `validateConfig` call, so downstream mutation of returned config cannot corrupt `DEFAULT_CONFIG`.
