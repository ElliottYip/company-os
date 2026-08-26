export type OfficeRoomId =
  | "work-2"
  | "work-3"
  | "work-4"
  | "work-8"
  | "meeting"
  | "reception"
  | "connector"
  | "pantry"
  | "restroom";

export type OfficeOccupantKind = "HUMAN" | "AGENT" | "EMPTY";
export type OfficeSpriteFacing = "FRONT_LEFT" | "FRONT_RIGHT";
export type OfficeHumanVariant = "MALE" | "FEMALE";

export interface OfficeSpriteSlot {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly facing: OfficeSpriteFacing;
  readonly depth: number;
}

export interface OfficeOccupancyPreset {
  readonly id: string;
  readonly label: string;
  readonly occupants: readonly OfficeOccupantKind[];
}

export interface OfficeRoomDefinition {
  readonly id: OfficeRoomId;
  readonly label: string;
  readonly description: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly populatedTeamImages?: Readonly<Record<OfficeHumanVariant, string>>;
  readonly slots: readonly OfficeSpriteSlot[];
  readonly presets: readonly OfficeOccupancyPreset[];
}

function moduleImage(fileName: string): string {
  return new URL(`./assets/scenes/modules/${fileName}`, import.meta.url).href;
}

function preset(id: string, label: string, occupants: readonly OfficeOccupantKind[]): OfficeOccupancyPreset {
  return { id, label, occupants };
}

const WORK_2_SLOTS: readonly OfficeSpriteSlot[] = [
  { id: "desk-left", left: 30, top: 60, width: 18, facing: "FRONT_RIGHT", depth: 4 },
  { id: "desk-right", left: 70, top: 48, width: 18, facing: "FRONT_LEFT", depth: 3 },
];

const WORK_3_SLOTS: readonly OfficeSpriteSlot[] = [
  { id: "desk-left", left: 24, top: 58, width: 17, facing: "FRONT_RIGHT", depth: 5 },
  { id: "desk-back", left: 72, top: 35, width: 15, facing: "FRONT_LEFT", depth: 2 },
  { id: "desk-front", left: 76, top: 67, width: 17, facing: "FRONT_LEFT", depth: 6 },
];

const WORK_4_SLOTS: readonly OfficeSpriteSlot[] = [
  { id: "desk-left-back", left: 27, top: 37, width: 14, facing: "FRONT_RIGHT", depth: 2 },
  { id: "desk-right-back", left: 72, top: 35, width: 14, facing: "FRONT_LEFT", depth: 2 },
  { id: "desk-left-front", left: 27, top: 67, width: 16, facing: "FRONT_RIGHT", depth: 6 },
  { id: "desk-right-front", left: 75, top: 67, width: 16, facing: "FRONT_LEFT", depth: 6 },
];

const WORK_8_SLOTS: readonly OfficeSpriteSlot[] = [
  { id: "row-a-1", left: 22, top: 34, width: 11, facing: "FRONT_RIGHT", depth: 2 },
  { id: "row-a-2", left: 40, top: 31, width: 11, facing: "FRONT_LEFT", depth: 2 },
  { id: "row-a-3", left: 61, top: 31, width: 11, facing: "FRONT_RIGHT", depth: 2 },
  { id: "row-a-4", left: 79, top: 35, width: 11, facing: "FRONT_LEFT", depth: 2 },
  { id: "row-b-1", left: 21, top: 66, width: 13, facing: "FRONT_RIGHT", depth: 6 },
  { id: "row-b-2", left: 40, top: 63, width: 13, facing: "FRONT_LEFT", depth: 6 },
  { id: "row-b-3", left: 61, top: 63, width: 13, facing: "FRONT_RIGHT", depth: 6 },
  { id: "row-b-4", left: 80, top: 66, width: 13, facing: "FRONT_LEFT", depth: 6 },
];

