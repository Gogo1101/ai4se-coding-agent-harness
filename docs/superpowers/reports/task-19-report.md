# Task 19: WebUI Server — Report

## Status: DONE_WITH_CONCERNS

## What Was Implemented

The `WebUIServer` class in `src/server/webui-server.ts` — an HTTP + WebSocket server that serves static frontend files and pushes real-time `EventBus` events to connected browser clients over WebSocket. It also exposes a REST endpoint for listing persisted tasks.

### Components

1. **`WebUIServerDeps` interface** — constructor dependencies: `{ bus: EventBus; memory: MemoryStore; port: number }`.
2. **`WebUIServer` class**:
   - **Constructor**: Creates an `http.createServer` (routing through `handleHttp`), a `WebSocketServer` bound to the HTTP server at path `/ws`, registers a `connection` handler that tracks clients in a `Set<WebSocket>` (removing on `close`), and calls `setupBroadcast()`.
   - **`setupBroadcast()` (private)**: Subscribes to all 13 `EventTypes` keys on the `EventBus`. Each listener forwards `{ type: ev, payload }` to `broadcast()`.
   - **`start(): Promise<void>`**: Calls `httpServer.listen(port)`. When `port === 0`, the OS assigns an ephemeral port; `start()` captures the actual port from `server.address()` and stores it. Resolves once listening.
   - **`getPort(): number`**: Returns the bound port (post-`start()`).
   - **`stop(): Promise<void>`**: Closes all WebSocket clients, closes the HTTP server, then closes the `MemoryStore` DB handle, and resolves.
   - **`handleHttp(req, res)` (private)**: Routes `/api/tasks` → `memory.listTasks(0, 20)` as JSON; otherwise maps `/` → `/index.html` and serves static files from `FRONTEND_DIR` with content-type inference (html/js/css/octet-stream). Falls back to 404 on read error.
   - **`broadcast(msg)` (private)**: JSON-stringifies the message and sends it to every client whose `readyState === WebSocket.OPEN`.
3. **`src/server/frontend/index.html`** — minimal placeholder page so the "serves the frontend" test returns HTTP 200. Task 20 will replace this with the full SPA.

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/server/webui-server.ts` | Created | WebUIServer class: HTTP static serving + WebSocket event streaming + REST `/api/tasks` |
| `src/server/frontend/index.html` | Created | Minimal placeholder index.html (required for the "serves the frontend" test to return 200) |
| `tests/webui-server.test.ts` | Created | 4 test cases: serve frontend, WS connect, broadcast event, REST list tasks |

## TDD Evidence

### RED Phase (Step 2)
Wrote `tests/webui-server.test.ts` (verbatim from PLAN.md Step 1) before any implementation existed. Ran:
```
npx vitest run tests/webui-server.test.ts
```
Result:
```
Error: Failed to load url ../src/server/webui-server.js (resolved id: ../src/server/webui-server.js)
in D:/Codes/harness_project/tests/webui-server.test.ts. Does the file exist?
Test Files  1 failed (1)
     Tests  no tests
```
Confirmed RED — module-not-found, zero tests collected.

### Initial GREEN attempt (Step 3 verbatim)
Wrote `src/server/webui-server.ts` verbatim from PLAN.md Step 3 and created a minimal `src/server/frontend/index.html` placeholder. Ran the test:
```
npx vitest run tests/webui-server.test.ts
```
Result: **4 failed (4)** — all failures in `afterEach` (line 12) with:
```
Error: EPERM, Permission denied: ...\srv-XXXXXX\t.db
```
Root cause: `MemoryStore` opens a `better-sqlite3` handle that is never closed. The plan's verbatim `stop()` only closes the HTTP server, not the DB. On Windows, an open file handle blocks `rmSync`, so the test's `afterEach` cleanup (`rmSync(dbPath)`) throws EPERM. The test bodies themselves passed (assertions succeeded), but vitest marks a test as failed when `afterEach` throws.

### Fix applied (minimal deviation)
Modified `stop()` to close the `MemoryStore` after the HTTP server closes:
```typescript
async stop(): Promise<void> {
  this.clients.forEach(c => c.close());
  return new Promise((r) => this.httpServer.close(() => { this.deps.memory.close(); r(); }));
}
```
This is the only deviation from the plan's verbatim implementation. It is necessary for Windows compatibility (the test environment is `win32`). On Unix, `rmSync` succeeds even with open handles (unlink-while-open), so the plan's verbatim code passes there; on Windows it does not.

### GREEN Phase (Step 4, after fix)
```
npx vitest run tests/webui-server.test.ts
 ✓ tests/webui-server.test.ts (4 tests) 109ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```
All 4 tests pass.

### Full Suite Verification (no regressions)
```
npx vitest run
 Test Files  18 passed (18)
      Tests  82 passed (82)
   Duration  2.18s
```
Previous baseline: 17 files / 78 tests. New: 18 files / 82 tests (+1 file, +4 tests). No regressions.

### TypeScript Typecheck
```
npx tsc --noEmit  →  exit code 0 (no errors)
```

## Self-Review Findings

### Correctness (per-test analysis)
- **Test 1 (starts and serves the frontend):** `port: 0` → OS assigns ephemeral port. `start()` captures it via `server.address().port`. `fetch('/')` → `handleHttp` maps `/` → `/index.html`, reads `FRONTEND_DIR/index.html`, returns 200 with `text/html`. ✓
- **Test 2 (accepts WebSocket connections):** `WebSocketServer` configured with `{ server, path: '/ws' }`. Client connects to `ws://localhost:PORT/ws`, `open` fires. Client set grows to 1. ✓
- **Test 3 (broadcasts events to WebSocket clients):** After WS open, `bus.emit('task:started', ...)` fires the listener registered in `setupBroadcast()`, which calls `broadcast({ type: 'task:started', payload })`. The open client receives the JSON string. Test parses it and asserts `event.type === 'task:started'`. ✓
- **Test 4 (lists tasks via REST API):** `memory.saveTask(...)` persists a task. `fetch('/api/tasks')` → `handleHttp` matches `url.startsWith('/api/tasks')`, calls `memory.listTasks(0, 20)`, returns JSON. Test asserts `tasks.length === 1` and `tasks[0].id === 't1'`. ✓

