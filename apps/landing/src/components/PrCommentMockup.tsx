/**
 * GitHub PR comment mockup — the format Conclave actually posts to
 * pull requests once the council reaches a verdict.
 *
 * This is a tableau, not a screenshot. Rendered server-side as
 * concrete DOM so it looks crisp on mobile and stays selectable / a11y.
 * Color and chrome match GitHub's light-mode comment box so the
 * "this is what you actually see on a PR" message reads honestly.
 *
 * Source of truth for the wording lives at
 * `apps/central-plane/src/routes/saas.ts:renderResultComment`. Keep
 * the structure (verdict line · 4 blockers · footnote) in sync if
 * the production renderer changes shape.
 */
import { LogoIcon } from "./Logo";

export function PrCommentMockup() {
  return (
    <figure
      className="overflow-hidden rounded-md border border-[#d1d9e0] bg-white shadow-sm shadow-[rgba(31,35,40,0.06)]"
      aria-label="Sample Conclave AI PR comment with a REWORK verdict and four blockers"
    >
      <header className="flex items-center gap-2.5 border-b border-[#d1d9e0] bg-[#f6f8fa] px-4 py-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-oxblood-600">
          <LogoIcon size={22} color="#F4ECDC" />
        </span>
        <span className="text-[14px] font-semibold text-[#1f2328]">
          conclave-ai-code-council
          <span className="ml-1 inline-block rounded bg-[#ddf4ff] px-1.5 py-0.5 align-middle text-[11px] font-medium text-[#57606a]">
            bot
          </span>
        </span>
        <span className="text-[14px] text-[#57606a]">commented 2 minutes ago</span>
      </header>

      <div className="px-5 pb-1 pt-4 font-sans text-[14px] leading-[1.55] text-[#1f2328]">
        <p className="mb-3.5 text-[17px] font-semibold">
          <span aria-hidden="true">🔁 </span>
          <strong>Conclave AI verdict: REWORK</strong>
          <span className="text-[#57606a]"> · 187s</span>
        </p>
        <p className="mb-3.5">4 blockers found across spec, security, a11y, and testing.</p>

        <ol className="mb-3.5 list-decimal space-y-4 pl-7 marker:text-[#57606a]">
          <Blocker
            category="spec-mismatch"
            severity="blocker"
            filepath="apps/api/src/routes/billing.ts:84"
          >
            Endpoint <Code>POST /billing/refund</Code> is not in the PRD&apos;s
            acceptance criteria. Either remove the route or extend{" "}
            <Code>.conclave/prd.md</Code> §3 to include it; shipping refund flow
            without spec coverage is exactly the audit-trail gap legal flagged
            last quarter.
          </Blocker>
          <Blocker
            category="security"
            severity="blocker"
            filepath="apps/web/src/components/Profile.tsx:31"
          >
            <Code>dangerouslySetInnerHTML</Code> renders the user-supplied{" "}
            <Code>bio</Code> field unchanged. XSS-trivial. Sanitize via DOMPurify
            or use plain text + line breaks.
          </Blocker>
          <Blocker
            category="a11y"
            severity="major"
            filepath="apps/web/src/components/Modal.tsx:18"
          >
            Icon-only close button has no <Code>aria-label</Code>. Screen readers
            announce nothing — the modal becomes inescapable for keyboard /
            VoiceOver users.
          </Blocker>
          <Blocker
            category="testing"
            severity="major"
            filepath="apps/api/test/billing.test.ts (missing)"
          >
            New <Code>/billing/refund</Code> route ships with zero integration
            tests. Refund logic untested in the same PR that introduces it
            inverts the safe order — add a test before merge.
          </Blocker>
        </ol>

        <p className="border-t border-[#f0f0f0] pb-3 pt-2 text-[13px] text-[#57606a]">
          Push a fix or run <Code>conclave autofix --use-saas --pr 142</Code> to
          let the worker agent attempt the fixes automatically.
        </p>
      </div>
    </figure>
  );
}

function Blocker({
  category,
  severity,
  filepath,
  children,
}: {
  category: string;
  severity: "blocker" | "major";
  filepath: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <strong>[{category}]</strong>
      <span className="italic text-[#57606a]"> · {severity}</span> {children}
      <span className="mt-1.5 block w-fit rounded bg-[#f6f8fa] px-2.5 py-1 font-mono text-[12px] text-[#57606a]">
        {filepath}
      </span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[#f6f8fa] px-1.5 py-0.5 font-mono text-[0.86em] text-[#1f2328]">
      {children}
    </code>
  );
}
