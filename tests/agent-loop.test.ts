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
    memory.close(); rmSync(dbPath);
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
    memory.close(); rmSync(dbPath);
  });

  it('blocks dangerous commands', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const mockLLM = new MockLLM([{ type: 'run_shell', command: 'rm -rf /' }, { type: 'write_file', path: '/workspace/stack.py', content: 'x' }, { type: 'run_tests' }]);
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: mockToolRouter(true) as never, memory, bus, config });
    expect(await loop.run(task)).toBe('success');
    memory.close(); rmSync(dbPath);
  });

  it('executes action after HITL approval', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const hitl = new HitlStateMachine(bus, 30);
    const mockLLM = new MockLLM([
      { type: 'run_shell', command: 'sudo apt-get install foo' },
      { type: 'write_file', path: '/workspace/stack.py', content: 'x' },
      { type: 'run_tests' },
    ]);
    const router = mockToolRouter(true);
    bus.on('guardrail:approval_requested', () => {
      setTimeout(() => hitl.approve(task.id), 0);
    });
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl, toolRouter: router as never, memory, bus, config });
    expect(await loop.run(task)).toBe('success');
    expect(router.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'run_shell', command: 'sudo apt-get install foo' }), 'c1');
    memory.close(); rmSync(dbPath);
  });

  it('skips action after HITL rejection', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const hitl = new HitlStateMachine(bus, 30);
    const mockLLM = new MockLLM([
      { type: 'run_shell', command: 'sudo apt-get install foo' },
      { type: 'write_file', path: '/workspace/stack.py', content: 'x' },
      { type: 'run_tests' },
    ]);
    const router = mockToolRouter(true);
    bus.on('guardrail:approval_requested', () => {
      setTimeout(() => hitl.reject(task.id), 0);
    });
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl, toolRouter: router as never, memory, bus, config });
    expect(await loop.run(task)).toBe('success');
    expect(router.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'run_shell', command: 'sudo apt-get install foo' }), 'c1');
    memory.close(); rmSync(dbPath);
  });

  it('detects repetition and terminates early', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const mockLLM = new MockLLM([{ type: 'run_tests' }, { type: 'run_tests' }, { type: 'run_tests' }]);
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: mockToolRouter(false) as never, memory, bus, config });
    expect(await loop.run(task)).toBe('failure');
    expect(mockLLM.callCount).toBe(3);
    memory.close(); rmSync(dbPath);
  });

  it('emits error event on round failure and continues', async () => {
    const bus = new EventBus();
    const dbPath = join(mkdtempSync(join(tmpdir(), 'al-')), 't.db');
    const memory = new MemoryStore(dbPath);
    const task = makeTask(); memory.saveTask(task);
    const errorEvents: { taskId: string; error: string }[] = [];
    bus.on('error', (p) => errorEvents.push(p));
    const router = mockToolRouter(true);
    router.dispatch.mockImplementationOnce(async () => { throw new Error('dispatch boom'); });
    const mockLLM = new MockLLM([
      { type: 'write_file', path: '/workspace/stack.py', content: 'x' },
      { type: 'write_file', path: '/workspace/stack.py', content: 'y' },
      { type: 'run_tests' },
    ]);
    const loop = new AgentLoop({ llm: mockLLM, guardrail: new Guardrail(config), hitl: new HitlStateMachine(bus, 30), toolRouter: router as never, memory, bus, config });
    expect(await loop.run(task)).toBe('success');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error).toBe('dispatch boom');
    memory.close(); rmSync(dbPath);
  });
});
