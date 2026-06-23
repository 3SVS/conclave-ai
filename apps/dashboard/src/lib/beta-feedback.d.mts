// Type declarations for beta-feedback.mjs (Stage 119).

export function buildBetaFeedbackMailto(input?: {
  route?: string;
  intakeType?: string;
  workflowRecordId?: string;
  section?: string;
  subjectPrefix?: string;
}): string;

export const FEEDBACK_EMAIL: string;
