/**
 * Data-backend selection.
 *
 * Two backends implement the same data-access interface (see ./index.ts):
 *
 *   - "json"  — the development/demo store (lib/data/deals.ts): a single JSON
 *     file on disk, no database required. This is the DEFAULT when no database
 *     is configured. It is explicitly a development mode, not production.
 *   - "postgres" — the real relational backend (lib/data/postgres/deals.ts).
 *
 * Selection rule: DATABASE_URL present and non-placeholder => postgres. There
 * is deliberately NO silent fallback: once postgres is configured, every read
 * and write goes to postgres and infrastructure failures propagate loudly. If
 * the configured database is unreachable the app fails; it never quietly
 * switches to the JSON store and then claims data was persisted.
 *
 * The single exception is an explicit, auditable operator pin:
 * FAIRHOLD_DATA_BACKEND=json selects the JSON store, but only when no real
 * database is configured. It can never mask a configured PostgreSQL, and it is
 * never inferred — the deployed production scope does not set it.
 *
 * This module never prints, logs, or returns connection strings or secrets.
 */
export type DataBackend = "postgres" | "json";

function looksPlaceholder(value: string | undefined): boolean {
  return !value || /^your_/i.test(value.trim());
}

/**
 * Returns the configured DATABASE_URL, or null when no usable database is
 * configured. Callers must treat the result as a secret: never log it, never
 * send it to the client, never include it in error messages.
 */
export function readDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.DATABASE_URL?.trim();
  if (looksPlaceholder(raw)) return null;
  if (!raw) return null;
  if (!/^postgres(ql)?:\/\//i.test(raw)) return null;
  return raw;
}

export function resolveDataBackend(
  env: Record<string, string | undefined> = process.env,
): DataBackend {
  const databaseUrl = readDatabaseUrl(env);
  const explicitJson = env.FAIRHOLD_DATA_BACKEND === "json";

  // Explicit, auditable JSON pin.
  //
  // In development it always wins: `next dev` auto-loads .env.local, so a
  // developer with a real DATABASE_URL there would otherwise have every local
  // run hit PostgreSQL even when the run is meant to be hermetic.
  if (env.NODE_ENV !== "production" && explicitJson) {
    return "json";
  }

  // In production the pin is honoured only when NO real database is
  // configured. It can therefore never mask a configured PostgreSQL, and a
  // real PostgreSQL outage still fails loudly instead of silently switching to
  // the JSON store. The deployed production scope does not set
  // FAIRHOLD_DATA_BACKEND, so production keeps requiring PostgreSQL.
  //
  // The E2E suite runs against `next start` (NODE_ENV=production) with
  // DATABASE_URL blanked so no real database is touched; it pins the JSON store
  // explicitly through this variable. That is the one intended production
  // consumer of the pin, and it is opt-in rather than inferred.
  if (env.NODE_ENV === "production" && explicitJson && databaseUrl === null) {
    return "json";
  }

  // Development (non-production): fall back to JSON if no DATABASE_URL.
  if (env.NODE_ENV !== "production") {
    return databaseUrl === null ? "json" : "postgres";
  }

  // Production: PostgreSQL is required; no silent fallback to JSON.
  return "postgres";
}

export function isPostgresConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveDataBackend(env) === "postgres";
}