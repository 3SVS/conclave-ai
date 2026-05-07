# Visual review — configuring multi-modal review

Since v0.9.0, `conclave review` can capture before/after Playwright
screenshots and feed them to the DesignAgent's vision mode. This guide
covers when to turn it on, how to configure routes + viewports, how
preview URLs are detected, and the expected cost envelope.

## When to enable visual review

| Project type                        | Enable?     | Why                                        |
| ----------------------------------- | ----------- | ------------------------------------------ |
| Pure backend / API / lib            | No          | No rendered UI — DesignAgent skips anyway  |
| Small SPA, internal tools           | Optional    | Visual helps on marketing / logo polish    |
| Public marketing site               | Yes         | Brand regressions are existential          |
| Design-system / component library   | Yes         | Every PR touches rendered UI               |
| Heavy redesign underway             | **Yes**     | Visual regression catches what diffs miss  |

Opt in one of three ways:

1. **Per-run**: `conclave review --pr 21 --visual`
2. **Config default**: set `visual.enabled: true` in `.conclaverc.json`
3. **CI workflow**: pass `visual: true` when calling the reusable
   workflow (see workflow snippet at the end).

## How preview URLs are detected

The capture step needs two preview URLs — one for the base SHA, one for
the head SHA. Conclave walks the configured platform list in order and
uses the first platform that returns a URL:

```json
{
  "visual": {
    "platforms": ["vercel", "netlify", "cloudflare", "railway", "render", "deployment-status"]
  }
}
```

- `vercel` / `netlify` / `cloudflare` / `railway` / `render` use
  platform-specific APIs with the corresponding env var tokens.
  Missing credentials → skip silently.
- `deployment-status` is the universal fallback: it reads GitHub
  `check_suites` via `gh` CLI and extracts the preview URL from the
  check output. Works for most hosted-deploy setups without extra env
  config, but is less precise than a direct platform integration.

If **neither SHA** resolves to a URL, the capture step logs the miss
and DesignAgent falls back to Mode B (text-UI). The review still runs.

## Route configuration

Routes are captured in order of precedence:

### 1. Explicit `--visual-routes`

```bash
conclave review --pr 21 --visual --visual-routes "/, /login, /dashboard"
```

Best for ad-hoc runs — no config file edit.

### 2. `.conclave/visual-routes.json`

```json
{
  "routes": ["/", "/login", "/signup", "/dashboard"]
}
```

Or as a bare array:

```json
["/", "/login", "/signup", "/dashboard"]
```

This is what we recommend for most projects — curated, checked-in, and
visible to everyone.

### 3. Filesystem auto-detection

When neither is present, Conclave scans:

- `pages/*` (Next.js pages router, Nuxt, SvelteKit routes)
- `app/*` (Next.js app router)
- `src/pages/*`, `src/app/*`

It looks for `page.tsx` / `index.tsx` / SvelteKit `+page.tsx` (and
`.ts/.jsx/.js` variants), derives routes from directory structure,
drops `_`-prefixed + `(group)` segments, and caps at 8 matches.

### 4. Fallback

When nothing else works: `["/"]` with a warning.

## Viewport configuration

```json
{
  "visual": {
    "viewport": {
      "desktop": [1280, 800],
      "mobile":  [375, 667]
    }
  }
}
```

Each configured viewport multiplies the capture count — 4 routes ×
2 viewports = 8 captures per SHA × 2 SHAs = 16 Playwright runs. The
`maxRoutes` cap (default 8) is applied to the (route × viewport)
combination list per SHA, so a single configured viewport buys you more
routes.

To capture desktop only:

```json
{ "visual": { "viewport": { "desktop": [1280, 800] } } }
```

Any other viewport is fine — `[1920, 1080]` for HD testing, `[390, 844]`
for modern iPhone dimensions, etc. Conclave doesn't know or care.

## Cost + time budget

Vision calls cost **~4×** text calls on Claude Opus 4.7 (current
DesignAgent default). The `budgetMultiplier` field scales your per-PR
budget when visual is on:

```json
{
  "budget": { "perPrUsd": 0.50 },
  "visual": { "budgetMultiplier": 1.5 }
}
```

Effective cap on multi-modal runs: `0.50 × 1.5 = $0.75`. Visual review uses a chunky token footprint (one image pair per route × viewport), so a typical 4-pair run takes a meaningful slice of the per-PR budget — but the cap stops it from runaway.

For design-heavy projects, bump `perPrUsd` to `1.0` so two visual runs fit per PR without tripping the cap.

Time envelope (measured on GitHub-hosted runners):

```
Playwright install (one-time per CI run):  ~30 s (chromium only)
Preview URL resolution:                    <5 s per SHA (cached)
Capture per route × viewport:              ~2-8 s (networkidle wait)
DesignAgent Mode A call:                   ~10-20 s
```

Total review time on a 4-pair visual run: ~2-3 minutes.

## Brand reference images

Drop up to 4 PNG files (≤ 500 KB each by default) in
`.conclave/design-reference/*.png`. DesignAgent renders them ahead of
the PR before/after pair as "brand reference" images. Most common use:

```
.conclave/design-reference/
├── 01-homepage-hero.png
├── 02-logo-lockup.png
├── 03-color-palette.png
└── 04-typography-spec.png
```

The agent anchors on these as "what this brand looks like when it's
right" before judging the PR diff. Without them, it judges against
generic rubrics — which is worse at catching brand-specific regressions
like logo quality ("looks AI-generated" vs "matches reference SVG").

## CI workflow

Reusable workflow snippet for a consumer repo:

```yaml
# .github/workflows/conclave.yml
name: Conclave AI
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  conclave:
    uses: conclave-ai/conclave-ai/.github/workflows/review.yml@v0.9.0
    with:
      cli-version: 0.9.0
      visual: true           # v0.9.0 — enable multi-modal
    secrets: inherit
```

When `visual: true`, the workflow runs a UI-signal heuristic on the
diff first. If the PR has no UI files (`.tsx`, `.css`, etc.), Playwright
is NOT installed — pure code PRs stay as fast as v0.8.

## Failure modes

| Failure                          | Behavior                                              |
| -------------------------------- | ----------------------------------------------------- |
| Deploy-status = failure          | Skip capture. Don't pay for vision on a red build.    |
| Deploy-status = pending/unknown  | Skip unless `--skip-deploy-wait`                      |
| No preview URL resolved          | Skip capture; DesignAgent runs text-UI mode (Mode B)  |
| Playwright not installed         | Skip capture with "install playwright" hint           |
| Individual route times out       | Skipped entry, run continues                          |
| Total budget blown               | Remaining routes skipped, successful pairs reviewed   |
| All captures fail                | Empty `visualArtifacts`, DesignAgent → Mode B         |

None of these abort the code review. The DesignAgent always produces a
verdict; visual capture is an augmentation, not a gate.
