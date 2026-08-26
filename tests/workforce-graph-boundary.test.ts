import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphSource = await readFile(
  new URL("../web/workforce-graph/mount-workforce-graph.tsx", import.meta.url),
  "utf8",
);
const packageDocument = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as { readonly dependencies?: Readonly<Record<string, string>> };

test("workforce graph uses fixed open-source Web dependencies", () => {
  assert.equal(packageDocument.dependencies?.["@xyflow/react"], "^12.8.5");
  assert.equal(packageDocument.dependencies?.["@dagrejs/dagre"], "^1.1.5");
  assert.match(graphSource, /@xyflow\/react/);
  assert.match(graphSource, /@dagrejs\/dagre/);
});

test("workforce graph keeps product data and visual assets independent", () => {
  assert.doesNotMatch(graphSource, /relevanceai|cdn\.relevance|paperclip/i);
  assert.doesNotMatch(graphSource, /three|\.glb|office-three/i);
  assert.match(graphSource, /DEMO_FIXTURE|确定性演示/);
  assert.match(graphSource, /accountable human/i);
  assert.match(graphSource, /raft-fish-fizz\.png/);
  assert.match(graphSource, /terracotta-short-hair\.png/);
  assert.match(graphSource, /makeOrganizationGraph/);
});
