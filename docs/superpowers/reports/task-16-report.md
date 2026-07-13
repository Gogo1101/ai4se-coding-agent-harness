# Task 16: Credential Manager — Report

## Status: DONE_WITH_CONCERNS

## What I Implemented

Created the `CredentialManager` class — a thin wrapper around the OS keychain (via `keytar`) that securely stores and retrieves the LLM API key without ever writing it to disk, logs, or config files.

- `src/credentials/credential-manager.ts` — `CredentialManager` class with `hasKey`, `getKey`, `setKey`, `clearKey`, `getStatus`
- `tests/credential-manager.test.ts` — 5 tests with a mocked `keytar` (no real OS keychain required)

### Behavior

All operations target a fixed keychain entry: service `coding-agent-harness`, account `api-key`.

| Method | keytar call | Return |
|--------|-------------|--------|
| `hasKey()` | `getPassword(SERVICE, ACCOUNT)` | `true` if a password is stored, else `false` |
| `getKey()` | `getPassword(SERVICE, ACCOUNT)` | the stored key string, or `null` |
| `setKey(key)` | `setPassword(SERVICE, ACCOUNT, key)` | `void` |
| `clearKey()` | `deletePassword(SERVICE, ACCOUNT)` | `void` |
| `getStatus()` | `getPassword(SERVICE, ACCOUNT)` | `'API Key: not configured'` when absent, else `'API Key: <masked> (configured, source: keychain)'` |

`getStatus` never returns the raw key — it masks it via `maskKey`, which exposes only the first 6 and last 5 characters with `****` in between (e.g. `sk-123****ijklm`), so the key is identifiable for debugging without leaking the secret. Keys of length ≤ 11 are fully masked as `****`.

## TDD Evidence

Followed the red → green → refactor cycle per PLAN.md Task 16.

