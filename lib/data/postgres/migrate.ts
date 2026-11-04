/**
 * Transactional migration runner.
 *
 * Schema versions live in `schema_migrations` (version = SQL file name).
 * Files under migrations/ are applied in lexicographic order, each inside its
 * own transaction with an INSERT of the version row — so a failed migration
 * leaves no partial schema and re-running is safe. Idempotent by design.
 *
 * The whole run is serialized with a PostgreSQL advisory lock so that two
 * processes starting against the same database (for example parallel test
 * files or two app instances) cannot race on `CREATE TABLE IF NOT EXISTS`
 * or on applying the same migration twice.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";

export const MIGRATIONS_DIR = join(process.cwd(), "migrations");

/** Arbitrary but stable 64-bit key ("FAIRHOLDMIGRATE" folded to a bigint). */
const MIGRATION_LOCK_KEY = BigInt("8246138273664011334");

export interface MigrationResult {
  /** Migration file names newly applied by this run. */
  applied: string[];
  /** Migration file names already present (no-op). */
  skipped: string[];
}

export async function runMigrations(
  pool: Pool,
  dir = MIGRATIONS_DIR,
): Promise<MigrationResult> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      return await applyMigrations(client, dir);
    } finally {
      await client
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
        .catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

async function applyMigrations(
  client: PoolClient,
  dir: string,
): Promise<MigrationResult> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query<{ version: string }>(
    "SELECT version FROM schema_migrations",
  );
  const appliedSet = new Set(rows.map((row) => row.version));

  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = await readFile(join(dir, file), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(
        `Migration '${file}' failed: ${(error as Error).message}`,
      );
    }
  }

  return { applied, skipped };
}
