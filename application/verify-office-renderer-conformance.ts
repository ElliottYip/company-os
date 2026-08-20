import {
  validateAssetManifest,
  validateOfficeScene,
  type AssetManifest,
  type InteractionSlot,
  type OfficeAction,
  type OfficeScene,
} from "../core/office.ts";
import type { WorkStatus } from "../core/control-plane.ts";
import type { OfficeRendererInfo } from "../ports/office-renderer-port.ts";

const ACTION_SLOT: Partial<Record<OfficeAction, InteractionSlot>> = {
  MOVE_TO: "LOCOMOTION",
  TURN_TO: "LOCOMOTION",
  ENTER_THROUGH: "DOOR",
  EXIT_THROUGH: "DOOR",
  USE_WORKSTATION: "WORKSTATION",
  TYPE: "WORKSTATION",
  SIT: "SEATING",
  STAND: "SEATING",
  PICK_UP: "HANDHELD_PROP",
  PUT_DOWN: "HANDHELD_PROP",
  DRINK: "HANDHELD_PROP",
};

export interface OfficeRendererConformanceReport {
  readonly rendererId: string;
  readonly entityCount: number;
  readonly coveredStates: readonly (WorkStatus | "AVAILABLE")[];
  readonly coveredInteractionSlots: readonly InteractionSlot[];
  readonly actionCount: number;
}

export function verifyOfficeRendererConformance(input: {
  readonly renderer: OfficeRendererInfo;
  readonly scene: OfficeScene;
  readonly manifest: AssetManifest;
}): OfficeRendererConformanceReport {
  const scene = validateOfficeScene(input.scene);
  const manifest = validateAssetManifest(input.manifest);
  if (!input.renderer.officeSceneVersions.includes(scene.formatVersion) ||
      !input.renderer.assetManifestVersions.includes(manifest.formatVersion) ||
      !input.renderer.actionSequenceVersions.includes("1.0")) {
    throw new Error("OFFICE_RENDERER_VERSION_UNSUPPORTED");
  }
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const coveredStates = new Set<WorkStatus | "AVAILABLE">();
  const coveredInteractionSlots = new Set<InteractionSlot>();
  for (const entity of scene.entities) {
    const asset = assets.get(entity.assetId);
    if (!asset) throw new Error("OFFICE_ASSET_NOT_FOUND");
    if (asset.kind !== (entity.kind === "AGENT" ? "AGENT_CHARACTER" : "HUMAN_CHARACTER")) {
      throw new Error("OFFICE_ASSET_KIND_MISMATCH");
    }
    const occupancySlot: InteractionSlot = entity.occupancy.kind === "WORKSTATION"
      ? "WORKSTATION"
      : entity.occupancy.kind === "TRANSIT" ? "LOCOMOTION" : "SEATING";
    if (!asset.interactionSlots.includes(occupancySlot)) {
      throw new Error("OFFICE_ASSET_OCCUPANCY_SLOT_MISSING");
    }
    asset.interactionSlots.forEach((slot) => coveredInteractionSlots.add(slot));
    coveredStates.add(entity.state);
  }
  let actionCount = 0;
  for (const sequence of scene.actionSequences) {
    const entity = scene.entities.find(({ id }) => id === sequence.actorId);
    if (!entity) throw new Error("OFFICE_ACTION_ACTOR_NOT_FOUND");
    const asset = assets.get(entity.assetId);
    if (!asset) throw new Error("OFFICE_ASSET_NOT_FOUND");
    for (const step of sequence.steps) {
      actionCount += 1;
      const slot = ACTION_SLOT[step.action];
      if (slot && !asset.interactionSlots.includes(slot)) {
        throw new Error("OFFICE_ACTION_SLOT_UNSUPPORTED");
      }
    }
  }
  return {
    rendererId: input.renderer.rendererId,
    entityCount: scene.entities.length,
    coveredStates: [...coveredStates],
    coveredInteractionSlots: [...coveredInteractionSlots],
    actionCount,
  };
}
