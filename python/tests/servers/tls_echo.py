"""Test server: TLS / mTLS echo tool.

Usage:
  python tls_echo.py <port> <server_cert> <server_key>            # server-only TLS
  python tls_echo.py <port> <server_cert> <server_key> <ca_cert>  # mTLS
"""

import asyncio
import sys

from rapidmcp import RapidMCP
from rapidmcp.auth import TLSConfig

port = int(sys.argv[1])
server_cert = sys.argv[2]
server_key = sys.argv[3]
ca_cert = sys.argv[4] if len(sys.argv) > 4 else ""

tls = TLSConfig(cert=server_cert, key=server_key, ca=ca_cert)
server = RapidMCP(name="docker-tls-echo", version="0.1", tls=tls)


@server.tool(description="Echo")
async def echo(text: str) -> str:
    await asyncio.sleep(0.005)
    return text


async def _main() -> None:
    grpc_server = await server._start_grpc(port)
    await grpc_server.wait_for_termination()


asyncio.run(_main())
