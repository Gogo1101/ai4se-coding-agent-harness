import { describe, it, expect } from 'vitest';
import { parseTestResult } from '../src/feedback/feedback-parser.js';
import { samplePytestReport, compileErrorReport, importErrorReport } from './helpers/fixtures.js';

describe('FeedbackParser', () => {
  it('parses a report with 2 passed, 1 failed', () => {
    const result = parseTestResult(samplePytestReport);
    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].testName).toBe('test_stack.py::test_peek');
  });
  it('detects all-pass as no failures', () => {
    const allPass = { ...samplePytestReport, tests: samplePytestReport.tests.filter((t: { outcome: string }) => t.outcome === 'passed'), summary: { total: 2, passed: 2, failed: 0 } };
    const result = parseTestResult(allPass);
    expect(result.failed).toBe(0);
  });
  it('parses collection error as COMPILE_ERROR', () => {
    expect(parseTestResult(compileErrorReport).failureType).toBe('COMPILE_ERROR');
  });
  it('parses import error as IMPORT_ERROR', () => {
    expect(parseTestResult(importErrorReport).failureType).toBe('IMPORT_ERROR');
  });
  it('handles empty report', () => {
    const result = parseTestResult({ tests: [], summary: { total: 0, passed: 0, failed: 0 } });
    expect(result.total).toBe(0);
  });
});
