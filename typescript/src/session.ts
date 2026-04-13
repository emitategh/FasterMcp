/**
 * AsyncQueue — unbounded async FIFO queue.
 * enqueue() pushes; dequeue() returns a promise that resolves
 * when an item is available.
 */
export class AsyncQueue<T> {
  private _buffer: T[] = [];
  private _waiters: Array<(value: T) => void> = [];

  enqueue(item: T): void {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(item);
    } else {
      this._buffer.push(item);
    }
  }

  dequeue(): Promise<T> {
    const item = this._buffer.shift();
    if (item !== undefined) {
      return Promise.resolve(item);
    }
    return new Promise<T>((resolve) => {
      this._waiters.push(resolve);
    });
  }
}

/**
 * PendingRequests — track in-flight outbound requests
 * and correlate responses by requestId.
 */
export class PendingRequests {
  private _counter = 0n;
  private _pending = new Map<bigint, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  nextId(): bigint {
    this._counter += 1n;
    return this._counter;
  }

  create(requestId: bigint): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
    });
  }

  resolve(requestId: bigint, result: unknown): void {
    const entry = this._pending.get(requestId);
    if (entry) {
      this._pending.delete(requestId);
      entry.resolve(result);
    }
  }

  reject(requestId: bigint, error: Error): void {
    const entry = this._pending.get(requestId);
    if (entry) {
      this._pending.delete(requestId);
      entry.reject(error);
    }
  }

  cancelAll(): void {
    for (const entry of this._pending.values()) {
      entry.reject(new Error("cancelled"));
    }
    this._pending.clear();
  }

  rejectAll(error: Error): void {
    for (const entry of this._pending.values()) {
      entry.reject(error);
    }
    this._pending.clear();
  }
}

/**
 * NotificationRegistry — fan-out notification callbacks
 * keyed by notification type name.
 */
export class NotificationRegistry {
  private _handlers = new Map<string, Array<(payload: string) => void | Promise<void>>>();

  register(type: string, handler: (payload: string) => void | Promise<void>): void {
    let list = this._handlers.get(type);
    if (!list) {
      list = [];
      this._handlers.set(type, list);
    }
    list.push(handler);
  }

  async dispatch(type: string, payload: string): Promise<void> {
    const list = this._handlers.get(type);
    if (!list) return;
    for (const handler of list) {
      await handler(payload);
    }
  }
}
