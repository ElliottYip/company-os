import assert from "node:assert/strict";
import test from "node:test";

import { resolveFormalCompanySelection } from "../web/company-selection.ts";

const directory = {
  schemaVersion: 1 as const,
  companies: [
    { id: "company-one", name: "Northstar", membershipRole: "owner" as const },
    { id: "company-two", name: "Harbor", membershipRole: "operator" as const },
  ],
  isInstanceAdmin: false,
};

test("formal company selection keeps an active selection before stored and first-company fallbacks", () => {
  assert.equal(resolveFormalCompanySelection(directory, "company-two", "company-one"), "company-two");
  assert.equal(resolveFormalCompanySelection(directory, null, "company-two"), "company-two");
  assert.equal(resolveFormalCompanySelection(directory, null, "missing"), "company-one");
});

test("formal company selection rejects stale IDs and an empty directory", () => {
  assert.equal(resolveFormalCompanySelection(directory, "missing", "company-two"), "company-two");
  assert.equal(resolveFormalCompanySelection({ ...directory, companies: [] }, null, null), null);
});
