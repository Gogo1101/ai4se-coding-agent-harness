# Task 21 Report: Dockerfile + Entry Point

## What I Implemented

Implemented the final integration task that wires all modules together into a runnable entry point and a containerized deployment image, following PLAN.md Task 21 steps exactly.

1. **`src/index.ts`** (Step 1) — Main entry point created verbatim from the plan. It:
   - Loads config from `config.yaml` in the current working directory via `loadConfig`.
   - Constructs the full module graph: `EventBus`, `MemoryStore` (at `~/.harness/harness.db`), `Guardrail`, `HitlStateMachine`, `ToolRouter`, `CredentialManager`.
   - Guards on API key presence via `CredentialManager.hasKey()`; exits with a setup hint if missing.
   - Builds the `OpenAIAdapter` with the resolved key + config, then constructs `AgentLoop` and `WebUIServer` (port 3000).
   - Starts the server and logs the URL. Top-level `main().catch(console.error)` surfaces fatal errors.
2. **`Dockerfile`** (Step 2) — Multi-stage build created verbatim from the plan:
   - **Builder stage** (`node:20-alpine`): `npm ci` + `npm run build` to produce `dist/`.
   - **Runtime stage** (`node:20-alpine`): installs `docker-cli`, `python3`, `py3-pip`, then `pytest` (via `--break-system-packages`); copies `dist/`, `node_modules/`, `package.json`, `config.yaml`; exposes 3000; runs `node dist/index.js`.
