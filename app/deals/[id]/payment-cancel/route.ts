import { redirect } from "next/navigation";
import { canAccessDeal, getDemoSession } from "@/lib/auth/session";
import { getDeal } from "@/lib/data";

/**
 * PayPal cancel URL: the buyer cancelled the approval flow in PayPal.
 * Redirect back to the deal page with a cancellation notice.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: dealId } = await context.params;
  const session = await getDemoSession();
  const deal = await getDeal(dealId);

  if (!session || !deal || !canAccessDeal(session, deal)) {
    return new Response("Not found", { status: 404 });
  }

  return redirect(`/deals/${dealId}?paymentCancel=1`);
}
