import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import { createFormalTemplateFromDemo } from "../core/demo-promotion.ts";

test("Demo promotion copies only a sanitized organization template", () => {
  const template = createFormalTemplateFromDemo(DEMO_COMPANY);
  const serialized = JSON.stringify(template);

  assert.deepEqual(template.rebindRequirements, [
    "IDENTITY", "HUMANS", "AGENTS", "PERMISSIONS", "DATA_AUTHORIZATIONS", "RESPONSIBILITY_CONTRACTS",
  ]);
  assert.equal(serialized.includes("demo-boss"), false);
  assert.equal(serialized.includes("demo-researcher"), false);
  assert.equal(serialized.includes("fixture-"), false);
  assert.equal("humans" in template, false);
  assert.equal("agents" in template, false);
});
