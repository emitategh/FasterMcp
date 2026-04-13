# Authentication & TLS

RapidMCP supports two independent, additive security layers:

- **TLS / mTLS** — encrypts the connection and verifies identity at the transport layer
- **Token auth** — validates a bearer token at the application layer

You can use either or both. TLS is enforced before any RPC handler runs; token auth is enforced before the servicer runs.

---

## Concepts: CA cert, certificate, and private key

TLS uses three types of PEM files, each with a distinct role:

| File | Who holds it | Purpose |
|---|---|---|
| Private key (`.key`) | Owner only — never shared | Signs the TLS handshake to prove identity |
| Certificate (`.crt`) | Sent to the other party | Contains the public key + identity, signed by a CA |
| CA certificate (`ca.crt`) | The verifying party | Trust anchor used to verify the other party's certificate |

**Private key** — the secret half of the keypair. Never leaves the machine that owns it. If it leaks, the certificate is compromised.

**Certificate** — the public half. Sent during the TLS handshake so the other side can verify who they're talking to.

**CA certificate** — not your identity, but the ruler you use to measure someone else's identity. The CA cert was used to *sign* the certificate, so holding it lets you verify that the certificate is legitimate.

---

## TLS modes

### Server TLS (one-way)

The server proves its identity to the client. The client is not verified.

```
Client → connects
Server → sends server.crt
Client → checks: was this signed by my ca.crt? If yes, proceed.
```

```python
from rapidmcp import RapidMCP, TLSConfig

server = RapidMCP(
    name="my-server",
    version="1.0.0",
    tls=TLSConfig(cert="server.crt", key="server.key"),
)
```

Client:

```python
from rapidmcp import Client, ClientTLSConfig

# Custom CA (e.g. self-signed server cert)
async with Client("localhost:50051", tls=ClientTLSConfig(ca="ca.crt")) as client:
    ...

# System CA bundle (for certs signed by a public CA)
async with Client("localhost:50051", tls=ClientTLSConfig()) as client:
    ...
```

### Mutual TLS (mTLS)

Both sides verify each other. The server rejects any client that doesn't present a certificate signed by the trusted CA — enforced at the gRPC layer before any code runs.

```
Client → connects
Server → sends server.crt
Client → checks: signed by ca.crt? ✓
Server → requests client certificate
Client → sends client.crt
Server → checks: signed by ca.crt? If not → connection rejected immediately.
```

Server: pass `ca` to `TLSConfig` — this enables `require_client_auth`:

```python
server = RapidMCP(
    name="my-server",
    version="1.0.0",
    tls=TLSConfig(cert="server.crt", key="server.key", ca="ca.crt"),
)
```

Client: pass `cert` and `key` in addition to `ca`:

```python
async with Client(
    "localhost:50051",
    tls=ClientTLSConfig(ca="ca.crt", cert="client.crt", key="client.key"),
) as client:
    ...
```

---

## Token authentication

Bearer token auth is implemented as a gRPC server interceptor. On every call, it reads the `authorization` metadata key, strips the `Bearer ` prefix, and calls your `verify` callable before the handler runs.

`verify` can be sync or async:

```python
from rapidmcp import RapidMCP

# Sync — static token
server = RapidMCP(name="my-server", version="1.0.0", auth=lambda token: token == "secret")

# Async — e.g. JWT / OAuth2 introspection
async def verify(token: str) -> bool:
    resp = await httpx.AsyncClient().post(
        "https://auth.example.com/introspect",
        data={"token": token},
    )
    return resp.json().get("active") is True

server = RapidMCP(name="my-server", version="1.0.0", auth=verify)
```

If `verify` returns `False` or raises, the call is aborted with `UNAUTHENTICATED` before the tool handler runs.

The client sends the token as a gRPC metadata header on every call:

```python
async with Client("localhost:50051", token="secret") as client:
    ...
```

---

## Combining TLS and token auth

The two layers are independent. Use both for maximum security — TLS protects the channel, token auth protects the application:

```python
# Server
server = RapidMCP(
    name="my-server",
    version="1.0.0",
    tls=TLSConfig(cert="server.crt", key="server.key"),
    auth=lambda token: token == "secret",
)

# Client
async with Client(
    "localhost:50051",
    tls=ClientTLSConfig(ca="ca.crt"),
    token="secret",
) as client:
    ...
```

### Files needed per scenario

| Scenario | Server needs | Client needs |
|---|---|---|
| No security | — | — |
| TLS only | `server.crt`, `server.key` | `ca.crt` (or system CAs) |
| mTLS | `server.crt`, `server.key`, `ca.crt` | `ca.crt`, `client.crt`, `client.key` |
| Token only | `auth=` callable | `token=` string |
| TLS + token | `server.crt`, `server.key`, `auth=` | `ca.crt`, `token=` |
| mTLS + token | `server.crt`, `server.key`, `ca.crt`, `auth=` | `ca.crt`, `client.crt`, `client.key`, `token=` |
