# @emitate/rapidmcp

> TypeScript / Node.js SDK for RapidMCP — gRPC-native MCP. ~17x lower latency than Streamable HTTP.

[![npm version](https://img.shields.io/npm/v/@emitate/rapidmcp.svg)](https://www.npmjs.com/package/@emitate/rapidmcp)

## Install

```bash
npm install @emitate/rapidmcp
```

## Requirements

- Node.js 22+
- `"type": "module"` in your `package.json`
- TypeScript tsconfig with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` (see [tsconfig setup](#tsconfig-setup))

## Quick start: Server

```typescript
import { RapidMCP } from "@emitate/rapidmcp";
import { z } from "zod";

const server = new RapidMCP({ name: "my-server", version: "1.0.0" });

server.addTool({
  name: "echo",
  description: "Echo text back unchanged",
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => text,
});

await server.listen({ port: 50051, host: "0.0.0.0" });
```

## Quick start: Client

```typescript
import { Client } from "@emitate/rapidmcp";

const client = new Client();
await client.connect("localhost:50051");

const tools = await client.listTools();
const result = await client.callTool("echo", { text: "hello" });
console.log(result.content[0].text); // "hello"

await client.close();
```

## LangChain / LangGraph

```typescript
import { MCPToolkit } from "@emitate/rapidmcp/integrations/langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const toolkit = new MCPToolkit("localhost:50051");
await toolkit.connect();

const tools = await toolkit.getTools();
const agent = createReactAgent({
  llm: new ChatAnthropic({ model: "claude-sonnet-4-6" }),
  tools,
});
const result = await agent.invoke({
  messages: [{ role: "user", content: "Add 17 and 25" }],
});

await toolkit.close();
```

Peer dependency: `npm install @langchain/core @langchain/anthropic @langchain/langgraph`

## Context features

### Logging

```typescript
import { RapidMCP, Context } from "@emitate/rapidmcp";
import { z } from "zod";

const server = new RapidMCP({ name: "my-server", version: "1.0.0" });

server.addTool({
  name: "log_demo",
  description: "Demo server-to-client logging",
  parameters: z.object({}),
  execute: async (_args: Record<string, never>, ctx: Context) => {
    ctx.log.debug("debug: low-level detail");
    ctx.log.info("info: normal operation");
    ctx.log.warning("warning: something to watch");
    ctx.log.error("error: something went wrong");
    return "done";
  },
});
```

### Progress reporting

```typescript
server.addTool({
  name: "long_task",
  description: "Task with progress",
  parameters: z.object({ steps: z.number().int() }),
  execute: async ({ steps }: { steps: number }, ctx: Context) => {
    for (let i = 1; i <= steps; i++) {
      ctx.reportProgress(i, steps);
      await new Promise<void>((r) => setTimeout(r, 100));
    }
    return `Completed ${steps} steps`;
  },
});
```

### Sampling (LLM completion mid-tool)

```typescript
server.addTool({
  name: "summarize",
  description: "Summarize text via LLM",
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }: { text: string }, ctx: Context) => {
    const response = await ctx.sample({
      messages: [
        { role: "user", content: [{ type: "text", text: `Summarize: ${text}` }] },
      ],
      maxTokens: 200,
    }) as { content?: Array<{ text?: string }> } | null;
    return response?.content?.[0]?.text ?? "No summary";
  },
});
```

### Elicitation (user input mid-tool)

```typescript
server.addTool({
  name: "confirm_action",
  description: "Perform action after user confirmation",
  parameters: z.object({ action: z.string() }),
  execute: async ({ action }: { action: string }, ctx: Context) => {
    const result = await ctx.elicit(`Confirm: ${action}`, {
      type: "object",
      properties: {
        confirm: { type: "boolean", title: "Confirm?" },
      },
      required: ["confirm"],
    });
    if (result.action === "accept") {
      const data = JSON.parse(result.content) as { confirm?: boolean };
      if (data.confirm) return `Executed: ${action}`;
    }
    return `Declined: ${action}`;
  },
});
```

## Middleware

```typescript
import {
  RapidMCP,
  TimingMiddleware,
  LoggingMiddleware,
  TimeoutMiddleware,
  ValidationMiddleware,
} from "@emitate/rapidmcp";

const server = new RapidMCP({ name: "my-server", version: "1.0.0" });
server.use(new TimingMiddleware());        // logs "echo completed in 0.52ms"
server.use(new LoggingMiddleware());      // logs args before, is_error after
server.use(new TimeoutMiddleware(5000));  // rejects tool calls after 5000ms
server.use(new ValidationMiddleware());  // validates args against JSON schema
```

## Resources & Prompts

```typescript
// Static resource
server.addResource({
  uri: "res://config",
  name: "config",
  description: "Server configuration",
  mimeType: "application/json",
  load: async () => ({ text: JSON.stringify({ debug: true, maxRetries: 3 }) }),
});

// Resource template
server.addResourceTemplate({
  uriTemplate: "res://items/{id}",
  name: "item",
  description: "Fetch item by ID",
  mimeType: "application/json",
  load: async (args: Record<string, string>) => ({
    text: JSON.stringify({ id: args["id"], status: "active" }),
  }),
});

// Prompt with argument completion
server.addPrompt({
  name: "greet",
  description: "Generate a greeting",
  arguments: [
    { name: "name", description: "Name to greet", required: true },
    {
      name: "style",
      description: "Greeting style",
      required: false,
      complete: async (value: string) => ({
        values: ["formal", "casual", "pirate"].filter((s) => s.startsWith(value)),
      }),
    },
  ],
  load: async (args: Record<string, string>) => {
    const { name, style = "formal" } = args;
    const greetings: Record<string, string> = {
      formal: `Dear ${name}, I hope this message finds you well.`,
      casual: `Hey ${name}! What's up?`,
      pirate: `Ahoy, ${name}! Shiver me timbers!`,
    };
    return greetings[style] ?? `Hello, ${name}!`;
  },
});
```

## tsconfig setup

Minimum required configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

Also required in `package.json`:

```json
{
  "type": "module"
}
```

## Development

```bash
npm run build   # compile TypeScript → dist/
npm test        # run tests (vitest)
```

## License

MIT
