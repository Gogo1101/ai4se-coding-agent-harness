import type { Action } from '../types.js';

export function parseAction(content: string): Action {
  const jsonStr = extractJson(content);
  let parsed: unknown;
  try { parsed = JSON.parse(jsonStr); } catch { throw new Error(`Failed to parse LLM output as JSON: ${content.substring(0, 100)}`); }
  const obj = parsed as { action?: string; path?: string; content?: string; command?: string };
  if (!obj.action) throw new Error('LLM output missing "action" field');
  switch (obj.action) {
    case 'write_file':
      if (!obj.path || obj.content === undefined) throw new Error('write_file requires "path" and "content"');
      return { type: 'write_file', path: obj.path, content: obj.content };
    case 'read_file':
      if (!obj.path) throw new Error('read_file requires "path"');
      return { type: 'read_file', path: obj.path };
    case 'run_shell':
      if (!obj.command) throw new Error('run_shell requires "command"');
      return { type: 'run_shell', command: obj.command };
    case 'run_tests':
      return { type: 'run_tests' };
    default:
      throw new Error(`Unknown action type: ${obj.action}`);
  }
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  return trimmed;
}
