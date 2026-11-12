import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPostgresConfigured,
  readDatabaseUrl,
  resolveDataBackend,
} from "./db.ts";

test("readDatabaseUrl: unset DATABASE_URL means no database", () => {
  assert.equal(readDatabaseUrl({}), null);
});

test("readDatabaseUrl: placeholder values are treated as unconfigured", () => {
  assert.equal(readDatabaseUrl({ DATABASE_URL: "your_postgres_url" }), null);
});

test("readDatabaseUrl: accepts a real postgres URL", () => {
  const url = readDatabaseUrl({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/fairhold",
  });
  assert.ok(url);
  assert.match(url as string, /^postgresql:\/\//);
});

test("readDatabaseUrl: rejects non-postgres schemes", () => {
  assert.equal(
    readDatabaseUrl({ DATABASE_URL: "mysql://user:pass@localhost/fh" }),
    null,
  );
});

test("resolveDataBackend: json by default, postgres only when configured", () => {
  assert.equal(resolveDataBackend({}), "json");
  assert.equal(
    resolveDataBackend({ DATABASE_URL: "postgres://u:p@localhost:5432/fh" }),
    "postgres",
  );
  assert.equal(
    resolveDataBackend({ DATABASE_URL: "your_placeholder" }),
    "json",
  );
});

test("resolveDataBackend: explicit non-production JSON override wins over DATABASE_URL", () => {
  assert.equal(
    resolveDataBackend({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://u:p@localhost:5432/fh",
      FAIRHOLD_DATA_BACKEND: "json",
    }),
    "json",
  );
  assert.equal(
    isPostgresConfigured({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://u:p@localhost:5432/fh",
      FAIRHOLD_DATA_BACKEND: "json",
    }),
    false,
  );
});

test("resolveDataBackend: the JSON override is ignored in production", () => {
  assert.equal(
    resolveDataBackend({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://u:p@localhost:5432/fh",
      FAIRHOLD_DATA_BACKEND: "json",
    }),
    "postgres",
  );
});

test("resolveDataBackend: production without DATABASE_URL returns postgres", () => {
  assert.equal(
    resolveDataBackend({
      NODE_ENV: "production",
    }),
    "postgres",
  );
});

test("resolveDataBackend: an explicit JSON pin in production is honoured only when no database is configured", () => {
  // The E2E suite runs `next start` (NODE_ENV=production) with DATABASE_URL
  // blanked so it never touches a real database, and pins the JSON store
  // explicitly. That pin is an auditable operator choice, not an inferred
  // downgrade.
  assert.equal(
    resolveDataBackend({
      NODE_ENV: "production",
      DATABASE_URL: "",
      FAIRHOLD_DATA_BACKEND: "json",
    }),
    "json",
  );
  // A placeholder value is still "no database configured".
  assert.equal(
    resolveDataBackend({
      NODE_ENV: "production",
      DATABASE_URL: "your_postgres_url",
      FAIRHOLD_DATA_BACKEND: "json",
    }),
    "json",
  );
  // The pin must never mask a real database: PostgreSQL still wins.
  assert.equal(
    resolveDataBackend({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://u:p@localhost:5432/fh",
      FAIRHOLD_DATA_BACKEND: "json",
    }),
    "postgres",
  );
  assert.equal(
    isPostgresConfigured({
      NODE_ENV: "production",
      DATABASE_URL: "",
      FAIRHOLD_DATA_BACKEND: "json",
    }),
    false,
  );
});

test("isPostgresConfigured agrees with resolveDataBackend", () => {
  assert.equal(isPostgresConfigured({}), false);
  assert.equal(
    isPostgresConfigured({ DATABASE_URL: "postgres://u:p@localhost:5432/fh" }),
    true,
  );
});