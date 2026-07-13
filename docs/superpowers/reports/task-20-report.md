# Task 20 Report: Frontend SPA

## What I Implemented

Implemented the browser-based single-page application for the Coding Agent Harness WebUI, following PLAN.md Task 20 steps exactly. The SPA connects to the WebSocket (Task 19) for real-time agent event streaming and to the REST API for task listing/submission.

Three static frontend files were created/overwritten under `src/server/frontend/` (the directory the `WebUIServer` serves via `FRONTEND_DIR`):

1. **`index.html`** (overwrote Task 19 placeholder) — SPA shell with four views toggled by a nav bar:
   - **New Task**: task description textarea + dynamic test-file entries (add/remove) + Start Task button.
   - **Running**: real-time event log + HITL approval panel (Approve/Reject buttons).
   - **History**: task list container populated from REST API.
   - **API Key**: key status display + set/clear buttons.
2. **`style.css`** — Dark theme styling (background `#1a1a2e`), nav buttons, form controls, event log with color-coded event classes (`event-round`, `event-llm`, `event-guardrail`, `event-error`), HITL panel, task cards with status badges.
3. **`app.js`** — Vanilla JS client logic:
   - Nav-bar view switching; loads tasks/key-status on tab activation.
   - Dynamic test-file entry cloning/removal.
   - `POST /api/tasks` to start a task, then switches to Running view and opens WebSocket.
   - `connectWebSocket()` parses `{ type, payload }` messages, appends color-coded events to the log, shows/hides the HITL panel on `guardrail:approval_requested`/`guardrail:approval_responded`.
   - Approve/Reject send `{ type: 'approve'|'reject', taskId }` over WebSocket.
   - `loadTasks()` fetches `GET /api/tasks` and renders task cards.
   - `loadKeyStatus()` fetches `GET /api/credentials`.

## Files Changed

- `src/server/frontend/index.html` — overwritten (placeholder replaced with full SPA markup)
- `src/server/frontend/style.css` — new
- `src/server/frontend/app.js` — new

Commit: `142b38b` — "feat: frontend SPA with task submission and real-time event display"

## Self-Review Findings

- **Plan adherence**: Files created verbatim from PLAN.md Task 20 Steps 1-3. No comments added (per instructions). File named `style.css` to match the plan and the `<link href="/style.css">` reference in index.html (the task brief mentioned `styles.css`, but the plan is authoritative and the HTML references `style.css`).
- **Path reconciliation**: The task brief mentioned `src/webui/public/`, but the actual repo structure (and PLAN.md File Structure) uses `src/server/frontend/`, which is where `WebUIServer` (`FRONTEND_DIR = join(__dirname, 'frontend')`) serves static assets. Used the actual/plan path so the server correctly serves the SPA.
- **Build impact**: `tsconfig.json` includes `src/**/*` but TypeScript only compiles `.ts` files, so the new `.html`/`.css`/`.js` files do not affect `tsc --noEmit` (lint) or `tsc` (build). Verified: `npx tsc --noEmit` exits 0.
- **Test impact**: Frontend files are static assets not imported by any module or test, so they cannot break existing tests. Verified full suite: 82 tests pass across 18 files, including the 4 `webui-server.test.ts` tests (the "starts and serves the frontend" test fetches `/` and gets 200 with the new index.html).
- **Manual verification (Step 4)**: Could not open a browser in this environment. Substituted with: (a) lint pass, (b) full test suite pass, (c) confirmed `WebUIServer.handleHttp` serves `/` -> `index.html`, `/style.css`, `/app.js` with correct content types, and `/api/tasks` returns JSON. The static-file serving path is covered by the existing webui-server test.

## Issues / Concerns

1. **Server-side endpoint gaps (Task 19 scope, not this task's scope)**: The plan's `app.js` calls two endpoints not implemented by the current `WebUIServer` (`src/server/webui-server.ts`):
   - `POST /api/tasks` (task submission) — the server only handles `GET /api/tasks` (list). The `handleHttp` method does not branch on method or route POST bodies, so submitting a task will currently fall through to the static-file handler and 404.
   - `GET /api/credentials` (key status) — not routed; will 404.
   These are server-side gaps from Task 19. The frontend is implemented exactly per the plan and will function once the server exposes these endpoints. No frontend changes are needed to resolve this; it is a `WebUIServer` enhancement.
2. **WebSocket approve/reject handling**: The frontend sends `{ type: 'approve'|'reject', taskId }` inbound messages over the WebSocket, but `WebUIServer` only sets up an `on('connection')` handler that tracks client lifecycle — it does not listen for inbound `message` events to drive the `HitlStateMachine`. This is again a server-side (Task 19) gap; the frontend is correct per the plan.
3. **`task:completed` double-append**: In `app.js`, `ws.onmessage` calls `appendEvent(type, payload)` for every message, then additionally calls `appendEvent('task:completed', payload)` again when `type === 'task:completed'`. This duplicates the completion event in the log. This matches the plan's code verbatim, so it was preserved as-is; flagging as a minor cosmetic bug present in the source plan.
4. **No automated tests for frontend**: Per the task description this is a frontend-only task (HTML/CSS/JS, no TypeScript, no tests). Verification was limited to lint + existing server tests + static analysis. Browser-level behavior (DOM rendering, WebSocket message handling) is not covered by automated tests.

## Verification Summary

- `npx tsc --noEmit` -> exit 0 (lint clean)
- `npx vitest run` -> 18 files, 82 tests, all passing
- `webui-server.test.ts` -> 4/4 passing (frontend served correctly)
