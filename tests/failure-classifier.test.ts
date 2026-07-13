// tests/failure-classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyFailure } from '../src/feedback/failure-classifier.js';
import type { FeedbackSignal } from '../src/types.js';

function makeFeedback(assertion: string): FeedbackSignal {
  return { total: 3, passed: 2, failed: 1, failures: [{ testName: 'test_x', assertion, expected: '', actual: '', traceback: '' }], failureType: 'RUNTIME_ERROR', rawReport: '' };
}

describe('FailureClassifier', () => {
  it('classifies SyntaxError as COMPILE_ERROR', () => { expect(classifyFailure(makeFeedback('SyntaxError: invalid syntax'))).toBe('COMPILE_ERROR'); });
  it('classifies AssertionError as ASSERTION_ERROR', () => { expect(classifyFailure(makeFeedback('AssertionError: assert 1 == 2'))).toBe('ASSERTION_ERROR'); });
  it('classifies ModuleNotFoundError as IMPORT_ERROR', () => { expect(classifyFailure(makeFeedback("ModuleNotFoundError: No module named 'numpy'"))).toBe('IMPORT_ERROR'); });
  it('classifies Timeout as TIMEOUT', () => { expect(classifyFailure(makeFeedback('Timeout: execution exceeded 30s'))).toBe('TIMEOUT'); });
  it('classifies unknown as RUNTIME_ERROR', () => { expect(classifyFailure(makeFeedback('RuntimeError: something went wrong'))).toBe('RUNTIME_ERROR'); });
  it('returns existing type when no failures', () => {
    const fb: FeedbackSignal = { total: 0, passed: 0, failed: 0, failures: [], failureType: 'COMPILE_ERROR', rawReport: '' };
    expect(classifyFailure(fb)).toBe('COMPILE_ERROR');
  });
});
