/**
 * PayPal configuration, read from the server environment only.
 *
 * This module never logs or returns secret values to the browser. It only
 * decides whether the sandbox adapter is fully configured. If configuration is
 * incomplete the app falls back to the demo provider — but only *before* a real
 * operation is started; see getPaymentProvider().
 */

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string | null;
  /** Sandbox only in this phase. */
  environment: "sandbox";
}

function looksPlaceholder(value: string | undefined): boolean {
  return !value || /^your_/i.test(value.trim());
}

/**
 * Returns a usable sandbox config, or null when PayPal is not configured.
 * Sandbox-only: any other PAYPAL_ENV value disables the real adapter.
 */
export function readPayPalConfig(
  env: Record<string, string | undefined>,
): PayPalConfig | null {
  const environment = (env.PAYPAL_ENV ?? "").trim().toLowerCase();
  if (environment !== "sandbox") return null;
  if (looksPlaceholder(env.PAYPAL_CLIENT_ID)) return null;
  if (looksPlaceholder(env.PAYPAL_CLIENT_SECRET)) return null;
  const webhookId = env.PAYPAL_WEBHOOK_ID;
  return {
    clientId: (env.PAYPAL_CLIENT_ID as string).trim(),
    clientSecret: (env.PAYPAL_CLIENT_SECRET as string).trim(),
    webhookId: looksPlaceholder(webhookId) ? null : (webhookId as string).trim(),
    environment: "sandbox",
  };
}

export function isPayPalSandboxConfigured(
  env: Record<string, string | undefined>,
): boolean {
  return readPayPalConfig(env) !== null;
}
