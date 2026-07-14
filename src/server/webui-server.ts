import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { EventBus } from '../event-bus/event-bus.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { AgentLoop } from '../agent/agent-loop.js';
import type { CredentialManager } from '../credentials/credential-manager.js';
import type { EventTypes, Task } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(__dirname, 'frontend');

export interface WebUIServerDeps {
  bus: EventBus;
  memory: MemoryStore;
  port: number;
  agentLoop?: AgentLoop;
  creds?: CredentialManager;
}

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
  async stop(): Promise<void> { this.clients.forEach(c => c.close()); return new Promise((r) => this.httpServer.close(() => { this.deps.memory.close(); r(); })); }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    if (url === '/api/credentials' && method === 'GET') {
      if (this.deps.creds) {
        let status: string;
        try {
          status = await this.deps.creds.getStatus();
        } catch {
          status = process.env.OPENAI_API_KEY
            ? 'API Key: configured (source: env)'
            : 'API Key: not configured';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status }));
      } else {
        res.writeHead(404); res.end('Not found');
      }
      return;
    }

    if (url === '/api/credentials' && method === 'POST') {
      if (this.deps.creds) {
        const body = await new Promise<string>((resolve) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          req.on('end', () => resolve(data));
        });
        try {
          const parsed = JSON.parse(body) as { apiKey: string };
          if (!parsed.apiKey) { res.writeHead(400); res.end('Missing apiKey'); return; }
          await this.deps.creds.setKey(parsed.apiKey);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'Key saved successfully' }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: `Failed: ${(e as Error).message}` }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'Not found' }));
      }
      return;
    }

    if (url === '/api/credentials' && method === 'DELETE') {
      if (this.deps.creds) {
        try {
          await this.deps.creds.clearKey();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'Key cleared' }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: `Failed: ${(e as Error).message}` }));
        }
      } else {
        res.writeHead(404); res.end('Not found');
      }
      return;
    }

    if (url === '/api/tasks' && method === 'POST') {
      const agentLoop = this.deps.agentLoop;
      if (agentLoop) {
        const body = await new Promise<string>((resolve) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          req.on('end', () => resolve(data));
        });
        let description: string;
        let testFiles: Record<string, string>;
        try {
          const parsed = JSON.parse(body) as { description: string; testFiles?: Record<string, string> };
          description = parsed.description;
          testFiles = parsed.testFiles || {};
        } catch {
          res.writeHead(400); res.end('Invalid JSON');
          return;
        }
        if (!description) {
          res.writeHead(400); res.end('Missing description');
          return;
        }
        const task: Task = {
          id: randomUUID(),
          description,
          testFiles,
          status: 'running',
          createdAt: new Date().toISOString(),
          finishedAt: null,
        };
        this.deps.memory.saveTask(task);
        agentLoop.run(task).catch((err: unknown) => {
          this.deps.bus.emit('error', { taskId: task.id, error: (err as Error).message });
          this.deps.memory.updateTaskStatus(task.id, 'failure');
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ taskId: task.id, status: 'running' }));
      } else {
        res.writeHead(404); res.end('Not found');
      }
      return;
    }

    if (url.startsWith('/api/tasks')) { const tasks = this.deps.memory.listTasks(0, 20); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(tasks)); return; }
    try {
      const filePath = url === '/' ? '/index.html' : url;
      const content = await readFile(join(FRONTEND_DIR, filePath));
      const ext = filePath.split('.').pop()?.toLowerCase();
      const ct = ext === 'html' ? 'text/html' : ext === 'js' ? 'text/javascript' : ext === 'css' ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache, no-store, must-revalidate' }); res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
  }

  private broadcast(msg: unknown): void { const data = JSON.stringify(msg); this.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); }); }
}
