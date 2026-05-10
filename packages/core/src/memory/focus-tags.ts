/**
 * v0.16.10 — Domain-focus detection for failure-gate + catch-regression.
 *
 * Both modules match catalog entries to a diff via shared-token overlap.
 * That broad-cast catches obvious regressions but mis-fires across
 * sub-domains: an a11y-only PR shouldn't surface visual-decoration
 * stickies just because the diff and the catalog entry both mention
 * "color" or "background".
 *
 * This module detects which sub-domain a diff or a failure entry
 * "looks like" via a small regex catalog. When BOTH sides resolve to a
 * non-empty focus set and they don't intersect, the caller drops the
 * match. When either side has no detectable focus, the caller falls
 * through to plain token matching — preserves the unchanged-by-default
 * contract for inputs the heuristic doesn't recognize.
 *
 * Adding new tags is additive: append to FOCUS_PATTERNS, ship.
 */
import type { FailureEntry } from "./schema.js";

/**
 * Public type for the focus tag returned by detectors. Matchers stringly
 * compare these — no need for a closed enum.
 */
export type FocusTag =
  | "accessibility"
  | "visual-decoration"
  | "typography"
  | "spacing-layout"
  | "responsive"
  | "interaction"
  | "dead-code"
  | "performance"
  | "security"
  | "i18n"
  | "forms"
  | "state-management";

interface FocusPattern {
  tag: FocusTag;
  re: RegExp;
}

const FOCUS_PATTERNS: ReadonlyArray<FocusPattern> = [
  // Accessibility — semantic / keyboard / screen-reader / contrast.
  {
    tag: "accessibility",
    re: /\b(aria[-\s_]?\w+|role\s*=|alt\s*=|tabindex|tabIndex|onKeyDown|onKeyUp|focus[-\s]?ring|focus[-\s]?visible|wcag|screen\s?reader|a11y|accessib(le|ility)|keyboard\s+(?:nav|access))/i,
  },
  // Visual decoration — color systems, gradients, palettes.
  {
    tag: "visual-decoration",
    re: /\b(rainbow|palette|gradient|accent|brand[\s-]?color|hue|tint|shade|backgroundColor|background-color|tailwind\s+colors)/i,
  },
  // Typography — fonts, weights, line-height.
  {
    tag: "typography",
    re: /\b(font[\s-]?family|font[\s-]?size|font[\s-]?weight|line[\s-]?height|letter[\s-]?spacing|typography|typeface|fontWeight|fontSize)/i,
  },
  // Spacing / layout — padding/margin/gap/grid.
  {
    tag: "spacing-layout",
    re: /\b(padding|margin|gap|grid|flex(box)?|justify[\s-]?content|align[\s-]?items|space[\s-]?(?:between|around|evenly))/i,
  },
  // Responsive — breakpoints, media queries.
  {
    tag: "responsive",
    re: /(@media|breakpoint|min-width|max-width|\b(?:sm|md|lg|xl|2xl):)/i,
  },
  // Interaction — buttons, forms, clicks.
  {
    tag: "interaction",
    re: /\b(<button|<input|<form|<a\s|<label|onClick|onSubmit|onChange|preventDefault|disabled\s*=)/i,
  },
  // Dead code / unused.
  {
    tag: "dead-code",
    re: /\b(unused|dead\s+code|never\s+(?:read|referenced)|todo:?\s*remove|deprecated)/i,
  },
  // Performance.
  {
    tag: "performance",
    re: /\b(perf(ormance)?|memo(ize|ization)?|lazy|debounce|throttle|n\+1|bundle\s+size|next\/image)/i,
  },
  // Security — XSS / injection / auth bypass / hardcoded creds / dangerous APIs.
  // Conservative: matches specific dangerous primitives + explicit
  // hard-coded-credential phrasing rather than the bare word "security",
  // which appears too commonly in unrelated comments to be a useful tag.
  {
    tag: "security",
    re: /\b(xss|csrf|sql[\s-]?inject(ion)?|prototype[\s-]?pollut|hard[\s-]?coded\s+(credential|password|secret|token|key)|jwt\.(sign|verify|decode)|bcrypt|argon2|sanitiz(e|ation)|escape[\s-]?html)|dangerouslySetInnerHTML|innerHTML\s*=|eval\s*\(|new\s+Function\s*\(/i,
  },
  // Internationalization — locale / translation / RTL.
  {
    tag: "i18n",
    re: /\b(i18n|l10n|locali[zs]ation|useTranslation|formatMessage|IntlProvider|next-intl|react-intl|messages\.(json|po|xliff)|translation[s]?[\s-]?(file|key)|locale\s*[:=]|rtl[\s-]?(support|layout)|dir\s*=\s*["']rtl)/i,
  },
  // Form validation — zod / yup / react-hook-form / schema parsing.
  {
    tag: "forms",
    re: /\b(zod|yup|formik|react-hook-form|useForm|safeParse|\.parse\s*\(|formState|fieldError|FieldError|register\s*\(|controller\s*=|getValues|setValue|trigger\s*\()/i,
  },
  // State management — local hooks + popular global stores.
  // Note: useState / useReducer overlap with general React code, so the
  // pattern leans on stronger global-store signals (redux/zustand/jotai/
  // recoil + dispatch / createStore) for distinctiveness. The hook
  // matches stay because PR-level catalog entries about state often
  // call them out by name.
  {
    tag: "state-management",
    re: /\b(useState|useReducer|redux|zustand|jotai|recoil|createStore|combineReducers|dispatch\s*\(|atomFamily|atomWithStorage|configureStore|createSlice|useSelector|useDispatch)/i,
  },
];

/**
 * Detect focus tags from a unified-diff string. Cheap — runs each regex
 * over the whole diff once. Order doesn't matter; returned set is
 * unordered.
 */
export function detectDiffFocus(diff: string): Set<FocusTag> {
  const focus = new Set<FocusTag>();
  for (const { tag, re } of FOCUS_PATTERNS) {
    if (re.test(diff)) focus.add(tag);
  }
  return focus;
}

/**
 * Detect focus tags from a FailureEntry. Reads the title, body, free-
 * form category (incl. seedBlocker.category preference), tags, and id
 * — anything text-shaped.
 */
export function detectFailureFocus(failure: FailureEntry): Set<FocusTag> {
  const effectiveCat = failure.seedBlocker?.category ?? failure.category;
  const blob = [
    failure.title,
    failure.body,
    effectiveCat,
    ...failure.tags,
    failure.id,
  ].join(" ");
  const focus = new Set<FocusTag>();
  for (const { tag, re } of FOCUS_PATTERNS) {
    if (re.test(blob)) focus.add(tag);
  }
  return focus;
}

/** Returns true iff the two sets share at least one element. */
export function focusSetsIntersect(
  a: ReadonlySet<FocusTag>,
  b: ReadonlySet<FocusTag>,
): boolean {
  for (const x of a) {
    if (b.has(x)) return true;
  }
  return false;
}

/**
 * Convenience: should this catalog entry be matched against this diff?
 * Returns false ONLY when both sides have detectable focus tags AND
 * they don't intersect — preserves prior behavior for unrecognized
 * inputs (false-negative-leaning).
 */
export function shouldMatchByFocus(
  diffFocus: ReadonlySet<FocusTag>,
  failureFocus: ReadonlySet<FocusTag>,
): boolean {
  if (diffFocus.size === 0) return true;
  if (failureFocus.size === 0) return true;
  return focusSetsIntersect(diffFocus, failureFocus);
}
