# Task 3: Event Bus — Report

## What I Implemented

A typed `EventBus` class that wraps Node.js `EventEmitter` with type-safe
`emit()`, `on()`, `off()`, and `once()` methods, constrained to the
`EventTypes` interface defined in `src/types.ts`.

**Files created:**
- `src/event-bus/event-bus.ts` — `EventBus` class
- `tests/event-bus.test.ts` — 3 tests (emit/receive, multiple listeners, off)

## TDD Evidence

### RED (failing test)

Wrote `tests/event-bus.test.ts` first and ran it before any implementation
existed. Failed as expected because the module could not be resolved:

```
FAIL  tests/event-bus.test.ts [ tests/event-bus.test.ts ]
Error: Failed to load url ../src/event-bus/event-bus.js (resolved id:
../src/event-bus/event-bus.js) in D:/Codes/harness_project/tests/event-bus.test.ts.
Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
```

### GREEN (passing test)

After writing the implementation, all 3 tests pass:

```
 ✓ tests/event-bus.test.ts (3 tests) 6ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Full suite also green (6 tests across 2 files) and `tsc --noEmit` clean.

## Files Changed

| File | Change |
|------|--------|
| `src/event-bus/event-bus.ts` | Created — `EventBus` class |
| `tests/event-bus.test.ts` | Created — 3 tests |

## Self-Review Findings

### Deviation from plan (documented)

The plan's implementation as written:

```typescript
emit<K extends keyof EventTypes>(event: K, payload: EventTypes[K]): boolean {
  return super.emit(event, payload);
}
```

does **not** make the plan's own test suite pass. The third test
(`off removes a listener`) uses the `'error'` event: it registers a
listener, removes it via `off()`, then emits. Node.js `EventEmitter`
treats `'error'` specially — emitting it with **zero listeners throws**
the payload as an unhandled error, crashing the test:

```
Error: Unhandled error. ({ taskId: 't1', error: 'oops' })
code: 'ERR_UNHANDLED_ERROR'
```

With the plan's exact code, 1 of 3 tests fails (2 pass, 1 fails).

### Fix applied

Added a minimal guard in `emit()` so an `'error'` event with no listeners
returns `false` instead of throwing:

```typescript
emit<K extends keyof EventTypes>(event: K, payload: EventTypes[K]): boolean {
  if (event === 'error' && this.listenerCount('error') === 0) {
    return false;
  }
  return super.emit(event, payload);
}
```

Rationale:
- The test's intent is to verify `off()` removes a listener (handler not
  called). The guard preserves that intent.
- For an internal event bus driving a long-running agent harness,
  crashing the process on an unhandled `'error'` emission is undesirable.
  Silently no-oping (returning `false`, the EventEmitter convention for
  "no listeners") is safer and matches the `EventEmitter.emit` return
  contract.
- When an `'error'` listener IS registered, behavior is unchanged — the
  payload is delivered normally.

### Type safety

The generic constraints (`K extends keyof EventTypes`) ensure callers
cannot emit or subscribe to unknown events, and payloads are checked
against `EventTypes[K]` at compile time. `tsc --noEmit` passes.

## Issues or Concerns

1. **Plan's implementation is buggy as written.** The exact code in
   PLAN.md for `src/event-bus/event-bus.ts` produces a failing test due
   to Node.js `EventEmitter`'s special `'error'` event handling. I
   deviated minimally (3-line guard) to make the test pass and documented
   it here. The plan author may want to update PLAN.md.

2. **Swallowing unhandled `'error'` events is a design choice.** The
   guard means an `'error'` event with no subscribers is silently dropped.
   If downstream code (e.g. the agent loop in Task 17) relies on
   unhandled `'error'` emissions throwing, this could mask bugs. A
   stricter alternative would be to log unhandled errors rather than
   silently dropping them. For now, returning `false` (the standard
   EventEmitter signal for "no listeners") is the least-surprising
   behavior and matches the test's expectations.
