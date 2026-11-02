import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("payment operations migration uses UUID relations and operation correlation indexes", async () => {
  const migration = await readFile(
    new URL("../../../migrations/0004_payment_operations.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /deal_id uuid NOT NULL REFERENCES deals\(id\)/);
  assert.match(migration, /milestone_id uuid REFERENCES milestones\(id\)/);
  assert.match(migration, /ALTER TABLE payment_operations DROP CONSTRAINT IF EXISTS payment_operations_deal_id_fkey/);
  assert.match(migration, /payment_operations_milestone_idx/);
  assert.match(migration, /payment_operations_provider_reference_idx/);
  assert.match(migration, /m\.id = NEW\.milestone_id AND m\.deal_id = NEW\.deal_id/);
});
