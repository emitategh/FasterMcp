"""Middleware system for FasterMCP tool call interception."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from mcp_grpc._generated import mcp_pb2

if TYPE_CHECKING:
    # Context is imported only for type-checking to avoid a circular import:
    # server.py imports Middleware; middleware.py needs Context for ToolCallContext.
    # With `from __future__ import annotations`, all annotations are strings at
    # runtime so Python never resolves this import during normal execution.
    from mcp_grpc.server import Context

# Type alias for the next handler in the chain.
CallNext = Callable[["ToolCallContext"], Awaitable[mcp_pb2.CallToolResponse]]


@dataclass
class ToolCallContext:
    """Passed to every middleware on each tool invocation.

    ctx is None when the tool handler did not declare `ctx: Context` in its
    signature. FasterMCP constructs Context explicitly per-call (not via a
    ContextVar), so middleware only receives it when the tool opted in.
    """

    tool_name: str
    arguments: dict[str, Any]
    ctx: Context | None


class Middleware:
    """Base class for FasterMCP middleware.

    Override on_tool_call to intercept tool invocations.
    The default passes through to the next handler unchanged.
    """

    async def on_tool_call(
        self,
        tool_ctx: ToolCallContext,
        call_next: CallNext,
    ) -> mcp_pb2.CallToolResponse:
        return await call_next(tool_ctx)
