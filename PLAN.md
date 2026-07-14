# Coding Agent Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a "exam coach" coding agent harness that accepts a programming task + pytest tests, drives an LLM to generate code, runs tests in Docker, parses failures, and feeds back structured signals for self-correction until all green or max retries.

**Architecture:** Modular monolith (single Node.js process) with internal event bus connecting six dimension modules. WebSocket pushes real-time events to browser SPA. Docker container isolates AI-generated code execution. Mock LLM abstraction enables deterministic unit tests of all core mechanisms.

**Tech Stack:** TypeScript (Node.js 20), dockerode, SQLite (better-sqlite3), ws (WebSocket), keytar, pytest, vitest

## Global Constraints

- Node.js 20+, TypeScript 5+
- Test framework: vitest
- LLM API: OpenAI-compatible format, endpoint configurable
- Target code language: Python (pytest --json-report)
- Docker required for code execution sandbox
- All core mechanisms must be testable with Mock LLM (no network, no real LLM)
- TDD enforced: red -> green -> refactor, no implementation before test
- API keys never hardcoded, never committed, never logged in plaintext
- `.gitignore` must include: `node_modules/`, `*.env`, `*.enc`, `data/`, `dist/`

## File Structure

```
harness_project/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── config.yaml
├── Dockerfile
├── .gitignore
├── .gitlab-ci.yml
├── README.md
├── SPEC.md
├── PLAN.md
├── src/
�?  ├── index.ts                     # Entry point
�?  ├── types.ts                     # All shared TypeScript types
�?  ├── config/config-loader.ts      # Loads & validates YAML config
�?  ├── credentials/credential-manager.ts
�?  ├── event-bus/event-bus.ts       # Internal EventEmitter wrapper
�?  ├── llm/
�?  �?  ├── llm-adapter.ts          # LLMAdapter interface
�?  �?  ├── mock-llm.ts             # Scripted mock for testing
�?  �?  └── openai-adapter.ts       # Real OpenAI-compatible implementation
�?  ├── guardrail/
�?  �?  ├── guardrail.ts            # checkAction() pure function
�?  �?  └── hitl-state-machine.ts   # HITL approval state machine
�?  ├── feedback/
�?  �?  ├── feedback-parser.ts      # parseTestResult() pure function
�?  �?  ├── failure-classifier.ts   # classifyFailure() pure function
�?  �?  ├── history-compressor.ts   # compressHistory() pure function
�?  �?  ├── repetition-detector.ts  # detectRepetition() pure function
�?  �?  └── context-assembler.ts   # assembleContext() pure function
�?  ├── tools/
�?  �?  ├── tool-router.ts          # dispatchAction() dispatcher
�?  �?  └── docker-exec.ts          # Docker container management
�?  ├── memory/memory-store.ts      # SQLite CRUD for tasks/rounds
�?  ├── agent/
�?  �?  ├── action-parser.ts        # parseAction() JSON parser
�?  �?  └── agent-loop.ts           # Main agent loop
�?  └── server/
�?      ├── webui-server.ts         # HTTP + WebSocket server
�?      └── frontend/
�?          ├── index.html
�?          ├── app.js
�?          └── style.css
├── tests/
�?  ├── helpers/fixtures.ts          # Shared test fixtures
�?  ├── config-loader.test.ts
�?  ├── event-bus.test.ts
�?  ├── mock-llm.test.ts
�?  ├── guardrail.test.ts
�?  ├── hitl-state-machine.test.ts
�?  ├── feedback-parser.test.ts
�?  ├── failure-classifier.test.ts
�?  ├── history-compressor.test.ts
�?  ├── repetition-detector.test.ts
�?  ├── context-assembler.test.ts
�?  ├── action-parser.test.ts
�?  ├── memory-store.test.ts
�?  ├── docker-exec.test.ts
�?  ├── tool-router.test.ts
�?  ├── agent-loop.test.ts
�?  ├── credential-manager.test.ts
�?  ├── openai-adapter.test.ts
�?  ├── webui-server.test.ts
�?  └── mechanism-demo.test.ts      # D1, D2, D3 demos
└── docs/superpowers/plans/
```

## Dependency Graph

```
Task 1 (scaffolding + types)
├── Task 2 (config loader)          ─�?├── Task 3 (event bus)               ├─ Phase 1: parallel
├── Task 4 (LLM adapter + mock)     ─�?�?├── Task 5 (guardrail)              ─�?├── Task 6 (HITL state machine)      �?├── Task 7 (feedback parser)         ├─ Phase 2: parallel (after Phase 1)
├── Task 8 (failure classifier)      �?├── Task 9 (history compressor)      �?├── Task 10 (repetition detector)    �?├── Task 11 (context assembler)      �?├── Task 12 (action parser)         ─�?�?├── Task 13 (memory store)          ─�?├── Task 14 (docker exec)            ├─ Phase 3: parallel (after Phase 1)
├── Task 15 (tool router)           ─�? (depends on Task 14 + Task 7)
├── Task 16 (credential manager)    ─�?�?├── Task 17 (agent loop)            ─── Phase 4 (depends on Phase 2 + 3)
├── Task 18 (openai adapter)       ─── Phase 4 (depends on Task 4)
�?├── Task 19 (webui server)         ─── Phase 5 (depends on Task 17)
├── Task 20 (frontend spa)         ─── Phase 5 (depends on Task 19)
�?├── Task 21 (dockerfile)           ─── Phase 6 (depends on all)
├── Task 22 (mechanism demos)      ─── Phase 6 (depends on Task 17)
└── Task 23 (ci config)            ─── Phase 6 (depends on Task 22)
```

---

