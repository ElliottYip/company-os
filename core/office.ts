import type { Identifier, WorkStatus } from "./control-plane.ts";
import type { OrganizationDraft } from "./organization.ts";

export type OfficeModuleKind =
  | "ENTRANCE"
  | "RECEPTION"
  | "DEPARTMENT"
  | "PROJECT_ROOM"
  | "MEETING_ROOM"
  | "PANTRY"
  | "RESTROOM"
  | "CORRIDOR";

export interface OfficeModule {
  readonly id: Identifier;
  readonly kind: OfficeModuleKind;
  readonly label: string;
  readonly capacity: number;
}

export interface OfficeConnection {
  readonly fromModuleId: Identifier;
  readonly toModuleId: Identifier;
  readonly kind: "DOOR" | "OPENING" | "CORRIDOR_LINK";
}

export interface OfficeOccupancy {
  readonly kind: "WORKSTATION" | "ROOM" | "TRANSIT";
  readonly anchorId: Identifier;
}

export interface OfficeEntity {
  readonly id: Identifier;
  readonly kind: "HUMAN" | "AGENT";
  readonly moduleId: Identifier;
  readonly state: WorkStatus | "AVAILABLE";
  readonly assetId: Identifier;
  readonly occupancy: OfficeOccupancy;
}

export interface OfficeScene {
  readonly companyId: Identifier;
  readonly modules: readonly OfficeModule[];
  readonly connections: readonly OfficeConnection[];
  readonly entities: readonly OfficeEntity[];
  readonly formatVersion: "1.0";
}

export interface OfficeProject {
  readonly id: Identifier;
  readonly name: string;
  readonly departmentIds: readonly Identifier[];
}

export interface OfficeCompilationOptions {
  readonly projects?: readonly OfficeProject[];
  readonly entityStates?: Readonly<Record<Identifier, WorkStatus | "AVAILABLE">>;
}

export type AssetKind =
  | "HUMAN_CHARACTER"
  | "AGENT_CHARACTER"
  | "FURNITURE"
  | "ARCHITECTURE"
  | "HANDHELD_PROP";

export type InteractionSlot =
  | "LOCOMOTION"
  | "WORKSTATION"
  | "DOOR"
  | "HANDHELD_PROP"
  | "SEATING";

export interface AssetDescriptor {
  readonly id: Identifier;
  readonly kind: AssetKind;
  readonly interactionSlots: readonly InteractionSlot[];
  readonly variants: readonly string[];
}

export interface AssetManifest {
  readonly formatVersion: "1.0";
  readonly assets: readonly AssetDescriptor[];
}

export type OfficeAction =
  | "MOVE_TO"
  | "TURN_TO"
  | "ENTER_THROUGH"
  | "USE_WORKSTATION"
  | "SIT"
  | "STAND"
  | "PICK_UP"
  | "PUT_DOWN"
  | "WAIT";

export interface ActionStep {
  readonly action: OfficeAction;
  readonly targetId: Identifier;
  readonly durationMs: number;
}

export interface ActionSequence {
  readonly formatVersion: "1.0";
  readonly id: Identifier;
  readonly actorId: Identifier;
  readonly steps: readonly ActionStep[];
}

function uniqueIds(values: readonly { readonly id: Identifier }[], label: string): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) {
    throw new Error(`${label} IDs must be unique.`);
  }
}

export function validateAssetManifest(manifest: AssetManifest): AssetManifest {
  if (manifest.formatVersion !== "1.0") throw new Error("Unsupported asset manifest version.");
  uniqueIds(manifest.assets, "Asset");
  for (const asset of manifest.assets) {
    if (!asset.id || !asset.interactionSlots.length || !asset.variants.length) {
      throw new Error("Assets require an ID, interaction slots, and variants.");
    }
  }
  return structuredClone(manifest);
}

export function validateActionSequence(sequence: ActionSequence): ActionSequence {
  if (sequence.formatVersion !== "1.0") throw new Error("Unsupported action sequence version.");
  if (!sequence.id || !sequence.actorId || !sequence.steps.length) {
    throw new Error("Action sequence requires ID, actor, and steps.");
  }
  for (const step of sequence.steps) {
    if (!step.targetId || !Number.isInteger(step.durationMs) || step.durationMs < 0) {
      throw new Error("Action steps require a target and non-negative integer duration.");
    }
  }
  return structuredClone(sequence);
}

export function compileOfficeScene(
  organization: OrganizationDraft,
  options: OfficeCompilationOptions = {},
): OfficeScene {
  const modules: OfficeModule[] = [
    { id: "entrance", kind: "ENTRANCE", label: "入口", capacity: 4 },
    { id: "reception", kind: "RECEPTION", label: "前台", capacity: 4 },
    ...organization.departments.map((department) => ({
      id: `department-${department.id}`,
      kind: "DEPARTMENT" as const,
      label: department.name,
      capacity: Math.max(
        3,
        organization.humans.filter(({ departmentId }) => departmentId === department.id).length +
          organization.agents.filter(({ departmentId }) => departmentId === department.id).length,
      ),
    })),
    ...(options.projects ?? []).map((project) => ({
      id: `project-${project.id}`,
      kind: "PROJECT_ROOM" as const,
      label: project.name,
      capacity: Math.max(4, project.departmentIds.length * 2),
    })),
    { id: "meeting-room", kind: "MEETING_ROOM", label: "会议室", capacity: 8 },
    { id: "pantry", kind: "PANTRY", label: "茶水间", capacity: 5 },
    { id: "restroom", kind: "RESTROOM", label: "洗手间", capacity: 2 },
    { id: "corridor", kind: "CORRIDOR", label: "走廊", capacity: 16 },
  ];

  uniqueIds(modules, "Office module");
  const connections: OfficeConnection[] = [
    { fromModuleId: "entrance", toModuleId: "reception", kind: "DOOR" },
    { fromModuleId: "reception", toModuleId: "corridor", kind: "OPENING" },
    ...modules
      .filter(({ id }) => !["entrance", "reception", "corridor"].includes(id))
      .map((module) => ({
        fromModuleId: "corridor",
        toModuleId: module.id,
        kind: "CORRIDOR_LINK" as const,
      })),
  ];

  return {
    companyId: organization.company.id,
    modules,
    connections,
    entities: [
      ...organization.humans.map((human) => ({
        id: human.id,
        kind: "HUMAN" as const,
        moduleId: `department-${human.departmentId}`,
        state: options.entityStates?.[human.id] ?? "AVAILABLE" as const,
        assetId: human.avatarId,
        occupancy: {
          kind: "WORKSTATION" as const,
          anchorId: `workstation-${human.id}`,
        },
      })),
      ...organization.agents.map((agent) => ({
        id: agent.id,
        kind: "AGENT" as const,
        moduleId: `department-${agent.departmentId}`,
        state: options.entityStates?.[agent.id] ?? "WAITING" as const,
        assetId: agent.avatarId,
        occupancy: {
          kind: "WORKSTATION" as const,
          anchorId: `workstation-${agent.id}`,
        },
      })),
    ],
    formatVersion: "1.0",
  };
}
