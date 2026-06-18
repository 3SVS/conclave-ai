"use client";

import type { ItemStatus } from "@/lib/labels";
import { STATUS_COLOR } from "@/lib/labels";
import { useI18n } from "@/i18n/I18nProvider";
import { statusLabel } from "@/i18n/dictionary.mjs";

export function StatusBadge({ status }: { status: ItemStatus }) {
  const { t } = useI18n();
  const c = STATUS_COLOR[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}
    >
      {statusLabel(t, status)}
    </span>
  );
}
