import type { ItemStatus } from "@/lib/labels";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/labels";

export function StatusBadge({ status }: { status: ItemStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
