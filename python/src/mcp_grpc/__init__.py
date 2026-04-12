"""mcp-grpc: gRPC-native tool-calling protocol inspired by MCP."""

__version__ = "0.1.0"

from mcp_grpc.client import Client
from mcp_grpc.content import Audio, Image
from mcp_grpc.context import Context
from mcp_grpc.elicitation import (
    BoolField,
    ElicitationField,
    ElicitationResult,
    EnumField,
    FloatField,
    IntField,
    StringField,
    build_elicitation_schema,
)
from mcp_grpc.errors import McpError, ToolError
from mcp_grpc.middleware import (
    LoggingMiddleware,
    Middleware,
    TimeoutMiddleware,
    TimingMiddleware,
    ToolCallContext,
    ValidationMiddleware,
)
from mcp_grpc.server import FasterMCP
from mcp_grpc.tools import ToolAnnotations
from mcp_grpc.types import (
    CallToolResult,
    CompleteResult,
    ContentItem,
    GetPromptResult,
    ListResult,
    Prompt,
    PromptArgument,
    PromptMessage,
    ReadResourceResult,
    Resource,
    ResourceTemplate,
    ServerInfo,
    Tool,
    ToolAnnotationInfo,
)

__all__ = [
    "Audio",
    "BoolField",
    "CallToolResult",
    "Client",
    "CompleteResult",
    "ContentItem",
    "Context",
    "ElicitationField",
    "ElicitationResult",
    "EnumField",
    "FasterMCP",
    "FloatField",
    "GetPromptResult",
    "Image",
    "IntField",
    "ListResult",
    "LoggingMiddleware",
    "McpError",
    "Middleware",
    "Prompt",
    "PromptArgument",
    "PromptMessage",
    "ReadResourceResult",
    "Resource",
    "ResourceTemplate",
    "ServerInfo",
    "StringField",
    "TimeoutMiddleware",
    "TimingMiddleware",
    "Tool",
    "ToolAnnotationInfo",
    "ToolAnnotations",
    "ToolCallContext",
    "ToolError",
    "ValidationMiddleware",
    "build_elicitation_schema",
]
