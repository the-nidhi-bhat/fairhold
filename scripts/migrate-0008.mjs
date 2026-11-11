#!/usr/bin/env node
/**
 * Dedicated migration runner for migration 0008 only.
 *
 * Applies ONLY migrations/0008_payment_capture_nullable_columns.sql to a
 * verified Neon Preview database. Never applies unrelated migrations.
 * Never prints credentials or connection strings.
 *
 * Usage:
 *   DATABASE_URL=<preview-url> node scripts/migrate-0008.mjs
 *
 * Safety:
 *   - Requires an explicit DATABASE_URL
 *   - Verifies exact Neon Preview database identity before writing:
 *     hostname matches ep-*.neon.tech, database is 'neondb', role is 'neondb_owner'
 *   - Applies migration 0008 in a single transaction
 *   - Verifies all four nullable columns and exactly one ledger record
 *   - Idempotent: safe to rerun (0008 already applied = no-op)
 */

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;
if (!url || /^your_/i.test(url.trim())) {
  console.error("DATABASE_URL is required. Set it and re-run.");
  process.exit(1);
}

// Resolve pg SSL from connection string's sslmode parameter (Neon requires TLS).
const sslMatch = url.match(/[?&]sslmode=([^&]+)/);
const sslMode = sslMatch ? sslMatch[1].toLowerCase() : "";
const ssl =
  sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full";

const MIGRATION_0008 = "0008_payment_capture_nullable_columns.sql";
const MIGRATIONS_DIR = join(process.cwd(), "migrations");

// Expected Neon Preview database identity (verified by user).
const EXPECTED_HOSTNAME = "ep-withered-cell-aovz8dra.c-2.ap-southeast-1.aws.neon.tech";
const EXPECTED_DATABASE = "neondb";
const EXPECTED_ROLE = "neondb_owner";

async function main() {
  // Parse host from connection string to verify identity.
  let host;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
  } catch {
    console.error("DATABASE_URL is not a valid connection string.");
    process.exit(1);
  }

  if (!host) {
    console.error("DATABASE_URL does not contain a host.");
    process.exit(1);
  }

  // Exact-match hostname against verified Neon Preview endpoint.
  // Production uses a different hostname; any mismatch is rejected.
  if (host !== EXPECTED_HOSTNAME) {
    console.error(
      `Refusing to run against unexpected host: ${host}. Expected: ${EXPECTED_HOSTNAME}.`,
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl,
  });

  let client;
  try {
    client = await pool.connect();

    // Verify database identity before writing.
    const identity = await client.query(
      `SELECT current_database() AS db, current_user AS role, version() AS pg_version`,
    );
    const { db, role } = identity.rows[0];
    console.log(`Connected to database: ${db} (role: ${role})`);

    // Exact-match database name and role for Preview identity.
    if (db !== EXPECTED_DATABASE) {
      console.error(
        `Refusing to run against unexpected database: ${db}. Expected: ${EXPECTED_DATABASE}.`,
      );
      process.exit(1);
    }
    if (role !== EXPECTED_ROLE) {
      console.error(
        `Refusing to run against unexpected role: ${role}. Expected: ${EXPECTED_ROLE}.`,
      );
      process.exit(1);
    }

    // Ensure schema_migrations table exists.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Check if 0008 is already applied.
    const { rows: appliedRows } = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [MIGRATION_0008],
    );

    if (appliedRows.length > 0) {
      console.log(
        `Migration ${MIGRATION_0008} already applied. Verifying...`,
      );
    } else {
      // Read and apply migration 0008 in a transaction.
      const sql = await readFile(
        join(MIGRATIONS_DIR, MIGRATION_0008),
        "utf8",
      );
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [MIGRATION_0008],
        );
        await client.query("COMMIT");
        console.log(
          `Migration ${MIGRATION_0008} applied successfully.`,
        );
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }

    // Verify all four nullable columns.
    const pcCols = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payment_captures'
        AND column_name IN ('deal_id', 'milestone_id', 'authorization_reference')
      ORDER BY column_name
    `);
    const aeCols = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'audit_events'
        AND column_name = 'deal_id'
    `);

    const allNullable = [
      {
        table: "payment_captures",
        column: "deal_id",
        nullable:
          pcCols.rows.find((r) => r.column_name === "deal_id")
            ?.is_nullable === "YES",
      },
      {
        table: "payment_captures",
        column: "milestone_id",
        nullable:
          pcCols.rows.find((r) => r.column_name === "milestone_id")
            ?.is_nullable === "YES",
      },
      {
        table: "payment_captures",
        column: "authorization_reference",
        nullable:
          pcCols.rows.find(
            (r) => r.column_name === "authorization_reference",
          )?.is_nullable === "YES",
      },
      {
        table: "audit_events",
        column: "deal_id",
        nullable:
          aeCols.rows.find((r) => r.column_name === "deal_id")
            ?.is_nullable === "YES",
      },
    ];

    console.log("\nColumn nullability verification:");
    for (const col of allNullable) {
      console.log(
        `  ${col.table}.${col.column}: ${col.nullable ? "NULLABLE" : "NOT NULL"}`,
      );
    }

    const allColumnsNullable = allNullable.every((c) => c.nullable);
    if (!allColumnsNullable) {
      console.error("ERROR: Not all required columns are nullable.");
      process.exit(1);
    }

    // Verify exactly one migration-ledger record for 0008.
    const { rows: ledgerRows } = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [MIGRATION_0008],
    );

    if (ledgerRows.length !== 1) {
      console.error(
        `ERROR: Expected exactly 1 ledger record for ${MIGRATION_0008}, found ${ledgerRows.length}.`,
      );
      process.exit(1);
    }

    console.log(
      `\nMigration ledger: exactly 1 record for ${MIGRATION_0008}.`,
    );
    console.log(
      "\nAll verifications passed. Migration 0008 is safely applied.",
    );
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
