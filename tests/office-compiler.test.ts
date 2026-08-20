import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOfficeScene,
  validateOfficeScene,
  validateActionSequence,
  validateAssetManifest,
} from "../core/office.ts";

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
    ["ENTRANCE", "RECEPTION", "DEPARTMENT", "MEETING_ROOM", "PANTRY", "RESTROOM", "CORRIDOR"],
  );
  assert.equal(scene.entities[1]?.state, "WAITING");
  assert.equal(scene.coordinateSpace.unit, "OFFICE_UNIT");
  assert.equal(scene.layoutRevision, "deterministic-grid-v1");
  assert.ok(scene.modules.every(({ bounds }) => bounds.width > 0 && bounds.height > 0));
  assert.ok(scene.entities.every(({ occupancy }) =>
    scene.anchors.some(({ id }) => id === occupancy.anchorId)));
  assert.equal("dom" in scene, false);
  assert.equal("assetUrl" in scene, false);
});

test("office compiler v1 emits complete connected workplace topology and project rooms", () => {
  const scene = compileOfficeScene({
    company: { id: "company-one", name: "珊瑚实验室", purpose: "", locale: "zh-CN" },
    departments: [
      { id: "growth", name: "增长部", mandate: "" },
      { id: "engineering", name: "研发部", mandate: "" },
    ],
    humans: [{
      id: "boss", name: "负责人", title: "Agent Boss", departmentId: "growth",
      avatarId: "human-placeholder",
    }],
    agents: [{
      id: "agent", name: "研究员", role: "研究", departmentId: "growth",
      accountableHumanId: "boss", runtimeConnectorId: "connector-one",
      avatarId: "fish-bumble", autonomyLevel: 2,
    }],
  }, {
    projects: [{ id: "launch", name: "发布计划", departmentIds: ["growth", "engineering"] }],
  });

  assert.deepEqual(scene.modules.map(({ kind }) => kind), [
    "ENTRANCE", "RECEPTION", "DEPARTMENT", "DEPARTMENT", "PROJECT_ROOM",
    "MEETING_ROOM", "PANTRY", "RESTROOM", "CORRIDOR",
  ]);
  assert.ok(scene.connections.some(({ fromModuleId, toModuleId }) =>
    fromModuleId === "entrance" && toModuleId === "reception"));
  assert.ok(scene.modules.every((module) =>
    module.id === "corridor" || scene.connections.some(({ fromModuleId, toModuleId }) =>
      fromModuleId === module.id || toModuleId === module.id)));
  assert.equal(scene.entities[0]?.occupancy.kind, "WORKSTATION");
  assert.deepEqual(validateOfficeScene(scene), scene);
  assert.deepEqual(scene, compileOfficeScene({
    company: { id: "company-one", name: "珊瑚实验室", purpose: "", locale: "zh-CN" },
    departments: [
      { id: "growth", name: "增长部", mandate: "" },
      { id: "engineering", name: "研发部", mandate: "" },
    ],
    humans: [{ id: "boss", name: "负责人", title: "Agent Boss", departmentId: "growth", avatarId: "human-placeholder" }],
    agents: [{ id: "agent", name: "研究员", role: "研究", departmentId: "growth", accountableHumanId: "boss", runtimeConnectorId: "connector-one", avatarId: "fish-bumble", autonomyLevel: 2 }],
  }, { projects: [{ id: "launch", name: "发布计划", departmentIds: ["growth", "engineering"] }] }));
});

test("asset manifest and action sequence v1 stay renderer and file-format neutral", () => {
  const manifest = validateAssetManifest({
    formatVersion: "1.0",
    assets: [{
      id: "fish-bumble",
      kind: "AGENT_CHARACTER",
      interactionSlots: ["LOCOMOTION", "WORKSTATION", "DOOR", "HANDHELD_PROP"],
      variants: ["DEFAULT"],
      unitScale: 1,
      bounds: { width: 2, height: 1, depth: 1 },
      anchorPoints: ["root", "hand", "gaze"],
      accessibilityFallback: "粘土小鱼 Agent",
    }],
  });
  const sequence = validateActionSequence({
    formatVersion: "1.0",
    id: "go-to-work",
    actorId: "agent",
    steps: [
      { action: "MOVE_TO", targetId: "workstation-agent", durationMs: 800 },
      { action: "TYPE", targetId: "workstation-agent", durationMs: 1200 },
      { action: "REQUEST_APPROVAL", targetId: "approval-one", durationMs: 0 },
    ],
  });

  assert.equal(JSON.stringify({ manifest, sequence }).includes(".glb"), false);
  assert.equal(JSON.stringify({ manifest, sequence }).includes("three"), false);
  assert.equal(JSON.stringify({ manifest, sequence }).includes("bone"), false);
});
