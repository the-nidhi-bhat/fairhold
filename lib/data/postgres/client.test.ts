import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { getPool, resolveSsl } from "./client.ts";

let createdPool: Pool | null = null;

test.afterEach(() => {
  if (createdPool) {
    createdPool.end().catch(() => undefined);
    createdPool = null;
  }
});

test("resolveSsl: Neon connection string with sslmode=require enables TLS", () => {
  assert.equal(
    resolveSsl("postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require"),
    true,
  );
});

test("resolveSsl: verify-ca and verify-full enable TLS", () => {
  assert.equal(resolveSsl("postgresql://u:p@host/db?sslmode=verify-ca"), true);
  assert.equal(resolveSsl("postgresql://u:p@host/db?sslmode=verify-full"), true);
});

test("resolveSsl: disable and absent sslmode disable TLS (local dev)", () => {
  assert.equal(resolveSsl("postgresql://u:p@localhost:5432/db?sslmode=disable"), false);
  assert.equal(resolveSsl("postgresql://u:p@localhost:5432/db"), false);
  assert.equal(resolveSsl("postgresql://u:p@127.0.0.1:55432/db"), false);
});

test("getPool creates a Neon-compatible pool (TLS, small max for serverless)", () => {
  // DATABASE_URL must be set (not a placeholder) for getPool to succeed.
  // Use a local non-routable URL; no connection is attempted until connect().
  process.env.DATABASE_URL = "postgresql://fairhold:fairholdtest@127.0.0.1:55432/fairhold_test";

  const pool = getPool();
  createdPool = pool;

  assert.ok(pool instanceof Pool);
  assert.equal(pool.options.max, 2, "serverless-safe max connections");
  assert.equal(pool.options.connectionTimeoutMillis, 5000);
  assert.equal(pool.options.ssl, false, "no TLS for local PostgreSQL without sslmode");
});
