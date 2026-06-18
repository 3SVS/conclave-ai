"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { statusLabel } from "@/i18n/dictionary.mjs";

/** Locale-aware status label as plain text (no badge chrome). Drop-in replacement
 *  for backend-provided Korean `userLabel` strings. */
export function StatusText({ status }: { status: string }) {
  const { t } = useI18n();
  return <>{statusLabel(t, status)}</>;
}
