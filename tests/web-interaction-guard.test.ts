import assert from "node:assert/strict";
import test from "node:test";

import { checkWebInteractions, checkWebInteractionSources } from "../scripts/check-web-interactions.mjs";

test("customer Web admits no dead buttons, bare forms, placeholder links, or inline handlers", async () => {
  assert.deepEqual(await checkWebInteractions(), { checkedFiles: 2, status: "PASS" });
});

test("interaction guard reports the exact source location of a dead control", async () => {
  const sources = [
    ["web/mount.ts", "const page = `<button>Decorative</button>`;"],
    ["web/pages/operational-pages.ts", "export const page = ``;"],
  ] as const;
  assert.throws(() => checkWebInteractionSources(sources),
    /web\/mount\.ts:1:interactive button has no handler hook/);
});

test("a cosmetic data attribute does not make an unbound control functional", () => {
  assert.throws(() => checkWebInteractionSources([
    ["web/mount.ts", "const page = `<button data-dead-control>Decorative</button>`;"],
    ["web/pages/operational-pages.ts", "export const page = ``;"],
  ]), /interactive button has no handler hook/);
});
