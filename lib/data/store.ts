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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Database, Deal } from "../domain/types";

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "fairhold.json");
const EVIDENCE_DIR = join(DATA_DIR, "evidence");

function emptyDatabase(): Database {
  return { version: 1, deals: [] };
}

/**
 * Fill in fields that did not exist in older stored data so the rest of the
 * app can rely on them being present. Keeps forward-compat with the JSON file.
 */
function normalizeDeal(deal: Deal): Deal {
  return {
    ...deal,
    authorization: deal.authorization ?? null,
    evidence: Array.isArray(deal.evidence) ? deal.evidence : [],
    milestones: (deal.milestones ?? []).map((m) => ({
      ...m,
      approval: m.approval ?? null,
    })),
  };
}

export async function readDatabase(): Promise<Database> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
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
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

/**
 * Persist an evidence file's bytes to the dev store and return its path
 * relative to .data. The stored name is generated (never the raw client name)
 * so a crafted filename cannot affect the path.
 */
export async function writeEvidenceFile(
  sanitizedName: string,
  bytes: Uint8Array,
): Promise<string> {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const storedName = `${randomUUID()}-${sanitizedName}`;
  await writeFile(join(EVIDENCE_DIR, storedName), bytes);
  return join("evidence", storedName);
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
