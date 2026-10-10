#!/usr/bin/env node
/**
 * Apply pending SQL migrations to the configured PostgreSQL database.
 *
 * Usage:  node --env-file-if-exists=.env scripts/db-migrate.mjs
 *
 * Reads DATABASE_URL from the environment (via next's build once for the app,
 * or --env-file for scripts). Never prints the connection string, user, or
 * password. Idempotent: already-applied migrations are skipped. Each migration
 * runs in its own transaction; a failure leaves the schema untouched and exits
 * non-zero.
 */
import { createRequire } from "node:module";
import { runMigrations } from "../lib/data/postgres/migrate.ts";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;
if (!url || /^your_/i.test(url.trim())) {
  console.error(
    "No usable DATABASE_URL configured. Set DATABASE_URL (or run without it to keep using the JSON dev store).",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });

try {
  const { applied, skipped } = await runMigrations(pool);
  console.log(`Migrations applied:   ${applied.length > 0 ? applied.join(", ") : "(none)"}`);
  console.log(`Migrations skipped:   ${skipped.length > 0 ? skipped.join(", ") : "(none)"}`);
} catch (error) {
  console.error(`Migration run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}