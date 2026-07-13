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
