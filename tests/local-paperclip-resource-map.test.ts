import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalPaperclipResourceMap } from "../adapters/paperclip/local-paperclip-resource-map.ts";

test("Paperclip opaque mappings survive restart and remain tenant-scoped", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-paperclip-map-"));
  const first = new LocalPaperclipResourceMap(directory);
  await first.bind("company-one", "work", "work-one", "11111111-1111-4111-8111-111111111111");
  await first.bind("company-two", "work", "work-one", "22222222-2222-4222-8222-222222222222");

  const restarted = new LocalPaperclipResourceMap(directory);
  assert.equal(await restarted.getUpstreamId("company-one", "work", "work-one"), "11111111-1111-4111-8111-111111111111");
  assert.equal(await restarted.getUpstreamId("company-two", "work", "work-one"), "22222222-2222-4222-8222-222222222222");
  assert.equal(await restarted.getCompanyOsId("company-one", "work", "22222222-2222-4222-8222-222222222222"), null);
});

test("Paperclip mappings are idempotent and reject either side being rebound", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-paperclip-map-"));
  const map = new LocalPaperclipResourceMap(directory);
  const upstream = "11111111-1111-4111-8111-111111111111";
  await map.bind("company-one", "work", "work-one", upstream);
  await map.bind("company-one", "work", "work-one", upstream);
  await assert.rejects(
    map.bind("company-one", "work", "work-one", "22222222-2222-4222-8222-222222222222"),
    /mapping conflict/i,
  );
  await assert.rejects(
    map.bind("company-one", "work", "work-two", upstream),
    /mapping conflict/i,
  );
});

test("Paperclip mapping backup is portable, integrity checked, and non-overwriting", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "company-os-paperclip-map-"));
  const restoreDirectory = await mkdtemp(join(tmpdir(), "company-os-paperclip-map-"));
  const source = new LocalPaperclipResourceMap(sourceDirectory);
  await source.bind("company-one", "agent", "agent-one", "11111111-1111-4111-8111-111111111111");
  const backup = await source.exportBackup("company-one");

  const restored = new LocalPaperclipResourceMap(restoreDirectory);
  await restored.restoreBackup("company-one", backup);
  assert.equal(await restored.exportBackup("company-one"), backup);
  await assert.rejects(restored.restoreBackup("company-one", backup), /not empty/i);

  const empty = new LocalPaperclipResourceMap(await mkdtemp(join(tmpdir(), "company-os-paperclip-map-")));
  await assert.rejects(
    empty.restoreBackup("company-one", backup.replace('"digest":"sha256:', '"digest":"sha256:bad-')),
    /digest or schema/i,
  );
});

test("Paperclip mapping loader fails closed on duplicate or corrupt bindings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-paperclip-map-"));
  await writeFile(join(directory, "company-one.paperclip-map.json"), JSON.stringify({
    schemaVersion: 1,
    companyId: "company-one",
    bindings: [
      { kind: "work", companyOsId: "work-one", upstreamId: "upstream-one" },
      { kind: "work", companyOsId: "work-one", upstreamId: "upstream-two" }
    ]
  }), "utf8");
  await assert.rejects(
    new LocalPaperclipResourceMap(directory).getUpstreamId("company-one", "work", "work-one"),
    /corrupt Paperclip resource map/i,
  );
});
