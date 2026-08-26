import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every PostgreSQL migration is ordered, split into executable statements, and non-destructive", async () => {
  const journal = JSON.parse(await readFile(new URL(
    "../adapters/persistence/postgres/migrations/meta/_journal.json",
    import.meta.url,
  ), "utf8")) as { entries: { idx: number; tag: string; when: number }[] };
  assert.deepEqual(journal.entries.map(({ idx }) => idx), journal.entries.map((_, index) => index));
  assert.equal(new Set(journal.entries.map(({ tag }) => tag)).size, journal.entries.length);
  assert.deepEqual([...journal.entries].map(({ when }) => when), [...journal.entries].map(({ when }) => when).sort());
  for (const entry of journal.entries) {
    const sql = await readFile(new URL(
      `../adapters/persistence/postgres/migrations/${entry.tag}.sql`,
      import.meta.url,
    ), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((value) => value.trim());
    assert.ok(statements.length > 1, `${entry.tag} must contain statement breakpoints`);
    assert.ok(statements.every(Boolean), `${entry.tag} contains an empty statement`);
    assert.ok(statements.every((statement) => /^(?:CREATE|ALTER|INSERT|UPDATE)\b/i.test(statement)),
      `${entry.tag} contains an unclassified migration statement`);
    assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i);
  }
});
