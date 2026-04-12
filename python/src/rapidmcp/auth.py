"""Authentication helpers: token interceptor and TLS credentials."""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import grpc
from grpc import aio as grpc_aio

logger = logging.getLogger("rapidmcp.auth")


@dataclass
class TLSConfig:
    """Paths to TLS certificate material for the gRPC server.

    Pass ``ca`` to enable mutual TLS — the server will require clients to
    present a certificate signed by that CA.
    """

    cert: str
    key: str
    ca: str = ""


class _AuthInterceptor(grpc_aio.ServerInterceptor):
    """gRPC server interceptor that validates a bearer token.

    Reads the ``authorization`` metadata key, strips the optional
    ``Bearer `` prefix, and calls *verify*.  Aborts with UNAUTHENTICATED
    if *verify* returns False or raises.
    """

    def __init__(self, verify: Callable[[str], bool | Awaitable[bool]]) -> None:
        self._verify = verify

    async def intercept(
        self,
        method: Callable,
        request_or_iterator,
        context: grpc_aio.ServicerContext,
        method_name: str,
    ):
        metadata = dict(context.invocation_metadata())
        raw = metadata.get("authorization", "")
        raw = raw.strip()
        if raw.lower().startswith("bearer "):
            token = raw[7:].strip()
        else:
            token = raw.strip()
        try:
            ok = self._verify(token)
            if inspect.isawaitable(ok):
                ok = await ok
        except Exception:
            logger.warning("auth verify() raised unexpectedly", exc_info=True)
            ok = False
        if not ok:
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid token")
            return
        return await method(request_or_iterator, context)


def _build_server_credentials(tls: TLSConfig) -> grpc.ServerCredentials:
    """Build SSL server credentials from PEM file paths in *tls*."""
    with open(tls.cert, "rb") as f:
        cert_pem = f.read()
    with open(tls.key, "rb") as f:
        key_pem = f.read()
    ca_pem = None
    if tls.ca:
        with open(tls.ca, "rb") as f:
            ca_pem = f.read()
    return grpc.ssl_server_credentials(
        [(key_pem, cert_pem)],
        root_certificates=ca_pem,
        require_client_auth=bool(ca_pem),
    )
