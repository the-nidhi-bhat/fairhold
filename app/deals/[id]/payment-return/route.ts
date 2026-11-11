import { redirect } from "next/navigation";
import { canAccessDeal, getDemoSession } from "@/lib/auth/session";
import { getDeal } from "@/lib/data";

/**
 * PayPal return URL: the buyer was redirected here after approving the order
 * in PayPal. This page only renders a confirmation page; the actual
 * authorization is confirmed via confirmAuthorizationAction (server action)
 * which calls PayPal's authorize endpoint server-side. We never treat a
 * browser redirect or query parameter as proof of authorization.
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

  if (!deal.pendingAuthorization) {
    return new Response(
      "No pending authorization found for this deal.",
      { status: 400 },
    );
  }

  // The buyer has returned from PayPal after approving the order. The actual
  // authorization is confirmed via confirmAuthorizationAction (server action),
  // which calls PayPal's authorize endpoint server-side. We just redirect back
  // to the deal page so the buyer can confirm.
  return redirect(`/deals/${dealId}?paymentReturn=1`);
}
