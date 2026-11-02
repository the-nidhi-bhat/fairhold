/**
 * Minimal HTTP transport seam for the PayPal adapter.
 *
 * The provider depends on this interface, not on `fetch` directly, so its
 * request/response handling can be unit-tested with mocked responses and no
 * network. The default implementation wraps the global `fetch` with a timeout.
 */

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text: string;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 100_000;

/** Error thrown by the transport when the request never completed. */
export class TransportTimeoutError extends Error {
  constructor() {
    super("The request timed out.");
    this.name = "TransportTimeoutError";
  }
}

export class TransportNetworkError extends Error {
  constructor(message = "The request failed before a response was received.") {
    super(message);
    this.name = "TransportNetworkError";
  }
}

export function createFetchTransport(
  fetchImpl: typeof fetch = fetch,
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
): HttpTransport {
  return async ({ method, url, headers, body, timeoutMs }) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs ?? defaultTimeoutMs,
    );
    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: "error",
      });
      const text = (await response.text()).slice(0, MAX_BODY_CHARS);
      return { status: response.status, ok: response.ok, text };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TransportTimeoutError();
      }
      throw new TransportNetworkError();
    } finally {
      clearTimeout(timer);
    }
  };
}
