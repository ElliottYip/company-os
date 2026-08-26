import assert from "node:assert/strict";
import test from "node:test";

import {
  getOffice2dRoom,
  OFFICE_2_5D_ROOMS,
  validateOffice2dCatalog,
} from "../web/office-2-5d-catalog.ts";

test("2.5D room catalog keeps every preset aligned with fixed workstation slots", () => {
  assert.doesNotThrow(() => validateOffice2dCatalog());
  assert.equal(new Set(OFFICE_2_5D_ROOMS.map(({ id }) => id)).size, OFFICE_2_5D_ROOMS.length);
  for (const room of OFFICE_2_5D_ROOMS) {
    for (const preset of room.presets) {
      assert.equal(preset.occupants.length, room.slots.length, `${room.id}/${preset.id}`);
    }
  }
});

test("public utility rooms stay free of person and Agent overlays", () => {
  for (const id of ["pantry", "restroom"] as const) {
    const room = getOffice2dRoom(id);
    assert.equal(room.slots.length, 0);
    assert.deepEqual(room.presets[0]?.occupants, []);
  }
});

test("default three-seat room supports one accountable human and two Agents", () => {
  const room = getOffice2dRoom("work-3");
  assert.deepEqual(room.presets.find(({ id }) => id === "1h2a")?.occupants, ["HUMAN", "AGENT", "AGENT"]);
  assert.equal(room.slots.length, 3);
  assert.ok(room.populatedTeamImages?.MALE.includes("team-room-1h2a-male"));
  assert.ok(room.populatedTeamImages?.FEMALE.includes("team-room-1h2a-female"));
  assert.ok(room.slots.every(({ facing }) => facing === "FRONT_LEFT" || facing === "FRONT_RIGHT"));
});

test("every team-room preset has exactly one accountable human", () => {
  for (const room of OFFICE_2_5D_ROOMS.filter(({ id }) => id.startsWith("work-"))) {
    for (const preset of room.presets) {
      assert.equal(preset.occupants.filter((kind) => kind === "HUMAN").length, 1, `${room.id}/${preset.id}`);
    }
  }
});

test("admitted team-room images currently cover one human with 1, 2, and 3 Agents", () => {
  const expected = new Map([["work-2", 1], ["work-3", 2], ["work-4", 3]]);
  for (const [id, agentCount] of expected) {
    const room = getOffice2dRoom(id as "work-2" | "work-3" | "work-4" | "work-8");
    assert.equal(room.presets[0]?.occupants.filter((kind) => kind === "AGENT").length, agentCount);
    assert.ok(room.populatedTeamImages?.MALE.includes(`${agentCount}a-male`));
    assert.ok(room.populatedTeamImages?.FEMALE.includes(`${agentCount}a-female`));
  }
  assert.equal(getOffice2dRoom("work-8").populatedTeamImages, undefined);
});
