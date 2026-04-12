"""Tests that token and tls params are correctly forwarded to Client in integrations."""

from unittest.mock import patch

import pytest

from rapidmcp.auth import ClientTLSConfig

# ---------------------------------------------------------------------------
# LiveKit
# ---------------------------------------------------------------------------


def test_mcp_server_grpc_forwards_token():
    """MCPServerGRPC(token=...) passes token to its internal Client."""
    try:
        from rapidmcp.integrations.livekit import MCPServerGRPC
    except ImportError:
        pytest.skip("livekit-agents not installed")

    with patch("rapidmcp.integrations.livekit.Client") as MockClient:
        MCPServerGRPC("host:50051", token="mytoken")
        MockClient.assert_called_once_with("host:50051", token="mytoken", tls=None)


def test_mcp_server_grpc_forwards_tls():
    """MCPServerGRPC(tls=...) passes tls to its internal Client."""
    try:
        from rapidmcp.integrations.livekit import MCPServerGRPC
    except ImportError:
        pytest.skip("livekit-agents not installed")

    tls = ClientTLSConfig(ca="ca.crt")
    with patch("rapidmcp.integrations.livekit.Client") as MockClient:
        MCPServerGRPC("host:50051", tls=tls)
        MockClient.assert_called_once_with("host:50051", token=None, tls=tls)


def test_mcp_server_grpc_forwards_token_and_tls():
    """MCPServerGRPC(token=..., tls=...) passes both to its internal Client."""
    try:
        from rapidmcp.integrations.livekit import MCPServerGRPC
    except ImportError:
        pytest.skip("livekit-agents not installed")

    tls = ClientTLSConfig(ca="ca.crt", cert="c.crt", key="c.key")
    with patch("rapidmcp.integrations.livekit.Client") as MockClient:
        MCPServerGRPC("host:50051", token="tok", tls=tls)
        MockClient.assert_called_once_with("host:50051", token="tok", tls=tls)


def test_mcp_server_grpc_no_auth_unchanged():
    """MCPServerGRPC() with no auth args passes token=None, tls=None (backward compat)."""
    try:
        from rapidmcp.integrations.livekit import MCPServerGRPC
    except ImportError:
        pytest.skip("livekit-agents not installed")

    with patch("rapidmcp.integrations.livekit.Client") as MockClient:
        MCPServerGRPC("host:50051")
        MockClient.assert_called_once_with("host:50051", token=None, tls=None)


# ---------------------------------------------------------------------------
# LangChain
# ---------------------------------------------------------------------------


def test_mcp_toolkit_forwards_token():
    """MCPToolkit(token=...) passes token to its internal Client."""
    try:
        from rapidmcp.integrations.langchain import MCPToolkit
    except ImportError:
        pytest.skip("langchain-core not installed")

    with patch("rapidmcp.integrations.langchain.Client") as MockClient:
        MCPToolkit("host:50051", token="mytoken")
        MockClient.assert_called_once_with("host:50051", token="mytoken", tls=None)


def test_mcp_toolkit_forwards_tls():
    """MCPToolkit(tls=...) passes tls to its internal Client."""
    try:
        from rapidmcp.integrations.langchain import MCPToolkit
    except ImportError:
        pytest.skip("langchain-core not installed")

    tls = ClientTLSConfig(ca="ca.crt")
    with patch("rapidmcp.integrations.langchain.Client") as MockClient:
        MCPToolkit("host:50051", tls=tls)
        MockClient.assert_called_once_with("host:50051", token=None, tls=tls)


def test_mcp_toolkit_forwards_token_and_tls():
    """MCPToolkit(token=..., tls=...) passes both to its internal Client."""
    try:
        from rapidmcp.integrations.langchain import MCPToolkit
    except ImportError:
        pytest.skip("langchain-core not installed")

    tls = ClientTLSConfig(ca="ca.crt", cert="c.crt", key="c.key")
    with patch("rapidmcp.integrations.langchain.Client") as MockClient:
        MCPToolkit("host:50051", token="tok", tls=tls)
        MockClient.assert_called_once_with("host:50051", token="tok", tls=tls)


def test_mcp_toolkit_no_auth_unchanged():
    """MCPToolkit() with no auth args passes token=None, tls=None (backward compat)."""
    try:
        from rapidmcp.integrations.langchain import MCPToolkit
    except ImportError:
        pytest.skip("langchain-core not installed")

    with patch("rapidmcp.integrations.langchain.Client") as MockClient:
        MCPToolkit("host:50051")
        MockClient.assert_called_once_with("host:50051", token=None, tls=None)
