# Task 5: Guardrail — Report

## What I Implemented

Created the Guardrail module that intercepts agent actions and decides whether to ALLOW, BLOCK, or REQUIRE_APPROVAL.

- **`src/guardrail/guardrail.ts`** — `Guardrail` class with `checkAction(action: Action): GuardrailResult`.
  - Constructor compiles `blockedPatterns` and `approvalPatterns` from `Config` into `RegExp[]` once (fail-fast on invalid regex), stores `enableHitl` and `workDir`.
  - `checkAction` dispatches by action type:
    - `run_tests` → always ALLOW.
    - `write_file` / `read_file` → `checkPath`.
    - `run_shell` → `checkCommand`.
  - `checkPath` blocks paths matching `SYSTEM_DIR_PATTERNS` (`/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/boot/`, `C:\Windows\` case-insensitive) and paths outside the workspace boundary.
  - `checkCommand` blocks commands matching blocked patterns; when `enableHitl` is true, commands matching approval patterns return REQUIRE_APPROVAL; otherwise ALLOW.
- **`tests/guardrail.test.ts`** — 7 tests covering safe commands, `rm -rf /` block, `git push --force` block, `sudo` approval, workspace write allow, system dir write block, and `run_tests` allow.

Implementation and tests match the PLAN.md Task 5 specification verbatim.

## TDD Evidence

### RED (Step 2)
Ran `npx vitest run tests/guardrail.test.ts` before writing the implementation. Result: suite failed to load with:
```
Error: Failed to load url ../src/guardrail/guardrail.js (resolved id: ../src/guardrail/guardrail.js)
in D:/Codes/harness_project/tests/guardrail.test.ts. Does the file exist?
```
0 tests collected — confirms the module did not exist yet (true RED, not a logic failure).

### GREEN (Step 4)
After writing `src/guardrail/guardrail.ts`, ran the same command:
```
✓ tests/guardrail.test.ts (7 tests) 3ms
Test Files  1 passed (1)
     Tests  7 passed (7)
```
All 7 tests pass.

### Typecheck
`npx tsc --noEmit` → exit code 0 (no errors).

### Full Suite (no regressions)
`npx vitest run` → 4 files, 16 tests passed (9 prior + 7 new):
```
✓ tests/mock-llm.test.ts (3 tests)
✓ tests/config-loader.test.ts (3 tests)
✓ tests/guardrail.test.ts (7 tests)
✓ tests/event-bus.test.ts (3 tests)
Test Files  4 passed (4)
     Tests  16 passed (16)
```

## Files Changed

| File | Status |
|------|--------|
| `src/guardrail/guardrail.ts` | created (47 lines) |
| `tests/guardrail.test.ts` | created (47 lines) |

## Commit

- `ba74c13` — feat: guardrail with pattern matching and path checking
  - 2 files changed, 94 insertions(+)

## Self-Review Findings

1. **Spec compliance** — Code and tests are byte-for-byte the PLAN.md Task 5 listing; no deviations.
2. **Regex compilation** — Patterns are compiled once in the constructor (performance-friendly). Invalid regex in config throws at construction time (fail-fast), which is acceptable.
3. **HITL gating** — When `enableHitl` is false, approval patterns are skipped and would-be-approval commands become ALLOW. This matches the plan's intent (HITL is opt-in).
4. **Cross-platform** — `SYSTEM_DIR_PATTERNS` includes `C:\Windows\` with the `i` flag, so Windows system dirs are also blocked.
5. **Path boundary** — `checkPath` allows paths starting with `workDir`, `.`, or the hardcoded `/workspace`. The hardcoded `/workspace` fallback is slightly loose but matches the plan and passes all tests; it exists so the test config (`workDir: '/workspace'`) and Task 11's config (`workDir: '/ws'`) both behave correctly.

## Issues or Concerns

- **Minor:** The `/workspace` literal is hardcoded in `checkPath` as a third allowed prefix. If a deployment uses a different `workDir` (e.g. `/app`), a path like `/workspace/secret` would still be allowed even though it is outside `/app`. This is inherited from the plan, not introduced by me; flagging for awareness. Not blocking for Task 5.
- **Minor:** No `try/catch` around `new RegExp(p)` in the constructor — a malformed pattern in `config.yaml` will crash construction. Acceptable as fail-fast, but a future task could wrap this with a clearer error message.
- No other concerns. Task 5 is complete and all tests green.

---

## Security Fix: Path Traversal via `../`

### Issue

`checkPath` used `path.startsWith('.')` to allow relative paths like `./stack.py`. Because `..` also starts with `.`, a `write_file` action targeting `../etc/passwd` was incorrectly ALLOWED — bypassing the workspace boundary and defeating the system-dir protection intent (since `../etc/passwd` does not match `^\/etc\//`).

### Fix

Changed the boundary check in `src/guardrail/guardrail.ts:30` from `path.startsWith('.')` to `path.startsWith('./')`. This still permits legitimate relative paths (`./stack.py`) while blocking traversal attempts (`../etc/passwd`).

### Test

Added a regression test in `tests/guardrail.test.ts`:
```typescript
it('blocks path traversal via ../', () => {
  const g = new Guardrail(config);
  expect(g.checkAction({ type: 'write_file', path: '../etc/passwd', content: 'x' }).decision).toBe('BLOCK');
});
```

### Verification

`npx vitest run tests/guardrail.test.ts` → 8 tests passed (7 prior + 1 new):
```
✓ tests/guardrail.test.ts (8 tests) 3ms
Test Files  1 passed (1)
     Tests  8 passed (8)
```

### Files Changed

| File | Status |
|------|--------|
| `src/guardrail/guardrail.ts` | modified (1 line) |
| `tests/guardrail.test.ts` | modified (+5 lines) |

