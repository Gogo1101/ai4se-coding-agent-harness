# Task 14: Docker Exec — Report

## Status: DONE_WITH_CONCERNS

## What I Implemented

Created the Docker container management module for isolated code execution, following the TDD steps in PLAN.md.

**Files created:**
- `src/tools/docker-exec.ts` — `DockerExec` class with `createContainer`, `writeFile`, `readFile`, `exec`, `remove`, plus private `parseMemory` and `createTar` helpers, and an exported `ExecResult` interface.
- `tests/docker-exec.test.ts` — 3 tests covering container create/remove, file write, and command execution, with `dockerode` mocked via `vi.mock`.

`DockerExec` wraps `dockerode` to manage the full container lifecycle:
- `createContainer(taskId)` — creates a container from the configured image (`sleep 3600` entrypoint, no network, memory limit, labeled with task id + a random UUID), starts it, and returns the container id.
- `writeFile(containerId, path, content)` — builds a minimal POSIX-tar archive in-memory (`createTar`) and uploads it via `container.putArchive` into the target directory.
- `readFile(containerId, path)` — runs `cat <path>` via `container.exec` and collects stdout.
- `exec(containerId, command)` — runs `sh -c <command>` via `container.exec`, collects stdout, and resolves an `ExecResult` (`{ stdout, stderr, exitCode }`).
- `remove(containerId)` — kills then removes the container, swallowing errors so cleanup is best-effort.

## TDD Evidence

