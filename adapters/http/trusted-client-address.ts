import { BlockList, isIP } from "node:net";
import type { IncomingMessage } from "node:http";

function address(value: string): { readonly value: string; readonly type: "ipv4" | "ipv6" } | null {
  const normalized = value.trim().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(normalized)?.[1];
  const candidate = mapped ?? normalized;
  const family = isIP(candidate);
  return family === 4 ? { value: candidate, type: "ipv4" }
    : family === 6 ? { value: candidate, type: "ipv6" }
    : null;
}

export class TrustedClientAddressResolver {
  readonly #trusted = new BlockList();

  constructor(cidrs: readonly string[]) {
    for (const cidr of cidrs) {
      const [rawAddress, rawPrefix] = cidr.split("/");
      const parsed = address(rawAddress ?? "");
      if (!parsed) throw new Error("TRUSTED_PROXY_CIDR_INVALID");
      const maximum = parsed.type === "ipv4" ? 32 : 128;
      const prefix = rawPrefix === undefined ? maximum : Number(rawPrefix);
      if (!Number.isSafeInteger(prefix) || prefix < 0 || prefix > maximum) {
        throw new Error("TRUSTED_PROXY_CIDR_INVALID");
      }
      this.#trusted.addSubnet(parsed.value, prefix, parsed.type);
    }
  }

  resolve(request: IncomingMessage): string {
    const peer = address(request.socket.remoteAddress ?? "");
    if (!peer) return "unknown-client";
    if (!this.#trusted.check(peer.value, peer.type)) return peer.value;
    const raw = request.headers["x-forwarded-for"];
    const source = Array.isArray(raw) ? raw.join(",") : raw ?? "";
    if (source.length > 2_048) return peer.value;
    const chain = source.split(",").map(address);
    if (!chain.length || chain.length > 16 || chain.some((entry) => entry === null)) return peer.value;
    let client = peer;
    for (const candidate of [...chain].reverse() as Array<NonNullable<typeof chain[number]>>) {
      if (!this.#trusted.check(client.value, client.type)) break;
      client = candidate;
    }
    return client.value;
  }
}
