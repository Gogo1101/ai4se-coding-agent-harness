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
