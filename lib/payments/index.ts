/**
 * Payment provider selection.
 *
 * Chooses the PayPal sandbox adapter when it is fully configured
 * (PAYPAL_ENV=sandbox + real credentials), otherwise the demo provider. The
 * selection is made once, before any operation starts, and the chosen provider
 * is used for the whole flow — the app never silently downgrades a started real
 * sandbox operation to a simulated one.
 */
import { readPayPalConfig } from "./config.ts";
import { DemoPaymentProvider } from "./demo.ts";
import { PayPalSandboxProvider } from "./paypal.ts";
import type { PaymentProvider } from "./provider.ts";

export * from "./provider.ts";

export function getPaymentProvider(
  env: Record<string, string | undefined> = process.env,
): PaymentProvider {
  const config = readPayPalConfig(env);
  if (config) {
    return new PayPalSandboxProvider({ config });
  }
  return new DemoPaymentProvider();
}
