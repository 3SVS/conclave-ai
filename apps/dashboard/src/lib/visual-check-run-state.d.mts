// Type declarations for visual-check-run-state.mjs (Stage 264).

export type RunErrorKey =
  | "websiteSourceRequired"
  | "runAlreadyActive"
  | "projectNotFound"
  | "forbidden"
  | "invalidIntent"
  | "generic";

export type RunButtonReasonKey = "runAlreadyActive" | "websiteSourceRequired";

export const RUN_POLL_INTERVAL_MS: number;

export function isActiveStatus(status: unknown): boolean;

export function nextPollDelayMs(status: unknown): number | null;

export function runButtonState(input?: {
  hasWebsiteSource?: boolean;
  hasActiveRun?: boolean;
}): { disabled: boolean; reasonKey: RunButtonReasonKey | null };

export function mapRunError(codeOrStatus: unknown): RunErrorKey;
