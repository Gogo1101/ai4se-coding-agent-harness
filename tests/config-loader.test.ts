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
