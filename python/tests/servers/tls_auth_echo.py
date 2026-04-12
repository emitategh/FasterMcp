"""Test server: TLS + bearer token echo tool.

Usage:
  python tls_auth_echo.py <port> <server_cert> <server_key> <expected_token>
"""

import asyncio
import sys

from rapidmcp import RapidMCP
from rapidmcp.auth import TLSConfig

port = int(sys.argv[1])
server_cert = sys.argv[2]
server_key = sys.argv[3]
expected_token = sys.argv[4]

tls = TLSConfig(cert=server_cert, key=server_key)
server = RapidMCP(
    name="docker-tls-auth-echo",
    version="0.1",
    tls=tls,
    auth=lambda token: token == expected_token,
)


@server.tool(description="Echo")
async def echo(text: str) -> str:
    return text


async def _main() -> None:
    grpc_server = await server._start_grpc(port)
    await grpc_server.wait_for_termination()


asyncio.run(_main())
