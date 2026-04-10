"""FastMCP echo server for benchmarking. Streamable HTTP on port 8000."""
from fastmcp import FastMCP

mcp = FastMCP("fastmcp-benchmark")


@mcp.tool()
def echo(text: str) -> str:
    """Echo the input back."""
    return text


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="127.0.0.1", port=8001)
