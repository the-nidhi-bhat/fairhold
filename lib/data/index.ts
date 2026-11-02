/**
 * Data-access facade.
 *
 * Selects the backend once per process:
 *   - PostgreSQL when DATABASE_URL is configured (and not a placeholder);
 *   - the JSON development store otherwise.
 *
 * There is NO silent fallback: once DATABASE_URL is set, every call goes to
 * PostgreSQL and infrastructure failures propagate as exceptions. The JSON
 * store is an explicit development mode, not a production fallback.
 *
 * Callers import from "@/lib/data" and never know which backend they hit.
 */
import { resolveDataBackend } from "./db.ts";
import * as jsonBackend from "./deals.ts";
import * as postgresBackend from "./postgres/deals.ts";
import { writeEvidenceFile } from "./storage.ts";

export type {
  MilestoneInput,
  CreateDealInput,
  DealMutationResult,
  EvidenceInput,
} from "./deals.ts";
export {
  validateDealForImport,
  validateDealForImportTyped,
} from "./importValidate.ts";
export { isPostgresConfigured, resolveDataBackend } from "./db.ts";
export { writeEvidenceFile };
export type DataBackendModule = typeof jsonBackend;

const backend: DataBackendModule =
  resolveDataBackend() === "postgres" ? postgresBackend : jsonBackend;

export const beginPaymentOperation: typeof jsonBackend.beginPaymentOperation =
  backend.beginPaymentOperation;
export const updatePaymentOperation: typeof jsonBackend.updatePaymentOperation =
  backend.updatePaymentOperation;

export const listDeals: typeof jsonBackend.listDeals = backend.listDeals;
export const getDeal: typeof jsonBackend.getDeal = backend.getDeal;
export const createDeal: typeof jsonBackend.createDeal = backend.createDeal;
export const addMilestone: typeof jsonBackend.addMilestone = backend.addMilestone;
export const updateMilestone: typeof jsonBackend.updateMilestone =
  backend.updateMilestone;
export const setMilestoneStatus: typeof jsonBackend.setMilestoneStatus =
  backend.setMilestoneStatus;
export const setDealStatus: typeof jsonBackend.setDealStatus =
  backend.setDealStatus;
export const markDealAuthorized: typeof jsonBackend.markDealAuthorized =
  backend.markDealAuthorized;
export const setPendingAuthorization: typeof jsonBackend.setPendingAuthorization =
  backend.setPendingAuthorization;
export const addEvidence: typeof jsonBackend.addEvidence = backend.addEvidence;
export const reviewEvidence: typeof jsonBackend.reviewEvidence =
  backend.reviewEvidence;
export const recordMilestoneApproval: typeof jsonBackend.recordMilestoneApproval =
  backend.recordMilestoneApproval;