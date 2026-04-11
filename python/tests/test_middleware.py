"""Unit tests for middleware core types (no gRPC required)."""
from __future__ import annotations

import pytest

from mcp_grpc._generated import mcp_pb2
from mcp_grpc.middleware import Middleware, ToolCallContext


def _ok(text: str) -> mcp_pb2.CallToolResponse:
    return mcp_pb2.CallToolResponse(
        content=[mcp_pb2.ContentItem(type="text", text=text)],
        is_error=False,
    )


def test_tool_call_context_fields():
    """ToolCallContext stores tool_name, arguments, and ctx."""
    tc = ToolCallContext(tool_name="add", arguments={"a": 1, "b": 2}, ctx=None)
    assert tc.tool_name == "add"
    assert tc.arguments == {"a": 1, "b": 2}
    assert tc.ctx is None


@pytest.mark.asyncio
async def test_base_middleware_passes_through():
    """Default Middleware.on_tool_call forwards to call_next unchanged."""
    mw = Middleware()
    tc = ToolCallContext(tool_name="echo", arguments={"text": "hi"}, ctx=None)
    expected = _ok("hi")

    async def call_next(t: ToolCallContext) -> mcp_pb2.CallToolResponse:
        assert t is tc
        return expected

    result = await mw.on_tool_call(tc, call_next)
    assert result is expected
