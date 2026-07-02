// Type declarations for visual-check-compare.mjs (Stage 266).

export type CompareDirection = "improved" | "regressed" | "unchanged";

export type ComparedFinding = { severity: string; what: string };

export type EvidencePair = { name: string; prev: true; latest: true };

export type EvidencePairing = {
  pairs: EvidencePair[];
  prevOnly: string[];
  latestOnly: string[];
};

export type VerdictTransition = {
  from: { works: boolean | null; decision: string };
  to: { works: boolean | null; decision: string };
  direction: CompareDirection;
};

export type VisualCheckComparison =
  | { comparable: false; reason: string }
  | {
      comparable: true;
      verdictTransition: VerdictTransition;
      findings: {
        resolved: ComparedFinding[];
        remaining: ComparedFinding[];
        introduced: ComparedFinding[];
      };
      evidencePairs: EvidencePairing;
    };

export type ComparableListItem = {
  id: string;
  status: string;
  works: boolean | null;
  createdAt: string;
};

export type ListTransition = {
  runId: string;
  direction: CompareDirection;
  fromWorks: boolean | null;
  toWorks: boolean | null;
};

export function compareWorks(
  prevWorks: boolean | null | undefined,
  latestWorks: boolean | null | undefined,
): CompareDirection;

export function pairEvidenceScreenshots(prevKeys: unknown, latestKeys: unknown): EvidencePairing;

export function compareVisualChecks(prevCheck: unknown, latestCheck: unknown): VisualCheckComparison;

export function pickPreviousDoneCheck<T extends ComparableListItem>(
  checks: readonly T[] | null | undefined,
  currentId: string,
  currentCreatedAt: string,
): T | null;

export function latestDoneTransition(
  checks: readonly ComparableListItem[] | null | undefined,
): ListTransition | null;
