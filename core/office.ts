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
  readonly bounds: OfficeBounds;
}

export interface OfficeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
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
  readonly anchors: readonly OfficeAnchor[];
  readonly actionSequences: readonly ActionSequence[];
  readonly coordinateSpace: {
    readonly unit: "OFFICE_UNIT";
    readonly origin: "TOP_LEFT";
    readonly width: number;
    readonly height: number;
  };
  readonly layoutRevision: "deterministic-grid-v1";
  readonly formatVersion: "1.0";
}

export interface OfficeAnchor {
  readonly id: Identifier;
  readonly moduleId: Identifier;
  readonly kind: "WORKSTATION" | "DOOR" | "ROOM_CENTER" | "TRANSIT";
  readonly x: number;
  readonly y: number;
  readonly facingDegrees: 0 | 90 | 180 | 270;
}

export interface OfficeProject {
  readonly id: Identifier;
  readonly name: string;
  readonly departmentIds: readonly Identifier[];
}

export interface OfficeCompilationOptions {
  readonly projects?: readonly OfficeProject[];
  readonly entityStates?: Readonly<Record<Identifier, WorkStatus | "AVAILABLE">>;
  readonly actionSequences?: readonly ActionSequence[];
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
  readonly unitScale: number;
  readonly bounds: { readonly width: number; readonly height: number; readonly depth: number };
  readonly anchorPoints: readonly string[];
  readonly accessibilityFallback: string;
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
  | "TYPE"
  | "SIT"
  | "STAND"
  | "PICK_UP"
  | "PUT_DOWN"
  | "WAIT"
  | "DRINK"
  | "EXIT_THROUGH"
  | "REQUEST_APPROVAL"
  | "CELEBRATE";

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
    if (!asset.id || !asset.interactionSlots.length || !asset.variants.length ||
        !Number.isFinite(asset.unitScale) || asset.unitScale <= 0 ||
        Object.values(asset.bounds).some((value) => !Number.isFinite(value) || value <= 0) ||
        !asset.anchorPoints.length || !asset.accessibilityFallback.trim()) {
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

export function validateOfficeScene(scene: OfficeScene): OfficeScene {
  if (scene.formatVersion !== "1.0" || scene.layoutRevision !== "deterministic-grid-v1" ||
      scene.coordinateSpace.unit !== "OFFICE_UNIT" || scene.coordinateSpace.origin !== "TOP_LEFT" ||
      scene.coordinateSpace.width <= 0 || scene.coordinateSpace.height <= 0) {
    throw new Error("Unsupported office scene contract.");
  }
  uniqueIds(scene.modules, "Office module");
  uniqueIds(scene.entities, "Office entity");
  uniqueIds(scene.anchors, "Office anchor");
  const moduleIds = new Set(scene.modules.map(({ id }) => id));
  const anchorIds = new Set(scene.anchors.map(({ id }) => id));
  for (const module of scene.modules) {
    const { x, y, width, height } = module.bounds;
    if ([x, y, width, height].some((value) => !Number.isInteger(value)) ||
        x < 0 || y < 0 || width < 1 || height < 1 ||
        x + width > scene.coordinateSpace.width || y + height > scene.coordinateSpace.height) {
      throw new Error("Office module bounds are invalid.");
    }
  }
  for (const connection of scene.connections) {
    if (!moduleIds.has(connection.fromModuleId) || !moduleIds.has(connection.toModuleId)) {
      throw new Error("Office connection references an unknown module.");
    }
  }
  for (const anchor of scene.anchors) {
    if (!moduleIds.has(anchor.moduleId) || !Number.isInteger(anchor.x) || !Number.isInteger(anchor.y)) {
      throw new Error("Office anchor is invalid.");
    }
  }
  for (const entity of scene.entities) {
    if (!moduleIds.has(entity.moduleId) || !anchorIds.has(entity.occupancy.anchorId)) {
      throw new Error("Office entity placement is invalid.");
    }
  }
  scene.actionSequences.forEach(validateActionSequence);
  return structuredClone(scene);
}

function placeModules(
  drafts: readonly Omit<OfficeModule, "bounds">[],
): { readonly modules: readonly OfficeModule[]; readonly width: number; readonly height: number } {
  const rooms = drafts.filter(({ kind }) => kind !== "CORRIDOR");
  const height = Math.max(40, Math.ceil(rooms.length / 2) * 30 + 4);
  let roomIndex = 0;
  const modules = drafts.map((module): OfficeModule => {
    if (module.kind === "CORRIDOR") {
      return { ...module, bounds: { x: 58, y: 0, width: 4, height } };
    }
    const column = roomIndex % 2;
    const row = Math.floor(roomIndex / 2);
    roomIndex += 1;
    return {
      ...module,
      bounds: { x: column === 0 ? 0 : 64, y: row * 30 + 2, width: 56, height: 26 },
    };
  });
  return { modules, width: 120, height };
}

export function compileOfficeScene(
  organization: OrganizationDraft,
  options: OfficeCompilationOptions = {},
): OfficeScene {
  const moduleDrafts: Omit<OfficeModule, "bounds">[] = [
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

  for (const project of options.projects ?? []) {
    if (!project.departmentIds.length || project.departmentIds.some((departmentId) =>
      !organization.departments.some(({ id }) => id === departmentId)
    )) throw new Error("Office project references an unknown department.");
  }

  const layout = placeModules(moduleDrafts);
  const modules = layout.modules;

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

  const entities: OfficeEntity[] = [
    ...organization.humans.map((human) => ({
      id: human.id,
      kind: "HUMAN" as const,
      moduleId: `department-${human.departmentId}`,
      state: options.entityStates?.[human.id] ?? "AVAILABLE" as const,
      assetId: human.avatarId,
      occupancy: { kind: "WORKSTATION" as const, anchorId: `workstation-${human.id}` },
    })),
    ...organization.agents.map((agent) => ({
      id: agent.id,
      kind: "AGENT" as const,
      moduleId: `department-${agent.departmentId}`,
      state: options.entityStates?.[agent.id] ?? "WAITING" as const,
      assetId: agent.avatarId,
      occupancy: { kind: "WORKSTATION" as const, anchorId: `workstation-${agent.id}` },
    })),
  ];
  const entityOffsets = new Map<Identifier, number>();
  const anchors: OfficeAnchor[] = [
    ...modules.filter(({ kind }) => kind !== "CORRIDOR").map((module): OfficeAnchor => ({
      id: `door-${module.id}`,
      moduleId: module.id,
      kind: "DOOR",
      x: module.bounds.x + (module.bounds.x < 58 ? module.bounds.width : 0),
      y: module.bounds.y + Math.floor(module.bounds.height / 2),
      facingDegrees: module.bounds.x < 58 ? 90 : 270,
    })),
    ...entities.map((entity): OfficeAnchor => {
      const module = modules.find(({ id }) => id === entity.moduleId);
      if (!module) throw new Error("Office entity references an unknown module.");
      const offset = entityOffsets.get(module.id) ?? 0;
      entityOffsets.set(module.id, offset + 1);
      return {
        id: entity.occupancy.anchorId,
        moduleId: module.id,
        kind: "WORKSTATION",
        x: module.bounds.x + 8 + (offset % 4) * 10,
        y: module.bounds.y + 12 + Math.floor(offset / 4) * 6,
        facingDegrees: 180,
      };
    }),
  ];

  return validateOfficeScene({
    companyId: organization.company.id,
    modules,
    connections,
    entities,
    anchors,
    actionSequences: (options.actionSequences ?? []).map(validateActionSequence),
    coordinateSpace: { unit: "OFFICE_UNIT", origin: "TOP_LEFT", width: layout.width, height: layout.height },
    layoutRevision: "deterministic-grid-v1",
    formatVersion: "1.0",
  });
}
