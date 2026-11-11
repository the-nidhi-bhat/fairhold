/**
 * PostgreSQL-backed evidence byte storage.
 *
 * Selected automatically when PostgreSQL is configured (see ../storage.ts). It
 * exists because the filesystem is not durable on a serverless host: the bundle
 * is read-only and the temp-directory fallback dies with the instance, leaving a
 * metadata row that points at bytes nothing can read.
 *
 * Design notes:
 *
 *   - The storage key IS the primary key and IS the value already stored in
 *     evidence.file_stored_path, so no row rewriting or backfill is needed.
 *   - Bytes are capped upstream (3 MB per file) before they reach this module,
 *     and the size is re-asserted by the table's CHECK constraint.
 *   - Reads and deletes are parameterized; a key that does not exist is a loud
 *     failure on read and a no-op on delete (compensating cleanup stays idempotent).
 *   - Nothing here makes bytes publicly reachable: the download route streams
 *     them only after its own session + deal authorization check.
 */
import { getPool } from "./client.ts";

export async function writePostgresEvidenceFile(input: {
  storageKey: string;
  bytes: Uint8Array;
  contentType: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO evidence_files (storage_key, content, content_type, byte_size)
     VALUES ($1, $2, $3, $4)`,
    [input.storageKey, Buffer.from(input.bytes), input.contentType, input.bytes.byteLength],
  );
}

export async function readPostgresEvidenceFile(storageKey: string): Promise<Uint8Array> {
  const pool = getPool();
  const result = await pool.query<{ content: Buffer }>(
    `SELECT content FROM evidence_files WHERE storage_key = $1`,
    [storageKey],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Evidence file not found.");
  }
  return row.content;
}

/** Idempotent: deleting a key that is already gone is not an error. */
export async function deletePostgresEvidenceFile(storageKey: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM evidence_files WHERE storage_key = $1`, [storageKey]);
}
