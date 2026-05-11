/**
 * v0.14.5 — Lemon Squeezy SDK-free helper.
 *
 * Lemon Squeezy is the chosen MoR (Merchant of Record) because Stripe
 * Korea is personal-only — 3SVS Co. as a business can't onboard.
 * LS handles VAT/tax across KR/US/EU; we just need their API for
 * Checkout session creation + their webhook for fulfillment.
 *
 * Two operations only (MVP):
 *   1. createCheckoutSession() — POST /v1/checkouts → returns hosted
 *      Checkout URL we redirect the buyer to.
 *   2. verifyWebhookSignature() — verifies the `X-Signature` HMAC-SHA256
 *      header on incoming webhook deliveries so we can trust the body.
 *
 * No SDK dependency on purpose. The official `@lemonsqueezy/lemonsqueezy.js`
 * pulls a lot of node-only code (path, fs, etc.) that doesn't fit the
 * Workers runtime cleanly. The LS REST API is small enough to call
 * directly via fetch; signature verify is plain `crypto.subtle.verify`.
 *
 * Future providers (Toss, Stripe, PortOne) will get their own helpers
 * under the same shape; routes/billing.ts switches on `provider`.
 */

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";
const CHECKOUT_TIMEOUT_MS = 8_000;

export interface CreateCheckoutInput {
  apiKey: string;
  storeId: string;
  variantId: string;
  /** Pre-fill the buyer's email at checkout. Empty string skips pre-fill. */
  email?: string;
  /**
   * Arbitrary key→value metadata round-tripped to the webhook in
   * `meta.custom_data`. We use this to carry our saas_user_id (or the
   * intended product_label) so the webhook can credit the right user.
   * LS caps values at 1024 chars; we don't enforce that here.
   */
  custom?: Record<string, string>;
  /** Where LS redirects after success. Optional — falls back to LS default. */
  successUrl?: string;
}

export interface CreateCheckoutOutput {
  /** Hosted Checkout URL to redirect the buyer to. */
  url: string;
  /** LS checkout id; useful for correlating logs. */
  checkoutId: string;
}

/**
 * Create a Lemon Squeezy hosted Checkout session and return the URL
 * the buyer should be redirected to.
 *
 * Throws on any non-2xx response or network failure. Caller is
 * expected to translate that into a 503 for the user.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateCheckoutOutput> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          ...(input.email ? { email: input.email } : {}),
          ...(input.custom ? { custom: input.custom } : {}),
        },
        checkout_options: { embed: false, media: true },
        ...(input.successUrl ? { product_options: { redirect_url: input.successUrl } } : {}),
      },
      relationships: {
        store:   { data: { type: "stores",   id: input.storeId   } },
        variant: { data: { type: "variants", id: input.variantId } },
      },
    },
  };

  let r: Response;
  try {
    r = await fetchImpl(`${LS_API_BASE}/checkouts`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        accept: "application/vnd.api+json",
        "content-type": "application/vnd.api+json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(t);
  }

  if (!r.ok) {
    const tail = await r.text().catch(() => "");
    throw new Error(`lemonsqueezy: POST /checkouts ${r.status} — ${tail.slice(0, 300)}`);
  }

  const j = (await r.json()) as {
    data?: { id?: string; attributes?: { url?: string } };
  };
  const url = j.data?.attributes?.url;
  const checkoutId = j.data?.id;
  if (!url || !checkoutId) {
    throw new Error("lemonsqueezy: malformed checkout response — missing url or id");
  }
  return { url, checkoutId };
}

/**
 * Verify a Lemon Squeezy webhook signature.
 *
 * LS sends an `X-Signature` header containing the hex-encoded
 * HMAC-SHA256 of the raw request body using the webhook secret you
 * set on the webhook endpoint in their dashboard.
 *
 * Uses `crypto.subtle.verify` so the comparison is constant-time
 * (the equivalent of `crypto.timingSafeEqual` in Node).
 *
 * Returns false on any error — never throws on bad input. Caller
 * should respond 401 on false.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature || typeof signature !== "string") return false;
  if (!secret) return false;

  // Parse hex signature → bytes. LS uses lowercase hex.
  const sigHex = signature.toLowerCase().trim();
  if (!/^[0-9a-f]+$/.test(sigHex) || sigHex.length % 2 !== 0) return false;
  const sigBytes = new Uint8Array(sigHex.length / 2);
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
  }

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(rawBody));
  } catch {
    return false;
  }
}

// ----- webhook event shapes (the subset we care about) ------------------

/**
 * LS webhook envelope. Real payload has way more fields; we narrow to
 * what we read. See https://docs.lemonsqueezy.com/help/webhooks
 */
export interface WebhookEvent {
  meta: {
    event_name: string;             // "order_created" | "subscription_created" | ...
    custom_data?: Record<string, string>;
  };
  data: {
    type: string;
    id: string;                      // LS order id / subscription id
    attributes: WebhookOrderAttrs | Record<string, unknown>;
  };
}

export interface WebhookOrderAttrs {
  store_id: number;
  customer_id: number;
  identifier: string;
  user_email: string;
  user_name: string;
  currency: string;
  status: string;                    // "paid" | "refunded" | "pending" | "failed"
  total: number;                     // cents in USD (or other currency)
  total_usd?: number;                // always present, USD cents
  refunded: boolean;
  first_order_item?: {
    variant_id: number;
    variant_name: string;
    product_id: number;
    product_name: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Narrow an unknown webhook body to a WebhookEvent shape. Returns null
 * when the body doesn't look like an LS event. Pure — no IO.
 */
export function parseWebhookEvent(raw: unknown): WebhookEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const meta = r.meta as Record<string, unknown> | undefined;
  const data = r.data as Record<string, unknown> | undefined;
  if (!meta || !data) return null;
  if (typeof meta.event_name !== "string") return null;
  if (typeof data.type !== "string" || typeof data.id !== "string") return null;
  if (!data.attributes || typeof data.attributes !== "object") return null;
  return raw as WebhookEvent;
}
