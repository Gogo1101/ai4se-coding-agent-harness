import { EventEmitter } from 'events';
import type { EventTypes } from '../types.js';

type EventHandler<K extends keyof EventTypes> = (payload: EventTypes[K]) => void;

export class EventBus extends EventEmitter {
  emit<K extends keyof EventTypes>(event: K, payload: EventTypes[K]): boolean {
    if (event === 'error' && this.listenerCount('error') === 0) {
      return false;
    }
    return super.emit(event, payload);
  }
  on<K extends keyof EventTypes>(event: K, handler: EventHandler<K>): this {
    return super.on(event, handler);
  }
  off<K extends keyof EventTypes>(event: K, handler: EventHandler<K>): this {
    return super.off(event, handler);
  }
  once<K extends keyof EventTypes>(event: K, handler: EventHandler<K>): this {
    return super.once(event, handler);
  }
}
