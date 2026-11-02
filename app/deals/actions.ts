"use server";

/**
 * Server actions for deals and milestones.
 *
 * Every action treats its input as untrusted: fields are read from FormData,
 * validated with the pure domain validators, and status changes are re-checked
 * against the deterministic rules before anything is persisted. Payment status
 * and amounts are never taken from the client. Signed demo authentication
 * supplies the audit actor; production identity providers remain out of scope.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPostgresConfigured } from "@/lib/data/db";
import {
  addEvidence,
  addMilestone,
  beginPaymentOperation,
  createDeal,
  getDeal,
  markDealAuthorized,
  recordMilestoneApproval,
  reviewEvidence,
  setDealStatus,
  setMilestoneStatus,
  setPendingAuthorization,
  updateMilestone,
  updatePaymentOperation,
} from "@/lib/data";
import { planCapture } from "@/lib/payments/capture-state";
import { writeEvidenceFile } from "@/lib/data/storage";
import { isApprovalDecision, planApproval } from "@/lib/domain/approval";
import { validateEvidenceInput } from "@/lib/domain/evidence";
import { recommendMilestone } from "@/lib/domain/rules";
import { canTransitionDeal, canTransitionMilestone } from "@/lib/domain/status";
import {
  DEAL_STATUSES,
  MILESTONE_STATUSES,
  type DealStatus,
  type MilestoneApproval,
  type MilestoneStatus,
} from "@/lib/domain/types";
import {
  validateDealInput,
  validateMilestoneInput,
} from "@/lib/domain/validation";
import { getPaymentProvider } from "@/lib/payments";
import { canAccessDeal, getDemoSession, type DemoSession } from "@/lib/auth/session";

export interface FormState {
  ok: boolean;
  errors: Record<string, string>;
}

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isDealStatus(value: string): value is DealStatus {
  return (DEAL_STATUSES as readonly string[]).includes(value);
}

function isMilestoneStatus(value: string): value is MilestoneStatus {
  return (MILESTONE_STATUSES as readonly string[]).includes(value);
}

async function currentSession(): Promise<DemoSession> {
  const session = await getDemoSession();
  if (!session) throw new Error("Authentication required.");
  return session;
}

async function currentActor(): Promise<string> {
  const session = await currentSession();
  return `${session.role}:${session.name}`;
}

async function assertDealAccess(dealId: string): Promise<void> {
  const session = await currentSession();
  const deal = await getDeal(dealId);
  if (!deal || !canAccessDeal(session, deal)) {
    throw new Error("Deal access denied.");
  }
}

async function requireRole(...roles: DemoSession["role"][]): Promise<DemoSession> {
  const session = await currentSession();
  if (!roles.includes(session.role)) {
    throw new Error("This action is not allowed for the current role.");
  }
  return session;
}

export async function createDealAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireRole("buyer", "seller", "reviewer");
  const result = validateDealInput({
    title: field(formData, "title"),
    clientName: field(formData, "clientName"),
    freelancerName: field(formData, "freelancerName"),
    currency: field(formData, "currency"),
    agreement: field(formData, "agreement"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  if (
    session.role !== "reviewer" &&
    ((session.role === "buyer" &&
      result.value.clientName.toLowerCase() !== session.name.toLowerCase()) ||
      (session.role === "seller" &&
        result.value.freelancerName.toLowerCase() !== session.name.toLowerCase()))
  ) {
    return { ok: false, errors: { _form: "The party name must match your signed demo identity." } };
  }

  const deal = await createDeal(result.value, await currentActor());
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/deals/${deal.id}`);
}

export async function addMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireRole("seller", "reviewer");
  const dealId = field(formData, "dealId");
  const result = validateMilestoneInput({
    title: field(formData, "title"),
    description: field(formData, "description"),
    amount: field(formData, "amount"),
    dueDate: field(formData, "dueDate"),
    acceptanceCriteria: field(formData, "acceptanceCriteria"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  const deal = await getDeal(dealId);
  if (!deal) return { ok: false, errors: { _form: "Deal not found." } };
  if (deal.authorization) {
    return { ok: false, errors: { _form: "Milestones cannot be added after an authorization exists." } };
  }
  if (deal.status === "Completed" || deal.status === "Disputed" || deal.status === "Cancelled") {
    return { ok: false, errors: { _form: "Milestones cannot be added while the deal is " + deal.status + "." } };
  }

  await assertDealAccess(dealId);
  const response = await addMilestone(dealId, result.value, await currentActor());
  if (!response.ok) return { ok: false, errors: { _form: response.error } };

  revalidatePath(`/deals/${dealId}`);
  return { ok: true, errors: {} };
}

export async function updateMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireRole("seller", "reviewer");
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  await assertDealAccess(dealId);
  const result = validateMilestoneInput({
    title: field(formData, "title"),
    description: field(formData, "description"),
    amount: field(formData, "amount"),
    dueDate: field(formData, "dueDate"),
    acceptanceCriteria: field(formData, "acceptanceCriteria"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  const deal = await getDeal(dealId);
  if (!deal) return { ok: false, errors: { _form: "Deal not found." } };
  const milestone = deal.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return { ok: false, errors: { _form: "Milestone not found in this deal." } };
  if (deal.authorization) {
    return { ok: false, errors: { _form: "Milestones cannot be edited after an authorization exists." } };
  }
  if (deal.status === "Completed" || deal.status === "Disputed" || deal.status === "Cancelled") {
    return { ok: false, errors: { _form: "Milestones cannot be edited while the deal is " + deal.status + "." } };
  }
  if (
    milestone.status === "Completed" ||
    milestone.status === "Disputed" ||
    milestone.status === "Cancelled"
  ) {
    return { ok: false, errors: { _form: "Milestones cannot be edited while the milestone is " + milestone.status + "." } };
  }
  const response = await updateMilestone(
    dealId,
    milestoneId,
    result.value,
    await currentActor(),
  );
  if (!response.ok) return { ok: false, errors: { _form: response.error } };

  revalidatePath(`/deals/${dealId}`);
  return { ok: true, errors: {} };
}

export async function changeMilestoneStatusAction(
  formData: FormData,
): Promise<void> {
  await requireRole("seller", "reviewer");
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  const to = field(formData, "status");
  if (!isMilestoneStatus(to)) return;

  const deal = await getDeal(dealId);
  if (!deal) return;
  const milestone = deal.milestones.find((m) => m.id === milestoneId);
  if (!milestone || !canTransitionMilestone(milestone.status, to)) return;

  await assertDealAccess(dealId);
  await setMilestoneStatus(dealId, milestoneId, to, await currentActor());
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

export async function changeDealStatusAction(formData: FormData): Promise<void> {
  await requireRole("seller", "reviewer");
  const dealId = field(formData, "dealId");
  const to = field(formData, "status");
  if (!isDealStatus(to) || to === "Authorized") return;

  const deal = await getDeal(dealId);
  if (!deal || !canTransitionDeal(deal.status, to)) return;

  await assertDealAccess(dealId);
  await setDealStatus(dealId, to, await currentActor());
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

/**
 * Requests an authorization hold. With the demo provider this completes in one
 * step (simulated). With the PayPal sandbox it creates an order and stops,
 * recording a pending authorization the buyer must approve in PayPal; a second
 * action then confirms it. A failed real request is never downgraded to a
 * simulated success — the deal simply stays unauthorized.
 */
