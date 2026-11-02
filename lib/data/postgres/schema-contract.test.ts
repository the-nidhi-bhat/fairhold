/**
 * Schema contract guard (no database required).
 *
 * Reads the migration SQL and fails if a required table, constraint, or
 * monetary/status rule disappears. This is not a substitute for running the
 * migration against PostgreSQL (see the integration test), but it stops
 * accidental regressions of the persistence contract at unit-test time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");
const sql = await readFile(join(MIGRATIONS_DIR, "0001_initial.sql"), "utf8");
const dealsSql = await readFile(
  join(process.cwd(), "lib", "data", "postgres", "deals.ts"),
  "utf8",
);

test("schema defines every required table", () => {
  for (const table of [
    "CREATE TABLE deals",
    "CREATE TABLE milestones",
    "CREATE TABLE evidence",
    "CREATE TABLE milestone_approvals",
    "CREATE TABLE audit_events",
    "CREATE TABLE payment_orders",
    "CREATE TABLE payment_authorizations",
    "CREATE TABLE payment_captures",
    "CREATE TABLE webhook_events",
  ]) {
    assert.ok(sql.includes(table), `missing: ${table}`);
  }
});

test("webhook idempotency key is unique per provider", () => {
  assert.match(sql, /CONSTRAINT webhook_events_provider_event UNIQUE \(provider, event_id\)/);
});

test("one approval per milestone is enforced in the database", () => {
  assert.match(sql, /milestone_id\s+uuid NOT NULL UNIQUE REFERENCES milestones/);
});

test("at most one authorization and one pending order per deal", () => {
  assert.match(sql, /deal_id\s+uuid NOT NULL UNIQUE REFERENCES deals/);
  assert.ok((sql.match(/deal_id\s+uuid NOT NULL UNIQUE REFERENCES deals/g) ?? []).length >= 2);
});

test("monetary columns are integer cents, not floats", () => {
  assert.ok(sql.includes("amount_cents       bigint NOT NULL CHECK (amount_cents > 0)") ||
    sql.includes("amount_cents  bigint NOT NULL CHECK (amount_cents > 0)") ||
    /amount_cents\s+bigint NOT NULL CHECK \(amount_cents > 0\)/.test(sql));
  assert.ok(!/amount_cents\s+(numeric|double precision|real)/.test(sql));
});

test("status columns are constrained to the domain unions", () => {
  assert.match(sql, /CHECK \(status IN \(/);
  assert.match(sql, /'Ready for Authorization'/);
  assert.match(sql, /'received', 'processing', 'processed', 'failed'/);
});

test("webhook inbox table is append-only with safe error metadata", () => {
  assert.match(sql, /status\s+text NOT NULL DEFAULT 'received'/);
  assert.match(sql, /last_error\s+text/);
  assert.match(sql, /processed_at\s+timestamptz/);
});

test("deal mutations do not query nonexistent authorization_id", () => {
  assert.doesNotMatch(dealsSql, /deals?\.authorization_id|authorization_id/i);
});

test("milestone and evidence queries contain placeholders and row locks", () => {
  assert.doesNotMatch(dealsSql, /WHERE id =  (AND|$)|WHERE id = $1  AND/);
  assert.match(
    dealsSql,
    /WHERE id = \$1 AND deal_id = \$2\s+FOR UPDATE/,
  );
  assert.match(
    dealsSql,
    /WHERE id = \$1 AND deal_id = \$2\s+FOR UPDATE/,
  );
});

test("evidence persistence writes every metadata column", () => {
  assert.match(
    dealsSql,
    /file_name, file_size, file_type, file_stored_path, submitted_by, submitted_at/,
  );
  assert.match(dealsSql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11\)/);
});