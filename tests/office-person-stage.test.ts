import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_OFFICE_DESTINATIONS,
  PERSON_OFFICE_CHAIR_IMAGE,
  PERSON_OFFICE_MODULES,
  PERSON_OFFICE_OCCLUDERS,
  PERSON_OFFICE_REAL_SCALE,
  PERSON_OFFICE_WORKSTATION_IMAGE,
  PERSON_OFFICE_WORKSTATIONS,
  officeStageDepth,
  officeStageRoute,
  officeStageTravelDurationMs,
} from "../web/office-person-stage.ts";

test("person office stage has two columns of three workstations", () => {
  assert.equal(PERSON_OFFICE_WORKSTATIONS.length, 6);
  assert.deepEqual([...new Set(PERSON_OFFICE_WORKSTATIONS.map(({ x }) => x))], [52, 78]);
  assert.equal(PERSON_OFFICE_WORKSTATIONS.filter(({ x }) => x === 52).length, 3);
  assert.equal(PERSON_OFFICE_WORKSTATIONS.filter(({ x }) => x === 78).length, 3);
  const modules = PERSON_OFFICE_MODULES.filter(({ kind }) => kind === "WORKSTATION");
  assert.equal(modules.length, 6);
  assert.ok(modules.every(({ image }) => image === PERSON_OFFICE_WORKSTATION_IMAGE));
  const chairs = PERSON_OFFICE_MODULES.filter(({ kind }) => kind === "CHAIR");
  assert.equal(chairs.length, 6);
  assert.ok(chairs.every(({ image }) => image === PERSON_OFFICE_CHAIR_IMAGE));
});

test("person office stage routes cross-zone movement through the shared aisle", () => {
  const route = officeStageRoute(PERSON_OFFICE_WORKSTATIONS[0]!, PERSON_OFFICE_DESTINATIONS.find(({ id }) => id === "pantry")!);
  assert.equal(route.at(-1)?.id, "pantry");
  assert.ok(route.slice(0, -1).every(({ x }) => x === 38));
});

test("person office stage exposes pantry, restroom and occlusion planes", () => {
  assert.ok(PERSON_OFFICE_DESTINATIONS.some(({ id }) => id === "pantry"));
  assert.ok(PERSON_OFFICE_DESTINATIONS.some(({ id }) => id === "restroom"));
  assert.ok(PERSON_OFFICE_DESTINATIONS.some(({ id }) => id === "balcony"));
  assert.ok(PERSON_OFFICE_OCCLUDERS.some(({ moduleId }) => moduleId === "pantry"));
  assert.ok(PERSON_OFFICE_OCCLUDERS.some(({ moduleId }) => moduleId === "restroom"));
  assert.ok(PERSON_OFFICE_OCCLUDERS.some(({ moduleId }) => moduleId === "balcony"));
  assert.ok(officeStageDepth(80) > officeStageDepth(30));
});

test("person office modules use one documented physical scale", () => {
  assert.deepEqual(
    {
      workstation: [PERSON_OFFICE_REAL_SCALE.workstationWidthMm, PERSON_OFFICE_REAL_SCALE.workstationDepthMm],
      coffeeCounter: [PERSON_OFFICE_REAL_SCALE.coffeeCounterWidthMm, PERSON_OFFICE_REAL_SCALE.coffeeCounterDepthMm],
    },
    { workstation: [1_600, 800], coffeeCounter: [2_400, 635] },
  );
  const workstation = PERSON_OFFICE_MODULES.find(({ kind }) => kind === "WORKSTATION");
  const pantry = PERSON_OFFICE_MODULES.find(({ kind }) => kind === "PANTRY");
  const balcony = PERSON_OFFICE_MODULES.find(({ kind }) => kind === "BALCONY");
  const restroom = PERSON_OFFICE_MODULES.find(({ kind }) => kind === "RESTROOM");
  assert.ok(workstation && pantry && balcony && restroom);
  assert.ok(pantry.width > workstation.width);
  assert.ok(balcony.width > workstation.width);
  assert.ok(restroom.width > workstation.width);
});

test("person office travel duration is continuous and distance based", () => {
  const short = officeStageTravelDurationMs(
    { id: "a", label: "A", x: 10, y: 10 },
    { id: "b", label: "B", x: 12, y: 10 },
  );
  const long = officeStageTravelDurationMs(
    { id: "a", label: "A", x: 10, y: 10 },
    { id: "b", label: "B", x: 80, y: 80 },
  );
  assert.equal(short, 360);
  assert.ok(long > short);
  assert.ok(long <= 1_450);
});
