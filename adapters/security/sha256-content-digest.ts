import { createHash } from "node:crypto";

import type { ContentDigestPort } from "../../ports/content-digest-port.ts";

export class Sha256ContentDigest implements ContentDigestPort {
  async sha256Utf8(value: string): Promise<`sha256:${string}`> {
    return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
  }
}
