/**
 * v0.14.5 — Lemon Squeezy webhook receiver.
 *
 * POST /webhook/lemonsqueezy
 *
 * Auth: `X-Signature` header containing HMAC-SHA256(rawBody, secret)
 * where `secret` is the value Bae set when creating the webhook in the
 * LS dashboard. Stored as Worker secret LEMONSQUEEZY_WEBHOOK_SECRET.
 *
 * Events handled today:
 *   - order_created   — one-time purchase (first-PR pass, future
 *                       boosters) → grant paid_credit
 *
 * Events accepted-but-ignored (we ack 200 so LS doesn't retry forever):
 *   - subscription_*  — subscriptions land in a follow-up sprint
 *   - order_refunded  — refunds need a manual review path; ack + log
 *
 * Idempotency: provider_order_id is UNIQUE on billing_orders. If LS
 * re-sends the same event (network blip, retry), the second INSERT
 * collides → we 200 with `duplicate: true`.
 *
 * Pending-link: when the order's email doesn't match any saas_user,
 * we still record the order with status='paid_unlinked' + pending_email
 * populated. db/saas.ts:upsertUser claims pending orders by email
 * the next time that email signs up via CLI or GH App install.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import {
  parseWebhookEvent,
  verifyWebhookSignature,
  type WebhookOrderAttrs,
} from "../lemonsqueezy.js";
import {
  claimPendingBillingForUser,
  createBillingOrderPaid,
  findBillingOrderByProvider,
  findUserByEmail,
  grantPaidCredits,
} from "../db/saas.js";

// Map product label (from LS custom_data or first_order_item.variant_name)
// → credits granted. First-PR pass = 1 review. Booster = 5 (planned).
const CREDITS_FOR: Record<string, number> = {
  "first-pr-pass": 1,
  "booster-5": 5,
};

export function createLemonsqueezyWebhookRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/webhook/lemonsqueezy", async (c) => {
    if (!c.env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      return c.json({ error: "webhook_disabled" }, 503);
    }
    const sig = c.req.header("x-signature") ?? c.req.header("X-Signature") ?? null;
    const rawBody = await c.req.text();
    const ok = await verifyWebhookSignature(rawBody, sig, c.env.LEMONSQUEEZY_WEBHOOK_SECRET);
    if (!ok) {
      return c.json({ error: "signature_mismatch" }, 401);
    }

    let event;
    try {
      event = parseWebhookEvent(JSON.parse(rawBody));
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (!event) return c.json({ error: "invalid_event_shape" }, 400);

    const eventName = event.meta.event_name;
    const orderId = event.data.id;

    // Idempotency check — short-circuit if we already processed.
    const existing = await findBillingOrderByProvider(c.env, "lemonsqueezy", orderId);
    if (existing) {
      return c.json({ ok: true, duplicate: true, order_id: orderId });
    }

    if (eventName === "order_created") {
      const attrs = event.data.attributes as WebhookOrderAttrs;
      if (attrs.status !== "paid") {
        // LS sometimes emits order_created for failed/pending orders.
        // Only credit on `paid`.
        return c.json({ ok: true, skipped: `status=${attrs.status}` });
      }

      // Determine product label from custom_data, fallback to variant id.
      const customLabel = event.meta.custom_data?.product_label;
      const productLabel = customLabel && CREDITS_FOR[customLabel]
        ? customLabel
        : "first-pr-pass"; // safe default for MVP
      const credits = CREDITS_FOR[productLabel] ?? 0;

      const email = (attrs.user_email ?? "").toLowerCase().trim();
      const linkedUser = email ? await findUserByEmail(c.env, email) : null;

      const now = new Date().toISOString();
      const id = `bo_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

      await createBillingOrderPaid(c.env, {
        id,
        userId: linkedUser?.id ?? null,
        provider: "lemonsqueezy",
        providerOrderId: orderId,
        productVariantId: attrs.first_order_item?.variant_id !== undefined
          ? String(attrs.first_order_item.variant_id)
          : null,
        productLabel,
        amountCents: typeof attrs.total === "number" ? attrs.total : 0,
        currency: attrs.currency ?? "USD",
        status: linkedUser ? "paid" : "paid_unlinked",
        creditsGranted: credits,
        customerEmail: email || null,
        pendingEmail: linkedUser ? null : (email || null),
        createdAt: now,
        paidAt: now,
        rawPayload: rawBody,
      });

      if (linkedUser) {
        await grantPaidCredits(c.env, linkedUser.id, credits);
      }
      // else: pending. upsertUser will claim it on next sign-in matching email.

      return c.json({
        ok: true,
        order_id: orderId,
        credits_granted: credits,
        linked: Boolean(linkedUser),
      });
    }

    // subscription_* + order_refunded — ack but don't process.
    return c.json({ ok: true, skipped: `event=${eventName}` });
  });

  return app;
}

/**
 * Helper used by saas-auth's upsertUser. Exported here so the route
 * file stays the single source of truth on credit-grant semantics.
 *
 * Idempotent: only claims orders whose status is 'paid_unlinked' AND
 * pending_email matches AND user_id is null.
 */
export async function claimPendingOrdersForEmail(
  env: Env,
  email: string,
  userId: string,
): Promise<{ claimed: number; creditsGranted: number }> {
  return claimPendingBillingForUser(env, email, userId);
}
