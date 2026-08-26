import assert from "node:assert/strict";
import test from "node:test";

import { createDemoApplicationClient } from "../web/application-client.ts";
import { addHumanColleague } from "../web/product-onboarding/onboarding-model.ts";

test("Demo organization edits are visible to the Web client and remain fixture-only", async () => {
  const client = createDemoApplicationClient();
  const initial = await client.organization();
  const updated = addHumanColleague(initial, {
    name: "许真",
    title: "客户成功负责人（演示）",
    departmentId: initial.departments[0]!.id,
  });

  await client.replaceOrganization(updated);
  const reloaded = await client.organization();

  assert.equal(reloaded.humans.length, initial.humans.length + 1);
  assert.equal(reloaded.humans.at(-1)?.name, "许真");
  (updated.humans[0] as { name: string }).name = "mutated outside client";
  assert.notEqual((await client.organization()).humans[0]?.name, "mutated outside client");
});

test("reset restores the canonical deterministic Demo organization", async () => {
  const client = createDemoApplicationClient();
  const initial = await client.organization();
  await client.replaceOrganization(addHumanColleague(initial, {
    name: "临时成员",
    title: "演示成员",
    departmentId: initial.departments[0]!.id,
  }));

  await client.resetFixture();
  assert.deepEqual(await client.organization(), initial);
});

test("local workspace planning edits remain isolated and revisioned", async () => {
  const client = createDemoApplicationClient();
  const organization = await client.organization();
  const initial = await client.planning();
  const now = "2026-08-25T00:00:00.000Z";

  const updated = await client.replacePlanning({
    ...initial,
    goals: [{
      id: "goal-local-one",
      companyId: organization.company.id,
      title: "Prepare the operating plan",
      description: null,
      level: "company",
      status: "planned",
      parentId: null,
      ownerAgentId: null,
      accountableHumanId: organization.humans[0]!.id,
      createdAt: now,
      updatedAt: now,
    }],
  });

  assert.equal(updated.revision, 1);
  assert.equal((await client.planning()).goals[0]?.title, "Prepare the operating plan");
  assert.equal((await client.formalAccess()).capabilities.execution, false);
});
