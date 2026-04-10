"""mcp-grpc echo server for benchmarking. Runs on port 50051."""
from mcp_grpc import McpServer

server = McpServer(name="grpc-benchmark", version="1.0.0")


@server.tool(description="Echo the input back")
async def echo(text: str) -> str:
    return text


if __name__ == "__main__":
    # Monkey-patch _start_grpc to handle Windows IPv6 issues
    original_start_grpc = server._start_grpc

    async def _start_grpc_fallback(port: int):
        try:
            return await original_start_grpc(port)
        except RuntimeError as e:
            if "Failed to bind to address" in str(e):
                # Fall back to localhost
                from grpc import aio as grpc_aio
                from mcp_grpc._generated import mcp_pb2_grpc
                from mcp_grpc.server import _McpServicer

                grpc_server = grpc_aio.server()
                mcp_pb2_grpc.add_McpServicer_to_server(_McpServicer(server), grpc_server)
                actual_port = grpc_server.add_insecure_port(f"127.0.0.1:{port}")
                await grpc_server.start()
                server._port = actual_port
                return grpc_server
            raise

    server._start_grpc = _start_grpc_fallback
    server.run(port=50051)
