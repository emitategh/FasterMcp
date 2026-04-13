import { describe, it, expect } from "vitest";
import {
  Middleware,
  TimingMiddleware,
  LoggingMiddleware,
  TimeoutMiddleware,
  ValidationMiddleware,
  type ToolCallContext,
  type CallToolResult,
} from "../src/middleware.js";

function makeCtx(toolName: string, args: Record<string, unknown> = {}, inputSchema: Record<string, unknown> | null = null): ToolCallContext {
  return { toolName, arguments: args, ctx: null as any, inputSchema };
}

function okResult(text: string): CallToolResult {
  return { content: [{ type: "text", text, data: new Uint8Array(), mimeType: "", uri: "" }], isError: false };
}

describe("Middleware chain", () => {
  it("base Middleware passes through", async () => {
    const mw = new (class extends Middleware {})();
    const result = await mw.onToolCall(makeCtx("test"), async () => okResult("ok"));
    expect(result.content[0].text).toBe("ok");
  });

  it("chain executes in registration order (first = outermost)", async () => {
    const order: string[] = [];
    class MwA extends Middleware {
      async onToolCall(ctx: ToolCallContext, next: () => Promise<CallToolResult>) {
        order.push("A-before");
        const r = await next();
        order.push("A-after");
        return r;
      }
    }
    class MwB extends Middleware {
      async onToolCall(ctx: ToolCallContext, next: () => Promise<CallToolResult>) {
        order.push("B-before");
        const r = await next();
        order.push("B-after");
        return r;
      }
    }
    const chain = Middleware.buildChain([new MwA(), new MwB()], async () => {
      order.push("handler");
      return okResult("done");
    });
    await chain(makeCtx("test"));
    expect(order).toEqual(["A-before", "B-before", "handler", "B-after", "A-after"]);
  });
});

describe("TimingMiddleware", () => {
  it("passes through and calls next", async () => {
    const mw = new TimingMiddleware();
    const result = await mw.onToolCall(makeCtx("test"), async () => okResult("ok"));
    expect(result.content[0].text).toBe("ok");
  });
});

describe("LoggingMiddleware", () => {
  it("passes through and calls next", async () => {
    const mw = new LoggingMiddleware();
    const result = await mw.onToolCall(makeCtx("test"), async () => okResult("ok"));
    expect(result.content[0].text).toBe("ok");
  });
});

describe("TimeoutMiddleware", () => {
  it("passes through fast calls", async () => {
    const mw = new TimeoutMiddleware({ defaultTimeout: 1000 });
    const result = await mw.onToolCall(makeCtx("test"), async () => okResult("fast"));
    expect(result.content[0].text).toBe("fast");
  });

  it("returns error on timeout", async () => {
    const mw = new TimeoutMiddleware({ defaultTimeout: 10 });
    const result = await mw.onToolCall(makeCtx("slow"), async () => {
      await new Promise((r) => setTimeout(r, 100));
      return okResult("late");
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("timed out");
  });
});

describe("ValidationMiddleware", () => {
  it("passes when args match schema", async () => {
    const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
    const mw = new ValidationMiddleware();
    const result = await mw.onToolCall(makeCtx("test", { name: "hi" }, schema), async () => okResult("ok"));
    expect(result.isError).toBe(false);
  });

  it("rejects missing required args", async () => {
    const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
    const mw = new ValidationMiddleware();
    const result = await mw.onToolCall(makeCtx("test", {}, schema), async () => okResult("ok"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("missing");
  });

  it("rejects unknown args", async () => {
    const schema = { type: "object", properties: { name: { type: "string" } }, required: [] };
    const mw = new ValidationMiddleware();
    const result = await mw.onToolCall(makeCtx("test", { name: "hi", extra: true }, schema), async () => okResult("ok"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unknown");
  });

  it("passes through when no schema", async () => {
    const mw = new ValidationMiddleware();
    const result = await mw.onToolCall(makeCtx("test", {}, null), async () => okResult("ok"));
    expect(result.isError).toBe(false);
  });
});
