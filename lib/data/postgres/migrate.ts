/**
 * Transactional migration runner.
 *
 * Schema versions live in `schema_migrations` (version = SQL file name).
 * Files under migrations/ are applied in lexicographic order, each inside its
 * own transaction with an INSERT of the version row — so a failed migration
 * leaves no partial schema and re-running is safe. Idempotent by design.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export const MIGRATIONS_DIR = join(process.cwd(), "migrations");

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const { rows } = await pool.query("SELECT version FROM schema_migrations");
  const appliedSet = new Set<string>(rows.map((row) => row.version as string));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = await readFile(join(dir, file), "utf8");
    const client = await pool.connect();
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
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}