import assert from "node:assert/strict";
import test from "node:test";

import { compileOfficeScene } from "../core/office.ts";

test("office compiler emits renderer-neutral modules and entity states", () => {
  const scene = compileOfficeScene({
    company: { id: "demo-company", name: "演示公司", purpose: "", locale: "zh-CN" },
    departments: [{ id: "growth", name: "增长部", mandate: "" }],
    humans: [{
      id: "boss",
      name: "负责人",
      title: "Agent Boss",
      departmentId: "growth",
      avatarId: "clay-human-placeholder",
    }],
    agents: [{
      id: "agent",
      name: "研究员",
      role: "研究",
      departmentId: "growth",
      accountableHumanId: "boss",
      runtimeConnectorId: "connector-one",
      avatarId: "fish-bumble",
      autonomyLevel: 2,
    }],
  });

  assert.deepEqual(
    scene.modules.map(({ kind }) => kind),
    ["RECEPTION", "DEPARTMENT", "MEETING_ROOM", "PANTRY", "RESTROOM", "CORRIDOR"],
  );
  assert.equal(scene.entities[1]?.state, "WAITING");
  assert.equal("dom" in scene, false);
  assert.equal("assetUrl" in scene, false);
});

