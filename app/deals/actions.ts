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
import { writeEvidenceFile, deleteEvidenceFile } from "@/lib/data/storage";
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
import { paymentRuntime } from "@/lib/payments/runtime";
import type { PaymentOperationResult } from "@/lib/payments/provider";
import { canAccessDeal, getDemoSession, type DemoSession } from "@/lib/auth/session";

export interface FormState {
  ok: boolean;
  errors: Record<string, string>;
}

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function envOrDefault(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function isDealStatus(value: string): value is DealStatus {
  return (DEAL_STATUSES as readonly string[]).includes(value);
}

function isMilestoneStatus(value: string): value is MilestoneStatus {
  return (MILESTONE_STATUSES as readonly string[]).includes(value);
}

async function currentSession(): Promise<DemoSession> {
  const session = await getDemoSession();
  if (!session) throw new AccessDeniedError("Sign in to make changes.");
  return session;
}

/**
 * A guard failure (not signed in, wrong role, not your deal) is a normal
 * outcome of a crafted or stale request. It is carried as a typed error so an
 * action can answer with an inline message or a redirect instead of a 500.
 */
class AccessDeniedError extends Error {}

async function currentActor(): Promise<string> {
  const session = await currentSession();
  return `${session.role}:${session.name}`;
}

async function assertDealAccess(dealId: string): Promise<void> {
  const session = await currentSession();
  const deal = await getDeal(dealId);
  if (!deal || !canAccessDeal(session, deal)) {
    throw new AccessDeniedError(
      "You do not have access to this deal. No changes were made.",
    );
  }
}

async function requireRole(...roles: DemoSession["role"][]): Promise<DemoSession> {
  const session = await currentSession();
  if (!roles.includes(session.role)) {
    throw new AccessDeniedError(
      "This action is not allowed for your current role. No changes were made.",
    );
  }
  return session;
}

/** Form-state actions: turn a denied guard into an inline error, not a 500. */
function denialForm(error: unknown): FormState | null {
  return error instanceof AccessDeniedError
    ? { ok: false, errors: { _form: error.message } }
    : null;
}

/** Redirect actions: turn a denied guard into a banner on the deal page. */
async function requireDealAccessOrRedirect(dealId: string): Promise<void> {
  try {
    await assertDealAccess(dealId);
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    redirect(`/deals/${dealId}?actionError=forbidden`);
  }
}

type FormGuard = { denied: FormState } | { session: DemoSession };

/**
 * Form-state guard: signs the caller in, checks the role, and (when a deal is
 * given) checks deal ownership. A denied request returns an inline error, so a
 * stale tab or a crafted post never produces a 500.
 */
async function guardForm(
  roles: DemoSession["role"][],
  dealId: string | null,
): Promise<FormGuard> {
  try {
    const session = await requireRole(...roles);
    if (dealId) await assertDealAccess(dealId);
    return { session };
  } catch (error) {
    const denied = denialForm(error);
    if (denied) return { denied };
    throw error;
  }
}

export async function createDealAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await guardForm(["buyer", "seller"], null);
  if ("denied" in guard) return guard.denied;
  const session = guard.session;
  const result = validateDealInput({
    title: field(formData, "title"),
    clientName: field(formData, "clientName"),
    freelancerName: field(formData, "freelancerName"),
    currency: field(formData, "currency"),
    agreement: field(formData, "agreement"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  if (
    (session.role === "buyer" &&
      result.value.clientName.toLowerCase() !== session.name.toLowerCase()) ||
    (session.role === "seller" &&
      result.value.freelancerName.toLowerCase() !== session.name.toLowerCase())
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
  const dealId = field(formData, "dealId");
  const guard = await guardForm(["seller", "reviewer"], dealId);
  if ("denied" in guard) return guard.denied;
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
  if (deal.pendingAuthorization) {
    return { ok: false, errors: { _form: "Milestones cannot be added while a PayPal authorization is awaiting buyer approval." } };
  }
  if (deal.status === "Completed" || deal.status === "Disputed" || deal.status === "Cancelled") {
    return { ok: false, errors: { _form: "Milestones cannot be added while the deal is " + deal.status + "." } };
  }

  const response = await addMilestone(dealId, result.value, await currentActor());
  if (!response.ok) return { ok: false, errors: { _form: response.error } };

  revalidatePath(`/deals/${dealId}`);
  return { ok: true, errors: {} };
}

export async function updateMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  const guard = await guardForm(["seller", "reviewer"], dealId);
  if ("denied" in guard) return guard.denied;
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
  if (deal.pendingAuthorization) {
    return { ok: false, errors: { _form: "Milestones cannot be edited while a PayPal authorization is awaiting buyer approval." } };
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
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  const to = field(formData, "status");
  try {
    await requireRole("seller", "reviewer");
  } catch {
    redirect(`/deals/${dealId}?actionError=role`);
  }
  // Check access before anything about the deal's existence or state, so an
  // outsider cannot use the error code to learn whether a deal exists.
  await requireDealAccessOrRedirect(dealId);
  if (!isMilestoneStatus(to)) {
    redirect(`/deals/${dealId}?actionError=invalid_status`);
  }

  const deal = await getDeal(dealId);
  if (!deal) redirect(`/deals/${dealId}?actionError=not_found`);
  const milestone = deal.milestones.find((m) => m.id === milestoneId);
  if (!milestone) redirect(`/deals/${dealId}?actionError=not_found`);
  if (!canTransitionMilestone(milestone.status, to)) {
    redirect(`/deals/${dealId}?actionError=invalid_transition`);
  }

  const response = await setMilestoneStatus(dealId, milestoneId, to, await currentActor());
  if (!response.ok) {
    redirect(`/deals/${dealId}?actionError=invalid_transition`);
  }
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

export async function changeDealStatusAction(formData: FormData): Promise<void> {
  const dealId = field(formData, "dealId");
  const to = field(formData, "status");
  try {
    await requireRole("seller", "reviewer");
  } catch {
    redirect(`/deals/${dealId}?actionError=role`);
  }
  // Access first: the transition error must not double as an existence oracle.
  await requireDealAccessOrRedirect(dealId);
  if (!isDealStatus(to) || to === "Authorized") {
    redirect(`/deals/${dealId}?actionError=invalid_status`);
  }

  const deal = await getDeal(dealId);
  if (!deal) redirect(`/deals/${dealId}?actionError=not_found`);
  if (!canTransitionDeal(deal.status, to)) {
    redirect(`/deals/${dealId}?actionError=invalid_transition`);
  }

  const response = await setDealStatus(dealId, to, await currentActor());
  if (!response.ok) {
    redirect(`/deals/${dealId}?actionError=invalid_transition`);
  }
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
  try {
    await requireRole("buyer", "reviewer");
  } catch {
    redirect(`/deals/${dealId}?actionError=role`);
  }
  await requireDealAccessOrRedirect(dealId);
  const deal = await getDeal(dealId);
  if (!deal) redirect(`/deals/${dealId}?actionError=not_found`);
  if (deal.status !== "Ready for Authorization") {
    redirect(`/deals/${dealId}?actionError=invalid_status`);
  }
  if (deal.milestones.length === 0) {
    redirect(`/deals/${dealId}?actionError=no_milestones`);
  }

  const amountCents = deal.milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const { provider } = paymentRuntime();
  const returnUrl = `${envOrDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000")}/deals/${dealId}/payment-return`;
  const cancelUrl = `${envOrDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000")}/deals/${dealId}/payment-cancel`;
  const authorization = await provider.createAuthorizationHold({
    dealId,
    amountCents,
    currency: deal.currency,
    returnUrl,
    cancelUrl,
  });
  if (!authorization.ok) {
    redirect(`/deals/${dealId}?actionError=provider`);
  }

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
        expiresAt: authorization.expiresAt ?? null,
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
  try {
    await requireRole("buyer", "reviewer");
  } catch {
    redirect(`/deals/${dealId}?actionError=role`);
  }
  await requireDealAccessOrRedirect(dealId);
  const deal = await getDeal(dealId);
  if (!deal) redirect(`/deals/${dealId}?actionError=not_found`);
  if (deal.status !== "Ready for Authorization") {
    redirect(`/deals/${dealId}?actionError=invalid_status`);
  }
  const pending = deal.pendingAuthorization;
  if (!pending) redirect(`/deals/${dealId}?actionError=no_pending_authorization`);

  const { provider } = paymentRuntime();
  if (provider.mode !== "sandbox") {
    redirect(`/deals/${dealId}?actionError=sandbox_unavailable`);
  }

  const result = await provider.authorizeOrder({
    dealId,
    orderId: pending.providerOrderId,
    requestId: `fairhold-confirm-${dealId}`,
  });
  if (!result.ok || !result.providerReference) {
    redirect(`/deals/${dealId}?actionError=provider`);
  }

  await markDealAuthorized(
    dealId,
    {
      providerName: result.providerName,
      providerReference: result.providerReference,
      providerOrderId: pending.providerOrderId,
      simulated: result.simulated,
      amountCents: pending.amountCents,
      expiresAt: result.expiresAt ?? null,
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
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  const guard = await guardForm(["seller", "reviewer"], dealId);
  if ("denied" in guard) return guard.denied;

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
      result.value.file.type,
    );
  }

  let response;
  try {
    response = await addEvidence(
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
  } catch (error) {
    // The file was already written; the row was not. Remove the orphan so a
    // failed submission leaves no unreferenced bytes behind.
    if (storedPath) await deleteEvidenceFile(storedPath).catch(() => undefined);
    throw error;
  }
  if (!response.ok) {
    if (storedPath) await deleteEvidenceFile(storedPath).catch(() => undefined);
    return { ok: false, errors: { _form: response.error } };
  }

  revalidatePath(`/deals/${dealId}`);
  return { ok: true, errors: {} };
}

export async function reviewEvidenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const dealId = field(formData, "dealId");
  const submissionId = field(formData, "submissionId");
  const guard = await guardForm(["buyer", "reviewer"], dealId);
  if ("denied" in guard) return guard.denied;
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
 * payment provider. The reviewer is the signed demo identity, never "system".
 */
export async function recordApprovalAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const dealId = field(formData, "dealId");
  const milestoneId = field(formData, "milestoneId");
  const guard = await guardForm(["buyer", "reviewer"], dealId);
  if ("denied" in guard) return guard.denied;
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

  const { provider } = paymentRuntime();
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
    // Each distinct capture against the same milestone needs a unique, stable
    // idempotency identity. Retries of the same logical capture reuse the same
    // key; a second legitimate capture gets a different key. We count existing
    // completed captures for this milestone and add one.
    const existingCaptureCount = deal.milestones.filter(
      (m) =>
        m.id === milestoneId &&
        m.approval?.action === "CAPTURE" &&
        m.approval.paymentStatus === "COMPLETED",
    ).length;
    const idempotencyKey = `capture:${dealId}:${milestoneId}:${existingCaptureCount + 1}`;
    let operation;
    try {
      operation = await beginPaymentOperation({
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
    } catch (error) {
      return {
        ok: false,
        errors: {
          _form:
            error instanceof Error
              ? error.message
              : "The payment operation could not be recorded. Nothing was captured.",
        },
      };
    }

    // If the operation already has a terminal result (from a prior attempt),
    // reuse it instead of sending a duplicate request to the provider.
    let result: PaymentOperationResult;
    if (operation.status === "COMPLETED" || operation.status === "VOIDED" || operation.status === "FAILED") {
      result = {
        ok: operation.status === "COMPLETED" || operation.status === "VOIDED",
        providerReference: operation.providerReference ?? null,
        providerName: provider.name,
        simulated: false,
        status: operation.status,
        message: operation.status === "FAILED"
          ? "The prior capture attempt did not succeed."
          : `Capture already recorded as ${operation.status.toLowerCase()}.`,
      };
    } else {
      // RESERVED or PENDING: send to the provider. PENDING means a prior
      // attempt timed out — PayPal may have already processed it, so we
      // report the outcome conservatively and never blindly retry.
      result = await provider.captureAuthorization({
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
        simulated: result.simulated,
      });
    }
    if (!result.ok) return { ok: false, errors: { _form: result.message } };
    providerReference = result.providerReference;
    providerName = result.providerName;
    simulated = result.simulated;
    paymentStatus = result.status;
  } else if (plan.action === "VOID") {
    const idempotencyKey = `void:${dealId}:${milestoneId}`;
    let operation;
    try {
      operation = await beginPaymentOperation({
        dealId,
        milestoneId,
        authorizationReference: deal.authorization?.providerReference ?? null,
        action: "VOID",
        requestedAmountCents: null,
        currency: deal.currency,
        idempotencyKey,
        providerName: provider.name,
      });
    } catch (error) {
      return {
        ok: false,
        errors: {
          _form:
            error instanceof Error
              ? error.message
              : "The payment operation could not be recorded. Nothing was voided.",
        },
      };
    }

    let result: PaymentOperationResult;
    if (operation.status === "COMPLETED" || operation.status === "VOIDED" || operation.status === "FAILED") {
      result = {
        ok: operation.status === "COMPLETED" || operation.status === "VOIDED",
        providerReference: operation.providerReference ?? null,
        providerName: provider.name,
        simulated: false,
        status: operation.status,
        message: operation.status === "FAILED"
          ? "The prior void attempt did not succeed."
          : `Void already recorded as ${operation.status.toLowerCase()}.`,
      };
    } else {
      result = await provider.voidAuthorization({
        dealId,
        milestoneId,
        authorizationReference: deal.authorization?.providerReference ?? null,
        requestId: idempotencyKey,
      });
      await updatePaymentOperation(idempotencyKey, {
        status: result.status,
        providerReference: result.providerReference,
        simulated: result.simulated,
      });
    }
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
