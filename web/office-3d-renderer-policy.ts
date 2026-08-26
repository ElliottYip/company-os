import type { OfficeCameraPolicy } from "../ports/office-renderer-port.ts";

export const COMPANY_OS_3D_CAMERA_POLICY: OfficeCameraPolicy = {
  projection: "ORTHOGRAPHIC",
  pitchDegrees: 42,
  yaw: {
    mode: "HORIZONTAL_ORBIT_WITH_SNAP",
    snapDegrees: [45, 135, 225, 315],
  },
  zoom: { minimum: 0.7, maximum: 1.7 },
  wallOcclusion: {
    mode: "FADE_BLOCKING_WALLS",
    blockingOpacity: 0.14,
    transitionMs: 180,
    preserveCollision: true,
  },
};

export function resolveWallOpacity(input: {
  readonly blocksFocusedTarget: boolean;
  readonly isFocusedRoomWall: boolean;
  readonly policy?: OfficeCameraPolicy;
}): number {
  const policy = input.policy ?? COMPANY_OS_3D_CAMERA_POLICY;
  if (!input.blocksFocusedTarget || input.isFocusedRoomWall) return 1;
  return policy.wallOcclusion.blockingOpacity;
}
