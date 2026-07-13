import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Task, Round } from '../src/types.js';

describe('MemoryStore', () => {
  let store: MemoryStore; let dbPath: string;
  beforeEach(() => { dbPath = join(mkdtempSync(join(tmpdir(), 'harness-mem-')), 'test.db'); store = new MemoryStore(dbPath); });
  afterEach(() => { store.close(); rmSync(dbPath); });

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