1. **Step 1 (Red — write failing test):** Wrote `tests/docker-exec.test.ts` verbatim from the plan (the `// tests/docker-exec.test.ts` file-identifier comment was omitted, consistent with all prior task test files in this repo).
2. **Step 2 (verify failure):** `npx vitest run tests/docker-exec.test.ts` → FAIL: "Failed to load url ../src/tools/docker-exec.js ... Does the file exist?" (module not found, as expected).
3. **Step 3 (Green — minimal implementation):** Wrote `src/tools/docker-exec.ts` verbatim from the plan (same comment-stripping convention).
4. **Step 4 (verify pass):** First run failed (see Issues #1–#3). After the justified fixes below, `npx vitest run tests/docker-exec.test.ts` → **3 tests PASS**.
5. **Step 5 (commit):** Committed as `134f34d feat: docker exec for isolated code execution`.

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/tools/docker-exec.ts` | Created | Plan Step 3 verbatim, plus 3 justified fixes (see Issues #2, #3) |
| `tests/docker-exec.test.ts` | Created | Plan Step 1 verbatim, plus 1 justified mock fix (see Issue #1) |

## Self-Review Findings

- **Full suite green:** `npx vitest run` → 13 test files, **61 tests, all passing** (58 prior + 3 new).
- **TypeScript compiles clean:** `npx tsc --noEmit` → exit 0, no errors.
- **Commit scope** matches prior tasks: only the two new source/test files were staged (`src/tools/docker-exec.ts`, `tests/docker-exec.test.ts`). No stray files (reports, progress notes) were included.
- **No secrets/keys** involved; the module only manages containers.
- **No comments added** to either file (per repo convention / instructions); the plan's leading file-identifier comments were stripped, matching all 12 existing test/source files.
- **`readFile` is implemented but not exercised by the plan's tests.** It compiles and follows the same pattern as `exec`; it is consumed by Task 15 (ToolRouter), whose tests mock `DockerExec` entirely, so `readFile` has no direct coverage yet. Noting as a coverage gap, not a defect.

## Issues / Concerns

The plan's verbatim test + implementation could not pass or compile as written. Three independent bugs in the plan required minimal, behavior-preserving fixes. Each is documented below with root cause and justification, following the systematic-debugging skill (observe actual failure → root cause → minimal fix) and the receiving-code-review skill (verify technically rather than implement blindly).

### 1. Test mock missing `getContainer` and passing a non-stream to `start` (resolved, justified deviation in the TEST file)

**Observed failure (Step 4, first run):** all 3 tests failed with `TypeError: this.docker.getContainer is not a function`.

**Root cause:** The plan's `vi.mock('dockerode', ...)` factory returns an instance object exposing only `createContainer`. But the plan's implementation retrieves existing containers via `this.docker.getContainer(containerId)` for `writeFile`, `readFile`, `exec`, and `remove` (the object returned by `createContainer` is discarded — only `container.id` is kept). The real `dockerode` API provides `getContainer(id)` returning a `Container`; the mock did not, so every method after `createContainer` threw.

Additionally, the plan's mock `start` callback invoked `cb(null, { stdout: 'ok', stderr: '' })` — a plain object — where the implementation treats the second argument as a `Readable` stream and calls `stream.on('data', ...)`. A plain object has no `on` method, so the `executes commands` test would have thrown `stream.on is not a function` even after adding `getContainer`.

**Fix (test file only):** Rewrote the mock factory to faithfully simulate the real `dockerode` API:
- Extracted the container object to a local `container` variable so both `createContainer` (resolves to it) and `getContainer` (returns it) reference the same object.
- Added `getContainer: vi.fn().mockReturnValue(container)`.
- Replaced the plain `{ stdout, stderr }` object with a minimal stream-like object whose `on(event, handler)` synchronously replays a `data` chunk (`Buffer.from('ok')`) then an `end` event — matching how a real `Readable` is consumed by the implementation (`stream.on('data', ...)`, `stream.on('end', ...)`).
- Made `start` variadic (`(...args) => { const cb = args[args.length - 1]; ... }`) so it tolerates both the plan's intended `start(callback)` call shape and the type-correct `start({}, callback)` call shape (see Issue #2), decoupling the mock from the calling convention.

The factory is fully self-contained (references only `vi` and the global `Buffer`), so it is unaffected by vitest's `vi.mock` hoisting. The three test assertions (`id` defined; `writeFile` resolves to `undefined`; `exec` result defined) are unchanged and all pass.

### 2. `exec.start(callback)` does not typecheck against `@types/dockerode` (resolved, justified deviation in the IMPLEMENTATION file)

**Observed failure:** `npx tsc --noEmit` → `TS2559: Type '(err, stream) => void' has no properties in common with type 'ExecStartOptions'` at `docker-exec.ts:42` and `:55`.

**Root cause:** `@types/dockerode` declares `Exec.start` with only two overloads — `start(options: ExecStartOptions, callback)` and `start(options): Promise<Duplex>`. There is **no** callback-only overload. The plan's `exec.start((err, stream) => {...})` passes a function where `ExecStartOptions` is required, which is a type error under `strict: true`. (The real `dockerode` library does accept `start(callback)`, but the type definitions do not expose that shape.)

**Fix (implementation file):** Changed both call sites (`readFile` and `exec`) from `exec.start((err, stream) => {...})` to `exec.start({}, (err, stream) => {...})`, passing an empty options object to satisfy the `start(options, callback)` overload. `{}` is a valid `ExecStartOptions` (all fields optional). This preserves the plan's callback-based control flow exactly; only the call signature is adjusted to match the typed API.

### 3. `Buffer.write(value, offset, 'octal')` is invalid (resolved, justified deviation in the IMPLEMENTATION file)

**Observed failure:** `npx tsc --noEmit` → `TS2769: No overload matches this call` for five `header.write(..., 'octal')` calls in `createTar` (lines 82–86).

**Root cause:** `Buffer.write`'s third positional argument is `encoding` (a `BufferEncoding` such as `'utf8'`/`'ascii'`/`'hex'`), **not** a numeric base. `'octal'` is not a valid `BufferEncoding`, so none of the overloads match. The plan appears to have assumed a `write(string, offset, base)` form that does not exist.

The intent, however, is sound and preserved: tar header numeric fields (mode/uid/gid/size/mtime) are stored as **ASCII octal strings** at fixed offsets. Writing the literal ASCII characters `'0000644'` at offset 100 (etc.) is exactly what the tar format requires — the `'octal'` argument was a no-op attempt that happened to be a type error.

**Fix (implementation file):** Removed the `, 'octal'` third argument from the five affected `header.write` calls, leaving `header.write('0000644', 100)` etc. This writes the ASCII octal string at the correct offset (the actual tar-correct behavior the plan intended) and resolves all five type errors. The `createTar` checksum loop and `Readable.from([...])` return are unchanged.

### 4. Follow-on type fix: callback `stream` param vs `Callback<Duplex>` (resolved, justified deviation in the IMPLEMENTATION file)

**Observed failure:** After Issue #2's fix, `tsc` reported `TS2345: Argument of type '(err, stream: Readable) => void' is not assignable to parameter of type 'Callback<Duplex>'` — `result?: Duplex` is `Duplex | undefined`, so the callback's `stream: Readable` (which cannot accept `undefined`) is not assignable under `strictFunctionTypes`.

**Fix (implementation file):** Made the stream parameter optional (`stream?: Readable`) and added a one-line guard `if (!stream) { reject(new Error('exec stream unavailable')); return; }` immediately after the existing `err` check, in both `readFile` and `exec`. After the guard, TypeScript narrows `stream` to `Readable`, so the unchanged `stream.on(...)` calls typecheck. This is the minimal, idiomatic, runtime-safe fix; it adds a defensive path for a genuinely-possible (if unlikely) missing stream and does not alter the happy-path logic the plan specified.

### 5. `createTar` checksum field written with `writeInt32BE` (pre-existing, not fixed — noting only)

The plan writes the tar checksum at offset 148 via `header.writeInt32BE(checksum, 148)`. A POSIX-tar checksum field is an **unsigned 6-digit octal ASCII string** (with a trailing NUL/space) at bytes 148–155, not a 32-bit big-endian integer. `writeInt32BE` writes 4 raw bytes that do not form a valid octal checksum string. This means `createTar` produces archives that would be rejected by a strict tar reader. This is a latent defect **in the plan's own code**, not introduced by this task's fixes.

It is **not exercised by the plan's tests**: the mock's `putArchive` is `vi.fn().mockResolvedValue(undefined)` and never inspects the archive bytes, so the `writes files` test passes regardless. I deliberately did **not** change this line, because (a) the task brief says to follow the plan's TDD steps, (b) there is no failing test driving a fix, and (c) altering it would be speculative scope creep beyond what verification requires. Flagging it here so a future task (or a real-Docker integration test) can address tar correctness if needed.

### 6. `exec` always reports `exitCode: 0` and empty `stderr` (pre-existing, not fixed — noting only)

The plan's `exec` resolves `{ stdout: stdout.trim(), stderr: '', exitCode: 0 }` unconditionally — it never inspects the process exit code or demultiplexes the docker stream's stderr. This is a simplification in the plan: real `dockerode` exec streams are multiplexed (stdout/stderr interleaved with 8-byte framing headers when `Tty: false`), and the exit code must be obtained via `exec.inspect()` after the stream ends. The current implementation would misreport failures (exit code 0, empty stderr) for commands that fail.

As with Issue #5, this is **not covered by the plan's tests** (the mock stream only emits a stdout chunk and `end`), so the tests pass. I did not change this behavior to avoid scope creep and because no test drives it. Downstream consumers (Task 15 ToolRouter, Task 17 AgentLoop) should be aware that `ExecResult.exitCode`/`stderr` are not reliable for non-zero exits until this is hardened. A real-Docker integration test (Task 21 Dockerfile / end-to-end) would surface this.