export async function authorizeDealAction(formData: FormData): Promise<void> {
  const dealId = field(formData, "dealId");
  await requireRole("buyer", "reviewer");
  await assertDealAccess(dealId);
  const deal = await getDeal(dealId);
  if (!deal || deal.status !== "Ready for Authorization") return;

  const amountCents = deal.milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const provider = getPaymentProvider();
  if (provider.mode === "sandbox" && !isPostgresConfigured()) {
    return;
  }
  const authorization = await provider.createAuthorizationHold({
    dealId,
    amountCents,
    currency: deal.currency,
  });
  if (!authorization.ok) return;

  if (provider.mode === "sandbox" && authorization.orderId) {
    await setPendingAuthorization(
      dealId,
      {
        providerName: authorization.providerName,
        mode: provider.mode,
        providerOrderId: authorization.orderId,
        approvalUrl: authorization.approvalUrl,
        amountCents,
        currency: deal.currency,
      },
      await currentActor(),
    );
  } else {
    await markDealAuthorized(
      dealId,
      {
        providerName: authorization.providerName,
        providerReference: authorization.providerReference,
        simulated: authorization.simulated,
        amountCents,
      },
      await currentActor(),
    );
  }
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

/**
 * Confirms a PayPal sandbox order after the buyer approved it in PayPal. Only
 * runs when a pending order exists; the resulting authorization id is recorded
 * as a real (non-simulated) hold. The signed result, not the pending record, is
 * what marks the deal authorized.
 */
export async function confirmAuthorizationAction(formData: FormData): Promise<void> {
  const dealId = field(formData, "dealId");
  await requireRole("buyer", "reviewer");
  await assertDealAccess(dealId);
  const deal = await getDeal(dealId);
  if (!deal || deal.status !== "Ready for Authorization") return;
  const pending = deal.pendingAuthorization;
  if (!pending) return;

  const provider = getPaymentProvider();
  if (provider.mode !== "sandbox") return;
  if (!isPostgresConfigured()) return;

  const result = await provider.authorizeOrder({
    dealId,
    orderId: pending.providerOrderId,
    requestId: `fairhold-confirm-${dealId}`,
  });
  if (!result.ok || !result.providerReference) return;

  await markDealAuthorized(
    dealId,
    {
      providerName: result.providerName,
      providerReference: result.providerReference,
      providerOrderId: pending.providerOrderId,
      simulated: result.simulated,
      amountCents: pending.amountCents,
    },
    await currentActor(),
  );
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

export async function submitEvidenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireRole("seller", "reviewer");
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  await assertDealAccess(dealId);

  const deal = await getDeal(dealId);
  if (!deal) return { ok: false, errors: { _form: "Deal not found." } };
  const milestone = deal.milestones.find((m) => m.id === milestoneId);
  if (!milestone) {
    return { ok: false, errors: { _form: "Milestone not found in this deal." } };
  }

  const rawFile = formData.get("file");
  let fileInput = null;
  if (rawFile instanceof File && rawFile.size > 0) {
    const bytes = new Uint8Array(await rawFile.arrayBuffer());
    fileInput = { name: rawFile.name, size: rawFile.size, bytes };
  }

  const result = validateEvidenceInput({
    note: field(formData, "note"),
    url: field(formData, "url"),
    file: fileInput,
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  let storedPath: string | null = null;
  if (result.value.file) {
    storedPath = await writeEvidenceFile(
      result.value.file.name,
      result.value.file.bytes,
    );
  }

  const response = await addEvidence(
    dealId,
    milestoneId,
    {
      note: result.value.note,
      url: result.value.url,
      file: result.value.file
        ? {
            name: result.value.file.name,
            size: result.value.file.size,
            type: result.value.file.type,
            storedPath: storedPath as string,
          }
        : null,
    },
    await currentActor(),
  );
  if (!response.ok) return { ok: false, errors: { _form: response.error } };

  revalidatePath(`/deals/${dealId}`);
  return { ok: true, errors: {} };
}

export async function reviewEvidenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireRole("buyer", "reviewer");
  const dealId = field(formData, "dealId");
  const submissionId = field(formData, "submissionId");
  await assertDealAccess(dealId);
  const decision = field(formData, "decision");
  if (decision !== "accepted" && decision !== "rejected") {
    return { ok: false, errors: { _form: "Choose to accept or reject." } };
  }
  const note = field(formData, "reviewNote").trim();
  const reviewNote = note === "" ? null : note.slice(0, 1000);

  const response = await reviewEvidence(
    dealId,
    submissionId,
    decision,
    reviewNote,
    await currentActor(),
  );
  if (!response.ok) return { ok: false, errors: { _form: response.error } };

  revalidatePath(`/deals/${dealId}`);
  return { ok: true, errors: {} };
}

/**
 * Records a human decision. The recommendation is always recomputed from the
 * current stored state (never trusted from the client), the decision is gated
 * by the pure approval rules, and only an allowed decision may invoke the
 * payment provider. Reviewer identity is fixed to "system" until auth exists.
 */
export async function recordApprovalAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireRole("buyer", "reviewer");
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  await assertDealAccess(dealId);
  const decision = field(formData, "decision");
  const note = field(formData, "note").trim();

  if (!isApprovalDecision(decision)) {
    return { ok: false, errors: { _form: "Choose to approve or reject." } };
  }

  const deal = await getDeal(dealId);
  if (!deal) return { ok: false, errors: { _form: "Deal not found." } };
  const milestone = deal.milestones.find((m) => m.id === milestoneId);
  if (!milestone) {
    return { ok: false, errors: { _form: "Milestone not found in this deal." } };
  }

  const evidence = deal.evidence.filter((e) => e.milestoneId === milestoneId);
  const recommendation = recommendMilestone({
    deal,
    milestone,
    evidence,
    now: new Date(),
  });

  const plan = planApproval(recommendation, decision);
  if (!plan.allowed) {
    return {
      ok: false,
      errors: { _form: plan.error ?? "This decision is not allowed." },
    };
  }

  const provider = getPaymentProvider();
  if (provider.mode === "sandbox" && !isPostgresConfigured()) {
    return {
      ok: false,
      errors: { _form: "Real PayPal actions require PostgreSQL-backed durable payment accounting." },
    };
  }
  let providerReference: string | null = null;
  let providerName: string | null = null;
  let simulated = false;
  let paymentStatus: "COMPLETED" | "VOIDED" | "PENDING" | "FAILED" | undefined;

  if (plan.action === "CAPTURE") {
    const capturedCents = deal.milestones.reduce(
      (total, item) =>
        total +
        (item.approval?.action === "CAPTURE" &&
        item.approval.paymentStatus === "COMPLETED"
          ? item.amountCents
          : 0),
      0,
    );
    const capturePlan = planCapture(
      deal.authorization?.amountCents ?? 0,
      capturedCents,
      milestone.amountCents,
    );
    if (!capturePlan.allowed) {
      return {
        ok: false,
        errors: { _form: capturePlan.error ?? "Capture is not allowed." },
      };
    }
    const idempotencyKey = `capture:${dealId}:${milestoneId}`;
    await beginPaymentOperation({
      dealId,
      milestoneId,
      authorizationReference: deal.authorization?.providerReference ?? null,
      action: "CAPTURE",
      requestedAmountCents: milestone.amountCents,
      currency: deal.currency,
      idempotencyKey,
      providerName: provider.name,
      finalCapture: capturePlan.finalCapture,
    });
    const result = await provider.captureAuthorization({
      dealId,
      milestoneId,
      amountCents: milestone.amountCents,
      currency: deal.currency,
      authorizationReference: deal.authorization?.providerReference ?? null,
      finalCapture: capturePlan.finalCapture,
      invoiceId: idempotencyKey,
      requestId: idempotencyKey,
    });
    await updatePaymentOperation(idempotencyKey, {
      status: result.status,
      providerReference: result.providerReference,
    });
    if (!result.ok) return { ok: false, errors: { _form: result.message } };
    providerReference = result.providerReference;
    providerName = result.providerName;
    simulated = result.simulated;
    paymentStatus = result.status;
  } else if (plan.action === "VOID") {
    const idempotencyKey = `void:${dealId}:${milestoneId}`;
    await beginPaymentOperation({
      dealId,
      milestoneId,
      authorizationReference: deal.authorization?.providerReference ?? null,
      action: "VOID",
      requestedAmountCents: null,
      currency: deal.currency,
      idempotencyKey,
      providerName: provider.name,
    });
    const result = await provider.voidAuthorization({
      dealId,
      milestoneId,
      authorizationReference: deal.authorization?.providerReference ?? null,
      requestId: idempotencyKey,
    });
    await updatePaymentOperation(idempotencyKey, {
      status: result.status,
      providerReference: result.providerReference,
    });
    if (!result.ok) return { ok: false, errors: { _form: result.message } };
    providerReference = result.providerReference;
    providerName = result.providerName;
    simulated = result.simulated;
    paymentStatus = result.status;
  }

  const approval: MilestoneApproval = {
    id: randomUUID(),
    decision,
    action: plan.action,
    reasonCodes: recommendation.reasonCodes,
    explanation: recommendation.explanation,
    evidenceFingerprint: recommendation.evidenceFingerprint,
    evidenceReviewedCount: recommendation.evidenceReviewedCount,
    reviewedBy: await currentActor(),
    reviewedAt: new Date().toISOString(),
    providerReference,
    providerName,
    simulated,
    paymentStatus,
    note: note === "" ? null : note.slice(0, 1000),
  };

  const response = await recordMilestoneApproval(
    dealId,
    milestoneId,
    approval,
    await currentActor(),
  );
  if (!response.ok) return { ok: false, errors: { _form: response.error } };

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
  return { ok: true, errors: {} };
}
