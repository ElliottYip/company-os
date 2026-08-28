import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("private Paperclip Alpha is an explicit formal-only Compose overlay", async () => {
  const [overlay, publicDemo, runbook, apiDockerfile, rootPackageSource, connectorPackageSource, dockerignore] = await Promise.all([
    read("deploy/compose.private-alpha-paperclip.yml"),
    read("deploy/compose.public-demo.yml"),
    read("docs/paperclip-federated-alpha-runbook.md"),
    read("deploy/Dockerfile.api"),
    read("package.json"),
    read("connectors/federated-source-reference/package.json"),
    read(".dockerignore"),
  ]);
  const rootPackage = JSON.parse(rootPackageSource) as { dependencies?: Record<string, string> };
  const connectorPackage = JSON.parse(connectorPackageSource) as { name?: string; exports?: Record<string, string> };
  assert.match(overlay, /COMPANY_OS_FEDERATED_SOURCE_PACKAGES:\s*"@company-os\/federated-source-reference"/);
  assert.match(overlay, /COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE:\s*\/run\/company-os\/federated-source-secrets\/paperclip-board-key/);
  assert.match(overlay, /COMPANY_OS_PAPERCLIP_SECRET_DIRECTORY:\?set a private Paperclip Secret directory/);
  assert.doesNotMatch(publicDemo, /PAPERCLIP|FEDERATED_SOURCE_PACKAGES/);
  assert.match(runbook, /compose\.private-alpha-paperclip\.yml/);
  assert.match(runbook, /mode `0400` or `0600`/);
  assert.equal(rootPackage.dependencies?.["@company-os/federated-source-reference"],
    "file:connectors/federated-source-reference");
  assert.equal(connectorPackage.name, "@company-os/federated-source-reference");
  assert.equal(connectorPackage.exports?.["."], "./index.mjs");
  assert.match(apiDockerfile, /COPY --chown=node:node connectors \.\/connectors\nRUN npm ci --omit=dev/,
    "the production API image must install the selected local Federated Source package");
  assert.doesNotMatch(dockerignore, /^connectors\/?$/m,
    "the Docker build context must retain formal Connector packages");
});
