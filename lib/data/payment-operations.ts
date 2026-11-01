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
    const timestamp = new Date().toISOString();
    const operation: PaymentOperation = {
      id: randomUUID(),
      ...input,
      providerReference: null,
      status: "PENDING",
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
  update: Pick<PaymentOperation, "status" | "providerReference">,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await readDatabase();
    db.paymentOperations ??= [];
    const operation = db.paymentOperations.find((item) => item.idempotencyKey === idempotencyKey);
    if (!operation) throw new Error("Payment operation not found.");
    operation.status = update.status;
    operation.providerReference = update.providerReference;
    operation.updatedAt = new Date().toISOString();
    await writeDatabase(db);
  });
}
