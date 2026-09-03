import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { TrustedClientAddressResolver } from "../adapters/http/trusted-client-address.ts";

function request(peer: string, forwarded?: string): IncomingMessage {
  return {
    socket: { remoteAddress: peer },
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
  } as unknown as IncomingMessage;
}

test("signup client address trusts forwarded hops only from configured ingress proxies", () => {
  const resolver = new TrustedClientAddressResolver(["172.31.29.1/32", "10.0.0.0/8"]);
  assert.equal(resolver.resolve(request("172.31.29.1", "198.51.100.7")), "198.51.100.7");
  assert.equal(resolver.resolve(request("172.31.29.1", "198.51.100.7, 10.1.2.3")), "198.51.100.7");
  assert.equal(resolver.resolve(request("203.0.113.8", "198.51.100.7")), "203.0.113.8");
});

test("signup client address rejects malformed and oversized forwarded chains", () => {
  const resolver = new TrustedClientAddressResolver(["172.31.29.1/32"]);
  assert.equal(resolver.resolve(request("172.31.29.1", "attacker")), "172.31.29.1");
  assert.equal(resolver.resolve(request("172.31.29.1", "1.1.1.1,".repeat(300))), "172.31.29.1");
  assert.equal(resolver.resolve(request("::ffff:172.31.29.1", "2001:db8::1")), "2001:db8::1");
});
