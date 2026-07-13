import { describe, it, expect } from 'vitest';
import { compressHistory } from '../src/feedback/history-compressor.js';
import type { Round } from '../src/types.js';

function makeRound(num: number, failureType: string, testName: string): Round {
  return {
    id: num, taskId: 't1', roundNum: num, codeFiles: { 'solution.py': `# v${num}` },
    action: { type: 'write_file', path: 'solution.py', content: `# v${num}` } as never,
    feedback: { total: 3, passed: 2, failed: 1, failures: [{ testName, assertion: 'assert x', expected: '1', actual: '0', traceback: 't:1' }], failureType: failureType as never, rawReport: '' },
    failureType: failureType as never, createdAt: '',
  };
}

describe('HistoryCompressor', () => {
  it('compresses a single round', () => {
    const result = compressHistory([makeRound(1, 'ASSERTION_ERROR', 'test_a')], 2000);
    expect(result).toContain('Round 1');
    expect(result).toContain('ASSERTION_ERROR');
  });
  it('compresses multiple rounds', () => {
    const result = compressHistory([makeRound(1, 'ASSERTION_ERROR', 'test_a'), makeRound(2, 'TIMEOUT', 'test_b')], 2000);
    expect(result).toContain('Round 1');
    expect(result).toContain('Round 2');
  });
  it('truncates when exceeding max tokens', () => {
    const rounds = Array.from({ length: 20 }, (_, i) => makeRound(i + 1, 'ASSERTION_ERROR', `test_${i}`));
    const result = compressHistory(rounds, 100);
    expect(result.length).toBeLessThan(500);
    expect(result).toContain('Round 20');
  });
  it('returns empty string for no rounds', () => { expect(compressHistory([], 2000)).toBe(''); });
});
