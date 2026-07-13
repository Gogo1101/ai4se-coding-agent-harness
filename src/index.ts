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
import { mkdirSync } from 'fs';
import * as readline from 'readline';

async function main() {
  const config = loadConfig(join(process.cwd(), 'config.yaml'));
  const bus = new EventBus();
  const dbPath = join(homedir(), '.harness', 'harness.db');
  mkdirSync(join(homedir(), '.harness'), { recursive: true });
  const memory = new MemoryStore(dbPath);
  const guardrail = new Guardrail(config);
  const hitl = new HitlStateMachine(bus, config.guardrail.hitlTimeoutSeconds);
  const toolRouter = new ToolRouter(config);
  const creds = new CredentialManager();

  if (process.argv.includes('--setup')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const key = await new Promise<string>((resolve) => {
      rl.question('Enter your OpenAI API key: ', (answer) => resolve(answer.trim()));
    });
    rl.close();
    try {
      await creds.setKey(key);
      console.log('API key saved to keychain.');
    } catch {
      console.log('Could not save to keychain. Set OPENAI_API_KEY env var instead.');
    }
    process.exit(0);
  }

  let apiKey = '';
  try {
    if (await creds.hasKey()) {
      apiKey = (await creds.getKey()) || '';
    }
  } catch {
    void 0;
  }
  if (!apiKey) {
    apiKey = process.env.OPENAI_API_KEY || '';
  }
  if (!apiKey) {
    console.log('No API key found. Please run with --setup to configure, or set OPENAI_API_KEY env var.');
    process.exit(1);
  }

  const llm = new OpenAIAdapter({ apiKey, apiBase: config.llm.apiBase, model: config.llm.model, temperature: config.llm.temperature, maxTokens: config.llm.maxTokens });
  const agentLoop = new AgentLoop({ llm, guardrail, hitl, toolRouter, memory, bus, config });
  const server = new WebUIServer({ bus, memory, port: 3000, agentLoop, creds });

  await server.start();
  console.log(`Harness running on http://localhost:${server.getPort()}`);
}

main().catch(console.error);
