import type { Identifier, WorkStatus } from "./control-plane.ts";
import type { OrganizationDraft } from "./organization.ts";

export type OfficeModuleKind =
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

export interface OfficeEntity {
  readonly id: Identifier;
  readonly kind: "HUMAN" | "AGENT";
  readonly moduleId: Identifier;
  readonly state: WorkStatus | "AVAILABLE";
  readonly assetId: Identifier;
}

export interface OfficeScene {
  readonly companyId: Identifier;
  readonly modules: readonly OfficeModule[];
  readonly entities: readonly OfficeEntity[];
  readonly formatVersion: "1.0";
}

export function compileOfficeScene(organization: OrganizationDraft): OfficeScene {
  const modules: OfficeModule[] = [
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
    { id: "meeting-room", kind: "MEETING_ROOM", label: "会议室", capacity: 8 },
    { id: "pantry", kind: "PANTRY", label: "茶水间", capacity: 5 },
    { id: "restroom", kind: "RESTROOM", label: "洗手间", capacity: 2 },
    { id: "corridor", kind: "CORRIDOR", label: "走廊", capacity: 16 },
  ];

  return {
    companyId: organization.company.id,
    modules,
    entities: [
      ...organization.humans.map((human) => ({
        id: human.id,
        kind: "HUMAN" as const,
        moduleId: `department-${human.departmentId}`,
        state: "AVAILABLE" as const,
        assetId: human.avatarId,
      })),
      ...organization.agents.map((agent) => ({
        id: agent.id,
        kind: "AGENT" as const,
        moduleId: `department-${agent.departmentId}`,
        state: "WAITING" as const,
        assetId: agent.avatarId,
      })),
    ],
    formatVersion: "1.0",
  };
}

