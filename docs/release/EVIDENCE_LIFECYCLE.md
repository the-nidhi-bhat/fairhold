# FairHold — Evidence Data Lifecycle

**Branch:** `feat/deal-milestone-foundation`
**HEAD:** `b76e4d3`
**Status:** Documented (implementation verified in code)

This document describes the evidence storage, access, retention, and deletion
behavior of FairHold. It is written to be honest about what the architecture
provides and what it does not.

---

## 1. Storage Mode

| Environment | Storage Backend | Location | Durability |
|---|---|---|---|
| Development / demo | Local disk | `.data/evidence/` (git-ignored) | Single-process; not durable across serverless invocations |
| Production | Object storage (S3/R2/GCS) | Configurable via `writeEvidenceFile` replacement | Requires infrastructure provisioning |

The database stores only **file metadata** (name, size, type, stored path) — never
the bytes. Evidence bytes live behind `lib/data/storage.ts`.

### Storage module (`lib/data/storage.ts`)

- `writeEvidenceFile(sanitizedName, bytes)` — writes bytes to disk under
  `.data/evidence/` with a server-generated `randomUUID()` prefix prepended to
  the sanitized filename. Returns a storage key (`evidence/<uuid>-<name>`).
- `readEvidenceFile(storedPath)` — reads bytes back. Validates that the path
  is exactly `evidence/<storedName>` with no path traversal components.
- `deleteEvidenceFile(storedPath)` — removes bytes. Idempotent (missing file is
  not an error). Used to clean up orphans when a database row could not be
  persisted.

### Path traversal protection

The stored filename is generated server-side (`randomUUID()` + sanitized name).
The client-supplied filename is sanitized via `sanitizeFileName()` in
`lib/domain/evidence.ts`:
- Path components stripped (`split(/[\\/]/).pop()`)
- Unsafe characters replaced with `_`
- Leading dots removed
- Maximum 100 characters

`readEvidenceFile` and `deleteEvidenceFile` both validate that the normalized
path has exactly two segments (`evidence` + filename) and that the resolved
directory equals the evidence storage root — preventing `../` escapes.

---

## 2. File Validation (`lib/domain/evidence.ts`)

All client-supplied values are treated as untrusted.

| Validation | Limit / Rule |
|---|---|
| File size | 0 < size ≤ 3,000,000 bytes (3 MB) |
| File extension | png, jpg, jpeg, pdf, txt, md, csv (allowlist) |
| Content type | Detected from **magic bytes**, never from client MIME type or filename |
| URL scheme | http: or https: only, max 500 characters |
| Note text | Max 1,000 characters |
| Required content | At least one of: note, URL, or file |

### Magic byte sniffing (`sniffFileType`)

| Format | Magic bytes | Detected MIME type |
|---|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `image/png` |
| JPEG | `FF D8 FF` | `image/jpeg` |
| PDF | `25 50 44 46 2D` | `application/pdf` |
| Text | No NUL/control bytes in first 1KB | `text/plain` |
| Other | — | `null` (rejected) |

Files that don't match an allowed magic byte signature are rejected even if
the extension matches. This prevents extension spoofing attacks.

---

## 3. Access Control

Evidence access is gated through the deal-level authorization model:

- **Upload** (`submitEvidenceAction` in `app/deals/actions.ts`): Requires seller
  or reviewer role + deal access (`canAccessDeal`). Buyer cannot submit evidence.
- **Download** (`GET /api/evidence/[dealId]/[evidenceId]`): Requires valid demo
  session + `canAccessDeal(session, deal)`. Returns 404 for unauthorized access
  (no existence oracle).
- **Deal-level scoping**: `canAccessDeal` checks buyer matches `clientName`,
  seller matches `freelancerName`, or reviewer is granted via
  `authorizeReviewerDeal`.

### Response headers on download

- `Cache-Control: private, no-store` — no shared proxy or browser caching
- `Vary: Cookie` — response varies by session cookie
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing by browsers
- `Content-Disposition: attachment` — forces download, prevents inline rendering

---

## 4. Retention and Deletion

### Retention

- **No automatic retention policy.** Evidence files persist until explicitly
  deleted or until the underlying data store is reset.
- **No automatic deletion** when a deal is completed, cancelled, or disputed.
- **No versioning.** Each evidence submission overwrites the previous file
  reference (new UUID, old file becomes an orphan unless cleaned up).

### Deletion

- **Orphan cleanup:** When `addEvidence` fails after `writeEvidenceFile`
  succeeds, the orphaned file is removed via `deleteEvidenceFile` (idempotent,
  missing file is not an error).
- **No user-facing delete endpoint.** Evidence cannot be deleted through the
  UI; deletion is only a server-side cleanup operation.
- **No purge API.** There is no endpoint to bulk-delete evidence.

---

## 5. Limitations (Documented, Not Claimed)

| Item | Status | Notes |
|---|---|---|
| Object storage | NOT CONFIGURED | Production requires replacing `writeEvidenceFile` with S3/R2/GCS; no infrastructure provisioned |
| Malware scanning | NOT PERFORMED | Files are stored as-is; no virus/malware scanning |
| Permanent durability | NOT CLAIMED | Dev store is single-process local disk; writes refused on read-only Vercel filesystem |
| Automatic retention | NOT IMPLEMENTED | No TTL, no auto-expiry, no retention schedule |
| User-facing deletion | NOT IMPLEMENTED | No UI or API endpoint for evidence deletion |
| Versioning | NOT IMPLEMENTED | Each submission creates a new file; old files become orphans |
| Encryption at rest | NOT IMPLEMENTED | Files stored as plain bytes on local disk |
| Signed URLs | NOT IMPLEMENTED | Direct file serve via API route with session-scoped access |

---

## 6. What FairHold Does NOT Claim

- **No tamper-proof audit history.** Evidence files can be overwritten by new
  submissions; there is no write-once or immutable store.
- **No malware protection.** Files are not scanned.
- **No permanent durability.** The dev JSON store is single-process and local;
  production requires object storage infrastructure.
- **No automatic retention or deletion.** No TTL, no expiry, no purge.

---

## 7. Related Code

| File | Responsibility |
|---|---|
| `lib/data/storage.ts` | File write/read/delete with path traversal protection |
| `lib/domain/evidence.ts` | Validation: size, extension, magic bytes, URL, note |
| `lib/data/postgres/deals.ts` | Evidence row metadata in PostgreSQL |
| `lib/data/db.ts` | Backend selection (JSON demo vs PostgreSQL) |
| `app/deals/actions.ts` | `submitEvidenceAction` — upload with validation + orphan cleanup |
| `app/api/evidence/[dealId]/[evidenceId]/route.ts` | Download with access control + cache headers |
| `scripts/demo-reset.mjs` | Demo fixture with evidence submissions (all `file: null`) |
