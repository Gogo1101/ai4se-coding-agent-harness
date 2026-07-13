// tests/hitl-state-machine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HitlStateMachine } from '../src/guardrail/hitl-state-machine.js';
import { EventBus } from '../src/event-bus/event-bus.js';
import type { Action } from '../src/types.js';

const action: Action = { type: 'run_shell', command: 'sudo apt update' };

describe('HitlStateMachine', () => {
  it('starts in IDLE state', () => {
    expect(new HitlStateMachine(new EventBus(), 30).getState()).toBe('IDLE');
  });
  it('transitions IDLE -> WAITING on requestApproval', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    const spy = vi.spyOn(bus, 'emit');
    sm.requestApproval('task1', action, 'sudo detected');
    expect(sm.getState()).toBe('WAITING');
    expect(spy).toHaveBeenCalledWith('guardrail:approval_requested', { taskId: 'task1', action, reason: 'sudo detected' });
  });
  it('transitions WAITING -> APPROVED on approve', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    sm.requestApproval('task1', action, 'sudo detected');
    sm.approve('task1');
    expect(sm.getState()).toBe('APPROVED');
  });
  it('transitions WAITING -> REJECTED on reject', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    sm.requestApproval('task1', action, 'sudo detected');
    sm.reject('task1');
    expect(sm.getState()).toBe('REJECTED');
  });
  it('resets to IDLE after resolution', () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 30);
    sm.requestApproval('task1', action, 'sudo detected');
    sm.approve('task1');
    sm.reset();
    expect(sm.getState()).toBe('IDLE');
  });
  it('auto-rejects on timeout', async () => {
    const bus = new EventBus();
    const sm = new HitlStateMachine(bus, 0.1);
    sm.requestApproval('task1', action, 'sudo detected');
    await new Promise(r => setTimeout(r, 200));
    expect(sm.getState()).toBe('REJECTED');
  });
});
