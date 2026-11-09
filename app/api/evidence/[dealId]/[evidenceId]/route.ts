import { Buffer } from "node:buffer";

import { canAccessDeal, getDemoSession } from "@/lib/auth/session";
import { getDeal } from "@/lib/data";
import { readEvidenceFile } from "@/lib/data/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ dealId: string; evidenceId: string }> },
): Promise<Response> {
  const { dealId, evidenceId } = await context.params;
  const session = await getDemoSession();
  const deal = await getDeal(dealId);
  if (!session || !deal || !canAccessDeal(session, deal)) {
    return new Response("Not found", { status: 404 });
  }
  const evidence = deal.evidence.find((item) => item.id === evidenceId);
  if (!evidence?.file) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readEvidenceFile(evidence.file.storedPath);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": evidence.file.type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(evidence.file.name)}`,
        "X-Content-Type-Options": "nosniff",
        // Buyer evidence is private to the deal: never let a shared proxy or
        // the browser cache keep a copy after the session ends.
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      },
    });
  } catch {
    return new Response("Evidence file unavailable", { status: 404 });
  }
}
