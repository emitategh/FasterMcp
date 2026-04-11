# Bidirectional Messaging Architecture

How `Context`, the reader/writer tasks, and the write queue work together to enable
mid-execution server-to-client requests (sampling, elicitation, roots) over a single
gRPC bidi stream.

---

## The core problem

A gRPC bidi streaming RPC is an `async generator` on both ends. The server must `yield`
envelopes to the client while simultaneously receiving envelopes from the client via an
async iterator. The challenge: **a tool handler running mid-execution needs to send a
message to the client and wait for a reply** — sampling, elicitation, roots — all while
the stream is already flowing.

You can't `yield` from inside a tool handler because `yield` belongs to the outer
generator. You need a way for any coroutine in the call stack to inject a message onto
the stream.

The solution is to **decouple reading and writing** using a shared queue.

---

## Three-layer architecture

### Layer 1: The write queue — shared message bus (`_servicer.py`)

```python
write_queue: asyncio.Queue[mcp_pb2.ServerEnvelope] = asyncio.Queue()
```

This is the single shared object spanning the entire session. Anyone holding a reference
to `write_queue` can send a message to the client via `await write_queue.put(envelope)`,
regardless of whether the caller is:

- the reader task processing an incoming request
- a tool handler running concurrently as its own asyncio Task
- a `Context` method inside a tool doing a mid-execution sampling call

They all write to the same queue; the writer drains it onto the stream.

---

### Layer 2: Reader and writer tasks — concurrency (`_servicer.py`)

`Session()` is an async generator method (it `yield`s). gRPC requires it to both receive
from `request_iterator` and yield `ServerEnvelope`s. These two things can't happen on the
same coroutine simultaneously, so they're split:

**`_writer()` — the generator side**

```python
async def _writer():
    while True:
        envelope = await write_queue.get()
        if envelope is None:   # sentinel: reader is done
            break
        yield envelope
```

`_writer` is an async generator that blocks on `write_queue.get()` and yields whatever
arrives. The outer `Session` method iterates it:

```python
async for envelope in _writer():
    yield envelope     # actual gRPC yield to the client
```

The writer never inspects envelope content — it just drains the queue.

**`_reader()` — the dispatch side**

```python
reader_task = asyncio.create_task(_reader())
```

`_reader` is launched as a background `asyncio.Task`. It consumes the inbound
`request_iterator` and dispatches each message. For most request types (`list_tools`,
`list_resources`, `ping`, etc.) it handles them inline and puts the response directly on
`write_queue`. For `call_tool` it does something different.

**Tool calls are fire-and-forget tasks**

```python
task = asyncio.create_task(_run_tool(rid, req))
_tool_tasks[rid] = task
```

The reader doesn't `await` the tool. It creates a Task and immediately goes back to
listening for more messages. This is what enables **concurrent tool execution** — the
stream is never blocked while a tool runs. Each tool task, when done, puts its result on
`write_queue`:

```python
await write_queue.put(mcp_pb2.ServerEnvelope(request_id=_rid, call_tool=result))
```

**Shutdown sequence**

```
1. Client closes inbound stream → request_iterator exhausts
2. _reader() waits for all in-flight tool tasks (gather)
3. _reader() puts None (sentinel) on write_queue
4. _writer() sees None, breaks → generator ends
5. Session() finally block cancels reader_task, removes write_queue from _session_queues
```

---

### Layer 3: Context — the tool handler's handle (`context.py`)

`Context` is constructed once per tool call, only if the tool declares `ctx: Context` in
its signature:

```python
if tool and tool.needs_context:
    ctx = Context(
        client_capabilities=_caps,
        pending=server_pending,
        write_queue=write_queue,   # same queue as everyone else
    )
```

`Context` holds three things:

| Field | Purpose |
|---|---|
| `_write_queue` | Send messages to the client |
| `_pending` | Track outbound requests and correlate replies |
| `_capabilities` | Gate capabilities (raises if client didn't advertise sampling/elicitation/roots) |

**How sampling works — the future-correlation pattern**

This is the key pattern for any server→client request issued mid-execution:

```
1. ctx.sample() called inside a running tool Task
2. rid = pending.next_id()            # fresh request ID
3. future = pending.create(rid)       # register a Future keyed to that ID
4. write_queue.put(SamplingRequest)   # writer delivers it to client
5. await asyncio.wait_for(future, 30s)  # tool Task suspends here
```

While the tool is suspended, the reader Task is still running and processing incoming
messages. When the client sends a `sampling_reply` envelope, the reader handles it:

```python
elif msg_type == "sampling_reply":
    server_pending.resolve(rid, envelope.sampling_reply)
```

`PendingRequests.resolve()` pops the Future and calls `future.set_result(reply)`. The
tool's `await future` unblocks and execution continues with the LLM response.

The same pattern applies to `elicit()` and `list_roots()`:
**put request on queue → suspend on Future → reader resolves Future when reply arrives.**

**Notifications and logs don't need correlation**

`ctx.info()`, `ctx.report_progress()` put a `ServerNotification` with `request_id=0`
directly on the queue. No Future, no reply expected — fire and forget.

---

### `PendingRequests` — the correlation table (`session.py`)

```python
class PendingRequests:
    def next_id(self) -> int: ...          # monotonic counter
    def create(self, rid) -> Future: ...   # register Future for rid
    def resolve(self, rid, result): ...    # set_result on Future
    def reject(self, rid, error): ...      # set_exception on Future
    def cancel_all(self): ...              # cancel all on disconnect
```

It's a simple dict of `request_id → asyncio.Future`. All operations are safe within a
single asyncio event loop (no locking needed).

---

## Message flow diagram

```
Client                          Server
  |                                |
  |--- InitializeRequest --------> |
  |                           _reader() processes inline
  |                           write_queue.put(InitializeResponse)
  |<-- InitializeResponse ------   |
  |                                |
  |--- InitializedAck -----------> |
  |                           _session_queues.append(write_queue)
  |                                |
  |--- CallTool("summarize") ----> |
  |                           create_task(_run_tool)
  |                           reader keeps listening ↓
  |                                |
  |--- ListTools request --------> | ← handled while tool runs concurrently
  |<-- ListToolsResponse --------  |
  |                                |
  |                           tool calls ctx.sample()
  |                           pending.create(rid=1)
  |                           write_queue.put(SamplingRequest rid=1)
  |<-- SamplingRequest rid=1 ----  |
  |                                |
  |--- SamplingResponse rid=1 ---> |
  |                           reader: pending.resolve(1, response)
  |                           tool's Future unblocks
  |                           tool continues, produces result
  |                           write_queue.put(CallToolResponse rid=original)
  |<-- CallToolResponse ---------  |
```

---

## Key design consequences

- **`write_queue` is the only synchronization point.** No locks, no shared mutable state
  between tasks except the queue and `PendingRequests` (standard dict + asyncio.Future,
  safe within a single event loop).

- **The reader never awaits tool tasks.** Tool tasks can overlap freely. Ten tools can
  run concurrently; each independently puts its reply on the queue when done.

- **`Context` is a per-call object.** It captures the right `write_queue` and `pending`
  for its session. If a tool is called twice concurrently, each invocation gets its own
  `Context` instance but they share the same `write_queue` and `pending` — correct,
  since both are per-session, not per-call.

- **`request_id` is the universal correlation key.** It correlates both client→server
  responses (matched by the client) and server→client mid-handler requests (matched by
  `PendingRequests`). Notifications use `request_id=0` to signal no reply is expected.
