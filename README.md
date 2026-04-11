# FasterMCP (MCP gRPC native)

**MCP over native gRPC.** 17x lower latency than Streamable HTTP.

FasterMCP is a gRPC-native transport for the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP). Instead of JSON-RPC over HTTP, it uses protobuf messages over a persistent bidirectional gRPC stream — the same MCP semantics (tools, resources, prompts, sampling, elicitation), a fundamentally faster wire format.

| | MCP (stdio / Streamable HTTP) | FasterMCP (gRPC) |
|---|---|---|
| Wire format | JSON-RPC over text | Protobuf binary |
| Connection model | HTTP request per call | Persistent bidi stream |
| Type safety | Stringly typed | Fully typed `.proto` |
| Multi-language | Per-SDK JSON-RPC layer | Single `.proto`, generated stubs |
| Latency | ~9ms per call | ~0.5ms per call |

## Quick start

### Server

```python
from mcp_grpc import McpServer

server = McpServer(name="my-server", version="1.0.0")

@server.tool(description="Echo the input back")
async def echo(text: str) -> str:
    return text

server.run(port=50051)
```

### Client

```python
from mcp_grpc import McpClient

async with McpClient("localhost:50051") as client:
    result = await client.list_tools()
    tools = result.items  # ListResult with pagination support

    result = await client.call_tool("echo", {"text": "hello"})
    print(result.content[0].text)  # "hello"
```

### Sampling (LLM completion mid-tool)

Tools can request LLM completions from the client using `ToolContext`:

```python
from mcp_grpc import McpServer, ToolContext

server = McpServer(name="my-server", version="1.0.0")

@server.tool(description="Summarize text using LLM")
async def summarize(text: str, ctx: ToolContext) -> str:
    result = await ctx.sample(
        messages=[{"role": "user", "content": f"Summarize: {text}"}],
        max_tokens=200,
    )
    return result.content.text
```

The client registers a handler to provide the LLM:

```python
async def my_sampling_handler(request):
    # Call your LLM here with request.messages
    return mcp_pb2.SamplingResponse(
        role="assistant",
        content=mcp_pb2.ContentItem(type="text", text="..."),
        model="gpt-4", stop_reason="end",
    )

client = McpClient("localhost:50051")
client.set_sampling_handler(my_sampling_handler)
await client.connect()
```

### Elicitation (user input mid-tool)

Tools can ask the user for input:

```python
@server.tool(description="Deploy to production")
async def deploy(service: str, ctx: ToolContext) -> str:
    response = await ctx.elicit(
        message=f"Deploy {service} to prod?",
        schema='{"type": "object", "properties": {"confirm": {"type": "boolean"}}}',
    )
    if response.action == "accept":
        return f"Deployed {service}"
    return "Cancelled"
```

### Resource templates

```python
@server.resource_template(
    uri_template="file:///{path}",
    description="Read a file by path",
)
async def read_file(path: str) -> str:
    return open(path).read()
```

### Completions

```python
@server.completion("my-prompt")
async def complete_language(argument_name: str, value: str) -> list[str]:
    options = ["english", "spanish", "french", "german"]
    return [o for o in options if o.startswith(value)]
```

### Notifications

```python
# Server emits
server.notify_tools_list_changed()
server.log("info", "Something happened")
server.progress("task-1", 0.5, 1.0)

# Client receives
client.on_notification("tools_list_changed", my_callback)
client.on_notification("log", my_log_handler)

# Client emits
await client.notify_roots_list_changed()

# Server receives
server.on_roots_list_changed(my_handler)
```

## Full MCP feature support

| Feature | Status |
|---|---|
| Tools (list, call) | Supported |
| Resources (list, read, subscribe) | Supported |
| Resource templates | Supported |
| Prompts (list, get) | Supported |
| Completions | Supported |
| Pagination (all list methods) | Supported |
| Sampling (`ctx.sample()`) | Supported |
| Elicitation (`ctx.elicit()`) | Supported |
| Roots | Supported |
| Notifications (bidirectional) | Supported |
| Logging / Progress | Supported |
| Cancellation | Supported |
| Capability negotiation | Supported |
| Ping/Pong | Supported |

## Installation

```bash
cd python
uv sync --extra dev
```

## Tests

```bash
cd python
uv run pytest tests/ -v
```

37 tests covering: tool context injection, sampling/elicitation round-trips, resource templates, completions, pagination, notifications, and full gRPC integration over loopback.

## Benchmark: FasterMCP vs FastMCP (Streamable HTTP)

A latency benchmark comparing FasterMCP (gRPC) against [FastMCP](https://gofastmcp.com/) (Streamable HTTP). Both servers run the same `echo` tool — the difference is purely transport overhead.

### Run it

```bash
cd benchmark
uv sync
uv run python run_benchmark.py
```

Options:

```
-n, --calls N    Number of measured calls per transport (default: 1000)
```

### Results (Windows 11, loopback, 1000 sequential calls)

```
Transport             p50      p95      p99      min      max     mean    stdev
-------------------------------------------------------------------------------
FasterMCP (gRPC)    0.55ms    0.70ms    0.81ms    0.42ms    1.18ms    0.58ms    0.09ms
FastMCP (HTTP)      9.68ms   14.06ms   18.22ms    7.59ms   35.72ms   10.40ms    3.20ms
```

**FasterMCP is ~17x faster at p50 and ~22x faster at p99.** The gRPC binary transport over a persistent bidi stream eliminates HTTP connection overhead and JSON encoding on every call.

## Project structure

```
FasterMCP/
├── proto/mcp.proto              <- Protocol definition (single source of truth)
├── python/
│   ├── src/mcp_grpc/
│   │   ├── server.py            <- McpServer, ToolContext, decorator API, gRPC servicer
│   │   ├── client.py            <- McpClient, ListResult, sampling/elicitation handlers
│   │   ├── session.py           <- PendingRequests, NotificationRegistry
│   │   ├── errors.py            <- McpError
│   │   └── testing.py           <- InProcessChannel for unit tests
│   └── tests/                   <- 37 tests (unit + integration)
├── benchmark/
│   ├── run_benchmark.py         <- Latency harness
│   ├── grpc_server.py           <- FasterMCP echo server (gRPC)
│   └── fastmcp_server.py        <- FastMCP echo server (Streamable HTTP)
└── docs/superpowers/
    ├── specs/                   <- Design specs
    └── plans/                   <- Implementation plans
```

## Design

- **One service, one bidi streaming RPC.** `Session(stream ClientEnvelope) returns (stream ServerEnvelope)` carries all messages — mirroring MCP's duplex channel.
- **Write-queue servicer.** Concurrent reader/writer tasks per session. Enables notifications (server push), sampling/elicitation (mid-handler server-to-client requests), and concurrent tool execution.
- **ToolContext dependency injection.** Tool handlers that declare `ctx: ToolContext` get sampling/elicitation capabilities injected automatically. Tools without it work unchanged.
- **Protobuf envelopes with `oneof`.** Each envelope carries a `request_id` and one message type. The SDK handles correlation transparently via `PendingRequests` (same pattern as the official MCP SDK's `BaseSession`).

See [design spec](docs/superpowers/specs/2026-04-10-mcp-grpc-design.md) for the full protocol definition.

## Status

**Python SDK: feature-complete with full MCP spec parity.** Integrated into a [LiveKit](https://livekit.io/) voice agent for low-latency tool calling.

Next steps: TypeScript SDK, TLS/mTLS, PyPI packaging, CI pipeline.
