-- v0.14.5 — Sprint LS-a: billing_orders table for paid-credit purchases.
--
-- Provider-agnostic schema. First provider wired: Lemon Squeezy (MoR;
-- handles KR + global VAT). Toss / Stripe / PortOne can be added later
-- as new `provider` values without schema change.
--
-- Idempotency: (provider, provider_order_id) UNIQUE. Webhook resends
-- from any provider are no-ops because the insert collides.
--
-- Pending-link flow: when an order's webhook fires before the user has
-- a saas_user row (the LS Checkout doesn't require pre-existing CLI
-- login — first-time visitors can pay and THEN sign up via CLI
-- afterwards), `user_id` is NULL and `pending_email` holds the email
-- LS captured at checkout. On the next `upsertUser` call that matches
-- that email, we claim the order: set user_id, credit paid_credits,
-- flip status from 'paid_unlinked' to 'paid'.

CREATE TABLE IF NOT EXISTS billing_orders (
  id                   TEXT PRIMARY KEY,                 -- bo_<random12>
  user_id              TEXT,                              -- NULL when pending link by email
  provider             TEXT NOT NULL,                     -- 'lemonsqueezy' | 'stripe' | 'toss' | ...
  provider_order_id    TEXT NOT NULL,                     -- LS order id ("order_1234567") / Stripe payment_intent etc.
  product_variant_id   TEXT,                              -- LS variant id, Stripe price id, etc.
  product_label        TEXT NOT NULL,                     -- 'first-pr-pass' | 'solo-month' | ...
  amount_cents         INTEGER NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'USD',
  status               TEXT NOT NULL,                     -- 'paid' | 'paid_unlinked' | 'refunded' | 'pending'
  credits_granted      INTEGER NOT NULL DEFAULT 0,
  pending_email        TEXT,                              -- email from provider when user_id is NULL
  customer_email       TEXT,                              -- email from provider on the order
  created_at           TEXT NOT NULL,
  paid_at              TEXT,
  refunded_at          TEXT,
  linked_at            TEXT,                              -- when pending_email → user_id resolved
  raw_payload          TEXT,                              -- JSON of provider webhook event for debug
  UNIQUE(provider, provider_order_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_orders_user
  ON billing_orders(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_orders_pending_email
  ON billing_orders(pending_email)
  WHERE pending_email IS NOT NULL AND user_id IS NULL;
