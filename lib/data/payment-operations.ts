import { randomUUID } from "node:crypto";
import type { PaymentOperation } from "../domain/types.ts";
import { readDatabase, withWriteLock, writeDatabase } from "./store.ts";

export interface BeginPaymentOperationInput {
  dealId: string;
  milestoneId: string | null;
  authorizationReference: string | null;
  action: PaymentOperation["action"];
  requestedAmountCents: number | null;
  currency: string | null;
  idempotencyKey: string;
  providerName: string;
  finalCapture?: boolean;
}

export async function beginPaymentOperation(
  input: BeginPaymentOperationInput,
): Promise<PaymentOperation> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    db.paymentOperations ??= [];
    const existing = db.paymentOperations.find(
      (operation) => operation.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return existing;
    if (input.action === "CAPTURE" && input.requestedAmountCents !== null) {
      const deal = db.deals.find((item) => item.id === input.dealId);
      const authorizationCents = deal?.authorization?.amountCents ?? 0;
      const allocated = db.paymentOperations
        .filter((operation) =>
          operation.dealId === input.dealId &&
          operation.action === "CAPTURE" &&
          (operation.status === "RESERVED" || operation.status === "PENDING")
        )
        .reduce((sum, operation) => sum + (operation.requestedAmountCents ?? 0), 0);
      const completed = deal?.milestones
        .filter((milestone) => milestone.approval?.action === "CAPTURE" &&
          milestone.approval.paymentStatus === "COMPLETED")
        .reduce((sum, milestone) => sum + milestone.amountCents, 0) ?? 0;
      if (completed + allocated + input.requestedAmountCents > authorizationCents) {
        throw new Error("Capture exceeds the authorization including outstanding operations.");
      }
    }
    const timestamp = new Date().toISOString();
    const operation: PaymentOperation = {
      id: randomUUID(),
      ...input,
      providerReference: null,
      status: "RESERVED",
      finalCapture: input.finalCapture ?? false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    db.paymentOperations.push(operation);
    await writeDatabase(db);
    return operation;
  });
}

export async function updatePaymentOperation(
  idempotencyKey: string,
  update: Pick<PaymentOperation, "status" | "providerReference"> & {
    /**
     * Parity with the PostgreSQL backend, which records whether a capture came
     * from the demo provider. The JSON store keeps that flag on the milestone
     * approval, so it is accepted here and not persisted twice.
     */
    simulated?: boolean;
  },
): Promise<void> {
  await withWriteLock(async () => {
    const db = await readDatabase();
    db.paymentOperations ??= [];
    const operation = db.paymentOperations.find((item) => item.idempotencyKey === idempotencyKey);
    if (!operation) throw new Error("Payment operation not found.");
    if (operation.status === "COMPLETED" || operation.status === "VOIDED") return;
    if (
      operation.status === "FAILED" &&
      update.status !== "FAILED"
    ) return;
    operation.status = update.status;
    operation.providerReference = update.providerReference;
    operation.updatedAt = new Date().toISOString();
    await writeDatabase(db);
  });
}
