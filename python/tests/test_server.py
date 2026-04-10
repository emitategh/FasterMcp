import pytest

from mcp_grpc.server import McpServer


def test_register_tool():
    server = McpServer(name="test", version="0.1")

    @server.tool(description="Echo text back")
    async def echo(text: str) -> str:
        return text

    tools = server.list_registered_tools()
    assert len(tools) == 1
    assert tools[0].name == "echo"
    assert tools[0].description == "Echo text back"
    assert '"text"' in tools[0].input_schema


def test_register_resource():
    server = McpServer(name="test", version="0.1")

    @server.resource(uri="res://config", description="App config")
    async def config() -> str:
        return '{"env": "prod"}'

    resources = server.list_registered_resources()
    assert len(resources) == 1
    assert resources[0].uri == "res://config"


def test_register_prompt():
    server = McpServer(name="test", version="0.1")

    @server.prompt(description="Greet the user")
    async def greet(name: str) -> str:
        return f"Hello, {name}!"

    prompts = server.list_registered_prompts()
    assert len(prompts) == 1
    assert prompts[0].name == "greet"


@pytest.mark.asyncio
async def test_call_tool_handler():
    server = McpServer(name="test", version="0.1")

    @server.tool(description="Echo text back")
    async def echo(text: str) -> str:
        return text

    result = await server.handle_call_tool("echo", '{"text": "hello"}')
    assert result.content[0].text == "hello"
    assert not result.is_error


@pytest.mark.asyncio
async def test_call_unknown_tool():
    server = McpServer(name="test", version="0.1")

    from mcp_grpc.errors import McpError

    with pytest.raises(McpError, match="not found"):
        await server.handle_call_tool("nonexistent", "{}")
