import { describe, it, expect } from "vitest";
import { buildChannelCredentials, buildMetadata, type ClientOptions } from "../src/auth.js";
import { ChannelCredentials, Metadata } from "nice-grpc";

describe("buildMetadata", () => {
  it("returns empty metadata when no token", () => {
    const meta = buildMetadata({});
    expect(meta.getAll("authorization")).toEqual([]);
  });

  it("adds Bearer token to metadata", () => {
    const meta = buildMetadata({ token: "secret" });
    expect(meta.getAll("authorization")).toEqual(["Bearer secret"]);
  });
});

describe("buildChannelCredentials", () => {
  it("returns insecure credentials when no tls config", () => {
    const creds = buildChannelCredentials({});
    const insecure = ChannelCredentials.createInsecure();
    // Both should be InsecureChannelCredentialsImpl
    expect(creds.constructor.name).toBe(insecure.constructor.name);
  });

  it("returns SSL credentials with rootCert buffer", () => {
    const creds = buildChannelCredentials({
      tls: { rootCert: Buffer.from("fake-ca") },
    });
    // Should not be the insecure type
    const insecure = ChannelCredentials.createInsecure();
    expect(creds.constructor.name).not.toBe(insecure.constructor.name);
  });
});
