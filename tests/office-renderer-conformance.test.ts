import assert from "node:assert/strict";
import test from "node:test";

import { verifyOfficeRendererConformance } from "../application/verify-office-renderer-conformance.ts";
import { compileOfficeScene, type AssetManifest } from "../core/office.ts";
import type { WorkStatus } from "../core/control-plane.ts";

const states: readonly (WorkStatus | "AVAILABLE")[] = [
  "PENDING", "WORKING", "WAITING", "BLOCKED", "AWAITING_APPROVAL",
  "COMPLETED", "FAILED", "CANCELLED", "AVAILABLE",
];

test("renderer conformance covers every entity state and semantic interaction slot", () => {
  const agents = states.slice(0, -1).map((state, index) => ({
    id: `agent-${index}`, name: `Agent ${index}`, role: "Role", departmentId: "operations",
    accountableHumanId: "human-one", runtimeConnectorId: "connector-one",
    avatarId: `asset-${index}`, autonomyLevel: 2, state,
  }));
  const scene = compileOfficeScene({
    company: { id: "company-one", name: "Company", purpose: "", locale: "zh-CN" },
    departments: [{ id: "operations", name: "Operations", mandate: "" }],
    humans: [{ id: "human-one", name: "Human", title: "Boss", departmentId: "operations", avatarId: "asset-human" }],
    agents: agents.map(({ state: _state, ...agent }) => agent),
  }, {
    entityStates: Object.fromEntries(agents.map(({ id, state }) => [id, state])),
    actionSequences: [{ formatVersion: "1.0", id: "all-actions", actorId: "agent-0", steps: [
      { action: "MOVE_TO", targetId: "door-team-human-one", durationMs: 1 },
      { action: "ENTER_THROUGH", targetId: "door-team-human-one", durationMs: 1 },
      { action: "TYPE", targetId: "workstation-agent-0", durationMs: 1 },
      { action: "SIT", targetId: "workstation-agent-0", durationMs: 1 },
      { action: "DRINK", targetId: "coffee-one", durationMs: 1 },
      { action: "REQUEST_APPROVAL", targetId: "approval-one", durationMs: 0 },
    ] }],
  });
  const allSlots = ["LOCOMOTION", "WORKSTATION", "DOOR", "HANDHELD_PROP", "SEATING"] as const;
  const manifest: AssetManifest = {
    formatVersion: "1.0",
    assets: ["asset-human", ...agents.map(({ avatarId }) => avatarId)].map((id, index) => ({
      id, kind: index === 0 ? "HUMAN_CHARACTER" as const : "AGENT_CHARACTER" as const,
      interactionSlots: allSlots, variants: ["DEFAULT"], unitScale: 1,
      bounds: { width: 1, height: 1, depth: 1 }, anchorPoints: ["root"], accessibilityFallback: id,
    })),
  };
  const report = verifyOfficeRendererConformance({
    renderer: {
      rendererId: "structural", mode: "STRUCTURAL_PREVIEW", officeSceneVersions: ["1.0"],
      assetManifestVersions: ["1.0"], actionSequenceVersions: ["1.0"],
      capabilities: { orthographicCamera: false, horizontalOrbit: false, lockedPitch: false, wallOcclusionFade: false, focusSelection: true },
    },
    scene,
    manifest,
  });
  assert.deepEqual(new Set(report.coveredStates), new Set(states));
  assert.deepEqual(new Set(report.coveredInteractionSlots), new Set(allSlots));
  assert.equal(report.entityCount, states.length);
});

test("renderer conformance fails closed for missing semantic capabilities", () => {
  const scene = compileOfficeScene({
    company: { id: "company-one", name: "Company", purpose: "", locale: "zh-CN" },
    departments: [{ id: "operations", name: "Operations", mandate: "" }],
    humans: [{ id: "human-one", name: "Human", title: "Boss", departmentId: "operations", avatarId: "human-asset" }],
    agents: [{ id: "agent-one", name: "Agent", role: "Role", departmentId: "operations", accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "asset-one", autonomyLevel: 1 }],
  });
  assert.throws(() => verifyOfficeRendererConformance({
    renderer: { rendererId: "bad", mode: "STRUCTURAL_PREVIEW", officeSceneVersions: ["1.0"], assetManifestVersions: ["1.0"], actionSequenceVersions: ["1.0"], capabilities: { orthographicCamera: false, horizontalOrbit: false, lockedPitch: false, wallOcclusionFade: false, focusSelection: true } },
    scene,
    manifest: { formatVersion: "1.0", assets: [] },
  }), /OFFICE_ASSET_NOT_FOUND/);
});
