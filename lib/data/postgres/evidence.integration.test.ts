/**
 * PostgreSQL evidence-byte storage integration tests.
 *
 * Same contract as the other integration files: skipped unless
 * FAIRHOLD_TEST_DATABASE_URL points at an isolated database, applied through the
 * real migrations, and each file confined to its own schema.
 *
 * What this proves: when PostgreSQL is configured, evidence bytes are stored in
 * the database — not on the instance filesystem — so a download still works
 * after the process that accepted the upload is gone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { runMigrations } from "./migrate.ts";
import {
  prepareIntegrationDatabase,
  type IntegrationDatabase,
} from "./integration-database.ts";
import {
  deletePostgresEvidenceFile,
  readPostgresEvidenceFile,
  writePostgresEvidenceFile,
} from "./evidence.ts";
import { readEvidenceFile, usesDurableEvidenceStorage, writeEvidenceFile } from "../storage.ts";

const TEST_URL = process.env.FAIRHOLD_TEST_DATABASE_URL;
const live = Boolean(TEST_URL);

const skipReason = live
  ? false
  : "set FAIRHOLD_TEST_DATABASE_URL (isolated Postgres) to run these tests";

let pool: pg.Pool;
let database: IntegrationDatabase | null = null;

test.before(async () => {
  if (!TEST_URL) return;
  database = await prepareIntegrationDatabase(TEST_URL, "evidence-files");
  process.env.DATABASE_URL = database.connectionString;
  pool = new pg.Pool({ connectionString: database.connectionString, max: 2 });
  await runMigrations(pool);
});

test.after(async () => {
  if (!live) return;
  await pool.end();
  delete process.env.DATABASE_URL;
  await database?.drop();
});

test(
  "evidence bytes round trip through the database",
  { skip: skipReason },
  async () => {
    const storageKey = `evidence/${randomUUID()}-round-trip.txt`;
    const bytes = new TextEncoder().encode("handoff reviewed at three viewports");

    await writePostgresEvidenceFile({
      storageKey,
      bytes,
      contentType: "text/plain",
    });
    const read = await readPostgresEvidenceFile(storageKey);
    assert.equal(new TextDecoder().decode(read), "handoff reviewed at three viewports");

    const row = await pool.query(
      "SELECT byte_size, content_type FROM evidence_files WHERE storage_key = $1",
      [storageKey],
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].byte_size, String(bytes.byteLength));
    assert.equal(row.rows[0].content_type, "text/plain");

    await deletePostgresEvidenceFile(storageKey);
    await assert.rejects(() => readPostgresEvidenceFile(storageKey), /Evidence file not found/);
  },
);

test(
  "deleting an absent object stays idempotent",
  { skip: skipReason },
  async () => {
    await deletePostgresEvidenceFile(`evidence/${randomUUID()}-never-written.txt`);
  },
);

test(
  "the storage seam uses PostgreSQL when it is configured",
  { skip: skipReason },
  async () => {
    assert.equal(usesDurableEvidenceStorage(), true);

    const key = await writeEvidenceFile(
      "seam.txt",
      new TextEncoder().encode("bytes must outlive the instance"),
      "text/plain",
    );
    assert.match(key, /^evidence\/[0-9a-f-]{36}-seam\.txt$/);

    // Stored in the database, so the metadata row and the bytes share one key.
    const row = await pool.query(
      "SELECT byte_size FROM evidence_files WHERE storage_key = $1",
      [key],
    );
    assert.equal(row.rowCount, 1);

    const bytes = await readEvidenceFile(key);
    assert.equal(new TextDecoder().decode(bytes), "bytes must outlive the instance");

    await deletePostgresEvidenceFile(key);
  },
);

test(
  "an unsafe key is rejected before it reaches the database",
  { skip: skipReason },
  async () => {
    await assert.rejects(() => readEvidenceFile("../fairhold.json"), /Invalid evidence storage key/);
    await assert.rejects(
      () => readEvidenceFile("evidence/../fairhold.json"),
      /Invalid evidence storage key/,
    );
  },
);