export const OFFICE_2_5D_ROOMS: readonly OfficeRoomDefinition[] = [
  {
    id: "work-3",
    label: "三人工位",
    description: "默认组合：1 名真人与 2 个演示 Agent",
    image: moduleImage("work-capacity-3.png"),
    imageAlt: "温暖的三人工位房间，三张桌椅沿墙布置，中间保持通行空间",
    populatedTeamImages: {
      MALE: moduleImage("team-room-1h2a-male.png"),
      FEMALE: moduleImage("team-room-1h2a-female.png"),
    },
    slots: WORK_3_SLOTS,
    presets: [
      preset("1h2a", "1 真人 · 2 Agent", ["HUMAN", "AGENT", "AGENT"]),
      preset("1h1a", "1 真人 · 1 Agent", ["HUMAN", "AGENT", "EMPTY"]),
      preset("1h", "1 真人", ["HUMAN", "EMPTY", "EMPTY"]),
    ],
  },
  {
    id: "work-2",
    label: "双人工位",
    description: "适合一名负责人和一个 Agent 的最小单元",
    image: moduleImage("work-capacity-2.png"),
    imageAlt: "两张工位围成的温暖小型办公室",
    populatedTeamImages: {
      MALE: moduleImage("team-room-1h1a-male.png"),
      FEMALE: moduleImage("team-room-1h1a-female.png"),
    },
    slots: WORK_2_SLOTS,
    presets: [
      preset("1h1a", "1 真人 · 1 Agent", ["HUMAN", "AGENT"]),
      preset("1h", "1 真人", ["HUMAN", "EMPTY"]),
    ],
  },
  {
    id: "work-4",
    label: "四人工位",
    description: "可以承载小型 Agent Boss 团队",
    image: moduleImage("work-capacity-4.png"),
    imageAlt: "四张工位构成的明亮团队办公室",
    populatedTeamImages: {
      MALE: moduleImage("team-room-1h3a-male.png"),
      FEMALE: moduleImage("team-room-1h3a-female.png"),
    },
    slots: WORK_4_SLOTS,
    presets: [
      preset("1h3a", "1 真人 · 3 Agent", ["HUMAN", "AGENT", "AGENT", "AGENT"]),
      preset("1h2a", "1 真人 · 2 Agent", ["HUMAN", "AGENT", "AGENT", "EMPTY"]),
    ],
  },
  {
    id: "work-8",
    label: "八人工位",
    description: "较大的部门单元，仍采用固定工位与静态状态",
    image: moduleImage("work-capacity-8.png"),
    imageAlt: "八张工位组成的开放式部门办公室",
    slots: WORK_8_SLOTS,
    presets: [
      preset("1h5a", "1 真人 · 5 Agent", ["HUMAN", "AGENT", "AGENT", "AGENT", "AGENT", "AGENT", "EMPTY", "EMPTY"]),
      preset("1h4a", "1 真人 · 4 Agent", ["HUMAN", "AGENT", "AGENT", "AGENT", "AGENT", "EMPTY", "EMPTY", "EMPTY"]),
    ],
  },
  {
    id: "meeting",
    label: "项目会议室",
    description: "项目协作和真人审批会使用的公共空间",
    image: moduleImage("meeting-project.png"),
    imageAlt: "带会议桌和展示屏的项目会议室",
    slots: WORK_4_SLOTS,
    presets: [preset("empty", "共享空间", ["EMPTY", "EMPTY", "EMPTY", "EMPTY"])],
  },
  {
    id: "reception",
    label: "前台",
    description: "访客入口与公司接待空间",
    image: moduleImage("reception.png"),
    imageAlt: "带接待台和等候区的明亮前台",
    slots: WORK_2_SLOTS,
    presets: [preset("empty", "共享空间", ["EMPTY", "EMPTY"])],
  },
  {
    id: "connector",
    label: "连接器工作间",
    description: "表现不同厂商 Agent 的平等连接关系",
    image: moduleImage("connector-lounge.png"),
    imageAlt: "用于 Agent 连接器配置的双人工位空间",
    slots: WORK_2_SLOTS,
    presets: [preset("empty", "共享空间", ["EMPTY", "EMPTY"])],
  },
  {
    id: "pantry",
    label: "茶水间",
    description: "纯背景公共空间，不放置人物图层",
    image: moduleImage("pantry.png"),
    imageAlt: "带水槽、咖啡机和休息桌的茶水间",
    slots: [],
    presets: [preset("empty", "公共空间", [])],
  },
  {
    id: "restroom",
    label: "卫生间",
    description: "纯背景公共空间，不放置人物图层",
    image: moduleImage("restroom.png"),
    imageAlt: "整洁的办公室卫生间",
    slots: [],
    presets: [preset("empty", "公共空间", [])],
  },
] as const;

export function getOffice2dRoom(id: OfficeRoomId): OfficeRoomDefinition {
  const room = OFFICE_2_5D_ROOMS.find((candidate) => candidate.id === id);
  if (!room) throw new Error(`Unknown 2.5D office room: ${id}`);
  return room;
}

export function validateOffice2dCatalog(rooms: readonly OfficeRoomDefinition[] = OFFICE_2_5D_ROOMS): void {
  const ids = new Set<string>();
  for (const room of rooms) {
    if (ids.has(room.id)) throw new Error(`Duplicate 2.5D room ID: ${room.id}`);
    ids.add(room.id);
    if (!room.label.trim() || !room.imageAlt.trim() || !room.presets.length) {
      throw new Error(`Incomplete 2.5D room definition: ${room.id}`);
    }
    const slotIds = new Set(room.slots.map(({ id }) => id));
    if (slotIds.size !== room.slots.length) throw new Error(`Duplicate slot ID in room: ${room.id}`);
    for (const slot of room.slots) {
      if (slot.left < 0 || slot.left > 100 || slot.top < 0 || slot.top > 100 || slot.width <= 0 || slot.width > 100) {
        throw new Error(`Invalid sprite slot in room: ${room.id}`);
      }
    }
    for (const layout of room.presets) {
      if (layout.occupants.length !== room.slots.length) {
        throw new Error(`Preset ${layout.id} does not fill every slot in room ${room.id}`);
      }
    }
  }
}
