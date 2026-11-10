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
  // Explicit, non-production-only escape hatch for test runs. `next dev`
  // auto-loads .env.local, so a developer with a real DATABASE_URL there would
  // otherwise have every local run hit PostgreSQL even when the run is meant to
  // be hermetic. Setting FAIRHOLD_DATA_BACKEND=json pins the JSON store for that
  // case. It is ignored when NODE_ENV is "production" (Next sets that for
  // `next build`/`next start`), so deployed behaviour is unchanged and a real
  // PostgreSQL outage never silently falls back to JSON. The E2E suite itself
  // runs against `next start`, where this branch is inert: it selects JSON the
  // normal way, by leaving DATABASE_URL empty for the test servers.
  if (env.NODE_ENV !== "production" && env.FAIRHOLD_DATA_BACKEND === "json") {
    return "json";
  }
  return readDatabaseUrl(env) === null ? "json" : "postgres";
}

export function isPostgresConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveDataBackend(env) === "postgres";
}