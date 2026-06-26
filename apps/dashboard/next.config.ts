import type { NextConfig } from "next";
import { resolveCentralPlaneAuthOrigin, buildAuthRewrites } from "./src/lib/auth-rewrite.mjs";

/**
 * Stage 232 — same-origin auth rewrite (code readiness; NOT live until a dashboard deploy).
 *
 * Proxies first-party `/api/auth/*` on the dashboard origin (app.trysimsa.com) to the
 * central-plane Worker's `/api/auth/*`, so Better Auth cookies become first-party once auth is
 * later activated. This does NOT activate auth: while `AUTH_ENABLED` is unset the worker route
 * returns `503 auth_disabled`, so the proxied path returns 503 too. Merging changes no live
 * behaviour until a separately-approved Vercel deploy.
 *
 * Destination origin: `CENTRAL_PLANE_AUTH_ORIGIN` (server-side only), defaulting to the
 * documented production Worker origin. See src/lib/auth-rewrite.mjs + docs/auth-same-origin-rewrite.md.
 */
const nextConfig: NextConfig = {
  async rewrites() {
    return buildAuthRewrites(resolveCentralPlaneAuthOrigin(process.env));
  },
};

export default nextConfig;
