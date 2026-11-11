/**
 * PostgreSQL client and transaction helper.
 *
 * The pool is created lazily from DATABASE_URL (never logged, never sent to
 * the client). If PostgreSQL is configured but unreachable, every call throws
 * a loud infrastructure error — there is no silent fallback to the JSON store.
 *
 * Error messages returned to callers are deliberately generic: raw driver or
 * connection details are never surfaced. Known constraint violations (such as
 * unique-violation idempotency backstops) are mapped to friendly domain errors
 * by the data-access layer.
 */
import { Pool, type PoolClient } from "pg";
import { readDatabaseUrl } from "../db.ts";

let pool: Pool | null = null;

/**
 * Resolve the pg SSL option from the connection string's sslmode parameter.
 *
 * Neon provides connection strings with sslmode=require, so TLS is used for
 * Neon deployments. Local PostgreSQL connection strings typically omit
 * sslmode, so TLS is not required locally. When TLS is used, certificate
 * verification remains enabled (pg default: rejectUnauthorized=true) — this
 * never weakens TLS.
 */
function resolveSsl(connectionString: string): boolean {
  const match = connectionString.match(/[?&]sslmode=([^&]+)/);
  const mode = match?.[1]?.toLowerCase();
  return mode === "require" || mode === "verify-ca" || mode === "verify-full";
}

export { resolveSsl };

export function getPool(): Pool {
  if (pool) return pool;
  const url = readDatabaseUrl();
  if (url === null) {
    throw new Error(
      "PostgreSQL is configured but DATABASE_URL is missing. Set DATABASE_URL, or run without it to use the JSON development store.",
    );
  }
  pool = new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 5000,
    ssl: resolveSsl(url),
  });
  pool.on("error", (error) => {
    // Idle-client errors must not crash the process. The message never
    // contains the connection string or password.
    console.error("[fairhold-db] idle client error: " + error.message);
  });
  return pool;
}

/**
 * Run fn inside a single transaction. Every multi-record mutation (a status
 * change plus its audit events, an approval plus payment records, ...) must
 * use this so partial writes cannot be observed.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lock the deal row for the duration of the transaction. Every mutation locks
 * its deal before re-reading state, serializing concurrent status transitions
 * and financial operations per deal.
 */
export async function lockDeal(
  client: PoolClient,
  dealId: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT id FROM deals WHERE id = $1 FOR UPDATE",
    [dealId],
  );
  return (result.rowCount ?? 0) > 0;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

