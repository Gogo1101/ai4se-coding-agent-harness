export type Action =
  | { type: 'write_file'; path: string; content: string }
  | { type: 'read_file'; path: string }
  | { type: 'run_shell'; command: string }
  | { type: 'run_tests' };

export type FailureType = 'COMPILE_ERROR' | 'ASSERTION_ERROR' | 'TIMEOUT' | 'IMPORT_ERROR' | 'RUNTIME_ERROR';

export interface Failure {
  testName: string;
  assertion: string;
  expected: string;
  actual: string;
  traceback: string;
}

export interface FeedbackSignal {
  total: number;
  passed: number;
  failed: number;
  failures: Failure[];
  failureType: FailureType;
  rawReport: string;
}

export interface GuardrailResult {
  decision: 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';
  reason: string;
  matchedPattern?: string;
}

export interface LLMContext {
  systemPrompt: string;
  task: string;
  testFiles: Record<string, string>;
  historySummary: string;
  currentFailure?: FeedbackSignal;
  roundNum: number;
  maxRetries: number;
}

export interface LLMResponse {
  content: string;
  action: Action;
  usage?: { promptTokens: number; completionTokens: number };
}

export type TaskStatus = 'pending' | 'running' | 'success' | 'failure' | 'aborted';

export interface Task {
  id: string;
  description: string;
  testFiles: Record<string, string>;
  status: TaskStatus;
  createdAt: string;
  finishedAt: string | null;
}

export interface Round {
  id: number;
  taskId: string;
  roundNum: number;
  codeFiles: Record<string, string>;
  action: Action;
  feedback: FeedbackSignal | null;
  failureType: FailureType | null;
  createdAt: string;
}

export interface Config {
  llm: { model: string; temperature: number; maxTokens: number; apiBase: string };
  agent: { maxRetries: number; timeoutSeconds: number; repetitionThreshold: number; maxHistoryTokens: number };
  guardrail: { enableHitl: boolean; hitlTimeoutSeconds: number; blockedPatterns: string[]; approvalPatterns: string[] };
  docker: { image: string; workDir: string; memoryLimit: string };
  debug: boolean;
}

export interface EventTypes {
  'task:started': { taskId: string; description: string };
  'task:completed': { taskId: string; status: TaskStatus };
  'round:started': { taskId: string; roundNum: number };
  'round:completed': { taskId: string; roundNum: number; feedback: FeedbackSignal | null };
  'llm:called': { taskId: string; roundNum: number; context: LLMContext };
  'llm:responded': { taskId: string; roundNum: number; response: LLMResponse };
  'action:parsed': { taskId: string; roundNum: number; action: Action };
  'guardrail:checked': { taskId: string; action: Action; result: GuardrailResult };
  'guardrail:approval_requested': { taskId: string; action: Action; reason: string };
  'guardrail:approval_responded': { taskId: string; approved: boolean };
  'tool:executed': { taskId: string; action: Action; result: unknown };
  'agent:stopped': { taskId: string; reason: string };
  'error': { taskId: string; error: string };
}
