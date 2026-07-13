// src/feedback/failure-classifier.ts
import type { FeedbackSignal, FailureType } from '../types.js';

export function classifyFailure(feedback: FeedbackSignal): FailureType {
  if (feedback.failures.length === 0) return feedback.failureType || 'RUNTIME_ERROR';
  const a = feedback.failures[0].assertion;
  if (/SyntaxError|syntax error/i.test(a)) return 'COMPILE_ERROR';
  if (/ModuleNotFoundError|ImportError/i.test(a)) return 'IMPORT_ERROR';
  if (/Timeout|timed?\s*out/i.test(a)) return 'TIMEOUT';
  if (/AssertionError|assert\s/i.test(a)) return 'ASSERTION_ERROR';
  return 'RUNTIME_ERROR';
}
