/**
 * Resolve the writable directory that holds the JSON demo store and the
 * evidence bytes.
 *
 * Candidates, in order:
 *
 *   1. FAIRHOLD_DATA_DIR (test isolation) or `.data` under the project root —
 *      the normal development layout.
 *   2. The OS temp directory.
 *
 * A candidate is only used once it has actually been created. Serverless hosts
 * mount the deployment bundle read-only, so `.data` under `process.cwd()` cannot
 * be created there; without this probe and fallback every write (deal records
 * AND evidence bytes) failed with `ENOENT: mkdir '/var/task/.data'`. Falling
 * back to the temp directory keeps a read-only host functional for the duration
 * of that instance instead of returning a 500, and it is still not durability:
 * the temp directory is per-instance and ephemeral, so a real deployment needs
 * PostgreSQL plus object storage.
 *
 * Both the store and the evidence module resolve through this function, so they
 * can never disagree about which directory is in use.
 */
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const DATA_DIR_CANDIDATES = [
  // turbopackIgnore keeps the build from tracing the whole project just because
  // this path is computed from an env var (the default, ".data", is statically
  // scoped and is what development and production actually use).
  resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.FAIRHOLD_DATA_DIR || ".data",
  ),
  resolve(tmpdir(), "fairhold"),
];

let resolvedDataDir: string | null = null;

export async function resolveDataDir(): Promise<string> {
  if (resolvedDataDir) return resolvedDataDir;
  for (const dir of DATA_DIR_CANDIDATES) {
    try {
      await mkdir(dir, { recursive: true });
      resolvedDataDir = dir;
      return dir;
    } catch {
      continue;
    }
  }
  throw new Error("No writable data directory available for the demo store.");
}
