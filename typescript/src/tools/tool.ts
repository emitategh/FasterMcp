import type { ZodType } from "zod";

export interface ToolAnnotationsConfig {
  title?: string;
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  openWorld?: boolean;
}

export interface ToolConfig<T = any> {
  name: string;
  description?: string;
  parameters?: ZodType<T>;
  annotations?: ToolAnnotationsConfig;
  execute: (args: T, ctx: any) => Promise<unknown>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: string;
  outputSchema: string;
  handler: (args: any, ctx: any) => Promise<unknown>;
  annotations?: ToolAnnotationsConfig;
  zodSchema?: ZodType;
}
