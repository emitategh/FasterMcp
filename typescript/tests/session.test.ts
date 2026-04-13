import { describe, it, expect, vi } from "vitest";
import { AsyncQueue, PendingRequests, NotificationRegistry } from "../src/session.js";

// ── AsyncQueue ───────────────────────────────────────────

describe("AsyncQueue", () => {
  it("dequeues items in FIFO order", async () => {
    const q = new AsyncQueue<number>();
    q.enqueue(1);
    q.enqueue(2);
    expect(await q.dequeue()).toBe(1);
    expect(await q.dequeue()).toBe(2);
  });

  it("dequeue waits when empty", async () => {
    const q = new AsyncQueue<string>();
    const promise = q.dequeue();
    let resolved = false;
    promise.then(() => { resolved = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);
    q.enqueue("hello");
    expect(await promise).toBe("hello");
  });

  it("enqueue before dequeue works", async () => {
    const q = new AsyncQueue<number>();
    q.enqueue(42);
    expect(await q.dequeue()).toBe(42);
  });
});

// ── PendingRequests ──────────────────────────────────────

describe("PendingRequests", () => {
  it("generates monotonically increasing IDs", () => {
    const pr = new PendingRequests();
    const a = pr.nextId();
    const b = pr.nextId();
    expect(b).toBe(a + 1n);
  });

  it("resolves a pending request", async () => {
    const pr = new PendingRequests();
    const id = pr.nextId();
    const promise = pr.create(id);
    pr.resolve(id, "result");
    expect(await promise).toBe("result");
  });

  it("rejects a pending request", async () => {
    const pr = new PendingRequests();
    const id = pr.nextId();
    const promise = pr.create(id);
    pr.reject(id, new Error("fail"));
    await expect(promise).rejects.toThrow("fail");
  });

  it("cancelAll cancels all pending requests", async () => {
    const pr = new PendingRequests();
    const id1 = pr.nextId();
    const id2 = pr.nextId();
    const p1 = pr.create(id1);
    const p2 = pr.create(id2);
    pr.cancelAll();
    await expect(p1).rejects.toThrow("cancelled");
    await expect(p2).rejects.toThrow("cancelled");
  });

  it("rejectAll rejects all pending with given error", async () => {
    const pr = new PendingRequests();
    const id1 = pr.nextId();
    const id2 = pr.nextId();
    const p1 = pr.create(id1);
    const p2 = pr.create(id2);
    pr.rejectAll(new Error("stream died"));
    await expect(p1).rejects.toThrow("stream died");
    await expect(p2).rejects.toThrow("stream died");
  });

  it("resolve on unknown id is a no-op", () => {
    const pr = new PendingRequests();
    expect(() => pr.resolve(999n, "x")).not.toThrow();
  });
});

// ── NotificationRegistry ─────────────────────────────────

describe("NotificationRegistry", () => {
  it("dispatches to registered handlers", async () => {
    const reg = new NotificationRegistry();
    const calls: string[] = [];
    reg.register("tools_list_changed", (payload) => { calls.push(payload); });
    await reg.dispatch("tools_list_changed", "data");
    expect(calls).toEqual(["data"]);
  });

  it("fans out to multiple handlers", async () => {
    const reg = new NotificationRegistry();
    const calls: number[] = [];
    reg.register("log", () => { calls.push(1); });
    reg.register("log", () => { calls.push(2); });
    await reg.dispatch("log", "");
    expect(calls).toEqual([1, 2]);
  });

  it("handles async handlers", async () => {
    const reg = new NotificationRegistry();
    let called = false;
    reg.register("progress", async () => {
      await new Promise((r) => setTimeout(r, 5));
      called = true;
    });
    await reg.dispatch("progress", "");
    expect(called).toBe(true);
  });

  it("dispatch to unregistered type is a no-op", async () => {
    const reg = new NotificationRegistry();
    await expect(reg.dispatch("unknown", "")).resolves.toBeUndefined();
  });
});
