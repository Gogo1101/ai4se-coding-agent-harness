import { describe, it, expect } from 'vitest';
import { detectRepetition } from '../src/feedback/repetition-detector.js';
import type { Round } from '../src/types.js';

function makeRound(failureType: string, testName: string): Round {
  return {
    id: 1, taskId: 't1', roundNum: 1, codeFiles: {},
    action: { type: 'write_file', path: 'x.py', content: 'x' } as never,
    feedback: { total: 1, passed: 0, failed: 1, failures: [{ testName, assertion: '', expected: '', actual: '', traceback: '' }], failureType: failureType as never, rawReport: '' },
    failureType: failureType as never, createdAt: '',
  };
}

describe('RepetitionDetector', () => {
  it('returns false for fewer than threshold rounds', () => { expect(detectRepetition([makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(false); });
  it('returns false for different failures', () => { expect(detectRepetition([makeRound('ASSERTION_ERROR', 'test_a'), makeRound('TIMEOUT', 'test_b'), makeRound('IMPORT_ERROR', 'test_c')], 3)).toBe(false); });
  it('returns true for 3 consecutive identical failures', () => { expect(detectRepetition([makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(true); });
  it('returns false when only 2 of 3 are identical', () => { expect(detectRepetition([makeRound('TIMEOUT', 'test_b'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(false); });
  it('returns true when last N rounds are identical', () => { expect(detectRepetition([makeRound('TIMEOUT', 'test_b'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a'), makeRound('ASSERTION_ERROR', 'test_a')], 3)).toBe(true); });
});