1. **Step 1 (Red — write failing test):** Wrote `tests/credential-manager.test.ts` verbatim from the plan (5 tests, keytar mocked).
2. **Step 2 (verify failure):** Ran `npx vitest run tests/credential-manager.test.ts` → FAIL: "Failed to load url ../src/credentials/credential-manager.js ... Does the file exist?" (module not found, as expected).
3. **Step 3 (Green — minimal implementation):** Wrote `src/credentials/credential-manager.ts` verbatim from the plan.
4. **Step 4 (verify pass):** Ran the test → **2 of 5 tests FAILED** with the plan's verbatim code (see Issues #1 and #2). After the two justified, minimal fixes below, all **5 tests PASS**.
5. **Step 5 (commit):** Committed as `<sha> feat: credential manager with OS keychain storage`.

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/credentials/credential-manager.ts` | Created | Verbatim from plan Step 3, except `maskKey` (see Issue #2) |
| `tests/credential-manager.test.ts` | Created | Verbatim from plan Step 1, except the keytar mock (see Issue #1) |

## Verification

- `npx vitest run tests/credential-manager.test.ts` → **5 passed** (3 ms)
- `npx vitest run` (full suite) → **15 test files, 70 tests, all passed**
- `npx tsc --noEmit` → no errors (exit 0)

## Self-Review Findings

- **No secrets are hardcoded, logged, or persisted to disk.** The key lives only in the OS keychain; `getStatus` masks it; `getKey` returns it only to the caller (the OpenAI adapter, Task 18). This satisfies the global constraint "API keys never hardcoded, never committed, never logged in plaintext."
- **The keytar mock isolates tests from the real OS keychain**, so tests are deterministic and require no keychain daemon / privileges — consistent with the project's "all core mechanisms must be testable with Mock LLM (no network, no real LLM)" philosophy extended to credentials.
- **TypeScript compiles clean** with `esModuleInterop: true` enabling the `import keytar from 'keytar'` default-import of the CommonJS module.
- **No comments were added** to either source file (per project constraint).
- **Commit scope** matches prior tasks: only the two new source/test files plus this report are staged.

## Issues / Concerns

### 1. Plan's keytar mock is non-stateful — 2 tests cannot pass verbatim (resolved, justified deviation)

The plan's mock (Step 1) is:
```ts
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),       // always null
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}));
```

`getPassword` is hardcoded to resolve `null` on every call, regardless of prior `setPassword` calls. A real OS keychain is **stateful**: `setPassword` stores the value and a subsequent `getPassword` returns it. Because of this, with the plan's verbatim test + verbatim implementation:

- Test "stores and retrieves a key" → `setKey` then `hasKey` → `getPassword` returns `null` → `hasKey` returns `false`, but the test asserts `true`. **FAIL.**
- Test "masks key in status output" → `setKey` then `getStatus` → `getPassword` returns `null` → status is `'API Key: not configured'`, but the test expects it to contain `'sk-123'`. **FAIL.**

Observed exactly this when running the verbatim plan code: `Tests  2 failed | 3 passed (5)`.

**Root cause:** the mock does not simulate keychain state. The plan's Step 4 states "Expected: 5 tests PASS", which is unreachable with the plan's mock as written — an internal contradiction in the plan.

**Fix:** Made the mock stateful with a module-level `Map` so `getPassword` returns whatever `setPassword` last stored (and `deletePassword` clears it):
```ts
const store = new Map<string, string>();
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn((s, a) => Promise.resolve(store.get(`${s}:${a}`) ?? null)),
    setPassword: vi.fn((s, a, p) => { store.set(`${s}:${a}`, p); return Promise.resolve(undefined); }),
    deletePassword: vi.fn((s, a) => { store.delete(`${s}:${a}`); return Promise.resolve(true); }),
  },
}));
```

This is the minimal change that:
- Does not alter any test assertion, test data, or the implementation.
- Correctly simulates a real OS keychain (the entire purpose of the mock).
- Achieves the plan's stated expected outcome (5 tests PASS).

This is the only deviation in the test file.

### 2. Plan's `maskKey` is inconsistent with the plan's own test (resolved, justified deviation)

The plan's `maskKey` (Step 3) is:
```ts
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.substring(0, 3)}****${key.substring(key.length - 4)}`;
}
```
This exposes the first **3** and last **4** characters, producing `sk-****ijkl` for the test key `sk-1234567890abcdefghijklm`.

But the plan's test (Step 1) asserts:
```ts
expect(status).toContain('sk-123');   // first 6 chars
expect(status).toContain('ijklm');    // last 5 chars
expect(status).not.toContain('1234567890abcdefghij');  // middle must be masked
```
The test requires the first **6** and last **5** characters to be visible. The plan's `maskKey` exposes only 3 + 4, so `status` does not contain `sk-123` → **FAIL** (confirmed after fixing Issue #1: `Tests 1 failed | 4 passed`).

**Root cause:** the plan's implementation and its test disagree on how many characters to expose. In TDD the test is the spec, so the implementation must conform.

**Fix:** Aligned `maskKey` with the test's defined behavior — expose first 6 and last 5, mask the middle, and fully mask keys too short to safely mask (length ≤ 11):
```ts
function maskKey(key: string): string {
  if (key.length <= 11) return '****';
  return `${key.substring(0, 6)}****${key.substring(key.length - 5)}`;
}
```
For the test key this yields `sk-123****ijklm`, satisfying all three assertions. This is the only deviation in the implementation file.

### 3. `keytar` is a native module — build/portability note (not blocking)

`keytar` ships a prebuilt native binary (`node_modules/keytar/build/Release/keytar.node`). It loaded fine in this environment (Windows, Node 20). On CI or other platforms the correct prebuilt must be present or `npm rebuild` is required. This does not affect tests (keytar is mocked) but will matter for Task 18 (OpenAI adapter) and any real run. Noting for awareness; no action needed for Task 16.
