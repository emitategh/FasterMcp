/**
 * LangChain integration — MCPToolkit for RapidMCP gRPC servers.
 *
 * Wraps the rapidmcp Client and exposes MCP tools as LangChain
 * DynamicStructuredTool instances for use with createReactAgent.
 *
 * Requires @langchain/core as a peer dependency:
 *   npm install @langchain/core
 *
 * Usage:
 *   import { MCPToolkit } from "rapidmcp/integrations/langchain";
 *   const toolkit = new MCPToolkit("mcp-server:50051");
 *   await toolkit.connect();
 *   const tools = await toolkit.getTools();
 *   await toolkit.close();
 */

import { Client } from "../client.js";
import type { Tool, CallToolResult, ListResult } from "../types.js";
import type { ClientOptions } from "../auth.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// JSON Schema → Zod shape (top-level properties only, covers all real MCP tools)
// ---------------------------------------------------------------------------

function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodObject<z.ZodRawShape> {
  const props = (schema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((schema["required"] ?? []) as string[]);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(props)) {
    let zodType: z.ZodTypeAny;
    switch (prop["type"]) {
      case "string":
        zodType = z.string();
        break;
      case "integer":
        zodType = z.number().int();
        break;
      case "number":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.unknown());
        break;
      case "object":
        zodType = z.record(z.string(), z.unknown());
        break;
      default:
        zodType = z.unknown();
    }
    if (prop["description"]) {
      zodType = zodType.describe(prop["description"] as string);
    }
    shape[key] = required.has(key) ? zodType : zodType.optional();
  }

  return z.object(shape);
}

// ---------------------------------------------------------------------------
// CallToolResult → string for LangChain ToolMessage.content
// ---------------------------------------------------------------------------

function convertResult(result: CallToolResult): string {
  if (result.isError) {
    const text = result.content
      .map((c) => c.text)
      .filter(Boolean)
      .join(" ");
    return `Error: ${text || "Tool returned an error with no message"}`;
  }
  return result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// MCPToolkit
// ---------------------------------------------------------------------------

export class MCPToolkit {
  private _client: Client;

  /**
   * @param address  gRPC server address, e.g. "mcp-server:50051"
   * @param opts     Optional ClientOptions (token, tls, requestTimeout)
   */
  constructor(address: string, opts: ClientOptions = {}) {
    this._client = new Client(address, opts);
  }

  /** The underlying Client instance — use for sampling/elicitation handlers, ping, etc. */
  get client(): Client {
    return this._client;
  }

  /** Connect to the MCP server. Must be called before getTools(). */
  async connect(): Promise<void> {
    await this._client.connect();
  }

  /** Close the gRPC connection. */
  async close(): Promise<void> {
    await this._client.close();
  }

  /**
   * Fetch all tools from the server (follows pagination automatically) and
   * return them as LangChain DynamicStructuredTool instances.
   *
   * Requires @langchain/core to be installed: npm install @langchain/core
   */
  async getTools(): Promise<object[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DSTool: any;
    try {
      ({ DynamicStructuredTool: DSTool } = await import("@langchain/core/tools"));
    } catch {
      throw new Error(
        "@langchain/core is required for MCPToolkit.getTools().\n" +
          "Install it with: npm install @langchain/core",
      );
    }

    const tools: object[] = [];
    let cursor: string | undefined;

    while (true) {
      const result: ListResult<Tool> = await this._client.listTools(cursor);
      for (const mcpTool of result.items) {
        const schema = jsonSchemaToZod(mcpTool.inputSchema);
        const client = this._client;
        const name = mcpTool.name;
        tools.push(
          new DSTool({
            name,
            description: mcpTool.description ?? "",
            schema,
            func: async (args: Record<string, unknown>) => {
              const callResult = await client.callTool(name, args);
              return convertResult(callResult);
            },
          }),
        );
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    return tools;
  }
}
