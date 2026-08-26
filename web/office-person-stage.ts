export interface OfficeStagePoint {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export type OfficeStageModuleKind = "WORKSTATION" | "CHAIR" | "PANTRY" | "RESTROOM" | "BALCONY";

export interface OfficeStageModule {
  readonly id: string;
  readonly kind: OfficeStageModuleKind;
  readonly label: string;
  readonly image: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
}

export interface OfficeStageOccluder {
  readonly id: string;
  readonly moduleId: string;
  readonly clipPath: string;
  readonly depth: number;
}

export interface OfficeStageRealScale {
  readonly worldWidthMm: number;
  readonly workstationWidthMm: number;
  readonly workstationDepthMm: number;
  readonly coffeeCounterWidthMm: number;
  readonly coffeeCounterDepthMm: number;
  readonly balconyGroupWidthMm: number;
  readonly restroomGroupWidthMm: number;
}

// The 2.5D assets share one physical scale instead of being sized by eye.
// A 1,600 mm desk occupies 25% of the 7,200 mm world canvas after accounting
// for the transparent padding in the source image. Utility widths use their
// measured alpha bounds so their visible footprint stays comparable.
export const PERSON_OFFICE_REAL_SCALE: OfficeStageRealScale = {
  worldWidthMm: 7_200,
  workstationWidthMm: 1_600,
  workstationDepthMm: 800,
  coffeeCounterWidthMm: 2_400,
  coffeeCounterDepthMm: 635,
  balconyGroupWidthMm: 2_350,
  restroomGroupWidthMm: 2_100,
} as const;

const MODULE_ALPHA_WIDTH_RATIO = {
  WORKSTATION: 0.9486,
  PANTRY: 0.9147,
  BALCONY: 0.7188,
  RESTROOM: 0.7521,
} as const;

function canvasWidthPercent(realWidthMm: number, alphaWidthRatio: number): number {
  const visibleDeskPercent = 25 * MODULE_ALPHA_WIDTH_RATIO.WORKSTATION;
  const visiblePercent = visibleDeskPercent * (realWidthMm / PERSON_OFFICE_REAL_SCALE.workstationWidthMm);
  return Number((visiblePercent / alphaWidthRatio).toFixed(2));
}

export const PERSON_OFFICE_WORKSTATION_IMAGE = new URL(
  "./assets/scenes/person-office/workstation-desk-v2.webp",
  import.meta.url,
).href;

export const PERSON_OFFICE_CHAIR_IMAGE = new URL(
  "./assets/scenes/person-office/workstation-chair-v1.webp",
  import.meta.url,
).href;

const PANTRY_IMAGE = new URL("./assets/scenes/person-office/pantry-v1.webp", import.meta.url).href;
const RESTROOM_IMAGE = new URL("./assets/scenes/person-office/restroom-v2.webp", import.meta.url).href;
const BALCONY_IMAGE = new URL("./assets/scenes/person-office/balcony-v2.webp", import.meta.url).href;

export const PERSON_OFFICE_WORKSTATIONS: readonly OfficeStagePoint[] = [
  // Seat anchors live inside the chair silhouette, not below the workstation.
  // The foreground desk slice is then redrawn above the seated actor.
  { id: "desk-left-1", label: "左列工位 1", x: 52, y: 22 },
  { id: "desk-right-1", label: "右列工位 1", x: 78, y: 22 },
  { id: "desk-left-2", label: "左列工位 2", x: 52, y: 51 },
  { id: "desk-right-2", label: "右列工位 2", x: 78, y: 51 },
  { id: "desk-left-3", label: "左列工位 3", x: 52, y: 80 },
  { id: "desk-right-3", label: "右列工位 3", x: 78, y: 80 },
] as const;

const WORKSTATION_CENTERS = [
  { id: "desk-left-1", x: 52, y: 20, depth: 31 },
  { id: "desk-right-1", x: 78, y: 20, depth: 31 },
  { id: "desk-left-2", x: 52, y: 49, depth: 60 },
  { id: "desk-right-2", x: 78, y: 49, depth: 60 },
  { id: "desk-left-3", x: 52, y: 78, depth: 89 },
  { id: "desk-right-3", x: 78, y: 78, depth: 89 },
] as const;

export const PERSON_OFFICE_MODULES: readonly OfficeStageModule[] = [
  {
    id: "pantry",
    kind: "PANTRY",
    label: "茶水间",
    image: PANTRY_IMAGE,
    x: 18,
    y: 18,
    width: canvasWidthPercent(PERSON_OFFICE_REAL_SCALE.coffeeCounterWidthMm, MODULE_ALPHA_WIDTH_RATIO.PANTRY),
    depth: 26,
  },
  {
    id: "balcony",
    kind: "BALCONY",
    label: "阳台",
    image: BALCONY_IMAGE,
    x: 18,
    y: 50,
    width: canvasWidthPercent(PERSON_OFFICE_REAL_SCALE.balconyGroupWidthMm, MODULE_ALPHA_WIDTH_RATIO.BALCONY),
    depth: 58,
  },
  {
    id: "restroom",
    kind: "RESTROOM",
    label: "洗手间",
    image: RESTROOM_IMAGE,
    x: 18,
    y: 81,
    width: canvasWidthPercent(PERSON_OFFICE_REAL_SCALE.restroomGroupWidthMm, MODULE_ALPHA_WIDTH_RATIO.RESTROOM),
    depth: 90,
  },
  ...WORKSTATION_CENTERS.flatMap((point): readonly OfficeStageModule[] => [
    {
      id: point.id,
      kind: "WORKSTATION",
      label: point.id,
      image: PERSON_OFFICE_WORKSTATION_IMAGE,
      x: point.x,
      y: point.y,
      width: 25,
      depth: point.depth - 12,
    },
    {
      id: `${point.id}-chair`,
      kind: "CHAIR",
      label: `${point.id} 椅子`,
      image: PERSON_OFFICE_CHAIR_IMAGE,
      x: point.x,
      y: point.y,
      width: 25,
      depth: point.depth + 2,
    },
  ]),
] as const;

export const PERSON_OFFICE_DESTINATIONS: readonly OfficeStagePoint[] = [
  ...PERSON_OFFICE_WORKSTATIONS,
  { id: "pantry", label: "茶水间", x: 33, y: 19 },
  { id: "balcony", label: "阳台", x: 33, y: 51 },
  { id: "restroom", label: "洗手间", x: 33, y: 82 },
  { id: "aisle", label: "中央通道", x: 38, y: 58 },
] as const;

// Each workstation uses the same source image twice: the full module sits
// behind the actor, while the clipped desk top is redrawn in front. Utility
// modules use the same pattern for counters, half-walls, and balcony railings.
export const PERSON_OFFICE_OCCLUDERS: readonly OfficeStageOccluder[] = [
  { id: "balcony-railing", moduleId: "balcony", clipPath: "inset(46% 0 0 0)", depth: 31 },
  { id: "pantry-counter-front", moduleId: "pantry", clipPath: "inset(0 0 28% 0)", depth: 59 },
  { id: "restroom-front", moduleId: "restroom", clipPath: "inset(0 0 10% 0)", depth: 90 },
] as const;

export function officeStageRoute(from: OfficeStagePoint, to: OfficeStagePoint): readonly OfficeStagePoint[] {
  const aisleX = 38;
  const fromAisle = { id: "route-from", label: "通道", x: aisleX, y: from.y };
  const toAisle = { id: "route-to", label: "通道", x: aisleX, y: to.y };
  if (Math.abs(from.x - to.x) < 12 || from.id === "free-floor" || to.id === "free-floor") return [to];
  return [fromAisle, toAisle, to];
}

export function officeStageDepth(y: number): number {
  return Math.round(Math.max(0, Math.min(100, y)) * 100);
}

export function officeStageTravelDurationMs(from: OfficeStagePoint, to: OfficeStagePoint): number {
  const pixelDistance = Math.hypot((to.x - from.x) * 10.11, (to.y - from.y) * 8.51);
  return Math.round(Math.max(360, Math.min(1_450, pixelDistance * 5.4)));
}
