import type { Deal, EvidenceDecision } from "./types";

export interface WorkflowEvidenceItem {
  deal: Deal;
  milestoneId: string;
  milestoneTitle: string;
  evidenceId: string;
  decision: EvidenceDecision;
  submittedAt: string;
}

export interface DashboardWorkflow {
  pendingReviews: WorkflowEvidenceItem[];
  assignedMilestones: Array<{
    deal: Deal;
    milestoneId: string;
    milestoneTitle: string;
    status: string;
    dueDate: string | null;
  }>;
  rejectedEvidence: WorkflowEvidenceItem[];
  activeMilestoneCount: number;
}

export function summarizeDashboardWorkflow(
  deals: Deal[],
  role: "buyer" | "seller" | "reviewer",
  today = new Date().toISOString().slice(0, 10),
): DashboardWorkflow {
  const pendingReviews: WorkflowEvidenceItem[] = [];
  const rejectedEvidence: WorkflowEvidenceItem[] = [];
  const assignedMilestones: DashboardWorkflow["assignedMilestones"] = [];
  let activeMilestoneCount = 0;

  for (const deal of deals) {
    for (const milestone of deal.milestones) {
      if (!["Completed", "Cancelled"].includes(milestone.status)) {
        activeMilestoneCount += 1;
        if (role === "seller" && (!milestone.dueDate || milestone.dueDate >= today)) {
          assignedMilestones.push({
            deal,
            milestoneId: milestone.id,
            milestoneTitle: milestone.title,
            status: milestone.status,
            dueDate: milestone.dueDate,
          });
        }
      }

      for (const evidence of deal.evidence.filter(
        (item) => item.milestoneId === milestone.id,
      )) {
        const item = {
          deal,
          milestoneId: milestone.id,
          milestoneTitle: milestone.title,
          evidenceId: evidence.id,
          decision: evidence.decision,
          submittedAt: evidence.submittedAt,
        };
        if (role === "buyer" && evidence.decision === "pending") {
          pendingReviews.push(item);
        }
        if (role === "seller" && evidence.decision === "rejected") {
          rejectedEvidence.push(item);
        }
      }
    }
  }

  assignedMilestones.sort((a, b) =>
    (a.dueDate ?? "9999-12-31").localeCompare(
      b.dueDate ?? "9999-12-31",
    ),
  );
  pendingReviews.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  rejectedEvidence.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return {
    pendingReviews,
    assignedMilestones,
    rejectedEvidence,
    activeMilestoneCount,
  };
}
