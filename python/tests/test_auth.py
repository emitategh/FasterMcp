import pytest
from rapidmcp.auth import TLSConfig


def test_tls_config_required_fields():
    cfg = TLSConfig(cert="server.crt", key="server.key")
    assert cfg.cert == "server.crt"
    assert cfg.key == "server.key"
    assert cfg.ca == ""


def test_tls_config_with_ca():
    cfg = TLSConfig(cert="s.crt", key="s.key", ca="ca.crt")
    assert cfg.ca == "ca.crt"
