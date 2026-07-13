# Task 13: Memory Store — Report

## Status: DONE_WITH_CONCERNS

## What I Implemented

Created the SQLite-based persistence layer for tasks and rounds, following the TDD steps in PLAN.md exactly.

**Files created:**
- `src/memory/memory-store.ts` — `MemoryStore` class with `saveTask`, `saveRound`, `getTask`, `listTasks`, `updateTaskStatus`, `close`
- `tests/memory-store.test.ts` — 5 tests covering save/retrieve task, save/retrieve rounds, pagination, status update, and nonexistent-task lookup

The `MemoryStore` uses `better-sqlite3` to persist to a SQLite database. It creates two tables:
- `tasks` (id PK, description, test_files JSON, status, created_at, finished_at)
- `rounds` (autoincrement id, task_id FK, round_num, code_files JSON, action JSON, feedback JSON nullable, failure_type nullable, created_at)

Complex fields (`testFiles`, `codeFiles`, `action`, `feedback`) are serialized as JSON strings. `getTask` returns the task plus all its rounds ordered by `round_num`. `listTasks` paginates with `LIMIT`/`OFFSET` ordered by `created_at DESC`. `updateTaskStatus` sets `finishedAt` when the status is terminal (`success`/`failure`/`aborted`).

## TDD Evidence

1. **Step 1 (Red — write failing test):** Wrote `tests/memory-store.test.ts` verbatim from the plan.
2. **Step 2 (verify failure):** Ran `npx vitest run tests/memory-store.test.ts` → FAIL: "Failed to load url ../src/memory/memory-store.js ... Does the file exist?" (module not found, as expected).
3. **Step 3 (Green — minimal implementation):** Wrote `src/memory/memory-store.ts` verbatim from the plan.
4. **Step 4 (verify pass):** Ran the test → initial run hit a Windows-specific `EPERM` in `afterEach` cleanup (see Issues). After the justified fix (below), all 5 tests PASS.
5. **Step 5 (commit):** Committed as `e248f47 feat: memory store with SQLite persistence`.

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/memory/memory-store.ts` | Created | Verbatim from plan Step 3 |
| `tests/memory-store.test.ts` | Created | Verbatim from plan Step 1, except `afterEach` (see below) |

## Self-Review Findings

- **Implementation is verbatim from the plan.** No logic deviations, no extra comments, no scope creep.
- **TypeScript compiles clean:** `npx tsc --noEmit` → no errors.
- **Full suite green:** `npx vitest run` → 12 test files, 58 tests, all passing (including the 5 new memory-store tests).
- **SQL injection safety:** All queries use better-sqlite3 parameterized binding (`@named` params and `?` placeholders). No string interpolation into SQL.
- **No secrets/keys** involved.
- **`.gitignore`** already includes `data/`, so production DB files won't be committed. Tests use the OS temp dir.
- **Commit scope** matches prior tasks: only the two new source/test files were staged (no stray files).

## Issues / Concerns

### 1. Windows file-handle cleanup in test `afterEach` (resolved, justified deviation)

The plan's `afterEach` is:
```ts
afterEach(() => { rmSync(dbPath); });
```

On Windows (the target platform per the environment), this throws `EPERM` for every test because the SQLite database file has an open native handle (the `MemoryStore` constructor calls `new Database(dbPath)` and the connection is never closed before deletion). Windows does not permit deleting files with open handles, unlike Unix where open files can be unlinked.

**Root cause** (per systematic-debugging skill, Phase 1): open DB handle not released before `rmSync`. All 5 failures were in `afterEach` cleanup, not in test assertions — the implementation logic itself was correct.

**Fix:** Added `store.close()` before `rmSync(dbPath)` in `afterEach`:
```ts
afterEach(() => { store.close(); rmSync(dbPath); });
```

This is the minimal possible change:
- It does not alter any test assertion, test data, or test logic.
- It uses the `close()` method that the plan's own implementation provides (line 46 of `memory-store.ts`).
- It is a resource-cleanup best practice (releasing DB connections) that the plan omitted, likely because it was written for a Unix environment.

This is the only deviation from the plan's exact text. The implementation file is unchanged from the plan.

### 2. `saveRound` ignores the `id` field of the input `Round`

The `Round` type has an `id: number` field, but `saveRound` uses `INSERT INTO rounds` with an `AUTOINCREMENT` primary key and does not insert the provided `round.id`. The returned/queried `id` is the DB-assigned autoincrement value, not the input. The test passes `id: 0` and only asserts on `roundNum`, so this is consistent with the plan. Noting it in case downstream consumers (e.g., agent loop) expect the input `id` to be preserved — they should read back the persisted `id` via `getTask`.

### 3. `listTasks` ordering depends on `createdAt` granularity

Pagination orders by `created_at DESC`. The pagination test creates 5 tasks in a tight loop with `new Date().toISOString()`; if timestamps collide (same millisecond), ordering among those is undefined. The test only checks counts (`toHaveLength`), not specific ordering, so it passes. Noting for awareness if future tests assert specific task ordering.
