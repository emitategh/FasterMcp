import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolManager } from "../src/tools/tool-manager.js";

describe("ToolManager", () => {
  it("registers and lists a tool", () => {
    const tm = new ToolManager();
    tm.addTool({
      name: "greet",
      description: "Say hello",
      parameters: z.object({ name: z.string() }),
      execute: async (args) => `Hello, ${args.name}!`,
    });
    const tools = tm.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("greet");
    expect(tools[0].description).toBe("Say hello");
  });

  it("generates JSON schema from Zod", () => {
    const tm = new ToolManager();
    tm.addTool({
      name: "add",
      description: "Add numbers",
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: async (args) => String(args.a + args.b),
    });
    const tools = tm.listTools();
    const schema = JSON.parse(tools[0].inputSchema);
    expect(schema.type).toBe("object");
    expect(schema.properties.a.type).toBe("number");
    expect(schema.properties.b.type).toBe("number");
    expect(schema.required).toContain("a");
    expect(schema.required).toContain("b");
  });

  it("registers tool without parameters", () => {
    const tm = new ToolManager();
    tm.addTool({
      name: "ping",
      description: "Ping",
      execute: async () => "pong",
    });
    const tools = tm.listTools();
    expect(tools[0].inputSchema).toBe("{}");
  });

  it("registers tool with annotations", () => {
    const tm = new ToolManager();
    tm.addTool({
      name: "read",
      description: "Read data",
      annotations: { readOnly: true, title: "Reader" },
      execute: async () => "data",
    });
    const tools = tm.listTools();
    expect(tools[0].annotations?.readOnly).toBe(true);
    expect(tools[0].annotations?.title).toBe("Reader");
  });

  it("calls a tool and returns string result", async () => {
    const tm = new ToolManager();
    tm.addTool({
      name: "echo",
      description: "Echo",
      parameters: z.object({ text: z.string() }),
      execute: async (args) => args.text,
    });
    const result = await tm.callTool("echo", { text: "hi" }, null as any);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe("hi");
    expect(result.isError).toBe(false);
  });

  it("returns error for unknown tool", async () => {
    const tm = new ToolManager();
    await expect(tm.callTool("nope", {}, null as any)).rejects.toThrow("not found");
  });

  it("catches tool exceptions and returns is_error=true", async () => {
    const tm = new ToolManager();
    tm.addTool({
      name: "fail",
      description: "Fails",
      execute: async () => { throw new Error("boom"); },
    });
    const result = await tm.callTool("fail", {}, null as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("boom");
  });
});