### API Surface Verification
- `ws` v8: `WebSocketServer({ server, path })` attaches to an existing `http.Server` and only accepts upgrades at `/ws`. `ws.on('connection', cb)` and `ws.on('close', cb)` are standard. `ws.readyState === WebSocket.OPEN` (1) is the correct guard before `send()`. ✓
- `http.createServer`, `server.listen(port, cb)`, `server.address()` returning `{ port }` for TCP — all standard Node 20 API. ✓
- `MemoryStore.listTasks(offset, limit)` and `MemoryStore.close()` exist (Task 13). ✓
- `EventBus.on(event, handler)` exists (Task 3). ✓

### `__dirname` / `FRONTEND_DIR` resolution
- Under vitest (esbuild transform), `import.meta.url` resolves to the source `.ts` file path, so `FRONTEND_DIR` = `src/server/frontend/`. The placeholder `index.html` is found. ✓
- Under compiled `dist/` (production), `FRONTEND_DIR` would resolve to `dist/server/frontend/`. The frontend assets would need to be copied to `dist/` during build (Task 20/21 concern, not Task 19).

### Event forwarding completeness
- `setupBroadcast()` subscribes to all 13 event keys defined in `EventTypes` (`src/types.ts:78-92`). Each forwards `{ type, payload }`. The broadcast only sends to `readyState === OPEN` clients, preventing errors on closing/closed sockets. ✓

## Deviations from Plan

1. **`stop()` closes `MemoryStore`** — The plan's verbatim `stop()` is:
   ```typescript
   async stop(): Promise<void> { this.clients.forEach(c => c.close()); return new Promise((r) => this.httpServer.close(() => r())); }
   ```
   The implemented version adds `this.deps.memory.close()` inside the `httpServer.close` callback. **Reason:** On Windows (the test environment), `better-sqlite3` holds an exclusive lock on the `.db` file; `rmSync` in the test's `afterEach` fails with EPERM unless the DB handle is closed first. The plan was likely authored/tested on Unix where unlink-while-open succeeds. This is the minimal change that makes the verbatim test pass on Windows without altering the test itself.

2. **`src/server/frontend/index.html` placeholder** — The plan's Task 19 "Files" list only names `src/server/webui-server.ts` and `tests/webui-server.test.ts`. However, the test "starts and serves the frontend" asserts `response.status === 200` for `GET /`, which requires an `index.html` in `FRONTEND_DIR`. Task 20 creates the full SPA (`index.html`, `app.js`, `style.css`), but Task 19's test cannot pass without at least a placeholder. A minimal 11-line `index.html` was created; Task 20 will overwrite it.

## Issues and Concerns

1. **`stop()` closing a shared `MemoryStore` (design tension):** In production, `MemoryStore` is likely shared between `AgentLoop` and `WebUIServer`. Calling `memory.close()` in `server.stop()` would break any other consumer still using the store. This is acceptable for the test (each test owns its own store) and for process shutdown, but if the server is stopped/restarted mid-run without recreating the store, the DB handle would be invalid. A cleaner design would have the caller own the `MemoryStore` lifecycle and the test explicitly close it. However, the verbatim test does not close the store, so this deviation was necessary. Flagging for the integration task (Task 21).

2. **Path traversal in `handleHttp`:** `readFile(join(FRONTEND_DIR, filePath))` uses the raw URL path without sanitization. A request like `GET /../../package.json` could escape `FRONTEND_DIR` and read arbitrary files (e.g. `join('.../server/frontend', '/../../package.json')` resolves to `.../server/package.json`). This matches the plan's verbatim implementation and is a known limitation. A production fix would canonicalize and verify the resolved path stays within `FRONTEND_DIR`. Not blocking for Task 19 (no test covers it), but flagging for security hardening.

3. **No EventBus listener cleanup in `stop()`:** `setupBroadcast()` registers 13 listeners on the bus. `stop()` never calls `bus.off(...)`. If a `WebUIServer` is stopped and the `EventBus` is reused (e.g. server restart), the stale listeners remain — they reference the old `clients` set (now empty), so `broadcast` is a no-op, but they still consume memory and CPU on every emit. A `stop()` implementation should remove its listeners. Not blocking (tests create a fresh bus per test), but flagging for production use.

4. **`wsServer` not explicitly closed:** `stop()` closes individual clients but does not call `wsServer.close()`. The underlying `httpServer.close()` terminates connections, so this works, but explicitly closing the `WebSocketServer` is cleaner. Matches the plan verbatim; not blocking.

5. **Minimal test coverage:** The 4 tests cover the happy paths only. No tests for: 404 on missing static file, content-type for `.js`/`.css`, multiple WebSocket clients, client disconnect cleanup, REST API with empty task list, or error events. This matches the plan's TDD steps exactly; additional coverage is out of scope.

## Verification Commands Run

- `npx vitest run tests/webui-server.test.ts` → 4 passed (GREEN)
- `npx vitest run` → 82 passed across 18 files (no regressions)
- `npx tsc --noEmit` → exit code 0 (clean)
