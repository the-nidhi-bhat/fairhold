/**
 * Evidence file storage.
 *
 * The database stores only file METADATA (name, size, type) plus a storage key
 * (file_stored_path) — never the bytes. The bytes live behind this module:
 *
 *   - Development: local disk under .data/evidence/ (git-ignored), with the
 *     stored name generated server-side so a crafted client filename can never
 *     affect the filesystem path.
 *   - Production: replace writeEvidenceFile with object storage (S3 / R2 /
 *     GCS). The returned key becomes the object key and the database stores
 *     that same key; nothing else in the app changes.
 *
 * Files are intentionally NOT stored in PostgreSQL as blobs: evidence can be
 * large and binary, and the relational database should not carry object
 * payloads.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

export const EVIDENCE_DIR_REL = "evidence";

export function evidenceStorageDir(): string {
  return join(process.cwd(), ".data", EVIDENCE_DIR_REL);
}

/** Persist a validated evidence file and return a storage key (path). */
export async function writeEvidenceFile(
  sanitizedName: string,
  bytes: Uint8Array,
): Promise<string> {
  const dir = evidenceStorageDir();
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}-${sanitizedName}`;
  await writeFile(join(dir, storedName), bytes);
  return join(EVIDENCE_DIR_REL, storedName);
}

export async function readEvidenceFile(storedPath: string): Promise<Uint8Array> {
  const root = resolve(evidenceStorageDir());
  const normalized = storedPath.replaceAll("/", sep).replaceAll("\\", sep);
  if (normalized.split(sep).length !== 2 || normalized.split(sep)[0] !== EVIDENCE_DIR_REL) {
    throw new Error("Invalid evidence storage key.");
  }
  const filePath = resolve(root, normalized.slice(EVIDENCE_DIR_REL.length + sep.length));
  if (dirname(filePath) !== root) throw new Error("Invalid evidence storage key.");
  return readFile(filePath);
}