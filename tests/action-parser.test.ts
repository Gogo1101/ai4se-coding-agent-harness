import { describe, it, expect } from 'vitest';
import { parseAction } from '../src/agent/action-parser.js';

describe('ActionParser', () => {
  it('parses write_file action', () => {
    const action = parseAction('{"action": "write_file", "path": "stack.py", "content": "class Stack: pass"}');
    expect(action).toEqual({ type: 'write_file', path: 'stack.py', content: 'class Stack: pass' });
  });
  it('parses run_tests action', () => { expect(parseAction('{"action": "run_tests"}').type).toBe('run_tests'); });
  it('parses run_shell action', () => { expect(parseAction('{"action": "run_shell", "command": "echo hello"}')).toEqual({ type: 'run_shell', command: 'echo hello' }); });
  it('parses read_file action', () => { expect(parseAction('{"action": "read_file", "path": "stack.py"}').type).toBe('read_file'); });
  it('throws on invalid JSON', () => { expect(() => parseAction('not json')).toThrow(); });
  it('throws on unknown action type', () => { expect(() => parseAction('{"action": "fly"}')).toThrow(); });
  it('throws on missing required fields', () => { expect(() => parseAction('{"action": "write_file"}')).toThrow(); });
  it('extracts JSON from markdown code block', () => {
    expect(parseAction('```json\n{"action": "run_tests"}\n```').type).toBe('run_tests');
  });
});
