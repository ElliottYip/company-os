import assert from "node:assert/strict";
import test from "node:test";

import {
  companyWorkspacePath,
  parseCompanyWorkspacePath,
  resolveFormalCompanySelection,
} from "../web/company-selection.ts";

const directory = {
  schemaVersion: 1 as const,
  companies: [
    { id: "company-one", name: "Northstar", slug: "northstar", membershipRole: "owner" as const },
    { id: "company-two", name: "Harbor", slug: "harbor", membershipRole: "operator" as const },
  ],
  isInstanceAdmin: false,
};

test("formal company selection keeps an active selection before stored and first-company fallbacks", () => {
  assert.equal(resolveFormalCompanySelection(directory, "company-two", "company-one"), "company-two");
  assert.equal(resolveFormalCompanySelection(directory, null, "company-two"), "company-two");
  assert.equal(resolveFormalCompanySelection(directory, null, "missing"), "company-one");
  assert.equal(resolveFormalCompanySelection(directory, null, "company-two", "northstar"), "company-one");
  assert.equal(resolveFormalCompanySelection(directory, "company-one", "company-one", "unknown"), null);
});

test("formal company selection rejects stale IDs and an empty directory", () => {
  assert.equal(resolveFormalCompanySelection(directory, "missing", "company-two"), "company-two");
  assert.equal(resolveFormalCompanySelection({ ...directory, companies: [] }, null, null), null);
});

test("company workspace paths are canonical, deep-linkable, and derived only from directory slugs", () => {
  assert.deepEqual(parseCompanyWorkspacePath("/leike/"), { slug: "leike" });
  assert.deepEqual(parseCompanyWorkspacePath("/leike/organization"), {
    slug: "leike", section: "organization",
  });
  assert.equal(parseCompanyWorkspacePath("/leike/not-a-section"), null);
  assert.equal(parseCompanyWorkspacePath("/Leike/"), null);
  assert.equal(parseCompanyWorkspacePath("/t/leike"), null);
  assert.equal(companyWorkspacePath(directory, "company-two"), "/harbor/");
  assert.equal(companyWorkspacePath(directory, "missing"), null);
});
