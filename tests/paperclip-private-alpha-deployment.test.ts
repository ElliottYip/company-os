import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("private Paperclip Alpha is an explicit formal-only Compose overlay", async () => {
  const [overlay, publicDemo, runbook] = await Promise.all([
    read("deploy/compose.private-alpha-paperclip.yml"),
    read("deploy/compose.public-demo.yml"),
    read("docs/paperclip-federated-alpha-runbook.md"),
  ]);
  assert.match(overlay, /COMPANY_OS_FEDERATED_SOURCE_PACKAGES:\s*"@company-os\/federated-source-reference"/);
  assert.match(overlay, /COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE:\s*\/run\/company-os\/federated-source-secrets\/paperclip-board-key/);
  assert.match(overlay, /COMPANY_OS_PAPERCLIP_SECRET_DIRECTORY:\?set a private Paperclip Secret directory/);
  assert.doesNotMatch(publicDemo, /PAPERCLIP|FEDERATED_SOURCE_PACKAGES/);
  assert.match(runbook, /compose\.private-alpha-paperclip\.yml/);
  assert.match(runbook, /mode `0400` or `0600`/);
});
