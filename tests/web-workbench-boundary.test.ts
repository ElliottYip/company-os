import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mountSource = await readFile(new URL("../web/mount.ts", import.meta.url), "utf8");
const clientSource = await readFile(new URL("../web/application-client.ts", import.meta.url), "utf8");

test("Agent Boss workbench exposes stable projections without inheriting an upstream UI", () => {
  for (const section of ["office", "work", "responsibility", "connectors"]) {
    assert.match(mountSource, new RegExp(`data-section=[\\\"]${section}[\\\"]`));
  }
  assert.doesNotMatch(mountSource, /paperclip|upstream-audit|node_modules/i);
  assert.doesNotMatch(mountSource, /fetch\s*\(|WebSocket\s*\(|EventSource\s*\(/);
  assert.match(mountSource, /CompanyOSApplicationClient/);
  assert.doesNotMatch(clientSource, /paperclip|react|raft\/web|nip-?07|relay/i);
});

test("workbench copy distinguishes deterministic fixtures from formal connectors", () => {
  assert.match(mountSource, /DEMO · NO NETWORK/);
  assert.match(mountSource, /fixture/);
  assert.match(mountSource, /正式 Connector/);
  assert.match(mountSource, /未绑定/);
});
