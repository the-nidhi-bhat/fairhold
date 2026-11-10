-- FairHold migration 0007: durable evidence object storage.
--
-- Evidence was previously written to the local filesystem only. That works in
-- development, but a serverless host mounts the bundle read-only; the store then
-- fell back to the OS temp directory, which disappears with the instance. The
-- metadata row survived (it lives in the database) while the bytes did not, so a
-- recorded upload could render as "Evidence file unavailable".
--
-- Object storage (S3/R2/GCS) is the right long-term home for large binaries, but
-- it is not configured for this deployment. The evidence cap is 3 MB per file, so
-- the bytes can live in PostgreSQL next to the metadata that references them:
-- one transaction writes both, and they cannot silently diverge. The storage key
-- is exactly the value already held in evidence.file_stored_path, so existing
-- rows keep working and no backfill or import is required.
--
-- Evidence remains reachable only through the authorized download route, which
-- streams the bytes after the session/deal check; there is no public URL.
CREATE TABLE IF NOT EXISTS evidence_files (
  storage_key text PRIMARY KEY,
  content bytea NOT NULL,
  content_type text,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