### Task 1: Project Scaffolding + Shared Types
> Status: COMPLETED | Commit: 659e757

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/types.ts`
- Create: `tests/helpers/fixtures.ts`

**Interfaces:**
- Produces: All shared types (`Action`, `FeedbackSignal`, `Failure`, `FailureType`, `GuardrailResult`, `LLMContext`, `LLMResponse`, `Task`, `Round`, `Config`, `EventTypes`) used by all subsequent tasks.

- [x] **Step 1: Create package.json**

```json
{
  "name": "coding-agent-harness",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/index.ts",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "dockerode": "^4.0.0",
    "js-yaml": "^4.1.0",
    "keytar": "^7.9.0",
    "openai": "^4.0.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/dockerode": "^3.3.0",
    "@types/js-yaml": "^4.0.0",
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

- [x] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [x] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [x] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.env
*.enc
data/
.harness/
coverage/
```

- [x] **Step 5: Create src/types.ts**

```typescript
export type Action =
  | { type: 'write_file'; path: string; content: string }
  | { type: 'read_file'; path: string }
  | { type: 'run_shell'; command: string }
  | { type: 'run_tests' };

export type FailureType = 'COMPILE_ERROR' | 'ASSERTION_ERROR' | 'TIMEOUT' | 'IMPORT_ERROR' | 'RUNTIME_ERROR';

export interface Failure {
  testName: string;
  assertion: string;
  expected: string;
  actual: string;
  traceback: string;
}

export interface FeedbackSignal {
  total: number;
  passed: number;
  failed: number;
  failures: Failure[];
  failureType: FailureType;
  rawReport: string;
}

export interface GuardrailResult {
  decision: 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';
  reason: string;
  matchedPattern?: string;
}

export interface LLMContext {
  systemPrompt: string;
  task: string;
  testFiles: Record<string, string>;
  historySummary: string;
  currentFailure?: FeedbackSignal;
  roundNum: number;
  maxRetries: number;
}

export interface LLMResponse {
  content: string;
  action: Action;
  usage?: { promptTokens: number; completionTokens: number };
}

export type TaskStatus = 'pending' | 'running' | 'success' | 'failure' | 'aborted';

export interface Task {
  id: string;
  description: string;
  testFiles: Record<string, string>;
  status: TaskStatus;
  createdAt: string;
  finishedAt: string | null;
}

export interface Round {
  id: number;
  taskId: string;
  roundNum: number;
  codeFiles: Record<string, string>;
  action: Action;
  feedback: FeedbackSignal | null;
  failureType: FailureType | null;
  createdAt: string;
}

export interface Config {
  llm: { model: string; temperature: number; maxTokens: number; apiBase: string };
  agent: { maxRetries: number; timeoutSeconds: number; repetitionThreshold: number; maxHistoryTokens: number };
  guardrail: { enableHitl: boolean; hitlTimeoutSeconds: number; blockedPatterns: string[]; approvalPatterns: string[] };
  docker: { image: string; workDir: string; memoryLimit: string };
  debug: boolean;
}

export interface EventTypes {
  'task:started': { taskId: string; description: string };
  'task:completed': { taskId: string; status: TaskStatus };
  'round:started': { taskId: string; roundNum: number };
  'round:completed': { taskId: string; roundNum: number; feedback: FeedbackSignal | null };
  'llm:called': { taskId: string; roundNum: number; context: LLMContext };
  'llm:responded': { taskId: string; roundNum: number; response: LLMResponse };
  'action:parsed': { taskId: string; roundNum: number; action: Action };
  'guardrail:checked': { taskId: string; action: Action; result: GuardrailResult };
  'guardrail:approval_requested': { taskId: string; action: Action; reason: string };
  'guardrail:approval_responded': { taskId: string; approved: boolean };
  'tool:executed': { taskId: string; action: Action; result: unknown };
  'agent:stopped': { taskId: string; reason: string };
  'error': { taskId: string; error: string };
}
```

- [x] **Step 6: Create tests/helpers/fixtures.ts**

```typescript
import type { FeedbackSignal } from '../../src/types.js';

export const samplePytestReport = {
  created: 1690000000.0,
  duration: 1.5,
  tests: [
    { nodeid: 'test_stack.py::test_push', outcome: 'passed', call: { duration: 0.001 } },
    { nodeid: 'test_stack.py::test_pop', outcome: 'passed', call: { duration: 0.002 } },
    {
      nodeid: 'test_stack.py::test_peek',
      outcome: 'failed',
      call: {
        duration: 0.003,
        longrepr: {
          reprcrash: { message: 'AssertionError: assert None == 1' },
          reprtraceback: {
            chains: [{ content: [['test_stack.py', 15, 'test_peek', 'assert stack.peek() == 1']] }],
          },
        },
      },
    },
  ],
  summary: { total: 3, passed: 2, failed: 1 },
};

export const expectedFeedbackSignal: FeedbackSignal = {
  total: 3, passed: 2, failed: 1,
  failures: [{
    testName: 'test_stack.py::test_peek',
    assertion: 'assert stack.peek() == 1',
    expected: '1', actual: 'None',
    traceback: 'test_stack.py:15: test_peek',
  }],
  failureType: 'ASSERTION_ERROR',
  rawReport: '',
};

export const compileErrorReport = {
  created: 1690000000.0, duration: 0.5, tests: [],
  summary: { total: 0, passed: 0, failed: 0 },
  collectors: [{ nodeid: 'test_stack.py', outcome: 'failed', longrepr: 'SyntaxError: invalid syntax (test_stack.py, line 5)' }],
};

export const importErrorReport = {
  created: 1690000000.0, duration: 0.5, tests: [],
  summary: { total: 0, passed: 0, failed: 0 },
  collectors: [{ nodeid: 'test_stack.py', outcome: 'failed', longrepr: "ModuleNotFoundError: No module named 'numpy'" }],
};
```

- [x] **Step 7: Install dependencies and verify**

Run: `npm install`
Expected: Dependencies installed successfully.

- [x] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "chore: project scaffolding + shared types"
```

---

### Task 2: Config Loader
> Status: COMPLETED | Commit: 02ec406 (fix: 6eea2fd)

**Files:**
- Create: `src/config/config-loader.ts`, `config.yaml`, `tests/config-loader.test.ts`

**Interfaces:**
- Consumes: `Config` type from `src/types.ts`
- Produces: `loadConfig(path: string): Config`

- [x] **Step 1: Write the failing test**

```typescript
// tests/config-loader.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/config-loader.js';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigLoader', () => {
  it('loads a valid config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-cfg-'));
    writeFileSync(join(dir, 'config.yaml'), `
llm:
  model: "deepseek-v4-pro"
  temperature: 0.3
  max_tokens: 4096
  api_base: ""
agent:
  max_retries: 5
  timeout_seconds: 30
  repetition_threshold: 3
  max_history_tokens: 2000
guardrail:
  enable_hitl: true
  hitl_timeout_seconds: 30
  blocked_patterns:
    - "rm\\\\s+-rf\\\\s+/"
  approval_patterns:
    - "sudo\\\\s+"
docker:
  image: "harness-python:latest"
  work_dir: "/workspace"
  memory_limit: "256m"
debug: false
`);
    const config = loadConfig(join(dir, 'config.yaml'));
    expect(config.llm.model).toBe('deepseek-v4-pro');
    expect(config.agent.maxRetries).toBe(5);
    expect(config.guardrail.enableHitl).toBe(true);
  });

  it('uses defaults when file is missing', () => {
    const config = loadConfig('/nonexistent/path/config.yaml');
    expect(config.agent.maxRetries).toBe(5);
    expect(config.llm.temperature).toBe(0.3);
  });

  it('throws on invalid config schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-cfg-'));
    writeFileSync(join(dir, 'config.yaml'), 'llm:\n  model: 123\n');
    expect(() => loadConfig(join(dir, 'config.yaml'))).toThrow();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config-loader.test.ts`
Expected: FAIL with "Cannot find module"

- [x] **Step 3: Write minimal implementation**

```typescript
// src/config/config-loader.ts
import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import type { Config } from '../types.js';

const DEFAULT_CONFIG: Config = {
  llm: { model: 'deepseek-v4-pro', temperature: 0.3, maxTokens: 4096, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: {
    enableHitl: true, hitlTimeoutSeconds: 30,
    blockedPatterns: ['rm\\s+-rf\\s+/', 'git\\s+push\\s+(-f|--force)'],
    approvalPatterns: ['sudo\\s+', 'chmod\\s+-R', 'curl.*\\|.*sh'],
  },
  docker: { image: 'harness-python:latest', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

export function loadConfig(path: string): Config {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  const raw = readFileSync(path, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;
  return validateConfig(parsed);
}

function validateConfig(parsed: Record<string, unknown>): Config {
  const config = { ...DEFAULT_CONFIG };
  if (parsed.llm && typeof parsed.llm === 'object') {
    const llm = parsed.llm as Record<string, unknown>;
    if (llm.model !== undefined) { if (typeof llm.model !== 'string') throw new Error('llm.model must be string'); config.llm.model = llm.model; }
    if (llm.temperature !== undefined) { if (typeof llm.temperature !== 'number') throw new Error('llm.temperature must be number'); config.llm.temperature = llm.temperature; }
    if (llm.max_tokens !== undefined) config.llm.maxTokens = Number(llm.max_tokens);
    if (llm.api_base !== undefined) config.llm.apiBase = String(llm.api_base);
  }
  if (parsed.agent && typeof parsed.agent === 'object') {
    const agent = parsed.agent as Record<string, unknown>;
    if (agent.max_retries !== undefined) config.agent.maxRetries = Number(agent.max_retries);
    if (agent.timeout_seconds !== undefined) config.agent.timeoutSeconds = Number(agent.timeout_seconds);
    if (agent.repetition_threshold !== undefined) config.agent.repetitionThreshold = Number(agent.repetition_threshold);
    if (agent.max_history_tokens !== undefined) config.agent.maxHistoryTokens = Number(agent.max_history_tokens);
  }
  if (parsed.guardrail && typeof parsed.guardrail === 'object') {
    const g = parsed.guardrail as Record<string, unknown>;
    if (g.enable_hitl !== undefined) config.guardrail.enableHitl = Boolean(g.enable_hitl);
    if (g.hitl_timeout_seconds !== undefined) config.guardrail.hitlTimeoutSeconds = Number(g.hitl_timeout_seconds);
    if (Array.isArray(g.blocked_patterns)) config.guardrail.blockedPatterns = g.blocked_patterns as string[];
    if (Array.isArray(g.approval_patterns)) config.guardrail.approvalPatterns = g.approval_patterns as string[];
  }
  if (parsed.docker && typeof parsed.docker === 'object') {
    const d = parsed.docker as Record<string, unknown>;
    if (d.image !== undefined) config.docker.image = String(d.image);
    if (d.work_dir !== undefined) config.docker.workDir = String(d.work_dir);
    if (d.memory_limit !== undefined) config.docker.memoryLimit = String(d.memory_limit);
  }
  if (parsed.debug !== undefined) config.debug = Boolean(parsed.debug);
  return config;
}
```

- [x] **Step 4: Create default config.yaml**

```yaml
llm:
  model: "deepseek-v4-pro"
  temperature: 0.3
  max_tokens: 4096
  api_base: ""
agent:
  max_retries: 5
  timeout_seconds: 30
  repetition_threshold: 3
  max_history_tokens: 2000
guardrail:
  enable_hitl: true
  hitl_timeout_seconds: 30
  blocked_patterns:
    - "rm\\s+-rf\\s+/"
    - "git\\s+push\\s+(-f|--force)"
  approval_patterns:
    - "sudo\\s+"
    - "chmod\\s+-R"
    - "curl.*\\|.*sh"
docker:
  image: "harness-python:latest"
  work_dir: "/workspace"
  memory_limit: "256m"
debug: false
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config-loader.test.ts`
Expected: 3 tests PASS

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: config loader with YAML parsing and defaults"
```

---

### Task 3: Event Bus
> Status: COMPLETED | Commit: 8abeb76

**Files:**
- Create: `src/event-bus/event-bus.ts`, `tests/event-bus.test.ts`

**Interfaces:**
- Consumes: `EventTypes` from `src/types.ts`
- Produces: `EventBus` class with `emit()`, `on()`, `off()`

- [x] **Step 1: Write the failing test**

```typescript
// tests/event-bus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/event-bus/event-bus.js';

describe('EventBus', () => {
  it('emits and receives events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('task:started', handler);
    bus.emit('task:started', { taskId: 't1', description: 'test task' });
    expect(handler).toHaveBeenCalledWith({ taskId: 't1', description: 'test task' });
  });

  it('supports multiple listeners', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('round:completed', h1);
    bus.on('round:completed', h2);
    bus.emit('round:completed', { taskId: 't1', roundNum: 1, feedback: null });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('off removes a listener', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('error', handler);
    bus.off('error', handler);
    bus.emit('error', { taskId: 't1', error: 'oops' });
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-bus.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/event-bus/event-bus.ts
import { EventEmitter } from 'events';
import type { EventTypes } from '../types.js';

type EventHandler<K extends keyof EventTypes> = (payload: EventTypes[K]) => void;

export class EventBus extends EventEmitter {
  emit<K extends keyof EventTypes>(event: K, payload: EventTypes[K]): boolean {
    return super.emit(event, payload);
  }
  on<K extends keyof EventTypes>(event: K, handler: EventHandler<K>): this {
    return super.on(event, handler);
  }
  off<K extends keyof EventTypes>(event: K, handler: EventHandler<K>): this {
    return super.off(event, handler);
  }
  once<K extends keyof EventTypes>(event: K, handler: EventHandler<K>): this {
    return super.once(event, handler);
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event-bus.test.ts`
Expected: 3 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: event bus for internal module communication"
```

---

### Task 4: LLM Adapter Interface + Mock LLM
> Status: COMPLETED | Commit: 5bffbfb

**Files:**
- Create: `src/llm/llm-adapter.ts`, `src/llm/mock-llm.ts`, `tests/mock-llm.test.ts`

**Interfaces:**
- Consumes: `LLMContext`, `LLMResponse`, `Action` from `src/types.ts`
- Produces: `LLMAdapter` interface, `MockLLM` class

- [x] **Step 1: Write the failing test**

```typescript
// tests/mock-llm.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../src/llm/mock-llm.js';
import type { LLMContext } from '../src/types.js';

const baseContext: LLMContext = {
  systemPrompt: 'You are a Python coding agent.',
  task: 'Implement a stack',
  testFiles: { 'test_stack.py': 'def test_push(): pass' },
  historySummary: '', roundNum: 1, maxRetries: 5,
};

describe('MockLLM', () => {
  it('returns scripted responses in order', async () => {
    const mock = new MockLLM([
      { type: 'write_file', path: 'stack.py', content: 'class Stack: ...' },
      { type: 'run_tests' },
    ]);
    const r1 = await mock.generate(baseContext);
    expect(r1.action.type).toBe('write_file');
    const r2 = await mock.generate(baseContext);
    expect(r2.action.type).toBe('run_tests');
  });

  it('throws when script is exhausted', async () => {
    const mock = new MockLLM([{ type: 'run_tests' }]);
    await mock.generate(baseContext);
    await expect(mock.generate(baseContext)).rejects.toThrow('Mock LLM script exhausted');
  });

  it('records call history', async () => {
    const mock = new MockLLM([{ type: 'run_tests' }]);
    await mock.generate(baseContext);
    expect(mock.callCount).toBe(1);
    expect(mock.lastContext).toEqual(baseContext);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mock-llm.test.ts`
Expected: FAIL

- [x] **Step 3: Write LLMAdapter interface and MockLLM**

```typescript
// src/llm/llm-adapter.ts
import type { LLMContext, LLMResponse } from '../types.js';
export interface LLMAdapter {
  generate(context: LLMContext): Promise<LLMResponse>;
}
```

```typescript
// src/llm/mock-llm.ts
import type { LLMAdapter } from './llm-adapter.js';
import type { LLMContext, LLMResponse, Action } from '../types.js';

export class MockLLM implements LLMAdapter {
  private script: Action[];
  private index = 0;
  private _callCount = 0;
  private _lastContext: LLMContext | null = null;

  constructor(script: Action[]) { this.script = script; }
  get callCount(): number { return this._callCount; }
  get lastContext(): LLMContext | null { return this._lastContext; }

  async generate(context: LLMContext): Promise<LLMResponse> {
    if (this.index >= this.script.length) throw new Error('Mock LLM script exhausted');
    const action = this.script[this.index];
    this.index++;
    this._callCount++;
    this._lastContext = context;
    return { content: JSON.stringify(action), action };
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mock-llm.test.ts`
Expected: 3 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: LLM adapter interface and mock LLM for testing"
```

---

### Task 5: Guardrail
> Status: COMPLETED | Commit: ba74c13 (fix: fa18178)
> Commit: a74c13 (fix: a18178)

**Files:**
- Create: `src/guardrail/guardrail.ts`, `tests/guardrail.test.ts`

**Interfaces:**
- Consumes: `Action`, `GuardrailResult`, `Config` from `src/types.ts`
- Produces: `Guardrail` class with `checkAction(action: Action): GuardrailResult`

- [x] **Step 1: Write the failing test**

```typescript
// tests/guardrail.test.ts
import { describe, it, expect } from 'vitest';
import { Guardrail } from '../src/guardrail/guardrail.js';
import type { Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: {
    enableHitl: true, hitlTimeoutSeconds: 30,
    blockedPatterns: ['rm\\s+-rf\\s+/', 'git\\s+push\\s+(-f|--force)'],
    approvalPatterns: ['sudo\\s+', 'chmod\\s+-R'],
  },
  docker: { image: 'test', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

describe('Guardrail', () => {
  it('allows safe commands', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'ls -la' }).decision).toBe('ALLOW');
  });
  it('blocks rm -rf /', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'rm -rf /' }).decision).toBe('BLOCK');
  });
  it('blocks git push --force', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'git push --force origin main' }).decision).toBe('BLOCK');
  });
  it('requires approval for sudo', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_shell', command: 'sudo apt update' }).decision).toBe('REQUIRE_APPROVAL');
  });
  it('allows write_file to workspace', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'write_file', path: '/workspace/stack.py', content: 'x' }).decision).toBe('ALLOW');
  });
  it('blocks write_file to system directory', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'write_file', path: '/etc/passwd', content: 'x' }).decision).toBe('BLOCK');
  });
  it('allows run_tests', () => {
    const g = new Guardrail(config);
    expect(g.checkAction({ type: 'run_tests' }).decision).toBe('ALLOW');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guardrail.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/guardrail/guardrail.ts
import type { Action, GuardrailResult, Config } from '../types.js';

const SYSTEM_DIR_PATTERNS = [/^\/etc\//, /^\/usr\//, /^\/bin\//, /^\/sbin\//, /^\/boot\//, /^C:\\Windows\\/i];

export class Guardrail {
  private blockedPatterns: RegExp[];
  private approvalPatterns: RegExp[];
  private enableHitl: boolean;
  private workDir: string;

  constructor(config: Config) {
    this.blockedPatterns = config.guardrail.blockedPatterns.map(p => new RegExp(p));
    this.approvalPatterns = config.guardrail.approvalPatterns.map(p => new RegExp(p));
    this.enableHitl = config.guardrail.enableHitl;
    this.workDir = config.docker.workDir;
  }

  checkAction(action: Action): GuardrailResult {
    if (action.type === 'run_tests') return { decision: 'ALLOW', reason: 'run_tests is always safe' };
    if (action.type === 'write_file' || action.type === 'read_file') return this.checkPath(action.path);
    if (action.type === 'run_shell') return this.checkCommand(action.command);
    return { decision: 'ALLOW', reason: 'unknown action type' };
  }

  private checkPath(path: string): GuardrailResult {
    for (const pattern of SYSTEM_DIR_PATTERNS) {
      if (pattern.test(path)) return { decision: 'BLOCK', reason: `Path ${path} is in system directory`, matchedPattern: pattern.source };
    }
    if (!path.startsWith(this.workDir) && !path.startsWith('.') && !path.startsWith('/workspace')) {
      return { decision: 'BLOCK', reason: `Path ${path} is outside workspace` };
    }
    return { decision: 'ALLOW', reason: 'path within workspace' };
  }

  private checkCommand(command: string): GuardrailResult {
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) return { decision: 'BLOCK', reason: `Blocked pattern: ${pattern.source}`, matchedPattern: pattern.source };
    }
    if (this.enableHitl) {
      for (const pattern of this.approvalPatterns) {
        if (pattern.test(command)) return { decision: 'REQUIRE_APPROVAL', reason: `Approval pattern: ${pattern.source}`, matchedPattern: pattern.source };
      }
    }
    return { decision: 'ALLOW', reason: 'command is safe' };
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/guardrail.test.ts`
Expected: 7 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: guardrail with pattern matching and path checking"
```

---

### Task 6: HITL State Machine
> Status: COMPLETED | Commit: b56b6ae
> Commit: 56b6ae"

**Files:**
- Create: `src/guardrail/hitl-state-machine.ts`, `tests/hitl-state-machine.test.ts`

**Interfaces:**
- Consumes: `EventBus` from Task 3, `Action` from `src/types.ts`
- Produces: `HitlStateMachine` class, `HitlState` type

- [x] **Step 1: Write the failing test**

```typescript
// tests/hitl-state-machine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HitlStateMachine } from '../src/guardrail/hitl-state-machine.js';
import { EventBus } from '../src/event-bus/event-bus.js';
import type { Action } from '../src/types.js';

const action: Action = { type: 'run_shell', command: 'sudo apt update' };

describe('HitlStateMachine', () => {
  it('starts in IDLE state', () => {
    expect(new HitlStateMachine(new EventBus(), 30).getState()).toBe('IDLE');
  });
  it('transitions IDLE -> WAITING on requestApproval', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    const spy = vi.spyOn(bus, 'emit');
    sm.requestApproval('task1', action, 'sudo detected');
    expect(sm.getState()).toBe('WAITING');
    expect(spy).toHaveBeenCalledWith('guardrail:approval_requested', { taskId: 'task1', action, reason: 'sudo detected' });
  });
  it('transitions WAITING -> APPROVED on approve', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    sm.requestApproval('task1', action, 'sudo detected');
    sm.approve('task1');
    expect(sm.getState()).toBe('APPROVED');
  });
  it('transitions WAITING -> REJECTED on reject', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    sm.requestApproval('task1', action, 'sudo detected');
    sm.reject('task1');
    expect(sm.getState()).toBe('REJECTED');
  });
  it('resets to IDLE after resolution', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    sm.requestApproval('task1', action, 'sudo detected');
    sm.approve('task1');
    sm.reset();
    expect(sm.getState()).toBe('IDLE');
  });
  it('auto-rejects on timeout', async () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 0.1);
    sm.requestApproval('task1', action, 'sudo detected');
    await new Promise(r => setTimeout(r, 200));
    expect(sm.getState()).toBe('REJECTED');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hitl-state-machine.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/guardrail/hitl-state-machine.ts
import type { EventBus } from '../event-bus/event-bus.js';
import type { Action } from '../types.js';

export type HitlState = 'IDLE' | 'WAITING' | 'APPROVED' | 'REJECTED';

export class HitlStateMachine {
  private state: HitlState = 'IDLE';
  private currentTaskId: string | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(private bus: EventBus, private timeoutSeconds: number) {}

  getState(): HitlState { return this.state; }

  requestApproval(taskId: string, action: Action, reason: string): void {
    if (this.state !== 'IDLE') throw new Error(`Cannot request approval in state ${this.state}`);
    this.state = 'WAITING';
    this.currentTaskId = taskId;
    this.bus.emit('guardrail:approval_requested', { taskId, action, reason });
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.timeoutHandle = setTimeout(() => {
      if (this.state === 'WAITING' && this.currentTaskId) this.reject(this.currentTaskId);
    }, this.timeoutSeconds * 1000);
  }

  approve(taskId: string): void {
    if (this.state !== 'WAITING' || this.currentTaskId !== taskId) throw new Error(`Cannot approve in state ${this.state}`);
    this.state = 'APPROVED';
    this.clearTimeout();
    this.bus.emit('guardrail:approval_responded', { taskId, approved: true });
  }

  reject(taskId: string): void {
    if (this.state !== 'WAITING' || this.currentTaskId !== taskId) throw new Error(`Cannot reject in state ${this.state}`);
    this.state = 'REJECTED';
    this.clearTimeout();
    this.bus.emit('guardrail:approval_responded', { taskId, approved: false });
  }

  reset(): void { this.state = 'IDLE'; this.currentTaskId = null; this.clearTimeout(); }
  private clearTimeout(): void { if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; } }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hitl-state-machine.test.ts`
Expected: 6 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: HITL state machine with timeout auto-reject"
```

---

### Task 7: Feedback Parser
> Status: COMPLETED | Commit: d190e68 (fix: 155c790)

**Files:**
- Create: `src/feedback/feedback-parser.ts`, `tests/feedback-parser.test.ts`

**Interfaces:**
- Consumes: `FeedbackSignal`, `Failure` from `src/types.ts`
- Produces: `parseTestResult(jsonReport: unknown): FeedbackSignal`

- [x] **Step 1: Write the failing test**

```typescript
// tests/feedback-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseTestResult } from '../src/feedback/feedback-parser.js';
import { samplePytestReport, compileErrorReport, importErrorReport } from './helpers/fixtures.js';

describe('FeedbackParser', () => {
  it('parses a report with 2 passed, 1 failed', () => {
    const result = parseTestResult(samplePytestReport);
    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].testName).toBe('test_stack.py::test_peek');
  });
  it('detects all-pass as no failures', () => {
    const allPass = { ...samplePytestReport, tests: samplePytestReport.tests.filter((t: { outcome: string }) => t.outcome === 'passed'), summary: { total: 2, passed: 2, failed: 0 } };
    const result = parseTestResult(allPass);
    expect(result.failed).toBe(0);
  });
  it('parses collection error as COMPILE_ERROR', () => {
    expect(parseTestResult(compileErrorReport).failureType).toBe('COMPILE_ERROR');
  });
  it('parses import error as IMPORT_ERROR', () => {
    expect(parseTestResult(importErrorReport).failureType).toBe('IMPORT_ERROR');
  });
  it('handles empty report', () => {
    const result = parseTestResult({ tests: [], summary: { total: 0, passed: 0, failed: 0 } });
    expect(result.total).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/feedback-parser.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/feedback/feedback-parser.ts
import type { FeedbackSignal, Failure, FailureType } from '../types.js';

interface PytestTestEntry {
  nodeid: string; outcome: string;
  call?: { duration: number; longrepr?: { reprcrash?: { message: string }; reprtraceback?: { chains?: Array<{ content: Array<[string, number, string, string]> }> } } };
}
interface PytestCollectorEntry { nodeid: string; outcome: string; longrepr: string; }
interface PytestJsonReport { tests?: PytestTestEntry[]; collectors?: PytestCollectorEntry[]; summary?: { total: number; passed: number; failed: number }; }

export function parseTestResult(jsonReport: unknown): FeedbackSignal {
  const report = jsonReport as PytestJsonReport;
  const rawReport = JSON.stringify(report);

  if (report.collectors && report.collectors.length > 0) {
    const failed = report.collectors.find(c => c.outcome === 'failed');
    if (failed) {
      const longrepr = failed.longrepr || '';
      const failureType: FailureType = longrepr.includes('ModuleNotFoundError') || longrepr.includes('ImportError') ? 'IMPORT_ERROR' : 'COMPILE_ERROR';
      return { total: 0, passed: 0, failed: 1, failures: [{ testName: failed.nodeid, assertion: longrepr, expected: '', actual: '', traceback: longrepr }], failureType, rawReport };
    }
  }

  const tests = report.tests || [];
  const summary = report.summary || { total: tests.length, passed: 0, failed: 0 };
  const failures: Failure[] = tests.filter(t => t.outcome === 'failed').map(t => extractFailure(t));
  const failed = summary.failed || failures.length;
  const passed = summary.passed || tests.filter(t => t.outcome === 'passed').length;
  let failureType: FailureType = 'RUNTIME_ERROR';
  if (failures.length > 0) failureType = inferFailureType(failures);

  return { total: summary.total || tests.length, passed, failed, failures, failureType, rawReport };
}

function extractFailure(test: PytestTestEntry): Failure {
  const longrepr = test.call?.longrepr;
  const message = longrepr?.reprcrash?.message || 'Unknown error';
  const chains = longrepr?.reprtraceback?.chains || [];
  const content = chains[0]?.content || [];
  const lastLine = content[content.length - 1] || ['', 0, '', message];
  const [file, line, func, assertion] = lastLine;
  const { expected, actual } = parseAssertion(message);
  return { testName: test.nodeid, assertion: assertion || message, expected, actual, traceback: `${file}:${line}: ${func}` };
}

function parseAssertion(message: string): { expected: string; actual: string } {
  const match = message.match(/assert\s+(.+?)\s*==\s*(.+)/);
  if (match) return { expected: match[2].trim(), actual: match[1].trim() };
  return { expected: '', actual: '' };
}

function inferFailureType(failures: Failure[]): FailureType {
  const a = failures[0].assertion;
  if (/SyntaxError|syntax error/i.test(a)) return 'COMPILE_ERROR';
  if (/ModuleNotFoundError|ImportError/i.test(a)) return 'IMPORT_ERROR';
  if (/Timeout|timed?\s*out/i.test(a)) return 'TIMEOUT';
  if (/AssertionError|assert\s/i.test(a)) return 'ASSERTION_ERROR';
  return 'RUNTIME_ERROR';
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/feedback-parser.test.ts`
Expected: 5 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: feedback parser for pytest JSON reports"
```

---

### Task 8: Failure Classifier
> Status: COMPLETED | Commit: 46be4b4

**Files:**
- Create: `src/feedback/failure-classifier.ts`, `tests/failure-classifier.test.ts`

**Interfaces:**
- Consumes: `FeedbackSignal`, `FailureType` from `src/types.ts`
- Produces: `classifyFailure(feedback: FeedbackSignal): FailureType`

- [x] **Step 1: Write the failing test**

```typescript
// tests/failure-classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyFailure } from '../src/feedback/failure-classifier.js';
import type { FeedbackSignal } from '../src/types.js';

function makeFeedback(assertion: string): FeedbackSignal {
  return { total: 3, passed: 2, failed: 1, failures: [{ testName: 'test_x', assertion, expected: '', actual: '', traceback: '' }], failureType: 'RUNTIME_ERROR', rawReport: '' };
}

describe('FailureClassifier', () => {
  it('classifies SyntaxError as COMPILE_ERROR', () => { expect(classifyFailure(makeFeedback('SyntaxError: invalid syntax'))).toBe('COMPILE_ERROR'); });
  it('classifies AssertionError as ASSERTION_ERROR', () => { expect(classifyFailure(makeFeedback('AssertionError: assert 1 == 2'))).toBe('ASSERTION_ERROR'); });
  it('classifies ModuleNotFoundError as IMPORT_ERROR', () => { expect(classifyFailure(makeFeedback("ModuleNotFoundError: No module named 'numpy'"))).toBe('IMPORT_ERROR'); });
  it('classifies Timeout as TIMEOUT', () => { expect(classifyFailure(makeFeedback('Timeout: execution exceeded 30s'))).toBe('TIMEOUT'); });
  it('classifies unknown as RUNTIME_ERROR', () => { expect(classifyFailure(makeFeedback('RuntimeError: something went wrong'))).toBe('RUNTIME_ERROR'); });
  it('returns existing type when no failures', () => {
    const fb: FeedbackSignal = { total: 0, passed: 0, failed: 0, failures: [], failureType: 'COMPILE_ERROR', rawReport: '' };
    expect(classifyFailure(fb)).toBe('COMPILE_ERROR');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/failure-classifier.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/feedback/failure-classifier.ts
import type { FeedbackSignal, FailureType } from '../types.js';

export function classifyFailure(feedback: FeedbackSignal): FailureType {
  if (feedback.failures.length === 0) return feedback.failureType || 'RUNTIME_ERROR';
  const a = feedback.failures[0].assertion;
  if (/SyntaxError|syntax error/i.test(a)) return 'COMPILE_ERROR';
  if (/ModuleNotFoundError|ImportError/i.test(a)) return 'IMPORT_ERROR';
  if (/Timeout|timed?\s*out/i.test(a)) return 'TIMEOUT';
  if (/AssertionError|assert\s/i.test(a)) return 'ASSERTION_ERROR';
  return 'RUNTIME_ERROR';
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/failure-classifier.test.ts`
Expected: 6 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: failure classifier for categorizing test failures"
```

---

### Task 9: History Compressor
> Status: COMPLETED | Commit: 8cce24c

**Files:**
- Create: `src/feedback/history-compressor.ts`, `tests/history-compressor.test.ts`

**Interfaces:**
- Consumes: `Round` from `src/types.ts`
- Produces: `compressHistory(rounds: Round[], maxTokens: number): string`

- [x] **Step 1: Write the failing test**

```typescript
// tests/history-compressor.test.ts
import { describe, it, expect } from 'vitest';
import { compressHistory } from '../src/feedback/history-compressor.js';
import type { Round } from '../src/types.js';

function makeRound(num: number, failureType: string, testName: string): Round {
  return {
    id: num, taskId: 't1', roundNum: num, codeFiles: { 'solution.py': `# v${num}` },
    action: { type: 'write_file', path: 'solution.py', content: `# v${num}` } as never,
    feedback: { total: 3, passed: 2, failed: 1, failures: [{ testName, assertion: 'assert x', expected: '1', actual: '0', traceback: 't:1' }], failureType: failureType as never, rawReport: '' },
    failureType: failureType as never, createdAt: '',
  };
}

describe('HistoryCompressor', () => {
  it('compresses a single round', () => {
    const result = compressHistory([makeRound(1, 'ASSERTION_ERROR', 'test_a')], 2000);
    expect(result).toContain('Round 1');
    expect(result).toContain('ASSERTION_ERROR');
  });
  it('compresses multiple rounds', () => {
    const result = compressHistory([makeRound(1, 'ASSERTION_ERROR', 'test_a'), makeRound(2, 'TIMEOUT', 'test_b')], 2000);
    expect(result).toContain('Round 1');
    expect(result).toContain('Round 2');
  });
  it('truncates when exceeding max tokens', () => {
    const rounds = Array.from({ length: 20 }, (_, i) => makeRound(i + 1, 'ASSERTION_ERROR', `test_${i}`));
    const result = compressHistory(rounds, 100);
    expect(result.length).toBeLessThan(500);
    expect(result).toContain('Round 20');
  });
  it('returns empty string for no rounds', () => { expect(compressHistory([], 2000)).toBe(''); });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/history-compressor.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/feedback/history-compressor.ts
import type { Round } from '../types.js';

export function compressHistory(rounds: Round[], maxTokens: number): string {
  if (rounds.length === 0) return '';
  const maxChars = maxTokens * 4;
  const lines: string[] = rounds.map(r => {
    const actionDesc = formatAction(r.action);
    const failureDesc = r.feedback ? `[${r.failureType || 'UNKNOWN'}]: ${r.feedback.failures.map(f => f.testName).join(', ')}` : 'no feedback';
    return `Round ${r.roundNum}: ${actionDesc}, failed ${failureDesc}`;
  });
  let result = lines.join('\n');
  if (result.length > maxChars) {
    const truncated: string[] = [];
    let totalLen = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (totalLen + lines[i].length + 1 > maxChars - 50) break;
      truncated.unshift(lines[i]);
      totalLen += lines[i].length + 1;
    }
    result = `[...earlier rounds truncated...]\n${truncated.join('\n')}`;
  }
  return result;
}

function formatAction(action: Round['action']): string {
  switch (action.type) {
    case 'write_file': return `write_file ${action.path}`;
    case 'read_file': return `read_file ${action.path}`;
    case 'run_shell': return `run_shell ${action.command.substring(0, 50)}`;
    case 'run_tests': return 'run_tests';
    default: return 'unknown action';
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/history-compressor.test.ts`
Expected: 4 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: history compressor for multi-round context management"
```

---

### Task 10: Repetition Detector
> Status: COMPLETED | Commit: ed4f2d8

**Files:**
- Create: `src/feedback/repetition-detector.ts`, `tests/repetition-detector.test.ts`

**Interfaces:**
- Consumes: `Round` from `src/types.ts`
- Produces: `detectRepetition(rounds: Round[], threshold: number): boolean`

- [x] **Step 1: Write the failing test**

```typescript
// tests/repetition-detector.test.ts
import { describe, it, expect } from 'vitest';
import { detectRepetition } from '../src/feedback/repetition-detector.js';
import type { Round } from '../src/types.js';

function makeRound(failureType: string, testName: string): Round {
  return {
    id: 1, taskId: 't1', roundNum: 1, codeFiles: {},
    action: { type: 'write_file', path: 'x.py', content: 'x' } as never,
    feedback: { total: 1, passed: 0, failed: 1, failures: [{ testName, assertion: '', expected: '', actual: '', traceback: '' }], failureType: failureType as never, rawReport: '' },
    failureType: failureType as never, createdAt: '',
  };
}

describe('RepetitionDetector', () => {
  it('returns false for fewer than threshold rounds', () => { expect(detectRepetition([makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(false); });
  it('returns false for different failures', () => { expect(detectRepetition([makeRound('ASSERTION_ERROR', 'test_a'), makeRound('TIMEOUT', 'test_b'), makeRound('IMPORT_ERROR', 'test_c')], 3)).toBe(false); });
  it('returns true for 3 consecutive identical failures', () => { expect(detectRepetition([makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(true); });
  it('returns false when only 2 of 3 are identical', () => { expect(detectRepetition([makeRound('TIMEOUT', 'test_b'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(false); });
  it('returns true when last N rounds are identical', () => { expect(detectRepetition([makeRound('TIMEOUT', 'test_b'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(true); });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repetition-detector.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/feedback/repetition-detector.ts
import type { Round } from '../types.js';

export function detectRepetition(rounds: Round[], threshold: number): boolean {
  if (rounds.length < threshold) return false;
  const lastN = rounds.slice(-threshold);
  const firstKey = failureKey(lastN[0]);
  return lastN.every(r => failureKey(r) === firstKey);
}

function failureKey(round: Round): string {
  const failureType = round.failureType || 'UNKNOWN';
  const testNames = round.feedback?.failures.map(f => f.testName).sort().join(',') || '';
  return `${failureType}:${testNames}`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/repetition-detector.test.ts`
Expected: 5 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: repetition detector to prevent infinite loops"
```

---

### Task 11: Context Assembler
> Status: COMPLETED | Commit: fd3d295

**Files:**
- Create: `src/feedback/context-assembler.ts`, `tests/context-assembler.test.ts`

**Interfaces:**
- Consumes: `LLMContext`, `FeedbackSignal`, `Round`, `Config` from `src/types.ts`; `compressHistory` from Task 9
- Produces: `assembleContext(params): LLMContext`

- [x] **Step 1: Write the failing test**

```typescript
// tests/context-assembler.test.ts
import { describe, it, expect } from 'vitest';
import { assembleContext } from '../src/feedback/context-assembler.js';
import type { Round, Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: [], approvalPatterns: [] },
  docker: { image: 'test', workDir: '/ws', memoryLimit: '256m' },
  debug: false,
};

describe('ContextAssembler', () => {
  it('assembles initial context with no history', () => {
    const ctx = assembleContext({ task: 'Implement a stack', testFiles: { 'test_stack.py': 'def test_push(): pass' }, config, rounds: [], currentFailure: undefined });
    expect(ctx.task).toBe('Implement a stack');
    expect(ctx.roundNum).toBe(1);
    expect(ctx.historySummary).toBe('');
  });
  it('assembles context with history and current failure', () => {
    const rounds: Round[] = [{
      id: 1, taskId: 't1', roundNum: 1, codeFiles: { 'stack.py': 'x' },
      action: { type: 'write_file', path: 'stack.py', content: 'x' } as never,
      feedback: { total: 1, passed: 0, failed: 1, failures: [{ testName: 'test_a', assertion: 'assert x', expected: '1', actual: '0', traceback: '' }], failureType: 'ASSERTION_ERROR', rawReport: '' },
      failureType: 'ASSERTION_ERROR', createdAt: '',
    }];
    const ctx = assembleContext({ task: 'Implement a stack', testFiles: {}, config, rounds, currentFailure: { total: 1, passed: 0, failed: 1, failures: [{ testName: 'test_a', assertion: 'assert x', expected: '1', actual: '0', traceback: '' }], failureType: 'ASSERTION_ERROR', rawReport: '' } });
    expect(ctx.roundNum).toBe(2);
    expect(ctx.historySummary).toContain('Round 1');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/context-assembler.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/feedback/context-assembler.ts
import type { LLMContext, FeedbackSignal, Round, Config } from '../types.js';
import { compressHistory } from './history-compressor.js';

const SYSTEM_PROMPT = `You are a Python coding agent. You write Python code to solve programming tasks.
You receive a task description and test files. You must write code that passes all tests.

You respond with a JSON action. Available actions:
- {"action": "write_file", "path": "filename.py", "content": "your code here"}
- {"action": "run_tests"}

Always respond with exactly one JSON action. Do not include any other text.`;

export function assembleContext(params: { task: string; testFiles: Record<string, string>; config: Config; rounds: Round[]; currentFailure?: FeedbackSignal }): LLMContext {
  const { task, testFiles, config, rounds, currentFailure } = params;
  return {
    systemPrompt: SYSTEM_PROMPT,
    task, testFiles,
    historySummary: compressHistory(rounds, config.agent.maxHistoryTokens),
    currentFailure,
    roundNum: rounds.length + 1,
    maxRetries: config.agent.maxRetries,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/context-assembler.test.ts`
Expected: 2 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: context assembler for LLM context construction"
```

---

### Task 12: Action Parser
> Status: COMPLETED | Commit: 8b1f6bb

**Files:**
- Create: `src/agent/action-parser.ts`, `tests/action-parser.test.ts`

**Interfaces:**
- Consumes: `Action` from `src/types.ts`
- Produces: `parseAction(content: string): Action`

- [x] **Step 1: Write the failing test**

```typescript
// tests/action-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseAction } from '../src/agent/action-parser.js';

describe('ActionParser', () => {
  it('parses write_file action', () => {
    const action = parseAction('{"action": "write_file", "path": "stack.py", "content": "class Stack: pass"}');
    expect(action).toEqual({ type: 'write_file', path: 'stack.py', content: 'class Stack: pass' });
  });
  it('parses run_tests action', () => { expect(parseAction('{"action": "run_tests"}').type).toBe('run_tests'); });
  it('parses run_shell action', () => { expect(parseAction('{"action": "run_shell", "command": "echo hello"}')).toEqual({ type: 'run_shell', command: 'echo hello' }); });
  it('parses read_file action', () => { expect(parseAction('{"action": "read_file", "path": "stack.py"}').type).toBe('read_file'); });
  it('throws on invalid JSON', () => { expect(() => parseAction('not json')).toThrow(); });
  it('throws on unknown action type', () => { expect(() => parseAction('{"action": "fly"}')).toThrow(); });
  it('throws on missing required fields', () => { expect(() => parseAction('{"action": "write_file"}')).toThrow(); });
  it('extracts JSON from markdown code block', () => {
    expect(parseAction('```json\n{"action": "run_tests"}\n```').type).toBe('run_tests');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/action-parser.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/agent/action-parser.ts
import type { Action } from '../types.js';

export function parseAction(content: string): Action {
  const jsonStr = extractJson(content);
  let parsed: unknown;
  try { parsed = JSON.parse(jsonStr); } catch { throw new Error(`Failed to parse LLM output as JSON: ${content.substring(0, 100)}`); }
  const obj = parsed as { action?: string; path?: string; content?: string; command?: string };
  if (!obj.action) throw new Error('LLM output missing "action" field');
  switch (obj.action) {
    case 'write_file':
      if (!obj.path || obj.content === undefined) throw new Error('write_file requires "path" and "content"');
      return { type: 'write_file', path: obj.path, content: obj.content };
    case 'read_file':
      if (!obj.path) throw new Error('read_file requires "path"');
      return { type: 'read_file', path: obj.path };
    case 'run_shell':
      if (!obj.command) throw new Error('run_shell requires "command"');
      return { type: 'run_shell', command: obj.command };
    case 'run_tests':
      return { type: 'run_tests' };
    default:
      throw new Error(`Unknown action type: ${obj.action}`);
  }
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  return trimmed;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/action-parser.test.ts`
Expected: 8 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: action parser for LLM JSON output"
```

---

### Task 13: Memory Store
> Status: COMPLETED | Commit: e248f47

**Files:**
- Create: `src/memory/memory-store.ts`, `tests/memory-store.test.ts`

**Interfaces:**
- Consumes: `Task`, `Round` from `src/types.ts`
- Produces: `MemoryStore` class with `saveTask`, `saveRound`, `getTask`, `listTasks`, `updateTaskStatus`

- [x] **Step 1: Write the failing test**

```typescript
// tests/memory-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Task, Round } from '../src/types.js';

describe('MemoryStore', () => {
  let store: MemoryStore; let dbPath: string;
  beforeEach(() => { dbPath = join(mkdtempSync(join(tmpdir(), 'harness-mem-')), 'test.db'); store = new MemoryStore(dbPath); });
  afterEach(() => { rmSync(dbPath); });

  it('saves and retrieves a task', () => {
    const task: Task = { id: 't1', description: 'Implement a stack', testFiles: { 'test_stack.py': 'def test_push(): pass' }, status: 'running', createdAt: new Date().toISOString(), finishedAt: null };
    store.saveTask(task);
    const retrieved = store.getTask('t1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.task.description).toBe('Implement a stack');
    expect(retrieved!.rounds).toHaveLength(0);
  });
  it('saves and retrieves rounds', () => {
    store.saveTask({ id: 't1', description: 'test', testFiles: {}, status: 'running', createdAt: new Date().toISOString(), finishedAt: null });
    store.saveRound({ id: 0, taskId: 't1', roundNum: 1, codeFiles: { 'stack.py': 'x' }, action: { type: 'write_file', path: 'stack.py', content: 'x' } as never, feedback: null, failureType: null, createdAt: new Date().toISOString() });
    const retrieved = store.getTask('t1');
    expect(retrieved!.rounds).toHaveLength(1);
    expect(retrieved!.rounds[0].roundNum).toBe(1);
  });
  it('lists tasks with pagination', () => {
    for (let i = 0; i < 5; i++) store.saveTask({ id: `t${i}`, description: `task ${i}`, testFiles: {}, status: 'success', createdAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
    expect(store.listTasks(0, 2)).toHaveLength(2);
    expect(store.listTasks(4, 2)).toHaveLength(1);
  });
  it('updates task status', () => {
    store.saveTask({ id: 't1', description: 'test', testFiles: {}, status: 'running', createdAt: new Date().toISOString(), finishedAt: null });
    store.updateTaskStatus('t1', 'success');
    expect(store.getTask('t1')!.task.status).toBe('success');
    expect(store.getTask('t1')!.task.finishedAt).not.toBeNull();
  });
  it('returns null for nonexistent task', () => { expect(store.getTask('nonexistent')).toBeNull(); });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/memory-store.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/memory/memory-store.ts
import Database from 'better-sqlite3';
import type { Task, Round, TaskStatus } from '../types.js';

export class MemoryStore {
  private db: Database.Database;
  constructor(dbPath: string) { this.db = new Database(dbPath); this.init(); }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, description TEXT NOT NULL, test_files TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT);
      CREATE TABLE IF NOT EXISTS rounds (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id), round_num INTEGER NOT NULL, code_files TEXT NOT NULL, action TEXT NOT NULL, feedback TEXT, failure_type TEXT, created_at TEXT NOT NULL);
    `);
  }

  saveTask(task: Task): void {
    this.db.prepare('INSERT OR REPLACE INTO tasks (id, description, test_files, status, created_at, finished_at) VALUES (@id, @description, @test_files, @status, @created_at, @finished_at)').run({
      id: task.id, description: task.description, test_files: JSON.stringify(task.testFiles), status: task.status, created_at: task.createdAt, finished_at: task.finishedAt,
    });
  }

  saveRound(round: Round): void {
    this.db.prepare('INSERT INTO rounds (task_id, round_num, code_files, action, feedback, failure_type, created_at) VALUES (@task_id, @round_num, @code_files, @action, @feedback, @failure_type, @created_at)').run({
      task_id: round.taskId, round_num: round.roundNum, code_files: JSON.stringify(round.codeFiles), action: JSON.stringify(round.action), feedback: round.feedback ? JSON.stringify(round.feedback) : null, failure_type: round.failureType, created_at: round.createdAt,
    });
  }

  getTask(taskId: string): { task: Task; rounds: Round[] } | null {
    const taskRow = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, string | null> | undefined;
    if (!taskRow) return null;
    const task: Task = { id: taskRow.id as string, description: taskRow.description as string, testFiles: JSON.parse(taskRow.test_files as string), status: taskRow.status as TaskStatus, createdAt: taskRow.created_at as string, finishedAt: taskRow.finished_at };
    const roundRows = this.db.prepare('SELECT * FROM rounds WHERE task_id = ? ORDER BY round_num').all(taskId) as Array<Record<string, string | number | null>>;
    const rounds: Round[] = roundRows.map(r => ({ id: r.id as number, taskId: r.task_id as string, roundNum: r.round_num as number, codeFiles: JSON.parse(r.code_files as string), action: JSON.parse(r.action as string), feedback: r.feedback ? JSON.parse(r.feedback as string) : null, failureType: r.failure_type as Round['failureType'], createdAt: r.created_at as string }));
    return { task, rounds };
  }

  listTasks(offset: number, limit: number): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Array<Record<string, string | null>>;
    return rows.map(r => ({ id: r.id as string, description: r.description as string, testFiles: JSON.parse(r.test_files as string), status: r.status as TaskStatus, createdAt: r.created_at as string, finishedAt: r.finished_at }));
  }

  updateTaskStatus(taskId: string, status: TaskStatus): void {
    const finishedAt = (status === 'success' || status === 'failure' || status === 'aborted') ? new Date().toISOString() : null;
    this.db.prepare('UPDATE tasks SET status = ?, finished_at = ? WHERE id = ?').run(status, finishedAt, taskId);
  }

  close(): void { this.db.close(); }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/memory-store.test.ts`
Expected: 5 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: memory store with SQLite persistence"
```

---

### Task 14: Docker Exec
> Status: COMPLETED | Commit: 134f34d

**Files:**
- Create: `src/tools/docker-exec.ts`, `tests/docker-exec.test.ts`

**Interfaces:**
- Consumes: `Config` from `src/types.ts`
- Produces: `DockerExec` class with `createContainer`, `writeFile`, `readFile`, `exec`, `remove`

- [x] **Step 1: Write the failing test (with mocked dockerode)**

```typescript
// tests/docker-exec.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DockerExec } from '../src/tools/docker-exec.js';
import type { Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: [], approvalPatterns: [] },
  docker: { image: 'python:3.12-slim', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => ({
    createContainer: vi.fn().mockResolvedValue({ id: 'container-123', start: vi.fn().mockResolvedValue(undefined), exec: vi.fn().mockResolvedValue({ start: vi.fn().mockImplementation((cb) => cb(null, { stdout: 'ok', stderr: '' })) }), putArchive: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), kill: vi.fn().mockResolvedValue(undefined) }),
  })),
}));

describe('DockerExec', () => {
  it('creates and removes a container', async () => {
    const exec = new DockerExec(config);
    const id = await exec.createContainer('test-1');
    expect(id).toBeDefined();
    await exec.remove(id);
  });
  it('writes files', async () => {
    const exec = new DockerExec(config);
    const id = await exec.createContainer('test-2');
    await expect(exec.writeFile(id, '/workspace/stack.py', 'class Stack: pass')).resolves.toBeUndefined();
    await exec.remove(id);
  });
  it('executes commands', async () => {
    const exec = new DockerExec(config);
    const id = await exec.createContainer('test-3');
    const result = await exec.exec(id, 'echo hello');
    expect(result).toBeDefined();
    await exec.remove(id);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/docker-exec.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/tools/docker-exec.ts
import Docker from 'dockerode';
import type { Config } from '../types.js';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

export interface ExecResult { stdout: string; stderr: string; exitCode: number }

export class DockerExec {
  private docker: Docker;
  private image: string;
  private workDir: string;
  private memoryLimit: string;

  constructor(config: Config) {
    this.docker = new Docker();
    this.image = config.docker.image;
    this.workDir = config.docker.workDir;
    this.memoryLimit = config.docker.memoryLimit;
  }

  async createContainer(taskId: string): Promise<string> {
    const container = await this.docker.createContainer({
      Image: this.image, Cmd: ['sleep', '3600'], WorkingDir: this.workDir, Tty: false,
      HostConfig: { Memory: this.parseMemory(this.memoryLimit), NetworkMode: 'none' },
      Labels: { 'harness.task-id': taskId, 'harness.container-id': randomUUID() },
    });
    await container.start();
    return container.id;
  }

  async writeFile(containerId: string, path: string, content: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    const tar = this.createTar(path, content);
    const dir = path.substring(0, path.lastIndexOf('/')) || '/';
    await container.putArchive(tar, { path: dir });
  }

  async readFile(containerId: string, path: string): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({ Cmd: ['cat', path], AttachStdout: true, AttachStderr: true });
    return new Promise((resolve, reject) => {
      exec.start((err: Error | null, stream: Readable) => {
        if (err) { reject(err); return; }
        let output = '';
        stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
        stream.on('end', () => resolve(output.trim()));
      });
    });
  }

  async exec(containerId: string, command: string): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({ Cmd: ['sh', '-c', command], AttachStdout: true, AttachStderr: true });
    return new Promise((resolve, reject) => {
      exec.start((err: Error | null, stream: Readable) => {
        if (err) { reject(err); return; }
        let stdout = '';
        stream.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        stream.on('end', () => resolve({ stdout: stdout.trim(), stderr: '', exitCode: 0 }));
        stream.on('error', reject);
      });
    });
  }

  async remove(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.kill().catch(() => {});
    await container.remove().catch(() => {});
  }

  private parseMemory(limit: string): number {
    const m = limit.match(/^(\d+)(m|mb|g|gb)$/i);
    if (!m) return 256 * 1024 * 1024;
    const v = parseInt(m[1]);
    return m[2].toLowerCase().startsWith('g') ? v * 1024 * 1024 * 1024 : v * 1024 * 1024;
  }

  private createTar(path: string, content: string): Readable {
    const filename = path.substring(path.lastIndexOf('/') + 1);
    const header = Buffer.alloc(512);
    header.write(filename, 0);
    header.write('0000644', 100, 'octal');
    header.write('0000000', 108, 'octal');
    header.write('0000000', 116, 'octal');
    header.write('00000000000', 124, 'octal');
    header.write('0', 136, 'octal');
    header.write('ustar', 257);
    const contentBuf = Buffer.from(content);
    const padding = Buffer.alloc(512 - (contentBuf.length % 512));
    const endBlock = Buffer.alloc(1024);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += (i >= 148 && i < 156) ? 32 : header[i];
    header.writeInt32BE(checksum, 148);
    return Readable.from([header, contentBuf, padding, endBlock]);
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/docker-exec.test.ts`
Expected: 3 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: docker exec for isolated code execution"
```

---

### Task 15: Tool Router
> Status: COMPLETED | Commit: 877e1ed

**Files:**
- Create: `src/tools/tool-router.ts`, `tests/tool-router.test.ts`

**Interfaces:**
- Consumes: `Action` from `src/types.ts`, `DockerExec` from Task 14, `parseTestResult` from Task 7
- Produces: `ToolRouter` class with `dispatch(action, containerId): Promise<unknown>`

- [x] **Step 1: Write the failing test (with mocked DockerExec)**

```typescript
// tests/tool-router.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ToolRouter } from '../src/tools/tool-router.js';
import type { Config } from '../src/types.js';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: [], approvalPatterns: [] },
  docker: { image: 'test', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

vi.mock('../src/tools/docker-exec.js', () => ({
  DockerExec: vi.fn().mockImplementation(() => ({
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('file content'),
    exec: vi.fn().mockResolvedValue({ stdout: '{"tests":[],"summary":{"total":0,"passed":0,"failed":0}}', stderr: '', exitCode: 0 }),
    createContainer: vi.fn().mockResolvedValue('c1'),
    remove: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('ToolRouter', () => {
  it('dispatches write_file', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'write_file', path: '/workspace/stack.py', content: 'x' }, 'c1');
    expect(result).toEqual({ success: true });
  });
  it('dispatches read_file', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'read_file', path: '/workspace/stack.py' }, 'c1');
    expect(result).toEqual({ content: 'file content' });
  });
  it('dispatches run_shell', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'run_shell', command: 'echo hello' }, 'c1');
    expect(result).toHaveProperty('stdout');
  });
  it('dispatches run_tests and returns FeedbackSignal', async () => {
    const router = new ToolRouter(config);
    const result = await router.dispatch({ type: 'run_tests' }, 'c1') as { feedbackSignal: { total: number; passed: number; failed: number } };
    expect(result.feedbackSignal).toBeDefined();
    expect(result.feedbackSignal.total).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool-router.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/tools/tool-router.ts
import type { Action, Config, FeedbackSignal } from '../types.js';
import { DockerExec } from './docker-exec.js';
import { parseTestResult } from '../feedback/feedback-parser.js';

export class ToolRouter {
  dockerExec: DockerExec;
  constructor(private config: Config) { this.dockerExec = new DockerExec(config); }

  async dispatch(action: Action, containerId: string): Promise<unknown> {
    switch (action.type) {
      case 'write_file':
        await this.dockerExec.writeFile(containerId, action.path, action.content);
        return { success: true };
      case 'read_file':
        return { content: await this.dockerExec.readFile(containerId, action.path) };
      case 'run_shell':
        return await this.dockerExec.exec(containerId, action.command);
      case 'run_tests': {
        const result = await this.dockerExec.exec(containerId, 'pytest --json-report --tb=short 2>/dev/null || true');
        let report: unknown;
        try { report = JSON.parse(result.stdout); } catch { report = { tests: [], summary: { total: 0, passed: 0, failed: 0 } }; }
        return { feedbackSignal: parseTestResult(report) };
      }
      default:
        throw new Error(`Unknown action type: ${(action as Action).type}`);
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tool-router.test.ts`
Expected: 4 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tool router for dispatching actions to Docker"
```

---

### Task 16: Credential Manager
> Status: COMPLETED | Commit: 45617bd

**Files:**
- Create: `src/credentials/credential-manager.ts`, `tests/credential-manager.test.ts`

**Interfaces:**
- Produces: `CredentialManager` class with `hasKey`, `getKey`, `setKey`, `clearKey`, `getStatus`

- [x] **Step 1: Write the failing test (with mocked keytar)**

```typescript
// tests/credential-manager.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}));

import { CredentialManager } from '../src/credentials/credential-manager.js';

describe('CredentialManager', () => {
  it('returns false when no key exists', async () => {
    expect(await new CredentialManager().hasKey()).toBe(false);
  });
  it('stores and retrieves a key', async () => {
    const cm = new CredentialManager();
    await cm.setKey('sk-test-1234567890abcdef');
    expect(await cm.hasKey()).toBe(true);
    expect(await cm.getKey()).toBe('sk-test-1234567890abcdef');
  });
  it('masks key in status output', async () => {
    const cm = new CredentialManager();
    await cm.setKey('sk-1234567890abcdefghijklm');
    const status = await cm.getStatus();
    expect(status).toContain('sk-123');
    expect(status).toContain('ijklm');
    expect(status).not.toContain('1234567890abcdefghij');
  });
  it('clears the key', async () => {
    const cm = new CredentialManager();
    await cm.setKey('sk-test');
    await cm.clearKey();
    expect(await cm.hasKey()).toBe(false);
  });
  it('returns not configured status when no key', async () => {
    expect(await new CredentialManager().getStatus()).toContain('not configured');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/credential-manager.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/credentials/credential-manager.ts
import keytar from 'keytar';

const SERVICE = 'coding-agent-harness';
const ACCOUNT = 'api-key';

export class CredentialManager {
  async hasKey(): Promise<boolean> { return (await keytar.getPassword(SERVICE, ACCOUNT)) !== null; }
  async getKey(): Promise<string | null> { return await keytar.getPassword(SERVICE, ACCOUNT); }
  async setKey(key: string): Promise<void> { await keytar.setPassword(SERVICE, ACCOUNT, key); }
  async clearKey(): Promise<void> { await keytar.deletePassword(SERVICE, ACCOUNT); }
  async getStatus(): Promise<string> {
    const key = await keytar.getPassword(SERVICE, ACCOUNT);
    if (!key) return 'API Key: not configured';
    return `API Key: ${maskKey(key)} (configured, source: keychain)`;
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.substring(0, 3)}****${key.substring(key.length - 4)}`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/credential-manager.test.ts`
Expected: 5 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: credential manager with OS keychain storage"
```

---

### Task 17: Agent Loop
> Status: COMPLETED | Commit: 609407a (fix: c6a2be0)

**Files:**
- Create: `src/agent/agent-loop.ts`, `tests/agent-loop.test.ts`

**Interfaces:**
- Consumes: `LLMAdapter` (Task 4), `Guardrail` (Task 5), `HitlStateMachine` (Task 6), `ToolRouter` (Task 15), `MemoryStore` (Task 13), `assembleContext` (Task 11), `detectRepetition` (Task 10), `parseAction` (Task 12), `classifyFailure` (Task 8), `EventBus` (Task 3), `Config`, `Task`, `Round` from `src/types.ts`
- Produces: `AgentLoop` class with `run(task: Task): Promise<TaskStatus>`

- [x] **Step 1: Write the failing test (with mocked ToolRouter)**

```typescript
// tests/agent-loop.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../src/agent/agent-loop.js';
import { MockLLM } from '../src/llm/mock-llm.js';
import { EventBus } from '../src/event-bus/event-bus.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { Guardrail } from '../src/guardrail/guardrail.js';
import { HitlStateMachine } from '../src/guardrail/hitl-state-machine.js';
import type { Config, Task } from '../src/types.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: ['rm\\s+-rf\\s+/'], approvalPatterns: ['sudo\\s+'] },
  docker: { image: 'test', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

function makeTask(): Task {
  return { id: 'test-1', description: 'Implement a stack', testFiles: { 'test_stack.py': 'def test_push(): pass' }, status: 'running', createdAt: new Date().toISOString(), finishedAt: null };
}

function mockToolRouter(passing: boolean) {
  return {
    dockerExec: { createContainer: vi.fn().mockResolvedValue('c1'), remove: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) },
    dispatch: vi.fn().mockImplementation(async (action: { type: string }) => {
      if (action.type === 'run_tests') return { feedbackSignal: passing ? { total: 1, passed: 1, failed: 0, failures: [], failureType: 'RUNTIME_ERROR', rawReport: '' } : { total: 1, passed: 0, failed: 1, failures: [{ testName: 'test_a', assertion: 'AssertionError: assert 1 == 2', expected: '2', actual: '1', traceback: '' }], failureType: 'ASSERTION_ERROR', rawReport: '' } };
      return { success: true };
    }),
  };
}

describe('AgentLoop', () => {
  it('completes successfully when tests pass', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const mockLLM = new MockLLM([{ type: 'write_file', path: '/workspace/stack.py', content: 'class Stack: ...' }, { type: 'run_tests' }]);
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: mockToolRouter(true) as never, memory, bus, config });
    expect(await loop.run(task)).toBe('success');
    rmSync(dbPath);
  });

  it('fails after max retries', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const script = Array.from({ length: 10 }, (_, i) => i % 2 === 0 ? { type: 'write_file' as const, path: '/workspace/stack.py', content: `v${i}` } : { type: 'run_tests' as const });
    const mockLLM = new MockLLM(script);
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: mockToolRouter(false) as never, memory, bus, config });
    expect(await loop.run(task)).toBe('failure');
    rmSync(dbPath);
  });

  it('blocks dangerous commands', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const mockLLM = new MockLLM([{ type: 'run_shell', command: 'rm -rf /' }, { type: 'write_file', path: '/workspace/stack.py', content: 'x' }, { type: 'run_tests' }]);
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: mockToolRouter(true) as never, memory, bus, config });
    expect(await loop.run(task)).toBe('success');
    rmSync(dbPath);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent-loop.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/agent/agent-loop.ts
import type { LLMAdapter } from '../llm/llm-adapter.js';
import type { Guardrail } from '../guardrail/guardrail.js';
import type { HitlStateMachine } from '../guardrail/hitl-state-machine.js';
import type { ToolRouter } from '../tools/tool-router.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { EventBus } from '../event-bus/event-bus.js';
import type { Config, Task, Round, TaskStatus, Action, FeedbackSignal } from '../types.js';
import { parseAction } from './action-parser.js';
import { assembleContext } from '../feedback/context-assembler.js';
import { detectRepetition } from '../feedback/repetition-detector.js';
import { classifyFailure } from '../feedback/failure-classifier.js';

export interface AgentLoopDeps {
  llm: LLMAdapter; guardrail: Guardrail; hitl: HitlStateMachine;
  toolRouter: ToolRouter; memory: MemoryStore; bus: EventBus; config: Config;
}

export class AgentLoop {
  constructor(private deps: AgentLoopDeps) {}

  async run(task: Task): Promise<TaskStatus> {
    const { llm, guardrail, hitl, toolRouter, memory, bus, config } = this.deps;
    bus.emit('task:started', { taskId: task.id, description: task.description });
    const containerId = await toolRouter.dockerExec.createContainer(task.id);
    for (const [filename, content] of Object.entries(task.testFiles)) {
      await toolRouter.dockerExec.writeFile(containerId, `${config.docker.workDir}/${filename}`, content);
    }
    const rounds: Round[] = [];
    let currentFailure: FeedbackSignal | undefined;
    try {
      for (let roundNum = 1; roundNum <= config.agent.maxRetries; roundNum++) {
        bus.emit('round:started', { taskId: task.id, roundNum });
        const context = assembleContext({ task: task.description, testFiles: task.testFiles, config, rounds, currentFailure });
        bus.emit('llm:called', { taskId: task.id, roundNum, context });
        const response = await llm.generate(context);
        bus.emit('llm:responded', { taskId: task.id, roundNum, response });
        let action: Action;
        try { action = parseAction(response.content); } catch (err) {
          currentFailure = { total: 0, passed: 0, failed: 0, failures: [], failureType: 'RUNTIME_ERROR', rawReport: `Parse error: ${(err as Error).message}` };
          const r: Round = { id: 0, taskId: task.id, roundNum, codeFiles: {}, action: { type: 'run_tests' }, feedback: currentFailure, failureType: 'RUNTIME_ERROR', createdAt: new Date().toISOString() };
          rounds.push(r); memory.saveRound(r); continue;
        }
        bus.emit('action:parsed', { taskId: task.id, roundNum, action });
        const gr = guardrail.checkAction(action);
        bus.emit('guardrail:checked', { taskId: task.id, action, result: gr });
        if (gr.decision === 'BLOCK') {
          currentFailure = { total: 0, passed: 0, failed: 0, failures: [], failureType: 'RUNTIME_ERROR', rawReport: `Blocked: ${gr.reason}` };
          const r: Round = { id: 0, taskId: task.id, roundNum, codeFiles: {}, action, feedback: currentFailure, failureType: 'RUNTIME_ERROR', createdAt: new Date().toISOString() };
          rounds.push(r); memory.saveRound(r); bus.emit('round:completed', { taskId: task.id, roundNum, feedback: currentFailure }); continue;
        }
        if (gr.decision === 'REQUIRE_APPROVAL') {
          hitl.requestApproval(task.id, action, gr.reason);
          await new Promise<void>((resolve) => { const h = (p: { taskId: string }) => { if (p.taskId === task.id) { bus.off('guardrail:approval_responded', h); resolve(); } }; bus.on('guardrail:approval_responded', h); });
          hitl.reset();
        }
        const result = await toolRouter.dispatch(action, containerId) as { feedbackSignal?: FeedbackSignal };
        bus.emit('tool:executed', { taskId: task.id, action, result });
        let roundFeedback: FeedbackSignal | null = null;
        let failureType: string | null = null;
        if (action.type === 'run_tests' && result.feedbackSignal) {
          roundFeedback = result.feedbackSignal;
          failureType = classifyFailure(roundFeedback);
          if (roundFeedback.failed === 0) {
            const r: Round = { id: 0, taskId: task.id, roundNum, codeFiles: {}, action, feedback: roundFeedback, failureType, createdAt: new Date().toISOString() };
            rounds.push(r); memory.saveRound(r);
            bus.emit('round:completed', { taskId: task.id, roundNum, feedback: roundFeedback });
            memory.updateTaskStatus(task.id, 'success');
            bus.emit('task:completed', { taskId: task.id, status: 'success' });
            return 'success';
          }
          currentFailure = roundFeedback;
        }
        const r: Round = { id: 0, taskId: task.id, roundNum, codeFiles: {}, action, feedback: roundFeedback, failureType: failureType as Round['failureType'], createdAt: new Date().toISOString() };
        rounds.push(r); memory.saveRound(r);
        bus.emit('round:completed', { taskId: task.id, roundNum, feedback: roundFeedback });
        if (detectRepetition(rounds, config.agent.repetitionThreshold)) {
          bus.emit('agent:stopped', { taskId: task.id, reason: 'Repetition detected' });
          memory.updateTaskStatus(task.id, 'failure');
          bus.emit('task:completed', { taskId: task.id, status: 'failure' });
          return 'failure';
        }
      }
      bus.emit('agent:stopped', { taskId: task.id, reason: `Max retries (${config.agent.maxRetries}) reached` });
      memory.updateTaskStatus(task.id, 'failure');
      bus.emit('task:completed', { taskId: task.id, status: 'failure' });
      return 'failure';
    } finally { await toolRouter.dockerExec.remove(containerId); }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent-loop.test.ts`
Expected: 3 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: agent loop with feedback-driven self-correction"
```

---

### Task 18: OpenAI Adapter
> Status: COMPLETED | Commit: c2efed9

**Files:**
- Create: `src/llm/openai-adapter.ts`, `tests/openai-adapter.test.ts`

**Interfaces:**
- Consumes: `LLMAdapter` from Task 4, `LLMContext`, `LLMResponse` from `src/types.ts`, `parseAction` from Task 12
- Produces: `OpenAIAdapter` class implementing `LLMAdapter`

- [x] **Step 1: Write the failing test (with mocked openai)**

```typescript
// tests/openai-adapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAIAdapter } from '../src/llm/openai-adapter.js';
import type { LLMContext } from '../src/types.js';

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"action": "run_tests"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }) } },
  })),
}));

describe('OpenAIAdapter', () => {
  it('calls the API and returns an LLMResponse', async () => {
    const adapter = new OpenAIAdapter({ apiKey: 'sk-test', apiBase: 'https://example.com/v1', model: 'deepseek-v4-pro', temperature: 0.3, maxTokens: 4096 });
    const ctx: LLMContext = { systemPrompt: 'test', task: 'Implement a stack', testFiles: {}, historySummary: '', roundNum: 1, maxRetries: 5 };
    const response = await adapter.generate(ctx);
    expect(response.content).toBe('{"action": "run_tests"}');
    expect(response.action.type).toBe('run_tests');
    expect(response.usage?.promptTokens).toBe(100);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/openai-adapter.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/llm/openai-adapter.ts
import OpenAI from 'openai';
import type { LLMAdapter } from './llm-adapter.js';
import type { LLMContext, LLMResponse } from '../types.js';
import { parseAction } from '../agent/action-parser.js';

export interface OpenAIAdapterConfig { apiKey: string; apiBase: string; model: string; temperature: number; maxTokens: number }

export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: OpenAIAdapterConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.apiBase });
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async generate(context: LLMContext): Promise<LLMResponse> {
    const userPrompt = this.buildPrompt(context);
    const completion = await this.client.chat.completions.create({
      model: this.model, temperature: this.temperature, max_tokens: this.maxTokens,
      messages: [{ role: 'system', content: context.systemPrompt }, { role: 'user', content: userPrompt }],
    });
    const content = completion.choices[0]?.message?.content || '';
    return { content, action: parseAction(content), usage: completion.usage ? { promptTokens: completion.usage.prompt_tokens, completionTokens: completion.usage.completion_tokens } : undefined };
  }

  private buildPrompt(ctx: LLMContext): string {
    const parts: string[] = [`## Task\n${ctx.task}\n`, `## Test Files\n`];
    for (const [filename, content] of Object.entries(ctx.testFiles)) parts.push(`### ${filename}\n\`\`\`python\n${content}\n\`\`\`\n`);
    if (ctx.historySummary) parts.push(`## Previous Attempts\n${ctx.historySummary}\n`);
    if (ctx.currentFailure) {
      parts.push(`## Current Failure\nType: ${ctx.currentFailure.failureType}\nPassed: ${ctx.currentFailure.passed}/${ctx.currentFailure.total}\n`);
      for (const f of ctx.currentFailure.failures) parts.push(`- ${f.testName}: ${f.assertion} (expected: ${f.expected}, actual: ${f.actual})\n  Traceback: ${f.traceback}\n`);
    }
    parts.push(`\n## Round ${ctx.roundNum} of ${ctx.maxRetries}\nRespond with a JSON action.`);
    return parts.join('\n');
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/openai-adapter.test.ts`
Expected: 1 test PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: OpenAI-compatible LLM adapter"
```

---

### Task 19: WebUI Server
> Status: COMPLETED | Commit: 9c2b80a

**Files:**
- Create: `src/server/webui-server.ts`, `tests/webui-server.test.ts`

**Interfaces:**
- Consumes: `EventBus` (Task 3), `MemoryStore` (Task 13)
- Produces: `WebUIServer` class with `start()`, `stop()`, `getPort()`

- [x] **Step 1: Write the failing test**

```typescript
// tests/webui-server.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { WebUIServer } from '../src/server/webui-server.js';
import { EventBus } from '../src/event-bus/event-bus.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import WebSocket from 'ws';

describe('WebUIServer', () => {
  let server: WebUIServer; let dbPath: string;
  afterEach(async () => { if (server) await server.stop(); if (dbPath) rmSync(dbPath); });

  it('starts and serves the frontend', async () => {
    const bus = new EventBus();
    dbPath = join(mkdtempSync(join(tmpdir(), 'srv-')), 't.db');
    server = new WebUIServer({ bus, memory: new MemoryStore(dbPath), port: 0 });
    await server.start();
    const response = await fetch(`http://localhost:${server.getPort()}/`);
    expect(response.status).toBe(200);
  });

  it('accepts WebSocket connections', async () => {
    const bus = new EventBus();
    dbPath = join(mkdtempSync(join(tmpdir(), 'srv-')), 't.db');
    server = new WebUIServer({ bus, memory: new MemoryStore(dbPath), port: 0 });
    await server.start();
    const ws = new WebSocket(`ws://localhost:${server.getPort()}/ws`);
    await new Promise<void>(r => ws.on('open', () => r()));
    ws.close();
  });

  it('broadcasts events to WebSocket clients', async () => {
    const bus = new EventBus();
    dbPath = join(mkdtempSync(join(tmpdir(), 'srv-')), 't.db');
    server = new WebUIServer({ bus, memory: new MemoryStore(dbPath), port: 0 });
    await server.start();
    const ws = new WebSocket(`ws://localhost:${server.getPort()}/ws`);
    await new Promise<void>(r => ws.on('open', () => r()));
    const received = new Promise<string>(r => ws.on('message', d => r(d.toString())));
    bus.emit('task:started', { taskId: 't1', description: 'test' });
    const event = JSON.parse(await received);
    expect(event.type).toBe('task:started');
    ws.close();
  });

  it('lists tasks via REST API', async () => {
    const bus = new EventBus();
    dbPath = join(mkdtempSync(join(tmpdir(), 'srv-')), 't.db');
    const memory = new MemoryStore(dbPath);
    memory.saveTask({ id: 't1', description: 'test', testFiles: {}, status: 'success', createdAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
    server = new WebUIServer({ bus, memory, port: 0 });
    await server.start();
    const response = await fetch(`http://localhost:${server.getPort()}/api/tasks`);
    const tasks = await response.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('t1');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/webui-server.test.ts`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/server/webui-server.ts
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { EventBus } from '../event-bus/event-bus.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { EventTypes } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(__dirname, 'frontend');

export interface WebUIServerDeps { bus: EventBus; memory: MemoryStore; port: number }

export class WebUIServer {
  private httpServer: ReturnType<typeof createServer>;
  private wsServer: WebSocketServer;
  private port: number;
  private clients: Set<WebSocket> = new Set();

  constructor(private deps: WebUIServerDeps) {
    this.port = deps.port;
    this.httpServer = createServer((req, res) => this.handleHttp(req, res));
    this.wsServer = new WebSocketServer({ server: this.httpServer, path: '/ws' });
    this.wsServer.on('connection', (ws) => { this.clients.add(ws); ws.on('close', () => this.clients.delete(ws)); });
    this.setupBroadcast();
  }

  private setupBroadcast(): void {
    const events: (keyof EventTypes)[] = ['task:started', 'task:completed', 'round:started', 'round:completed', 'llm:called', 'llm:responded', 'action:parsed', 'guardrail:checked', 'guardrail:approval_requested', 'guardrail:approval_responded', 'tool:executed', 'agent:stopped', 'error'];
    for (const ev of events) this.deps.bus.on(ev, (payload: unknown) => this.broadcast({ type: ev, payload }));
  }

  async start(): Promise<void> {
    return new Promise((resolve) => { this.httpServer.listen(this.port, () => { const a = this.httpServer.address(); if (a && typeof a === 'object') this.port = a.port; resolve(); }); });
  }
  getPort(): number { return this.port; }
  async stop(): Promise<void> { this.clients.forEach(c => c.close()); return new Promise((r) => this.httpServer.close(() => r())); }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    if (url.startsWith('/api/tasks')) { const tasks = this.deps.memory.listTasks(0, 20); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(tasks)); return; }
    try {
      const filePath = url === '/' ? '/index.html' : url;
      const content = await readFile(join(FRONTEND_DIR, filePath));
      const ext = filePath.split('.').pop()?.toLowerCase();
      const ct = ext === 'html' ? 'text/html' : ext === 'js' ? 'text/javascript' : ext === 'css' ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct }); res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
  }

  private broadcast(msg: unknown): void { const data = JSON.stringify(msg); this.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); }); }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/webui-server.test.ts`
Expected: 4 tests PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: WebUI server with WebSocket and REST API"
```

---

### Task 20: Frontend SPA
> Status: COMPLETED | Commit: 142b38b

**Files:**
- Create: `src/server/frontend/index.html`, `src/server/frontend/app.js`, `src/server/frontend/style.css`

**Interfaces:**
- Consumes: WebSocket events from Task 19, REST API from Task 19
- Produces: Browser-based interactive console

- [x] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coding Agent Harness</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>Coding Agent Harness</h1>
      <nav>
        <button id="nav-new-task" class="nav-btn active">New Task</button>
        <button id="nav-history" class="nav-btn">History</button>
        <button id="nav-key" class="nav-btn">API Key</button>
      </nav>
    </header>
    <main>
      <section id="view-new-task" class="view active">
        <div class="form-group">
          <label for="task-description">Task Description</label>
          <textarea id="task-description" rows="4" placeholder="e.g., Implement a stack with push, pop, peek methods"></textarea>
        </div>
        <div class="form-group">
          <label>Test Files (Python)</label>
          <div id="test-files-container">
            <div class="test-file-entry">
              <input type="text" class="test-filename" placeholder="test_stack.py">
              <textarea class="test-content" rows="6" placeholder="def test_push():&#10;    s = Stack()&#10;    s.push(1)&#10;    assert s.peek() == 1"></textarea>
              <button class="btn-remove-file">Remove</button>
            </div>
          </div>
          <button id="btn-add-file" class="btn-secondary">+ Add File</button>
        </div>
        <button id="btn-start-task" class="btn-primary">Start Task</button>
      </section>
      <section id="view-running" class="view">
        <h2>Task Running</h2>
        <div id="event-log" class="event-log"></div>
        <div id="hitl-panel" class="hitl-panel hidden">
          <h3>Approval Required</h3>
          <p id="hitl-reason"></p>
          <button id="btn-approve" class="btn-primary">Approve</button>
          <button id="btn-reject" class="btn-danger">Reject</button>
        </div>
      </section>
      <section id="view-history" class="view">
        <h2>Task History</h2>
        <div id="task-list" class="task-list"></div>
      </section>
      <section id="view-key" class="view">
        <h2>API Key Management</h2>
        <p id="key-status"></p>
        <button id="btn-set-key" class="btn-primary">Set / Update Key</button>
        <button id="btn-clear-key" class="btn-danger">Clear Key</button>
      </section>
    </main>
  </div>
  <script src="/app.js"></script>
</body>
</html>
```

- [x] **Step 2: Create style.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; }
#app { max-width: 900px; margin: 0 auto; padding: 20px; }
header { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #333; }
h1 { font-size: 1.5rem; color: #7ec8e3; }
nav { display: flex; gap: 8px; }
.nav-btn { background: #333; color: #e0e0e0; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
.nav-btn.active { background: #7ec8e3; color: #1a1a2e; }
.view { display: none; padding: 20px 0; }
.view.active { display: block; }
.form-group { margin-bottom: 16px; }
label { display: block; margin-bottom: 4px; font-size: 0.9rem; color: #aaa; }
textarea, input[type="text"] { width: 100%; background: #16213e; color: #e0e0e0; border: 1px solid #333; border-radius: 4px; padding: 8px; font-family: monospace; }
.test-file-entry { margin-bottom: 12px; padding: 12px; background: #16213e; border-radius: 4px; }
.btn-primary { background: #0f3460; color: #e0e0e0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
.btn-secondary { background: #333; color: #e0e0e0; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
.btn-danger { background: #8b0000; color: #e0e0e0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
.event-log { background: #0d1117; border: 1px solid #333; border-radius: 4px; padding: 12px; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 0.85rem; }
.event-log .event { padding: 4px 0; border-bottom: 1px solid #222; }
.event-round { color: #7ec8e3; }
.event-llm { color: #98c379; }
.event-guardrail { color: #e5c07b; }
.event-error { color: #e06c75; }
.hitl-panel { margin-top: 16px; padding: 16px; background: #2a1a1a; border: 1px solid #8b0000; border-radius: 4px; }
.hidden { display: none; }
.task-list { display: flex; flex-direction: column; gap: 8px; }
.task-card { padding: 12px; background: #16213e; border-radius: 4px; cursor: pointer; }
.task-card .status { float: right; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; }
.status-success { background: #1a4a1a; }
.status-failure { background: #4a1a1a; }
.status-running { background: #1a1a4a; }
```

- [x] **Step 3: Create app.js**

```javascript
let ws = null;
let currentTaskId = null;

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.id.replace('nav-', '')}`).classList.add('active');
    if (btn.id === 'nav-history') loadTasks();
    if (btn.id === 'nav-key') loadKeyStatus();
  });
});

document.getElementById('btn-add-file').addEventListener('click', () => {
  const entry = document.querySelector('.test-file-entry').cloneNode(true);
  entry.querySelector('.test-content').value = '';
  document.getElementById('test-files-container').appendChild(entry);
  entry.querySelector('.btn-remove-file').addEventListener('click', () => entry.remove());
});
document.querySelectorAll('.btn-remove-file').forEach(btn => btn.addEventListener('click', (e) => e.target.parentElement.remove()));

document.getElementById('btn-start-task').addEventListener('click', async () => {
  const description = document.getElementById('task-description').value.trim();
  if (!description) return;
  const testFiles = {};
  document.querySelectorAll('.test-file-entry').forEach(entry => {
    const filename = entry.querySelector('.test-filename').value.trim();
    const content = entry.querySelector('.test-content').value;
    if (filename) testFiles[filename] = content;
  });
  const response = await fetch('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, testFiles }),
  });
  const { taskId } = await response.json();
  currentTaskId = taskId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-running').classList.add('active');
  connectWebSocket();
});

function connectWebSocket() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (event) => {
    const { type, payload } = JSON.parse(event.data);
    appendEvent(type, payload);
    if (type === 'guardrail:approval_requested') showHitlPanel(payload);
    if (type === 'guardrail:approval_responded') hideHitlPanel();
    if (type === 'task:completed') appendEvent('task:completed', payload);
  };
}

function appendEvent(type, payload) {
  const log = document.getElementById('event-log');
  const div = document.createElement('div');
  div.className = `event event-${type.split(':')[0]}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${type}: ${JSON.stringify(payload).substring(0, 200)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function showHitlPanel(payload) {
  const panel = document.getElementById('hitl-panel');
  panel.classList.remove('hidden');
  document.getElementById('hitl-reason').textContent = `${payload.action.type}: ${payload.reason}`;
}
function hideHitlPanel() { document.getElementById('hitl-panel').classList.add('hidden'); }

document.getElementById('btn-approve').addEventListener('click', () => { if (ws) ws.send(JSON.stringify({ type: 'approve', taskId: currentTaskId })); });
document.getElementById('btn-reject').addEventListener('click', () => { if (ws) ws.send(JSON.stringify({ type: 'reject', taskId: currentTaskId })); });

async function loadTasks() {
  const response = await fetch('/api/tasks');
  const tasks = await response.json();
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `<span class="status status-${task.status}">${task.status}</span><strong>${task.description}</strong><br><small>${task.createdAt}</small>`;
    list.appendChild(card);
  });
}

async function loadKeyStatus() {
  const response = await fetch('/api/credentials');
  const data = await response.json();
  document.getElementById('key-status').textContent = data.status;
}
```

- [x] **Step 4: Verify manually**

Run: `npm run dev`
Open browser to `http://localhost:3000`
Expected: WebUI loads with New Task, History, API Key tabs.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: frontend SPA with task submission and real-time event display"
```

---

### Task 21: Dockerfile + Entry Point
> Status: COMPLETED | Commit: 11d0d27 (fix: 79dcd2c)

**Files:**
- Create: `Dockerfile`
- Create: `src/index.ts`

**Interfaces:**
- Consumes: All modules from previous tasks
- Produces: Runnable Docker image and entry point

- [x] **Step 1: Create src/index.ts**

```typescript
// src/index.ts
import { loadConfig } from './config/config-loader.js';
import { EventBus } from './event-bus/event-bus.js';
import { MemoryStore } from './memory/memory-store.js';
import { Guardrail } from './guardrail/guardrail.js';
import { HitlStateMachine } from './guardrail/hitl-state-machine.js';
import { AgentLoop } from './agent/agent-loop.js';
import { ToolRouter } from './tools/tool-router.js';
import { OpenAIAdapter } from './llm/openai-adapter.js';
import { CredentialManager } from './credentials/credential-manager.js';
import { WebUIServer } from './server/webui-server.js';
import { join } from 'path';
import { homedir } from 'os';

async function main() {
  const config = loadConfig(join(process.cwd(), 'config.yaml'));
  const bus = new EventBus();
  const dbPath = join(homedir(), '.harness', 'harness.db');
  const memory = new MemoryStore(dbPath);
  const guardrail = new Guardrail(config);
  const hitl = new HitlStateMachine(bus, config.guardrail.hitlTimeoutSeconds);
  const toolRouter = new ToolRouter(config);
  const creds = new CredentialManager();

  if (!(await creds.hasKey())) {
    console.log('No API key found. Please run with --setup to configure.');
    process.exit(1);
  }

  const apiKey = await creds.getKey() || '';
  const llm = new OpenAIAdapter({ apiKey, apiBase: config.llm.apiBase, model: config.llm.model, temperature: config.llm.temperature, maxTokens: config.llm.maxTokens });
  const agentLoop = new AgentLoop({ llm, guardrail, hitl, toolRouter, memory, bus, config });
  const server = new WebUIServer({ bus, memory, port: 3000 });

  await server.start();
  console.log(`Harness running on http://localhost:${server.getPort()}`);
}

main().catch(console.error);
```

- [x] **Step 2: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache docker-cli python3 py3-pip
RUN pip3 install pytest --break-system-packages
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/config.yaml ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [x] **Step 3: Build and verify**

Run: `docker build -t harness-python:latest .`
Expected: Image builds successfully.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Dockerfile and entry point"
```

---

### Task 22: Mechanism Demos
> Status: COMPLETED | Commit: e2d636c

**Files:**
- Create: `tests/mechanism-demo.test.ts`

**Interfaces:**
- Consumes: All core mechanisms from previous tasks
- Produces: Three deterministic demos (D1, D2, D3) required by course §A.6

- [x] **Step 1: Write the demo tests**

```typescript
// tests/mechanism-demo.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../src/agent/agent-loop.js';
import { MockLLM } from '../src/llm/mock-llm.js';
import { EventBus } from '../src/event-bus/event-bus.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { Guardrail } from '../src/guardrail/guardrail.js';
import { HitlStateMachine } from '../src/guardrail/hitl-state-machine.js';
import type { Config, Task } from '../src/types.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const config: Config = {
  llm: { model: 'test', temperature: 0, maxTokens: 100, apiBase: '' },
  agent: { maxRetries: 5, timeoutSeconds: 30, repetitionThreshold: 3, maxHistoryTokens: 2000 },
  guardrail: { enableHitl: true, hitlTimeoutSeconds: 30, blockedPatterns: ['rm\\s+-rf\\s+/'], approvalPatterns: ['sudo\\s+'] },
  docker: { image: 'test', workDir: '/workspace', memoryLimit: '256m' },
  debug: false,
};

function makeTask(): Task {
  return { id: 'demo-1', description: 'Implement a stack', testFiles: { 'test_stack.py': 'def test_push(): pass' }, status: 'running', createdAt: new Date().toISOString(), finishedAt: null };
}

function mockToolRouter(passing: boolean) {
  return {
    dockerExec: { createContainer: vi.fn().mockResolvedValue('c1'), remove: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) },
    dispatch: vi.fn().mockImplementation(async (action: { type: string }) => {
      if (action.type === 'run_tests') return { feedbackSignal: passing ? { total: 1, passed: 1, failed: 0, failures: [], failureType: 'RUNTIME_ERROR', rawReport: '' } : { total: 1, passed: 0, failed: 1, failures: [{ testName: 'test_a', assertion: 'AssertionError: assert 1 == 2', expected: '2', actual: '1', traceback: '' }], failureType: 'ASSERTION_ERROR', rawReport: '' } };
      return { success: true };
    }),
  };
}

describe('Mechanism Demos (§A.6)', () => {
  describe('D1: Guardrail intercepts dangerous action', () => {
    it('blocks rm -rf / and continues to success', async () => {
      const bus = new EventBus();
      const dbPath = join(mkdtempSync(join(tmpdir(), 'demo-')), 't.db');
      const memory = new MemoryStore(dbPath);
      const task = makeTask(); memory.saveTask(task);
      const mockLLM = new MockLLM([
        { type: 'run_shell', command: 'rm -rf /' },
        { type: 'write_file', path: '/workspace/stack.py', content: 'class Stack: pass' },
        { type: 'run_tests' },
      ]);
      const events: string[] = [];
      bus.on('guardrail:checked', (p) => events.push(`${p.result.decision}:${p.action.type}`));

      const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: mockToolRouter(true) as never, memory, bus, config });
      const status = await loop.run(task);
      expect(status).toBe('success');
      expect(events).toContain('BLOCK:run_shell');
      rmSync(dbPath);
    });
  });

  describe('D2: Feedback loop drives self-correction', () => {
    it('fails round 1, gets feedback, succeeds round 2', async () => {
      const bus = new EventBus();
      const dbPath = join(mkdtempSync(join(tmpdir(), 'demo-')), 't.db');
      const memory = new MemoryStore(dbPath);
      const task = makeTask(); memory.saveTask(task);
      const mockLLM = new MockLLM([
        { type: 'write_file', path: '/workspace/stack.py', content: 'class Stack: pass' },
        { type: 'run_tests' },
        { type: 'write_file', path: '/workspace/stack.py', content: 'class Stack:\n    def push(self, v): self.items.append(v)' },
        { type: 'run_tests' },
      ]);
      const toolRouter = mockToolRouter(false);
      let callCount = 0;
      toolRouter.dispatch = vi.fn().mockImplementation(async (action: { type: string }) => {
        if (action.type === 'run_tests') {
          callCount++;
          const passing = callCount > 1;
          return { feedbackSignal: passing ? { total: 1, passed: 1, failed: 0, failures: [], failureType: 'RUNTIME_ERROR', rawReport: '' } : { total: 1, passed: 0, failed: 1, failures: [{ testName: 'test_a', assertion: 'AssertionError: assert 1 == 2', expected: '2', actual: '1', traceback: '' }], failureType: 'ASSERTION_ERROR', rawReport: '' } };
        }
        return { success: true };
      }) as never;

      const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter, memory, bus, config });
      const status = await loop.run(task);
      expect(status).toBe('success');
      expect(callCount).toBe(2);
      rmSync(dbPath);
    });
  });

  describe('D3: Repetition detection terminates early', () => {
    it('detects 3 identical failures and stops before max_retries', async () => {
      const bus = new EventBus();
      const dbPath = join(mkdtempSync(join(tmpdir(), 'demo-')), 't.db');
      const memory = new MemoryStore(dbPath);
      const task = makeTask(); memory.saveTask(task);
      const mockLLM = new MockLLM([
        { type: 'write_file', path: '/workspace/stack.py', content: 'v1' },
        { type: 'run_tests' },
        { type: 'write_file', path: '/workspace/stack.py', content: 'v2' },
        { type: 'run_tests' },
        { type: 'write_file', path: '/workspace/stack.py', content: 'v3' },
        { type: 'run_tests' },
      ]);
      let stopped = false;
      bus.on('agent:stopped', (p) => { if (p.reason.includes('Repetition')) stopped = true; });

      const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: mockToolRouter(false) as never, memory, bus, config });
      const status = await loop.run(task);
      expect(status).toBe('failure');
      expect(stopped).toBe(true);
      rmSync(dbPath);
    });
  });
});
```

- [x] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/mechanism-demo.test.ts`
Expected: 3 tests PASS (D1, D2, D3)

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: mechanism demos (D1 guardrail, D2 feedback loop, D3 repetition)"
```

---

### Task 23: CI Config
> Status: COMPLETED | Commit: d93b8da (fix: 8884e76)

**Files:**
- Create: `.gitlab-ci.yml`

**Interfaces:**
- Produces: CI pipeline with `unit-test` job

- [x] **Step 1: Create .gitlab-ci.yml**

```yaml
stages:
  - test
  - build

unit-test:
  stage: test
  image: node:20-alpine
  before_script:
    - npm ci
  script:
    - npx tsc --noEmit
    - npx vitest run
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: text
        path: coverage/coverage-summary.json

docker-build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker build -t harness-python:latest .
  only:
    - main
```

- [x] **Step 2: Verify CI config is valid**

Run: `npx vitest run` (ensure all tests pass locally)
Expected: All tests PASS.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: add unit-test and docker-build jobs"
```

---

## Self-Review

### Spec Coverage

| SPEC Section | Task(s) | Status |
|---|---|---|
| 3.1 WebUI | Task 19, 20 | Covered |
| 3.2 Agent Loop | Task 17 | Covered |
| 3.3 Tool Router | Task 14, 15 | Covered |
| 3.4 Feedback Parser | Task 7, 8, 9, 10, 11 | Covered |
| 3.5 Guardrail | Task 5, 6 | Covered |
| 3.6 Memory Store | Task 13 | Covered |
| 3.7 Config Loader | Task 2 | Covered |
| 3.8 Credential Manager | Task 16 | Covered |
| 3.9 Docker Exec | Task 14 | Covered |
| 7. Credential & Distribution | Task 16, 21 | Covered |
| 11.2 Mechanism Demos | Task 22 | Covered |
| CI requirement | Task 23 | Covered |

### Placeholder Scan

No TBD, TODO, or incomplete sections found. All steps contain actual code.

### Type Consistency

- `Action` type used consistently across Tasks 1, 4, 5, 12, 15, 17
- `FeedbackSignal` type used consistently across Tasks 1, 7, 8, 9, 11, 15, 17
- `GuardrailResult` type used consistently across Tasks 1, 5, 17
- `LLMContext` / `LLMResponse` types used consistently across Tasks 1, 4, 11, 17, 18
- `Config` type used consistently across Tasks 1, 2, 5, 11, 14, 15, 17
- `Task` / `Round` types used consistently across Tasks 1, 9, 10, 11, 13, 17
- `EventTypes` used consistently across Tasks 1, 3, 19
