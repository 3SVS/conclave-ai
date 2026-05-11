/**
 * Curated set of GitHub repositories conclave's self-evolve substrate
 * watches for changelog releases (Sprint E3) and recently-merged bugfix
 * PRs (Sprint E2). Each entry maps to one RAG inject domain ("code" or
 * "design") so the right corpus surfaces in front of the right review.
 *
 * Source of truth for both `changelog-monitor.ts` and `oss-pr-miner.ts`.
 * Add new entries here once; both miners pick them up on next cron tick.
 *
 * Naming rule for `source_id`:
 *   - Single-word, kebab-case, must be unique across the list.
 *   - Prefer the most recognizable short name a developer would Google
 *     ("nextjs", "drizzle", "zod") over the owner-prefixed form.
 *   - When two repos collide (e.g. TanStack/router vs TanStack/table),
 *     prefix with the owner ("tanstack-router", "tanstack-table").
 *
 * Domain assignment heuristic:
 *   - "design"  →  UI primitives, design systems, icon sets, animation,
 *                  data viz, maps (visual surface).
 *   - "code"    →  everything else — backend frameworks, ORMs, build
 *                  tools, testing, auth, AI SDKs, etc.
 *   Mixed-domain repos (e.g. Tailwind, which is technically design) are
 *   classified by the *kind of code a reviewer would write about them*.
 *
 * Cost ceiling on changes here:
 *   - Each added source adds ~1-3 Haiku calls per week (changelog) plus
 *     up to PER_REPO_LIMIT=5 calls per day (oss-pr-miner). At $0.0001
 *     per Haiku call, 250 sources ≈ $0.13/day for the miner + $0.005
 *     /wk for the changelog. Effectively free at this corpus size; keep
 *     in mind if a future expansion past ~1000 sources is proposed.
 */

export interface WatchedSource {
  /** Short kebab-case id used as a foreign key in `spec_updates` and
   *  `oss_patterns` tables. Must be unique. */
  source_id: string;
  /** "owner/repo" form for the GitHub API. */
  source_repo: string;
  /** Which conclave domain this repo's lessons map to. */
  domain: "code" | "design";
}

