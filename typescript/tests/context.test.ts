import { describe, it, expect } from "vitest";
import { Context } from "../src/context.js";
import { AsyncQueue, PendingRequests } from "../src/session.js";

describe("Context", () => {
  it("log.info enqueues a LOG notification", async () => {
    const queue = new AsyncQueue<any>();
    const pending = new PendingRequests();
    const ctx = new Context({ sampling: false, elicitation: false, roots: false }, pending, queue);

    ctx.log.info("hello");

    const envelope = await queue.dequeue();
    expect(envelope.message.$case).toBe("notification");
    const payload = JSON.parse(envelope.message.notification.payload);
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("hello");
  });

  it("log.debug/warning/error all work", async () => {
    const queue = new AsyncQueue<any>();
    const pending = new PendingRequests();
    const ctx = new Context({ sampling: false, elicitation: false, roots: false }, pending, queue);

    ctx.log.debug("d");
    ctx.log.warning("w");
    ctx.log.error("e");

    const e1 = await queue.dequeue();
    expect(JSON.parse(e1.message.notification.payload).level).toBe("debug");
    const e2 = await queue.dequeue();
    expect(JSON.parse(e2.message.notification.payload).level).toBe("warning");
    const e3 = await queue.dequeue();
    expect(JSON.parse(e3.message.notification.payload).level).toBe("error");
  });

  it("reportProgress enqueues a PROGRESS notification", async () => {
    const queue = new AsyncQueue<any>();
    const pending = new PendingRequests();
    const ctx = new Context({ sampling: false, elicitation: false, roots: false }, pending, queue);

    ctx.reportProgress(5, 10);

    const envelope = await queue.dequeue();
    expect(envelope.message.$case).toBe("notification");
    const payload = JSON.parse(envelope.message.notification.payload);
    expect(payload.progress).toBe(5);
    expect(payload.total).toBe(10);
  });

  it("sample throws when client lacks sampling capability", async () => {
    const queue = new AsyncQueue<any>();
    const pending = new PendingRequests();
    const ctx = new Context({ sampling: false, elicitation: false, roots: false }, pending, queue);

    await expect(ctx.sample({ messages: [], maxTokens: 10 })).rejects.toThrow("sampling");
  });

  it("elicit throws when client lacks elicitation capability", async () => {
    const queue = new AsyncQueue<any>();
    const pending = new PendingRequests();
    const ctx = new Context({ sampling: false, elicitation: false, roots: false }, pending, queue);

    await expect(ctx.elicit("confirm?", {})).rejects.toThrow("elicitation");
  });
});
