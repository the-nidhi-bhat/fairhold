/**
 * Evidence file storage.
 *
 * The database stores only file METADATA (name, size, type) plus a storage key
 * (file_stored_path) — never the bytes. The bytes live behind this module:
 *
 *   - Development: local disk under the store's data directory (git-ignored),
 *     with the stored name generated server-side so a crafted client filename
 *     can never affect the filesystem path.
 *   - Production: replace writeEvidenceFile with object storage (S3 / R2 /
 *     GCS). The returned key becomes the object key and the database stores
 *     that same key; nothing else in the app changes.
 *
 * The directory comes from ./data-dir.ts, the same resolver the JSON store uses,
 * so evidence can never land somewhere the store cannot see. On a read-only host
 * that resolver falls back to the OS temp directory: uploads then work for the
 * lifetime of that instance instead of returning a 500, but they are NOT
 * durable. Durable evidence needs object storage.
 *
 * Files are intentionally NOT stored in PostgreSQL as blobs: evidence can be
 * large and binary, and the relational database should not carry object
 * payloads.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDir } from "./data-dir.ts";

export const EVIDENCE_DIR_REL = "evidence";

export async function evidenceStorageDir(): Promise<string> {
  return join(await resolveDataDir(), EVIDENCE_DIR_REL);
}

/** Persist a validated evidence file and return a storage key (path). */
export async function writeEvidenceFile(
  sanitizedName: string,
  bytes: Uint8Array,
): Promise<string> {
  const dir = await evidenceStorageDir();
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}-${sanitizedName}`;
  await writeFile(join(dir, storedName), bytes);
  return join(EVIDENCE_DIR_REL, storedName);
}

export async function readEvidenceFile(storedPath: string): Promise<Uint8Array> {
  const root = resolve(await evidenceStorageDir());
  const normalized = storedPath.replaceAll("/", sep).replaceAll("\\", sep);
  if (normalized.split(sep).length !== 2 || normalized.split(sep)[0] !== EVIDENCE_DIR_REL) {
    throw new Error("Invalid evidence storage key.");
  }
  const filePath = resolve(root, normalized.slice(EVIDENCE_DIR_REL.length + sep.length));
  if (dirname(filePath) !== root) throw new Error("Invalid evidence storage key.");
  return readFile(filePath);
}

/**
 * Remove bytes written by writeEvidenceFile when the database row could not be
 * persisted. Without this, a failed submission leaves an orphaned file that no
 * record references. A missing file is not an error: the caller is cleaning up
 * after a failure, and cleanup must be idempotent.
 */
export async function deleteEvidenceFile(storedPath: string): Promise<void> {
  const root = resolve(await evidenceStorageDir());
  const normalized = storedPath.replaceAll("/", sep).replaceAll("\\", sep);
  if (normalized.split(sep).length !== 2 || normalized.split(sep)[0] !== EVIDENCE_DIR_REL) {
    throw new Error("Invalid evidence storage key.");
  }
  const filePath = resolve(root, normalized.slice(EVIDENCE_DIR_REL.length + sep.length));
  if (dirname(filePath) !== root) throw new Error("Invalid evidence storage key.");
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
