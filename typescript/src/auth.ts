import { ChannelCredentials } from "nice-grpc";
import { Metadata } from "nice-grpc-common";
import { readFileSync } from "node:fs";

export interface TlsConfig {
  rootCert: string | Buffer;
  clientCert?: string | Buffer;
  clientKey?: string | Buffer;
}

export interface ClientOptions {
  token?: string;
  tls?: TlsConfig;
  requestTimeout?: number;
}

function resolveCert(value: string | Buffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  return readFileSync(value);
}

export function buildChannelCredentials(opts: ClientOptions): ChannelCredentials {
  if (!opts.tls) {
    return ChannelCredentials.createInsecure();
  }
  const rootCert = resolveCert(opts.tls.rootCert);
  const clientKey = opts.tls.clientKey ? resolveCert(opts.tls.clientKey) : null;
  const clientCert = opts.tls.clientCert ? resolveCert(opts.tls.clientCert) : null;
  return ChannelCredentials.createSsl(rootCert, clientKey, clientCert);
}

export function buildMetadata(opts: ClientOptions): Metadata {
  const metadata = new Metadata();
  if (opts.token) {
    metadata.set("authorization", `Bearer ${opts.token}`);
  }
  return metadata;
}
