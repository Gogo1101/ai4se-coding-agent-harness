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
