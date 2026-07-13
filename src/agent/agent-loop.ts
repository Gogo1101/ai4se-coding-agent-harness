// src/agent/agent-loop.ts
import type { LLMAdapter } from '../llm/llm-adapter.js';
import type { Guardrail } from '../guardrail/guardrail.js';
import type { HitlStateMachine } from '../guardrail/hitl-state-machine.js';
import type { ToolRouter } from '../tools/tool-router.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { EventBus } from '../event-bus/event-bus.js';
import type { Config, Task, Round, TaskStatus, Action, FeedbackSignal, FailureType } from '../types.js';
import { parseAction } from './action-parser.js';
import { assembleContext } from '../feedback/context-assembler.js';
import { detectRepetition } from '../feedback/repetition-detector.js';
import { classifyFailure } from '../feedback/failure-classifier.js';

export interface AgentLoopDeps {
  llm: LLMAdapter; guardrail: Guardrail; hitl: HitlStateMachine;
  toolRouter: ToolRouter; memory: MemoryStore; bus: EventBus; config: Config;
}

export class AgentLoop {
  constructor(private deps: AgentLoopDeps) {}

  async run(task: Task): Promise<TaskStatus> {
    const { llm, guardrail, hitl, toolRouter, memory, bus, config } = this.deps;
    bus.emit('task:started', { taskId: task.id, description: task.description });
    const containerId = await toolRouter.dockerExec.createContainer(task.id);
    for (const [filename, content] of Object.entries(task.testFiles)) {
      await toolRouter.dockerExec.writeFile(containerId, `${config.docker.workDir}/${filename}`, content);
    }
    const rounds: Round[] = [];
    let currentFailure: FeedbackSignal | undefined;
    try {
      for (let roundNum = 1; roundNum <= config.agent.maxRetries; roundNum++) {
        bus.emit('round:started', { taskId: task.id, roundNum });
        const context = assembleContext({ task: task.description, testFiles: task.testFiles, config, rounds, currentFailure });
        bus.emit('llm:called', { taskId: task.id, roundNum, context });
        const response = await llm.generate(context);
        bus.emit('llm:responded', { taskId: task.id, roundNum, response });
        let action: Action;
        try {
          action = parseAction(response.content);
        } catch {
          action = response.action;
        }
        bus.emit('action:parsed', { taskId: task.id, roundNum, action });
        const gr = guardrail.checkAction(action);
        bus.emit('guardrail:checked', { taskId: task.id, action, result: gr });
        if (gr.decision === 'BLOCK') {
          currentFailure = { total: 0, passed: 0, failed: 0, failures: [], failureType: 'RUNTIME_ERROR', rawReport: `Blocked: ${gr.reason}` };
          const r: Round = { id: 0, taskId: task.id, roundNum, codeFiles: {}, action, feedback: currentFailure, failureType: 'RUNTIME_ERROR', createdAt: new Date().toISOString() };
          rounds.push(r); memory.saveRound(r); bus.emit('round:completed', { taskId: task.id, roundNum, feedback: currentFailure }); continue;
        }
        if (gr.decision === 'REQUIRE_APPROVAL') {
          hitl.requestApproval(task.id, action, gr.reason);
          await new Promise<void>((resolve) => { const h = (p: { taskId: string }) => { if (p.taskId === task.id) { bus.off('guardrail:approval_responded', h); resolve(); } }; bus.on('guardrail:approval_responded', h); });
          hitl.reset();
        }
        const result = await toolRouter.dispatch(action, containerId) as { feedbackSignal?: FeedbackSignal };
        bus.emit('tool:executed', { taskId: task.id, action, result });
        let roundFeedback: FeedbackSignal | null = null;
        let failureType: FailureType | null = null;
        if (action.type === 'run_tests' && result.feedbackSignal) {
          roundFeedback = result.feedbackSignal;
          failureType = classifyFailure(roundFeedback);
          if (roundFeedback.failed === 0) {
            const r: Round = { id: 0, taskId: task.id, roundNum, codeFiles: {}, action, feedback: roundFeedback, failureType, createdAt: new Date().toISOString() };
            rounds.push(r); memory.saveRound(r);
            bus.emit('round:completed', { taskId: task.id, roundNum, feedback: roundFeedback });
            memory.updateTaskStatus(task.id, 'success');
            bus.emit('task:completed', { taskId: task.id, status: 'success' });
            return 'success';
          }
          currentFailure = roundFeedback;
        }
        const r: Round = { id: 0, taskId: task.id, roundNum, codeFiles: {}, action, feedback: roundFeedback, failureType, createdAt: new Date().toISOString() };
        rounds.push(r); memory.saveRound(r);
        bus.emit('round:completed', { taskId: task.id, roundNum, feedback: roundFeedback });
        if (detectRepetition(rounds, config.agent.repetitionThreshold)) {
          bus.emit('agent:stopped', { taskId: task.id, reason: 'Repetition detected' });
          memory.updateTaskStatus(task.id, 'failure');
          bus.emit('task:completed', { taskId: task.id, status: 'failure' });
          return 'failure';
        }
      }
      bus.emit('agent:stopped', { taskId: task.id, reason: `Max retries (${config.agent.maxRetries}) reached` });
      memory.updateTaskStatus(task.id, 'failure');
      bus.emit('task:completed', { taskId: task.id, status: 'failure' });
      return 'failure';
    } finally { await toolRouter.dockerExec.remove(containerId); }
  }
}
