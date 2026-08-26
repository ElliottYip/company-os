import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_OS_3D_CAMERA_POLICY,
  resolveWallOpacity,
} from "../web/office-3d-renderer-policy.ts";

test("3D camera keeps a fixed isometric pitch while yaw snaps to four useful views", () => {
  assert.equal(COMPANY_OS_3D_CAMERA_POLICY.projection, "ORTHOGRAPHIC");
  assert.equal(COMPANY_OS_3D_CAMERA_POLICY.pitchDegrees, 42);
  assert.deepEqual(COMPANY_OS_3D_CAMERA_POLICY.yaw.snapDegrees, [45, 135, 225, 315]);
});

test("only a wall blocking the focused target fades and collision remains intact", () => {
  assert.equal(resolveWallOpacity({ blocksFocusedTarget: true, isFocusedRoomWall: false }), 0.14);
  assert.equal(resolveWallOpacity({ blocksFocusedTarget: false, isFocusedRoomWall: false }), 1);
  assert.equal(resolveWallOpacity({ blocksFocusedTarget: true, isFocusedRoomWall: true }), 1);
  assert.equal(COMPANY_OS_3D_CAMERA_POLICY.wallOcclusion.preserveCollision, true);
});
