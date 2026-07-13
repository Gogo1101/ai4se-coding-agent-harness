import type { FeedbackSignal } from '../../src/types.js';

export const samplePytestReport = {
  created: 1690000000.0,
  duration: 1.5,
  tests: [
    { nodeid: 'test_stack.py::test_push', outcome: 'passed', call: { duration: 0.001 } },
    { nodeid: 'test_stack.py::test_pop', outcome: 'passed', call: { duration: 0.002 } },
    {
      nodeid: 'test_stack.py::test_peek',
      outcome: 'failed',
      call: {
        duration: 0.003,
        longrepr: {
          reprcrash: { message: 'AssertionError: assert None == 1' },
          reprtraceback: {
            chains: [{ content: [['test_stack.py', 15, 'test_peek', 'assert stack.peek() == 1']] }],
          },
        },
      },
    },
  ],
  summary: { total: 3, passed: 2, failed: 1 },
};

export const expectedFeedbackSignal: FeedbackSignal = {
  total: 3, passed: 2, failed: 1,
  failures: [{
    testName: 'test_stack.py::test_peek',
    assertion: 'assert stack.peek() == 1',
    expected: '1', actual: 'None',
    traceback: 'test_stack.py:15: test_peek',
  }],
  failureType: 'ASSERTION_ERROR',
  rawReport: JSON.stringify(samplePytestReport),
};

export const compileErrorReport = {
  created: 1690000000.0, duration: 0.5, tests: [],
  summary: { total: 0, passed: 0, failed: 0 },
  collectors: [{ nodeid: 'test_stack.py', outcome: 'failed', longrepr: 'SyntaxError: invalid syntax (test_stack.py, line 5)' }],
};

export const importErrorReport = {
  created: 1690000000.0, duration: 0.5, tests: [],
  summary: { total: 0, passed: 0, failed: 0 },
  collectors: [{ nodeid: 'test_stack.py', outcome: 'failed', longrepr: "ModuleNotFoundError: No module named 'numpy'" }],
};
