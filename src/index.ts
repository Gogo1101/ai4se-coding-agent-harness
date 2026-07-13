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
