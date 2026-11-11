#!/usr/bin/env node
/**
 * Import the JSON development store into PostgreSQL.
 *
 * Usage:  node --env-file-if-exists=.env scripts/db-import-json.mjs [path]
 *         (path defaults to .data/fairhold.json)
 *
 * Behavior:
 *   - Validates every deal with the same pure validator used by the tests
 *     (lib/data/importValidate.ts). Invalid or payment-inconsistent records
 *     are reported and skipped; the process exits non-zero.
 *   - Imports each valid deal in its own transaction.
 *   - Safe to re-run: rows are inserted ON CONFLICT (id) DO NOTHING, so a
 *     second run reports the already-imported deals as skipped.
 *   - NEVER deletes or modifies the source JSON file.
 *   - Never prints the connection string or credentials.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { validateDealForImport } from "../lib/data/importValidate.ts";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const path = process.argv[2] ?? join(process.cwd(), ".data", "fairhold.json");

const url = process.env.DATABASE_URL;
if (!url || /^your_/i.test(url.trim())) {
  console.error(
    "No usable DATABASE_URL configured. The import requires PostgreSQL; run db:migrate first. " +
      "The JSON store is not otherwise touched.",
  );
  process.exit(1);
}

let raw;
try {
  raw = await readFile(path, "utf8");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    console.log(`No JSON store found at '${path}' — nothing to import.`);
    process.exit(0);
  }
  throw error;
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error(`'${path}' is not valid JSON. Aborting import (source file untouched).`);
  process.exit(1);
}

const deals = Array.isArray(parsed?.deals) ? parsed.deals : [];
const paymentOperations = Array.isArray(parsed?.paymentOperations) ? parsed.paymentOperations : [];

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });

const counts = {
  imported: 0,
  skipped: 0,
  invalid: 0,
  failed: 0,
  paymentOperations: 0,
  paymentOperationsSkipped: 0,
};

async function importDeal(deal) {
  const valid = validateDealForImport(deal);
  if (!valid.ok) {
    counts.invalid += 1;
    console.error(`  INVALID deal ${deal.id ?? "?"}:`);
    for (const issue of valid.issues) console.error(`    - ${issue}`);
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO deals (id, title, agreement, client_name, freelancer_name, currency, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        deal.id, deal.title, deal.agreement, deal.clientName, deal.freelancerName,
        deal.currency, deal.status, deal.createdAt, deal.updatedAt,
      ],
    );
    if ((inserted.rowCount ?? 0) === 0) {
      counts.skipped += 1;
      await client.query("ROLLBACK");
      return false;
    }

    for (const m of deal.milestones ?? []) {
      await client.query(
        `INSERT INTO milestones (id, deal_id, title, description, amount_cents, due_date, acceptance_criteria, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [m.id, deal.id, m.title, m.description, m.amountCents, m.dueDate, m.acceptanceCriteria, m.status, m.createdAt, m.updatedAt],
      );
      if (m.approval) {
        await client.query(
          `INSERT INTO milestone_approvals
             (id, milestone_id, decision, action, reason_codes, explanation, evidence_fingerprint,
              evidence_reviewed_count, reviewed_by, reviewed_at, provider_reference, provider_name, simulated, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (milestone_id) DO NOTHING`,
          [
            m.approval.id ?? `${m.id}-approval`, m.id, m.approval.decision, m.approval.action,
            JSON.stringify(m.approval.reasonCodes ?? []), m.approval.explanation ?? "",
            m.approval.evidenceFingerprint ?? "", m.approval.evidenceReviewedCount ?? 0,
            m.approval.reviewedBy ?? "system", m.approval.reviewedAt,
            m.approval.providerReference ?? null, m.approval.providerName ?? null,
            m.approval.simulated ?? false, m.approval.note ?? null,
          ],
        );
      }
    }

    for (const e of deal.evidence ?? []) {
      await client.query(
        `INSERT INTO evidence
           (id, deal_id, milestone_id, note, url, file_name, file_size, file_type, file_stored_path, submitted_by, submitted_at, decision, reviewed_at, review_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO NOTHING`,
        [
          e.id, deal.id, e.milestoneId, e.note ?? "", e.url ?? null,
          e.file?.name ?? null, e.file?.size ?? null, e.file?.type ?? null, e.file?.storedPath ?? null,
          e.submittedBy ?? "system", e.submittedAt, e.decision ?? "pending", e.reviewedAt ?? null, e.reviewNote ?? null,
        ],
      );
    }

    for (const ev of deal.events ?? []) {
      await client.query(
        `INSERT INTO audit_events (id, deal_id, milestone_id, type, message, actor, created_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [ev.id, deal.id, ev.milestoneId ?? null, ev.type, ev.message, ev.actor, ev.createdAt, JSON.stringify(ev.metadata ?? {})],
      );
    }

    if (deal.pendingAuthorization) {
      const p = deal.pendingAuthorization;
      await client.query(
        `INSERT INTO payment_orders (id, deal_id, provider_name, mode, provider_order_id, approval_url, amount_cents, currency, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [`${deal.id}-pending`, deal.id, p.providerName, p.mode, p.providerOrderId, p.approvalUrl ?? null, p.amountCents, p.currency, p.createdAt ?? deal.updatedAt],
      );
    }

    if (deal.authorization) {
      const a = deal.authorization;
      await client.query(
        `INSERT INTO payment_authorizations (id, deal_id, provider_name, provider_reference, provider_order_id, simulated, amount_cents, currency, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [`${deal.id}-authorization`, deal.id, a.providerName, a.providerReference, a.providerOrderId ?? null, a.simulated ?? false, a.amountCents, "USD", a.createdAt ?? deal.updatedAt],
      );
    }

    await client.query("COMMIT");
    counts.imported += 1;
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    counts.failed += 1;
    console.error(`  FAILED deal ${deal.id ?? "?"}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    client.release();
  }
}

async function importPaymentOperation(op) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO payment_operations
         (id, deal_id, milestone_id, authorization_reference, action,
          requested_amount_cents, currency, idempotency_key, provider_name,
          provider_reference, status, final_capture, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        op.id,
        op.dealId,
        op.milestoneId,
        op.authorizationReference,
        op.action,
        op.requestedAmountCents,
        op.currency,
        op.idempotencyKey,
        op.providerName,
        op.providerReference,
        op.status,
        op.finalCapture ?? false,
        op.createdAt,
        op.updatedAt,
      ],
    );
    if ((inserted.rowCount ?? 0) === 0) {
      counts.paymentOperationsSkipped += 1;
      await client.query("ROLLBACK");
      return false;
    }

    await client.query("COMMIT");
    counts.paymentOperations += 1;
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    counts.failed += 1;
    console.error(
      `  FAILED payment operation ${op.idempotencyKey ?? op.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  } finally {
    client.release();
  }
}

console.log(`Importing from '${path}' (${deals.length} deal(s))...`);
for (const deal of deals) {
  await importDeal(deal);
}

// Import top-level payment operations with their cross-deal relationships.
// Each operation references deal_id and milestone_id; both must already exist
// (imported above) for the foreign key and trigger validation to pass.
for (const op of paymentOperations ?? []) {
  await importPaymentOperation(op);
}

console.log(
  `Done. imported=${counts.imported} skipped(existing)=${counts.skipped} invalid=${counts.invalid} failed=${counts.failed} paymentOperations=${counts.paymentOperations} paymentOperationsSkipped=${counts.paymentOperationsSkipped}`,
);
if (counts.invalid > 0 || counts.failed > 0) process.exitCode = 1;

await pool.end();