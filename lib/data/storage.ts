/**
 * Evidence file storage.
 *
 * The database stores only file METADATA (name, size, type) plus a storage key
 * (file_stored_path) — never the bytes. The bytes live behind this module, and
 * which implementation answers is decided by the data backend:
 *
 *   - PostgreSQL configured: bytes go to the `evidence_files` table
 *     (see ./postgres/evidence.ts). This is the production path. It is durable
 *     across instances and cold starts, and the storage key is the primary key,
 *     so a metadata row can never point at bytes that no longer exist without
 *     that being a loud read error.
 *   - Otherwise (development, demo, E2E): local disk under the store's data
 *     directory, with the stored name generated server-side so a crafted client
 *     filename can never affect the filesystem path.
 *
 * The local path is a development convenience, not durability: on a read-only
 * host ./data-dir.ts falls back to the OS temp directory, which is discarded
 * with the instance. That is why production uses PostgreSQL here.
 *
 * Bytes are never publicly reachable. The download route streams them only after
 * its own session + deal authorization check; this module has no URL concept.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { isPostgresConfigured } from "./db.ts";
import { resolveDataDir } from "./data-dir.ts";
import {
  deletePostgresEvidenceFile,
  readPostgresEvidenceFile,
  writePostgresEvidenceFile,
} from "./postgres/evidence.ts";

export const EVIDENCE_DIR_REL = "evidence";

/** True when evidence bytes are kept in PostgreSQL instead of local disk. */
export function usesDurableEvidenceStorage(): boolean {
  return isPostgresConfigured();
}

export async function evidenceStorageDir(): Promise<string> {
  return join(await resolveDataDir(), EVIDENCE_DIR_REL);
}

/**
 * A storage key is always exactly "<evidence>/<server-generated name>". Reject
 * anything else so a crafted key can never escape the evidence namespace, in
 * either backend.
 */
function storedNameFromKey(storageKey: string): string {
  const normalized = storageKey.replaceAll("/", sep).replaceAll("\\", sep);
  const segments = normalized.split(sep);
  if (segments.length !== 2 || segments[0] !== EVIDENCE_DIR_REL || !segments[1]) {
    throw new Error("Invalid evidence storage key.");
  }
  return segments[1];
}

/** Persist a validated evidence file and return its storage key. */
export async function writeEvidenceFile(
  sanitizedName: string,
  bytes: Uint8Array,
  contentType: string | null = null,
): Promise<string> {
  const storageKey = `${EVIDENCE_DIR_REL}/${randomUUID()}-${sanitizedName}`;
  if (usesDurableEvidenceStorage()) {
    await writePostgresEvidenceFile({ storageKey, bytes, contentType });
    return storageKey;
  }
  const dir = await evidenceStorageDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, storedNameFromKey(storageKey)), bytes);
  return storageKey;
}

export async function readEvidenceFile(storageKey: string): Promise<Uint8Array> {
  const storedName = storedNameFromKey(storageKey);
  if (usesDurableEvidenceStorage()) {
    return readPostgresEvidenceFile(`${EVIDENCE_DIR_REL}/${storedName}`);
  }
  const root = resolve(await evidenceStorageDir());
  const filePath = resolve(root, storedName);
  if (dirname(filePath) !== root) throw new Error("Invalid evidence storage key.");
  return readFile(filePath);
}

/**
 * Remove bytes written by writeEvidenceFile when the database row could not be
 * persisted. Without this, a failed submission leaves orphaned bytes that no
 * record references. A missing object is not an error: the caller is cleaning up
 * after a failure, and cleanup must be idempotent.
 */
export async function deleteEvidenceFile(storageKey: string): Promise<void> {
  const storedName = storedNameFromKey(storageKey);
  if (usesDurableEvidenceStorage()) {
    await deletePostgresEvidenceFile(`${EVIDENCE_DIR_REL}/${storedName}`);
    return;
  }
  const root = resolve(await evidenceStorageDir());
  const filePath = resolve(root, storedName);
  if (dirname(filePath) !== root) throw new Error("Invalid evidence storage key.");
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
