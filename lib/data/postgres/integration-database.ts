/**
 * Per-file isolation for PostgreSQL integration tests.
 *
 * Node's test runner executes test files in parallel processes. A single shared
 * test database would therefore have its tables truncated underneath another
 * file mid-run. Each integration file instead gets its own schema: the schema
 * is created (fresh) up front, the connection string carries
 * `search_path=<schema>`, and the schema is dropped afterwards.
 *
 * This never touches `public` beyond creating a dedicated schema, so an
 * accidentally shared test database cannot destroy unrelated data.
 */
import pg from "pg";

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export interface IntegrationDatabase {
  /** Connection string scoped to the isolated schema. */
  connectionString: string;
  /** Schema name (safe identifier, already validated). */
  schema: string;
  /** Drop the schema and everything in it. */
  drop: () => Promise<void>;
}

export async function prepareIntegrationDatabase(
  baseUrl: string,
  namespace: string,
): Promise<IntegrationDatabase> {
  const schema = `fairhold_it_${namespace
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
  if (!SAFE_IDENTIFIER.test(schema)) {
    throw new Error(`Unsafe integration schema name: ${schema}`);
  }

  await withAdminClient(baseUrl, async (client) => {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
  });

  const url = new URL(baseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);

  return {
    connectionString: url.toString(),
    schema,
    drop: async () => {
      await withAdminClient(baseUrl, async (client) => {
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      });
    },
  };
}

async function withAdminClient(
  baseUrl: string,
  fn: (client: pg.Client) => Promise<void>,
): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}
