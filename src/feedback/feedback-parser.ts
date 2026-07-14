import type { FeedbackSignal, Failure, FailureType } from '../types.js';

interface PytestTestEntry {
  nodeid: string; outcome: string;
  call?: { duration: number; longrepr?: string | { reprcrash?: { message: string }; reprtraceback?: { chains?: Array<{ content: Array<[string, number, string, string]> }> } }; crash?: { message: string; path: string; lineno: number }; traceback?: Array<{ path: string; lineno: number; message: string }> };
}
interface PytestCollectorEntry { nodeid: string; outcome: string; longrepr: string; }
interface PytestJsonReport { tests?: PytestTestEntry[]; collectors?: PytestCollectorEntry[]; summary?: { total: number; passed: number; failed: number }; }

export function parseTestResult(jsonReport: unknown): FeedbackSignal {
  const report = jsonReport as PytestJsonReport;
  const rawReport = JSON.stringify(report);

  if (report.collectors && report.collectors.length > 0) {
    const failed = report.collectors.find(c => c.outcome === 'failed');
    if (failed) {
      const longrepr = failed.longrepr || '';
      const failureType: FailureType = longrepr.includes('ModuleNotFoundError') || longrepr.includes('ImportError') ? 'IMPORT_ERROR' : 'COMPILE_ERROR';
      return { total: 0, passed: 0, failed: 1, failures: [{ testName: failed.nodeid, assertion: longrepr, expected: '', actual: '', traceback: longrepr }], failureType, rawReport };
    }
  }

  const tests = report.tests || [];
  const summary = report.summary || { total: tests.length, passed: 0, failed: 0 };
  const failures: Failure[] = tests.filter(t => t.outcome === 'failed').map(t => extractFailure(t));
  const failed = summary.failed || failures.length;
  const passed = summary.passed || tests.filter(t => t.outcome === 'passed').length;
  let failureType: FailureType = 'RUNTIME_ERROR';
  if (failures.length > 0) failureType = inferFailureType(failures);

  return { total: summary.total || tests.length, passed, failed, failures, failureType, rawReport };
}

function extractFailure(test: PytestTestEntry): Failure {
  const call = test.call;
  if (!call) return { testName: test.nodeid, assertion: 'Unknown error', expected: '', actual: '', traceback: '' };
  let message = call.crash?.message || '';
  let tracebackStr = '';
  const longrepr = call.longrepr;
  if (typeof longrepr === 'string') {
    if (!message) {
      const lines = longrepr.split('\n');
      const errLine = lines.find(l => /^[A-Z]\w*Error:/.test(l)) || lines[lines.length - 1];
      message = errLine ? errLine.replace(/^E\s*/, '').trim() : 'Unknown error';
    }
    tracebackStr = longrepr;
  } else if (longrepr) {
    if (!message) message = longrepr.reprcrash?.message || 'Unknown error';
    const chains = longrepr.reprtraceback?.chains || [];
    const content = chains[0]?.content || [];
    const lastLine = content[content.length - 1] || ['', 0, '', message];
    const [file, line, func, assertion] = lastLine;
    if (!tracebackStr) tracebackStr = `${file}:${line}: ${func}`;
    if (!message) message = assertion || message;
  }
  if (!tracebackStr && call.traceback) {
    tracebackStr = call.traceback.map(t => `${t.path}:${t.lineno}: ${t.message}`).join('\n');
  }
  const { expected, actual } = parseAssertion(message);
  return { testName: test.nodeid, assertion: message, expected, actual, traceback: tracebackStr };
}

function parseAssertion(message: string): { expected: string; actual: string } {
  const match = message.match(/assert\s+(.+?)\s*==\s*(.+)/);
  if (match) return { expected: match[2].trim(), actual: match[1].trim() };
  return { expected: '', actual: '' };
}

function inferFailureType(failures: Failure[]): FailureType {
  const a = failures[0].assertion;
  if (/SyntaxError|syntax error/i.test(a)) return 'COMPILE_ERROR';
  if (/ModuleNotFoundError|ImportError/i.test(a)) return 'IMPORT_ERROR';
  if (/Timeout|timed?\s*out/i.test(a)) return 'TIMEOUT';
  if (/AssertionError|assert\s/i.test(a)) return 'ASSERTION_ERROR';
  return 'RUNTIME_ERROR';
}
