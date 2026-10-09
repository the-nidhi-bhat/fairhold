"use server";

/**
 * Server actions for deals and milestones.
 *
 * Every action treats its input as untrusted: fields are read from FormData,
 * validated with the pure domain validators, and status changes are re-checked
 * against the deterministic rules before anything is persisted. Payment status
 * and amounts are never taken from the client. Authentication does not exist
 * yet, so all actions run as the "system" actor and this is recorded honestly
 * in the audit trail.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addMilestone,
  createDeal,
  getDeal,
  markDealAuthorized,
  setDealStatus,
  setMilestoneStatus,
  updateMilestone,
} from "@/lib/data/deals";
import { canTransitionDeal, canTransitionMilestone } from "@/lib/domain/status";
import {
  DEAL_STATUSES,
  MILESTONE_STATUSES,
  type DealStatus,
  type MilestoneStatus,
} from "@/lib/domain/types";
import {
  validateDealInput,
  validateMilestoneInput,
} from "@/lib/domain/validation";
import { getPaymentProvider } from "@/lib/payments/demo";

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

export async function createDealAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = validateDealInput({
    title: field(formData, "title"),
    clientName: field(formData, "clientName"),
    freelancerName: field(formData, "freelancerName"),
    currency: field(formData, "currency"),
    agreement: field(formData, "agreement"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  const deal = await createDeal(result.value, "system");
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/deals/${deal.id}`);
}

export async function addMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const dealId = field(formData, "dealId");
  const result = validateMilestoneInput({
    title: field(formData, "title"),
    description: field(formData, "description"),
    amount: field(formData, "amount"),
    dueDate: field(formData, "dueDate"),
    acceptanceCriteria: field(formData, "acceptanceCriteria"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  const response = await addMilestone(dealId, result.value, "system");
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
  const result = validateMilestoneInput({
    title: field(formData, "title"),
    description: field(formData, "description"),
    amount: field(formData, "amount"),
    dueDate: field(formData, "dueDate"),
    acceptanceCriteria: field(formData, "acceptanceCriteria"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  const response = await updateMilestone(
    dealId,
    milestoneId,
    result.value,
    "system",
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
  if (!isMilestoneStatus(to)) return;

  const deal = await getDeal(dealId);
  if (!deal) return;
  const milestone = deal.milestones.find((m) => m.id === milestoneId);
  if (!milestone || !canTransitionMilestone(milestone.status, to)) return;

  await setMilestoneStatus(dealId, milestoneId, to, "system");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

export async function changeDealStatusAction(formData: FormData): Promise<void> {
  const dealId = field(formData, "dealId");
  const to = field(formData, "status");
  if (!isDealStatus(to) || to === "Authorized") return;

  const deal = await getDeal(dealId);
  if (!deal || !canTransitionDeal(deal.status, to)) return;

  await setDealStatus(dealId, to, "system");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

export async function authorizeDealAction(formData: FormData): Promise<void> {
  const dealId = field(formData, "dealId");
  const deal = await getDeal(dealId);
  if (!deal || deal.status !== "Ready for Authorization") return;

  const amountCents = deal.milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const provider = getPaymentProvider();
  const authorization = await provider.createAuthorizationHold({
    dealId,
    amountCents,
    currency: deal.currency,
  });
  if (!authorization.ok) return;

  await markDealAuthorized(
    dealId,
    {
      providerName: authorization.providerName,
      providerReference: authorization.providerReference,
      simulated: authorization.simulated,
    },
    "system",
  );
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}
