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
  async stop(): Promise<void> { this.clients.forEach(c => c.close()); return new Promise((r) => this.httpServer.close(() => { this.deps.memory.close(); r(); })); }

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