3. **`.dockerignore`** (addition beyond the plan's explicit steps, but listed as a deliverable in the task brief) — Excludes `node_modules`, `dist`, `.git`, `data`, `coverage`, `.harness`, secrets (`*.env`, `*.enc`, `auth.json`), docs/plan/spec, `.opencode`/`.superpowers`, `tests`, and `vitest.config.ts` from the Docker build context. `tsconfig.json` is deliberately **kept** because the builder stage's `npm run build` (`tsc`) requires it.

## Files Changed

- `src/index.ts` — new (entry point wiring all modules)
- `Dockerfile` — new (multi-stage build: TypeScript build + Python/pytest runtime)
- `.dockerignore` — new (build-context exclusions; keeps `tsconfig.json` so the build stage can compile)

Commit: `d8fd0e8` — "feat: Dockerfile and entry point"

## Self-Review Findings

- **Plan adherence**: `src/index.ts` and `Dockerfile` were created byte-for-byte from PLAN.md Task 21 Steps 1-2 (including the `// src/index.ts` filename marker that every other source file in this repo uses as line 1, matching repo convention). No explanatory comments were added.
- **Constructor signature verification**: Cross-checked every constructor call in `index.ts` against the actual module implementations to confirm the plan's wiring is type-correct:
  - `new MemoryStore(dbPath)` — matches `memory-store.ts:6`.
  - `new Guardrail(config)` — matches `guardrail.ts:12`.
  - `new HitlStateMachine(bus, config.guardrail.hitlTimeoutSeconds)` — matches `hitl-state-machine.ts` constructor `(bus, timeoutSeconds)`.
  - `new ToolRouter(config)` — matches `tool-router.ts:7`.
  - `new CredentialManager()` — matches `credential-manager.ts:6`.
  - `new OpenAIAdapter({ apiKey, apiBase, model, temperature, maxTokens })` — matches `OpenAIAdapterConfig` in `openai-adapter.ts:6`.
  - `new AgentLoop({ llm, guardrail, hitl, toolRouter, memory, bus, config })` — matches `AgentLoopDeps` in `agent-loop.ts:14`.
  - `new WebUIServer({ bus, memory, port: 3000 })` — matches `WebUIServerDeps` in `webui-server.ts:13`.
- **Build verification (substitute for Step 3)**: The Docker daemon is installed but **not running** in this environment (`docker ps` fails: "failed to connect to the docker API ... check if the daemon is running"). Since `docker build` could not be executed, I verified the build chain that the Dockerfile depends on:
  - `npx tsc --noEmit` → exit 0 (lint clean, all imports resolve).
  - `npx tsc` (full build) → exit 0, and `dist/index.js` + `dist/index.d.ts` are produced. The Dockerfile's `CMD ["node", "dist/index.js"]` therefore has a valid target.
  - `npx vitest run` → 18 files, 82 tests, all passing (no regressions from the new entry point; it is not imported by any test, which is expected for a process entry point).
- **`.dockerignore` correctness**: Initially listed `tsconfig.json` as ignored, which would break the builder stage's `npm run build`. Caught during self-review and removed it from the ignore list. Final `.dockerignore` keeps `tsconfig.json` and all of `src/` (not listed) so the TypeScript compile succeeds.
- **No test added for `index.ts`**: The plan does not specify a test for the entry point (it is a process bootstrap that touches the OS keychain, Docker, and a long-running HTTP server — not unit-testable without heavy mocking). This matches the plan, which has no `tests/index.test.ts`. Verification was limited to lint + build + full suite.

## Issues / Concerns

1. **Docker build not executed (Step 3 blocked)**: The Docker CLI is installed (v29.4.3) but the Docker Desktop Linux engine daemon is not running, so `docker build -t harness-python:latest .` could not be run. The Dockerfile is created verbatim from the plan and the underlying `tsc` build it invokes was verified to succeed and emit `dist/index.js`. The image build itself remains unverified in this environment; it should be run on a host with the Docker daemon running. This is an environment limitation, not a code defect.
2. **`~/.harness/` directory is never created**: `index.ts` sets `dbPath = join(homedir(), '.harness', 'harness.db')` and passes it to `new MemoryStore(dbPath)`, which calls `new Database(dbPath)` (better-sqlite3) directly. better-sqlite3 does **not** create missing parent directories, so on a fresh machine where `~/.harness/` does not exist, startup will throw `SQLite3Error: ... unable to open database file`. This is a latent runtime bug in the plan's code. Recommended fix (out of scope for "follow the plan exactly"): add `import { mkdirSync } from 'fs';` and `mkdirSync(join(homedir(), '.harness'), { recursive: true });` before constructing `MemoryStore`. Flagging for a follow-up; not fixed here to keep the entry point byte-identical to the plan.
3. **`--setup` flag referenced but not implemented**: `index.ts` prints "Please run with --setup to configure." when no API key is found, but neither this file nor `CredentialManager` parses `--setup` or wires `setKey` to a CLI flow. The plan's code is verbatim, so this is a plan-level gap, not an implementation deviation. The `dev` script (`tsx src/index.ts`) likewise has no setup path.
4. **Task brief vs. plan discrepancy (POST /api/tasks, GET /api/credentials)**: The task brief states the entry point "handles HTTP POST /api/tasks for task submission and GET /api/credentials for key status." The plan's `src/index.ts` does **not** implement these — it only constructs modules and starts the server. Those HTTP routes belong to `WebUIServer` (Task 19 scope), and the Task 20 report already flagged that `WebUIServer.handleHttp` only implements `GET /api/tasks` (list), not `POST /api/tasks` or `GET /api/credentials`. Per the explicit instruction to follow the plan exactly, `index.ts` was kept minimal as written; the frontend SPA (Task 20) will not be fully functional until `WebUIServer` is extended with the missing routes and inbound WebSocket message handling. This is a pre-existing server-side gap, not introduced by Task 21.
5. **`agentLoop` is constructed but never invoked**: `index.ts` builds an `AgentLoop` instance but does not wire it to an incoming task (e.g., via a `POST /api/tasks` handler that calls `agentLoop.run(task)`). With the plan's minimal entry point, the agent loop is idle until the missing server routes are added. This is consistent with concerns #4 and the Task 20 report; the wiring is expected to be completed when `WebUIServer` gains task-submission endpoints.

## Verification Summary

- `npx tsc --noEmit` → exit 0 (lint clean)
- `npx tsc` → exit 0; `dist/index.js` and `dist/index.d.ts` produced (Dockerfile CMD target valid)
- `npx vitest run` → 18 files, 82 tests, all passing (no regressions)
- `docker build` → **not run** (Docker daemon not running in this environment); Dockerfile is verbatim from the plan and the `tsc` build it depends on was verified

---

## Fix Report: Critical & Important Integration Issues

Applied follow-up fixes for the Critical and Important issues identified in the self-review above.

### Critical 1: `~/.harness/` directory never created → startup crash
- **Root cause**: `MemoryStore` passes `dbPath` to `new Database(dbPath)` (better-sqlite3), which does not create missing parent directories. On a fresh machine where `~/.harness/` does not exist, startup throws `SQLite3Error: unable to open database file`.
- **Fix** (`src/index.ts`): Added `import { mkdirSync } from 'fs';` and `mkdirSync(join(homedir(), '.harness'), { recursive: true });` before `new MemoryStore(dbPath)`. The `recursive: true` flag makes it a no-op if the directory already exists.

### Critical 2: Frontend static assets missing from Docker image
- **Root cause**: `webui-server.ts` serves files from `dist/server/frontend/` (computed via `__dirname` of the compiled `webui-server.js`), but `tsc` only emits `.js`/`.d.ts`/`.map` files — it does not copy non-TypeScript assets (`index.html`, `app.js`, `style.css`). The original Dockerfile only copied `dist/`, so the frontend was absent at runtime and every non-API route returned 404.
- **Fix** (`Dockerfile`): Added `COPY --from=builder /app/src/server/frontend ./dist/server/frontend` immediately after the `COPY --from=builder /app/dist ./dist` line. This copies the source frontend directory into the exact path `webui-server.ts` resolves at runtime (`dist/server/frontend/`).

### Critical 3: keytar cannot function in Docker → immediate exit
- **Root cause**: `keytar` requires libsecret/gnome-keyring, which is unavailable on `node:20-alpine`. `creds.hasKey()` throws, and the process exits with "Please run with --setup" — but `--setup` was unimplemented, leaving no path forward in a container.
- **Fix** (`src/index.ts`): Wrapped the `creds.hasKey()` / `creds.getKey()` calls in a try/catch. If keytar throws (or returns no key), the code falls back to `process.env.OPENAI_API_KEY`. If neither keychain nor env var yields a key, it prints a helpful message listing both options and exits. The resolved `apiKey` is passed directly to `OpenAIAdapter`, so the env-var path bypasses keytar entirely at runtime.

### Critical 4: Docker build not executed
- Skipped per instructions — Docker daemon not running in this environment. Dockerfile syntax verified correct; the new `COPY` line (Critical 2) follows the same multi-stage pattern as the existing lines.

### Important 1: `POST /api/tasks` and `GET /api/credentials` not implemented
- **Root cause**: The entry point constructed an `AgentLoop` but never wired it to an inbound HTTP request. `WebUIServer.handleHttp` only implemented `GET /api/tasks` (list), not task submission or credential status.
- **Fix** (`src/server/webui-server.ts` + `src/index.ts`):
  - Extended `WebUIServerDeps` with optional `agentLoop?: AgentLoop` and `creds?: CredentialManager` fields (optional so existing tests that construct `{ bus, memory, port }` still compile and pass).
  - `POST /api/tasks`: reads the JSON body (`{ description, testFiles }`), constructs a `Task` with a `randomUUID()` id and `status: 'running'`, persists it via `memory.saveTask(task)`, then kicks off `agentLoop.run(task)` as a fire-and-forget background promise (with a `.catch` that emits an `error` event and marks the task `failure`). Returns `{ taskId, status: 'running' }` immediately so the HTTP request does not block for the (potentially long) agent run; progress is streamed to clients over the existing WebSocket broadcast.
  - `GET /api/credentials`: returns `creds.getStatus()` as JSON. Wrapped in try/catch so that if keytar is unavailable (Docker), it falls back to reporting whether `OPENAI_API_KEY` is set, mirroring the index.ts env-var fallback.
  - `src/index.ts` now passes `agentLoop` and `creds` into `new WebUIServer({ bus, memory, port: 3000, agentLoop, creds })`.
  - The existing `GET /api/tasks` (list) route is preserved unchanged for the `startsWith('/api/tasks')` path with `GET` method.

### Important 2: `--setup` flag unimplemented
- **Root cause**: `index.ts` printed "Please run with --setup to configure." but no code parsed `--setup` or wired `setKey` to a CLI flow.
- **Fix** (`src/index.ts`): Added `import * as readline from 'readline';`. If `process.argv.includes('--setup')`, creates a readline interface, prompts "Enter your OpenAI API key: " on stdin, trims the answer, and calls `creds.setKey(key)`. Wrapped `setKey` in try/catch so that if keytar is unavailable (Docker), it prints a helpful "Set OPENAI_API_KEY env var instead." message rather than crashing. Exits after setup.

### Verification (post-fix)

- `npx tsc --noEmit` → exit 0 (lint clean; new imports `mkdirSync`, `readline`, `randomUUID`, and type imports `AgentLoop`/`CredentialManager`/`Task` all resolve).
- `npx vitest run` → 18 files, 82 tests, all passing (no regressions; the optional `agentLoop`/`creds` deps keep existing `WebUIServer` tests green).

### Files Changed (fix pass)

- `src/index.ts` — added `mkdirSync` for `~/.harness/`, `--setup` readline flow, keytar try/catch with `OPENAI_API_KEY` env fallback, passes `agentLoop`+`creds` to `WebUIServer`.
- `src/server/webui-server.ts` — extended `WebUIServerDeps` with optional `agentLoop`/`creds`; added `POST /api/tasks` and `GET /api/credentials` routes; preserved existing `GET /api/tasks` list route.
- `Dockerfile` — added `COPY --from=builder /app/src/server/frontend ./dist/server/frontend`.
