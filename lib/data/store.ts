/**
 * Development / demo persistence.
 *
 * FairHold has no database yet. This module is the single data-access boundary
 * for the app and stores state in a gitignored JSON file on disk. It is
 * intentionally NOT production-grade:
 *
 *   - single process only (no cross-instance locking, no transactions)
 *   - lost on redeploy for ephemeral hosts
 *   - not safe for concurrent multi-user writes
 *
 * It exists so the deal/milestone experience is real and durable across a
 * session while the PostgreSQL schema is deferred. The data-access functions in
 * ./deals.ts are written so this file can be swapped for a real database
 * without changing callers.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database, Deal } from "../domain/types.ts";
import { resolveDataDir } from "./data-dir.ts";
import { writeEvidenceFile } from "./storage.ts";

export { writeEvidenceFile };

// The store and the evidence bytes share one directory decision: see
// ./data-dir.ts for the candidate order (FAIRHOLD_DATA_DIR / .data, then the OS
// temp directory on read-only hosts). Data is ephemeral by design — lost on
// redeploy, which matches the JSON store's documented development/demo role.
// The FAIRHOLD_DATA_DIR env var can redirect the data directory for test
// isolation (the E2E runner points it at the OS temp directory so a synced
// checkout never has to upload and download store writes mid-run). A relative
// value stays relative to the project, an absolute one is used as-is.

export async function dataFilePath(): Promise<string> {
  return join(await resolveDataDir(), "fairhold.json");
}

function emptyDatabase(): Database {
  return { version: 1, deals: [], paymentOperations: [] };
}

/**
 * Fill in fields that did not exist in older stored data so the rest of the
 * app can rely on them being present. Keeps forward-compat with the JSON file.
 */
function normalizeDeal(deal: Deal): Deal {
  return {
    ...deal,
    authorization: deal.authorization ?? null,
    pendingAuthorization: deal.pendingAuthorization ?? null,
    evidence: Array.isArray(deal.evidence) ? deal.evidence : [],
    milestones: (deal.milestones ?? []).map((m) => ({
      ...m,
      approval: m.approval ?? null,
    })),
  };
}

export async function readDatabase(): Promise<Database> {
  try {
    const raw = await readFile(await dataFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Database;
    if (!parsed || !Array.isArray(parsed.deals)) return emptyDatabase();
    return { ...parsed, deals: parsed.deals.map(normalizeDeal) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyDatabase();
    }
    throw error;
  }
}

export async function writeDatabase(db: Database): Promise<void> {
  // resolveDataDir() has already created the directory it returns.
  await writeFile(await dataFilePath(), JSON.stringify(db, null, 2), "utf8");
}

// Serialize writes so two requests cannot interleave read-modify-write cycles.
// ponytail: in-process queue only — fine for a single dev instance; replace with
// a real database (row locks / transactions) before multi-instance use.
let queue: Promise<unknown> = Promise.resolve();

export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
