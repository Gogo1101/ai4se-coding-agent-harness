import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/event-bus/event-bus.js';

describe('EventBus', () => {
  it('emits and receives events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('task:started', handler);
    bus.emit('task:started', { taskId: 't1', description: 'test task' });
    expect(handler).toHaveBeenCalledWith({ taskId: 't1', description: 'test task' });
  });

  it('supports multiple listeners', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('round:completed', h1);
    bus.on('round:completed', h2);
    bus.emit('round:completed', { taskId: 't1', roundNum: 1, feedback: null });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('off removes a listener', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('error', handler);
    bus.off('error', handler);
    bus.emit('error', { taskId: 't1', error: 'oops' });
    expect(handler).not.toHaveBeenCalled();
  });
});
