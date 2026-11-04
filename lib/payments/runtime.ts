/**
 * Storage-aware payment runtime selection.
 *
 * PayPal sandbox credentials alone are not enough to run a real authorization:
 * FairHold requires PostgreSQL-backed durable accounting for every provider
 * operation. When credentials exist but the durable store does not, the runtime
 * selects the demo provider *before* any operation starts and reports why, so
 * the app never claims a real payment flow it cannot account for.
 *
 * This is a selection-time decision. Once a flow starts, the chosen provider is
 * used for the whole flow — an in-flight sandbox operation is never downgraded.
 */
import { isPostgresConfigured } from "../data/db.ts";
import { readPayPalConfig } from "./config.ts";
import { DemoPaymentProvider } from "./demo.ts";
import { PayPalSandboxProvider } from "./paypal.ts";
import type { PaymentProvider } from "./provider.ts";

export interface PaymentRuntime {
  provider: PaymentProvider;
  /**
   * True when sandbox credentials are configured but durable accounting is not,
   * so real provider actions are unavailable and the simulated provider is used.
   */
  sandboxRequiresPostgres: boolean;
}

export function paymentRuntime(
  env: Record<string, string | undefined> = process.env,
): PaymentRuntime {
  const config = readPayPalConfig(env);
  if (!config) {
    return { provider: new DemoPaymentProvider(), sandboxRequiresPostgres: false };
  }
  if (!isPostgresConfigured(env)) {
    return { provider: new DemoPaymentProvider(), sandboxRequiresPostgres: true };
  }
  return {
    provider: new PayPalSandboxProvider({ config }),
    sandboxRequiresPostgres: false,
  };
}
