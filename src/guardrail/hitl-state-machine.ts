// src/guardrail/hitl-state-machine.ts
import type { EventBus } from '../event-bus/event-bus.js';
import type { Action } from '../types.js';

export type HitlState = 'IDLE' | 'WAITING' | 'APPROVED' | 'REJECTED';

export class HitlStateMachine {
  private state: HitlState = 'IDLE';
  private currentTaskId: string | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(private bus: EventBus, private timeoutSeconds: number) {}

  getState(): HitlState { return this.state; }

  requestApproval(taskId: string, action: Action, reason: string): void {
    if (this.state !== 'IDLE') throw new Error(`Cannot request approval in state ${this.state}`);
    this.state = 'WAITING';
    this.currentTaskId = taskId;
    this.bus.emit('guardrail:approval_requested', { taskId, action, reason });
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.timeoutHandle = setTimeout(() => {
      if (this.state === 'WAITING' && this.currentTaskId) this.reject(this.currentTaskId);
    }, this.timeoutSeconds * 1000);
  }

  approve(taskId: string): void {
    if (this.state !== 'WAITING' || this.currentTaskId !== taskId) throw new Error(`Cannot approve in state ${this.state}`);
    this.state = 'APPROVED';
    this.clearTimeout();
    this.bus.emit('guardrail:approval_responded', { taskId, approved: true });
  }

  reject(taskId: string): void {
    if (this.state !== 'WAITING' || this.currentTaskId !== taskId) throw new Error(`Cannot reject in state ${this.state}`);
    this.state = 'REJECTED';
    this.clearTimeout();
    this.bus.emit('guardrail:approval_responded', { taskId, approved: false });
  }

  reset(): void { this.state = 'IDLE'; this.currentTaskId = null; this.clearTimeout(); }
  private clearTimeout(): void { if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; } }
}