export const WATCHED_SOURCES: ReadonlyArray<WatchedSource> = [
  // ── Meta frameworks + routing ─────────────────────────────────────
  { source_id: "react",              source_repo: "facebook/react",                 domain: "code" },
  { source_id: "nextjs",             source_repo: "vercel/next.js",                  domain: "code" },
  { source_id: "remix",              source_repo: "remix-run/remix",                 domain: "code" },
  { source_id: "react-router",       source_repo: "remix-run/react-router",          domain: "code" },
  { source_id: "tanstack-router",    source_repo: "TanStack/router",                 domain: "code" },
  { source_id: "tanstack-query",     source_repo: "TanStack/query",                  domain: "code" },
  { source_id: "tanstack-table",     source_repo: "TanStack/table",                  domain: "code" },
  { source_id: "tanstack-form",      source_repo: "TanStack/form",                   domain: "code" },
  { source_id: "tanstack-virtual",   source_repo: "TanStack/virtual",                domain: "code" },
  { source_id: "astro",              source_repo: "withastro/astro",                 domain: "code" },
  { source_id: "solid",              source_repo: "solidjs/solid",                   domain: "code" },
  { source_id: "svelte",             source_repo: "sveltejs/svelte",                 domain: "code" },
  { source_id: "sveltekit",          source_repo: "sveltejs/kit",                    domain: "code" },
  { source_id: "nuxt",               source_repo: "nuxt/nuxt",                       domain: "code" },
  { source_id: "vue",                source_repo: "vuejs/core",                      domain: "code" },
  { source_id: "qwik",               source_repo: "QwikDev/qwik",                    domain: "code" },

  // ── AI / LLM SDKs (highest-leverage for conclave users) ───────────
  { source_id: "vercel-ai-sdk",      source_repo: "vercel/ai",                       domain: "code" },
  { source_id: "anthropic-sdk-ts",   source_repo: "anthropics/anthropic-sdk-typescript", domain: "code" },
  { source_id: "anthropic-claude-code", source_repo: "anthropics/claude-code",        domain: "code" },
  { source_id: "openai-node",        source_repo: "openai/openai-node",              domain: "code" },
  { source_id: "google-genai",       source_repo: "google/generative-ai-js",         domain: "code" },
  { source_id: "langchain-js",       source_repo: "langchain-ai/langchainjs",        domain: "code" },
  { source_id: "langgraph-js",       source_repo: "langchain-ai/langgraphjs",        domain: "code" },
  { source_id: "mistral-client",     source_repo: "mistralai/client-js",             domain: "code" },
  { source_id: "mcp-typescript-sdk", source_repo: "modelcontextprotocol/typescript-sdk", domain: "code" },
  { source_id: "mcp-servers",        source_repo: "modelcontextprotocol/servers",    domain: "code" },
  { source_id: "ollama-js",          source_repo: "ollama/ollama-js",                domain: "code" },
  { source_id: "huggingface-js",     source_repo: "huggingface/huggingface.js",      domain: "code" },
  { source_id: "transformers-js",    source_repo: "xenova/transformers.js",          domain: "code" },
  { source_id: "replicate-js",       source_repo: "replicate/replicate-javascript",  domain: "code" },
  { source_id: "browserbase-stagehand", source_repo: "browserbase/stagehand",        domain: "code" },
  { source_id: "e2b",                source_repo: "e2b-dev/E2B",                     domain: "code" },
  { source_id: "inngest",            source_repo: "inngest/inngest-js",              domain: "code" },
  { source_id: "mastra",             source_repo: "mastra-ai/mastra",                domain: "code" },
  { source_id: "llamaindex-ts",      source_repo: "run-llama/LlamaIndexTS",          domain: "code" },
  { source_id: "cline",              source_repo: "cline/cline",                     domain: "code" },
  { source_id: "aider",              source_repo: "Aider-AI/aider",                  domain: "code" },

  // ── State management / data fetching ──────────────────────────────
  { source_id: "zustand",            source_repo: "pmndrs/zustand",                  domain: "code" },
  { source_id: "jotai",              source_repo: "pmndrs/jotai",                    domain: "code" },
  { source_id: "valtio",             source_repo: "pmndrs/valtio",                   domain: "code" },
  { source_id: "mobx",               source_repo: "mobxjs/mobx",                     domain: "code" },
  { source_id: "redux-toolkit",      source_repo: "reduxjs/redux-toolkit",           domain: "code" },
  { source_id: "redux",              source_repo: "reduxjs/redux",                   domain: "code" },
  { source_id: "effector",           source_repo: "effector/effector",               domain: "code" },
  { source_id: "swr",                source_repo: "vercel/swr",                      domain: "code" },
  { source_id: "apollo-client",      source_repo: "apollographql/apollo-client",     domain: "code" },
  { source_id: "recoil",             source_repo: "facebookexperimental/Recoil",     domain: "code" },

  // ── DB / ORM / Storage ────────────────────────────────────────────
  { source_id: "drizzle",            source_repo: "drizzle-team/drizzle-orm",        domain: "code" },
  { source_id: "prisma",             source_repo: "prisma/prisma",                   domain: "code" },
  { source_id: "supabase-js",        source_repo: "supabase/supabase-js",            domain: "code" },
  { source_id: "supabase",           source_repo: "supabase/supabase",               domain: "code" },
  { source_id: "kysely",             source_repo: "kysely-org/kysely",               domain: "code" },
  { source_id: "typeorm",            source_repo: "typeorm/typeorm",                 domain: "code" },
  { source_id: "mikro-orm",          source_repo: "mikro-orm/mikro-orm",             domain: "code" },
  { source_id: "vercel-storage",     source_repo: "vercel/storage",                  domain: "code" },
  { source_id: "planetscale-db",     source_repo: "planetscale/database-js",         domain: "code" },
  { source_id: "neon-serverless",    source_repo: "neondatabase/serverless",         domain: "code" },
  { source_id: "libsql",             source_repo: "tursodatabase/libsql-client-ts",  domain: "code" },
  { source_id: "mongodb-node",       source_repo: "mongodb/node-mongodb-native",     domain: "code" },
  { source_id: "node-redis",         source_repo: "redis/node-redis",                domain: "code" },
  { source_id: "upstash-redis",      source_repo: "upstash/upstash-redis",           domain: "code" },
  { source_id: "electric-sql",       source_repo: "electric-sql/electric",           domain: "code" },

  // ── Auth ──────────────────────────────────────────────────────────
  { source_id: "better-auth",        source_repo: "better-auth/better-auth",         domain: "code" },
  { source_id: "clerk-js",           source_repo: "clerk/javascript",                domain: "code" },
  { source_id: "nextauth",           source_repo: "nextauthjs/next-auth",            domain: "code" },
  { source_id: "lucia",              source_repo: "lucia-auth/lucia",                domain: "code" },
  { source_id: "workos-node",        source_repo: "workos/workos-node",              domain: "code" },
  { source_id: "kinde-ts",           source_repo: "kinde-oss/kinde-typescript-sdk",  domain: "code" },
  { source_id: "auth0-node",         source_repo: "auth0/node-auth0",                domain: "code" },
  { source_id: "supertokens-node",   source_repo: "supertokens/supertokens-node",    domain: "code" },
  { source_id: "ory-sdk",            source_repo: "ory/sdk",                         domain: "code" },
  { source_id: "firebase-js",        source_repo: "firebase/firebase-js-sdk",        domain: "code" },

  // ── Forms / validation ────────────────────────────────────────────
  { source_id: "zod",                source_repo: "colinhacks/zod",                  domain: "code" },
  { source_id: "valibot",            source_repo: "fabian-hiller/valibot",           domain: "code" },
  { source_id: "react-hook-form",    source_repo: "react-hook-form/react-hook-form", domain: "code" },
  { source_id: "formik",             source_repo: "jaredpalmer/formik",              domain: "code" },
  { source_id: "react-final-form",   source_repo: "final-form/react-final-form",     domain: "code" },
  { source_id: "ajv",                source_repo: "ajv-validator/ajv",               domain: "code" },
  { source_id: "joi",                source_repo: "hapijs/joi",                      domain: "code" },
  { source_id: "class-validator",    source_repo: "typestack/class-validator",       domain: "code" },
  { source_id: "yup",                source_repo: "jquense/yup",                     domain: "code" },

  // ── CSS / Tailwind / design systems ───────────────────────────────
  { source_id: "tailwind",           source_repo: "tailwindlabs/tailwindcss",        domain: "design" },
  { source_id: "headlessui",         source_repo: "tailwindlabs/headlessui",         domain: "design" },
  { source_id: "shadcn-ui",          source_repo: "shadcn-ui/ui",                    domain: "design" },
  { source_id: "radix-primitives",   source_repo: "radix-ui/primitives",             domain: "design" },
  { source_id: "radix-themes",       source_repo: "radix-ui/themes",                 domain: "design" },
  { source_id: "chakra-ui",          source_repo: "chakra-ui/chakra-ui",             domain: "design" },
  { source_id: "mui",                source_repo: "mui/material-ui",                 domain: "design" },
  { source_id: "joy-ui",             source_repo: "mui/joy-ui",                      domain: "design" },
  { source_id: "ant-design",         source_repo: "ant-design/ant-design",           domain: "design" },
  { source_id: "emotion",            source_repo: "emotion-js/emotion",              domain: "design" },
  { source_id: "styled-components",  source_repo: "styled-components/styled-components", domain: "design" },
  { source_id: "vanilla-extract",    source_repo: "vanilla-extract-css/vanilla-extract", domain: "design" },
  { source_id: "panda-css",          source_repo: "chakra-ui/panda",                 domain: "design" },
  { source_id: "mantine",            source_repo: "mantinedev/mantine",              domain: "design" },
  { source_id: "nextui",             source_repo: "nextui-org/nextui",               domain: "design" },
  { source_id: "ariakit",            source_repo: "ariakit/ariakit",                 domain: "design" },
  { source_id: "tremor",             source_repo: "tremorlabs/tremor",               domain: "design" },
  { source_id: "magicui",            source_repo: "magicuidesign/magicui",           domain: "design" },
  { source_id: "tamagui",            source_repo: "tamagui/tamagui",                 domain: "design" },
  { source_id: "daisyui",            source_repo: "saadeghi/daisyui",                domain: "design" },
  { source_id: "floating-ui",        source_repo: "floating-ui/floating-ui",         domain: "design" },
  { source_id: "sonner",             source_repo: "emilkowalski/sonner",             domain: "design" },
  { source_id: "cmdk",               source_repo: "pacocoursey/cmdk",                domain: "design" },
  { source_id: "arco-design",        source_repo: "arco-design/arco-design",         domain: "design" },
  { source_id: "fontsource",         source_repo: "fontsource/fontsource",           domain: "design" },

  // ── Animation / motion / icons ────────────────────────────────────
  { source_id: "framer-motion",      source_repo: "framer/motion",                   domain: "design" },
  { source_id: "react-spring",       source_repo: "pmndrs/react-spring",             domain: "design" },
  { source_id: "lucide",             source_repo: "lucide-icons/lucide",             domain: "design" },
  { source_id: "phosphor-react",     source_repo: "phosphor-icons/react",            domain: "design" },
  { source_id: "bootstrap-icons",    source_repo: "twbs/icons",                      domain: "design" },
  { source_id: "material-icons",     source_repo: "google/material-design-icons",    domain: "design" },
  { source_id: "iconify",            source_repo: "iconify/iconify",                 domain: "design" },
  { source_id: "rive-react",         source_repo: "rive-app/rive-react",             domain: "design" },
  { source_id: "anime",              source_repo: "juliangarnier/anime",             domain: "design" },
  { source_id: "auto-animate",       source_repo: "formkit/auto-animate",            domain: "design" },

  // ── Build tools / TS ──────────────────────────────────────────────
  { source_id: "vite",               source_repo: "vitejs/vite",                     domain: "code" },
  { source_id: "webpack",            source_repo: "webpack/webpack",                 domain: "code" },
  { source_id: "parcel",             source_repo: "parcel-bundler/parcel",           domain: "code" },
  { source_id: "swc",                source_repo: "swc-project/swc",                 domain: "code" },
  { source_id: "bun",                source_repo: "oven-sh/bun",                     domain: "code" },
  { source_id: "typescript",         source_repo: "microsoft/TypeScript",            domain: "code" },
  { source_id: "turbo",              source_repo: "vercel/turbo",                    domain: "code" },
  { source_id: "nx",                 source_repo: "nrwl/nx",                         domain: "code" },
  { source_id: "pnpm",               source_repo: "pnpm/pnpm",                       domain: "code" },
  { source_id: "yarn",               source_repo: "yarnpkg/berry",                   domain: "code" },
  { source_id: "npm-cli",            source_repo: "npm/cli",                         domain: "code" },
  { source_id: "rolldown",           source_repo: "rolldown/rolldown",               domain: "code" },
  { source_id: "rollup",             source_repo: "rollup/rollup",                   domain: "code" },
  { source_id: "esbuild",            source_repo: "evanw/esbuild",                   domain: "code" },

  // ── Linting / formatting ──────────────────────────────────────────
  { source_id: "biome",              source_repo: "biomejs/biome",                   domain: "code" },
  { source_id: "eslint",             source_repo: "eslint/eslint",                   domain: "code" },
  { source_id: "prettier",           source_repo: "prettier/prettier",               domain: "code" },
  { source_id: "stylelint",          source_repo: "stylelint/stylelint",             domain: "code" },
  { source_id: "typescript-eslint",  source_repo: "typescript-eslint/typescript-eslint", domain: "code" },
  { source_id: "definitelytyped",    source_repo: "DefinitelyTyped/DefinitelyTyped", domain: "code" },

  // ── Testing ───────────────────────────────────────────────────────
  { source_id: "vitest",             source_repo: "vitest-dev/vitest",               domain: "code" },
  { source_id: "jest",               source_repo: "jestjs/jest",                     domain: "code" },
  { source_id: "playwright",         source_repo: "microsoft/playwright",            domain: "code" },
  { source_id: "cypress",            source_repo: "cypress-io/cypress",              domain: "code" },
  { source_id: "rtl",                source_repo: "testing-library/react-testing-library", domain: "code" },
  { source_id: "jest-dom",           source_repo: "testing-library/jest-dom",        domain: "code" },
  { source_id: "user-event",         source_repo: "testing-library/user-event",      domain: "code" },
  { source_id: "msw",                source_repo: "mswjs/msw",                       domain: "code" },
  { source_id: "ava",                source_repo: "avajs/ava",                       domain: "code" },
  { source_id: "mocha",              source_repo: "mochajs/mocha",                   domain: "code" },
  { source_id: "chai",               source_repo: "chaijs/chai",                     domain: "code" },

  // ── Storybook / design tooling ────────────────────────────────────
  { source_id: "storybook",          source_repo: "storybookjs/storybook",           domain: "design" },
  { source_id: "chromatic-cli",      source_repo: "chromaui/chromatic-cli",          domain: "design" },
  { source_id: "design-tokens",      source_repo: "design-tokens/community-group",   domain: "design" },

  // ── Backend / API frameworks ──────────────────────────────────────
  { source_id: "express",            source_repo: "expressjs/express",               domain: "code" },
  { source_id: "fastify",            source_repo: "fastify/fastify",                 domain: "code" },
  { source_id: "nestjs",             source_repo: "nestjs/nest",                     domain: "code" },
  { source_id: "hono",               source_repo: "honojs/hono",                     domain: "code" },
  { source_id: "elysia",             source_repo: "elysiajs/elysia",                 domain: "code" },
  { source_id: "koa",                source_repo: "koajs/koa",                       domain: "code" },
  { source_id: "hapi",               source_repo: "hapijs/hapi",                     domain: "code" },
  { source_id: "adonisjs",           source_repo: "adonisjs/core",                   domain: "code" },
  { source_id: "trpc",               source_repo: "trpc/trpc",                       domain: "code" },
  { source_id: "graphql-js",         source_repo: "graphql/graphql-js",              domain: "code" },
  { source_id: "apollo-server",      source_repo: "apollographql/apollo-server",     domain: "code" },
  { source_id: "feathersjs",         source_repo: "feathersjs/feathers",             domain: "code" },

  // ── Cloud / edge / runtimes ───────────────────────────────────────
  { source_id: "workers-sdk",        source_repo: "cloudflare/workers-sdk",          domain: "code" },
  { source_id: "workerd",            source_repo: "cloudflare/workerd",              domain: "code" },
  { source_id: "wrangler-action",    source_repo: "cloudflare/wrangler-action",      domain: "code" },
  { source_id: "deno",               source_repo: "denoland/deno",                   domain: "code" },
  { source_id: "vercel-og",          source_repo: "vercel/og",                       domain: "code" },
  { source_id: "aws-sdk-js-v3",      source_repo: "aws/aws-sdk-js-v3",               domain: "code" },
  { source_id: "google-cloud-node",  source_repo: "googleapis/google-cloud-node",    domain: "code" },

  // ── Realtime / pubsub ─────────────────────────────────────────────
  { source_id: "socketio",           source_repo: "socketio/socket.io",              domain: "code" },
  { source_id: "ws",                 source_repo: "websockets/ws",                   domain: "code" },
  { source_id: "pusher-node",        source_repo: "pusher/pusher-http-node",         domain: "code" },
  { source_id: "ably-js",            source_repo: "ably/ably-js",                    domain: "code" },
  { source_id: "partykit",           source_repo: "partykit/partykit",               domain: "code" },
  { source_id: "supabase-realtime",  source_repo: "supabase/realtime-js",            domain: "code" },

  // ── Date / time / collection utils ────────────────────────────────
  { source_id: "date-fns",           source_repo: "date-fns/date-fns",               domain: "code" },
  { source_id: "moment",             source_repo: "moment/moment",                   domain: "code" },
  { source_id: "dayjs",              source_repo: "iamkun/dayjs",                    domain: "code" },
  { source_id: "luxon",              source_repo: "moment/luxon",                    domain: "code" },
  { source_id: "lodash",             source_repo: "lodash/lodash",                   domain: "code" },
  { source_id: "ramda",              source_repo: "ramda/ramda",                     domain: "code" },
  { source_id: "react-use",          source_repo: "streamich/react-use",             domain: "code" },
  { source_id: "vueuse",             source_repo: "antfu/vueuse",                    domain: "code" },

  // ── HTTP / fetch / API codegen ────────────────────────────────────
  { source_id: "axios",              source_repo: "axios/axios",                     domain: "code" },
  { source_id: "ky",                 source_repo: "sindresorhus/ky",                 domain: "code" },
  { source_id: "got",                source_repo: "sindresorhus/got",                domain: "code" },
  { source_id: "octokit",            source_repo: "octokit/octokit.js",              domain: "code" },
  { source_id: "graphiql",           source_repo: "graphql/graphiql",                domain: "code" },
  { source_id: "graphql-codegen",    source_repo: "dotansimha/graphql-code-generator", domain: "code" },
  { source_id: "urql",               source_repo: "urql-graphql/urql",               domain: "code" },
  { source_id: "fetch-event-source", source_repo: "Azure/fetch-event-source",        domain: "code" },
  { source_id: "nock",               source_repo: "nock/nock",                       domain: "code" },

  // ── Internationalization ──────────────────────────────────────────
  { source_id: "i18next",            source_repo: "i18next/i18next",                 domain: "code" },
  { source_id: "react-i18next",      source_repo: "i18next/react-i18next",           domain: "code" },
  { source_id: "lingui",             source_repo: "lingui/js-lingui",                domain: "code" },
  { source_id: "formatjs",           source_repo: "formatjs/formatjs",               domain: "code" },

  // ── Observability / analytics / OTel ──────────────────────────────
  { source_id: "sentry-js",          source_repo: "getsentry/sentry-javascript",     domain: "code" },
  { source_id: "posthog-js",         source_repo: "PostHog/posthog-js",              domain: "code" },
  { source_id: "segment-analytics",  source_repo: "segmentio/analytics-next",        domain: "code" },
  { source_id: "mixpanel-js",        source_repo: "mixpanel/mixpanel-js",            domain: "code" },
  { source_id: "plausible",          source_repo: "plausible/analytics",             domain: "code" },
  { source_id: "vercel-analytics",   source_repo: "vercel/analytics",                domain: "code" },
  { source_id: "opentelemetry-js",   source_repo: "open-telemetry/opentelemetry-js", domain: "code" },
  { source_id: "amplitude-ts",       source_repo: "amplitude/Amplitude-TypeScript",  domain: "code" },

  // ── CMS / Content ─────────────────────────────────────────────────
  { source_id: "strapi",             source_repo: "strapi/strapi",                   domain: "code" },
  { source_id: "payload",            source_repo: "payloadcms/payload",              domain: "code" },
  { source_id: "directus",           source_repo: "directus/directus",               domain: "code" },
  { source_id: "tinacms",            source_repo: "tinacms/tinacms",                 domain: "code" },
  { source_id: "keystone",           source_repo: "keystonejs/keystone",             domain: "code" },
  { source_id: "contentful-js",      source_repo: "contentful/contentful.js",        domain: "code" },
  { source_id: "sanity",             source_repo: "sanity-io/sanity",                domain: "code" },
  { source_id: "ghost",              source_repo: "TryGhost/Ghost",                  domain: "code" },
  { source_id: "decap-cms",          source_repo: "decaporg/decap-cms",              domain: "code" },

  // ── Email / push / notifications ──────────────────────────────────
  { source_id: "resend-node",        source_repo: "resend/resend-node",              domain: "code" },
  { source_id: "sendgrid-node",      source_repo: "sendgrid/sendgrid-nodejs",        domain: "code" },
  { source_id: "novu",               source_repo: "novuhq/novu",                     domain: "code" },
  { source_id: "knock-node",         source_repo: "knocklabs/knock-node",            domain: "code" },
  { source_id: "postmark-js",        source_repo: "wildbit/postmark.js",             domain: "code" },

  // ── Payment / billing ─────────────────────────────────────────────
  { source_id: "stripe-node",        source_repo: "stripe/stripe-node",              domain: "code" },
  { source_id: "lemonsqueezy-js",    source_repo: "lmsqueezy/lemonsqueezy.js",       domain: "code" },
  { source_id: "paddle-node",        source_repo: "PaddleHQ/paddle-node-sdk",        domain: "code" },
  { source_id: "polar-js",           source_repo: "polarsource/polar-js",            domain: "code" },

  // ── File / image / video ──────────────────────────────────────────
  { source_id: "sharp",              source_repo: "lovell/sharp",                    domain: "code" },
  { source_id: "jimp",               source_repo: "jimp-dev/jimp",                   domain: "code" },
  { source_id: "cloudinary-npm",     source_repo: "cloudinary/cloudinary_npm",       domain: "code" },
  { source_id: "uploadthing",        source_repo: "pingdotgg/uploadthing",           domain: "code" },
  { source_id: "papaparse",          source_repo: "mholt/PapaParse",                 domain: "code" },

  // ── Data visualization ────────────────────────────────────────────
  { source_id: "d3",                 source_repo: "d3/d3",                           domain: "design" },
  { source_id: "chartjs",            source_repo: "chartjs/Chart.js",                domain: "design" },
  { source_id: "echarts",            source_repo: "apache/echarts",                  domain: "design" },
  { source_id: "plotly-js",          source_repo: "plotly/plotly.js",                domain: "design" },
  { source_id: "recharts",           source_repo: "recharts/recharts",               domain: "design" },
  { source_id: "nivo",               source_repo: "plouc/nivo",                      domain: "design" },
  { source_id: "visx",               source_repo: "airbnb/visx",                     domain: "design" },

  // ── Maps / geo ────────────────────────────────────────────────────
  { source_id: "mapbox-gl-js",       source_repo: "mapbox/mapbox-gl-js",             domain: "design" },
  { source_id: "openlayers",         source_repo: "openlayers/openlayers",           domain: "design" },
  { source_id: "leaflet",            source_repo: "Leaflet/Leaflet",                 domain: "design" },
  { source_id: "turf-js",            source_repo: "Turfjs/turf",                     domain: "code" },

  // ── Search ────────────────────────────────────────────────────────
  { source_id: "fuse",               source_repo: "krisk/Fuse",                      domain: "code" },
  { source_id: "meilisearch-js",     source_repo: "meilisearch/meilisearch-js",      domain: "code" },
  { source_id: "algoliasearch-js",   source_repo: "algolia/algoliasearch-client-javascript", domain: "code" },
  { source_id: "typesense-js",       source_repo: "typesense/typesense-js",          domain: "code" },
  { source_id: "orama",              source_repo: "oramasearch/orama",               domain: "code" },

  // ── Docs / static site ────────────────────────────────────────────
  { source_id: "docusaurus",         source_repo: "facebook/docusaurus",             domain: "code" },
  { source_id: "vitepress",          source_repo: "vuejs/vitepress",                 domain: "code" },
  { source_id: "nextra",             source_repo: "shuding/nextra",                  domain: "code" },
  { source_id: "mdx",                source_repo: "mdx-js/mdx",                      domain: "code" },
  { source_id: "eleventy",           source_repo: "11ty/eleventy",                   domain: "code" },

  // ── PDF / Office ──────────────────────────────────────────────────
  { source_id: "pdfjs",              source_repo: "mozilla/pdf.js",                  domain: "code" },
  { source_id: "jspdf",              source_repo: "parallax/jsPDF",                  domain: "code" },
  { source_id: "pdfme",              source_repo: "pdfme/pdfme",                     domain: "code" },
  { source_id: "pdfkit",             source_repo: "foliojs/pdfkit",                  domain: "code" },

  // ── Crypto / security ─────────────────────────────────────────────
  { source_id: "noble-curves",       source_repo: "paulmillr/noble-curves",          domain: "code" },
  { source_id: "openpgp-js",         source_repo: "openpgpjs/openpgpjs",             domain: "code" },
  { source_id: "crypto-js",          source_repo: "brix/crypto-js",                  domain: "code" },
  { source_id: "jose",               source_repo: "panva/jose",                      domain: "code" },
  { source_id: "oauth4webapi",       source_repo: "panva/oauth4webapi",              domain: "code" },

  // ── Logging ───────────────────────────────────────────────────────
  { source_id: "winston",            source_repo: "winstonjs/winston",               domain: "code" },
  { source_id: "pino",               source_repo: "pinojs/pino",                     domain: "code" },
  { source_id: "debug",              source_repo: "debug-js/debug",                  domain: "code" },

  // ── CLI / scripting ───────────────────────────────────────────────
  { source_id: "commander",          source_repo: "tj/commander.js",                 domain: "code" },
  { source_id: "yargs",              source_repo: "yargs/yargs",                     domain: "code" },
  { source_id: "ink",                source_repo: "vadimdemedes/ink",                domain: "code" },
  { source_id: "execa",              source_repo: "sindresorhus/execa",              domain: "code" },
  { source_id: "chalk",              source_repo: "chalk/chalk",                     domain: "code" },
  { source_id: "tsx",                source_repo: "privatenumber/tsx",               domain: "code" },
  { source_id: "zx",                 source_repo: "google/zx",                       domain: "code" },

  // ── DevOps / CI / IaC ─────────────────────────────────────────────
  { source_id: "actions-runner",     source_repo: "actions/runner",                  domain: "code" },
  { source_id: "actions-checkout",   source_repo: "actions/checkout",                domain: "code" },
  { source_id: "actions-setup-node", source_repo: "actions/setup-node",              domain: "code" },
  { source_id: "github-cli",         source_repo: "cli/cli",                         domain: "code" },
  { source_id: "pulumi",             source_repo: "pulumi/pulumi",                   domain: "code" },
  { source_id: "terraform",          source_repo: "hashicorp/terraform",             domain: "code" },

  // ── Mobile / cross-platform ───────────────────────────────────────
  { source_id: "react-native",       source_repo: "facebook/react-native",           domain: "code" },
  { source_id: "expo",               source_repo: "expo/expo",                       domain: "code" },
  { source_id: "ionic-framework",    source_repo: "ionic-team/ionic-framework",      domain: "code" },
  { source_id: "capacitor",          source_repo: "ionic-team/capacitor",            domain: "code" },

  // ── Web standards / a11y ──────────────────────────────────────────
  { source_id: "axe-core",           source_repo: "dequelabs/axe-core",              domain: "design" },
  { source_id: "react-aria",         source_repo: "adobe/react-spectrum",            domain: "design" },

  // ── Utilities / common helpers ────────────────────────────────────
  { source_id: "uuid",               source_repo: "uuidjs/uuid",                     domain: "code" },
  { source_id: "nanoid",             source_repo: "ai/nanoid",                       domain: "code" },
  { source_id: "p-queue",            source_repo: "sindresorhus/p-queue",            domain: "code" },
  { source_id: "del",                source_repo: "sindresorhus/del",                domain: "code" },
  { source_id: "fs-extra",           source_repo: "jprichardson/node-fs-extra",      domain: "code" },
  { source_id: "globby",             source_repo: "sindresorhus/globby",             domain: "code" },
  { source_id: "ts-node",            source_repo: "TypeStrong/ts-node",              domain: "code" },
  { source_id: "tsup",               source_repo: "egoist/tsup",                     domain: "code" },
  { source_id: "unbuild",            source_repo: "unjs/unbuild",                    domain: "code" },
  { source_id: "h3",                 source_repo: "unjs/h3",                         domain: "code" },
  { source_id: "ofetch",             source_repo: "unjs/ofetch",                     domain: "code" },
];

/**
 * Filter to the design-domain subset. Convenience for places that
 * only want one half (e.g. design-only RAG context loaders).
 */
export const WATCHED_SOURCES_DESIGN = WATCHED_SOURCES.filter(
  (s) => s.domain === "design",
);

/**
 * Filter to the code-domain subset. See above.
 */
export const WATCHED_SOURCES_CODE = WATCHED_SOURCES.filter(
  (s) => s.domain === "code",
);
