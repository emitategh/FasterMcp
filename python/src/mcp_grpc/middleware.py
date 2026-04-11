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


class TimingMiddleware(Middleware):
    """Logs elapsed wall-clock time for every tool call.

    Default logger: ``mcp_grpc.timing`` at INFO level.
    """

    def __init__(
        self,
        logger: logging.Logger | None = None,
        log_level: int = logging.INFO,
    ) -> None:
        self._logger = logger or logging.getLogger("mcp_grpc.timing")
        self._log_level = log_level

    async def on_tool_call(
        self,
        tool_ctx: ToolCallContext,
        call_next: CallNext,
    ) -> mcp_pb2.CallToolResponse:
        start = time.perf_counter()
        result = await call_next(tool_ctx)
        elapsed_ms = (time.perf_counter() - start) * 1000
        self._logger.log(
            self._log_level,
            "%s completed in %.2fms",
            tool_ctx.tool_name,
            elapsed_ms,
        )
        return result


class LoggingMiddleware(Middleware):
    """Logs tool name + arguments before, and is_error status after, every call.

    Default logger: ``mcp_grpc.requests`` at INFO level.
    """

    def __init__(
        self,
        logger: logging.Logger | None = None,
        log_level: int = logging.INFO,
    ) -> None:
        self._logger = logger or logging.getLogger("mcp_grpc.requests")
        self._log_level = log_level

    async def on_tool_call(
        self,
        tool_ctx: ToolCallContext,
        call_next: CallNext,
    ) -> mcp_pb2.CallToolResponse:
        self._logger.log(
            self._log_level,
            "tool=%s args=%r",
            tool_ctx.tool_name,
            tool_ctx.arguments,
        )
        result = await call_next(tool_ctx)
        self._logger.log(
            self._log_level,
            "tool=%s is_error=%s",
            tool_ctx.tool_name,
            result.is_error,
        )
        return result
