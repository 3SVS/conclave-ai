"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { MockUserBadge } from "@/components/MockUserBadge";

const NAV_ITEMS = [
  "idea",
  "spec",
  "items",
  "checks",
  "fixes",
  "export",
  "settings",
  "github",
] as const;

export function ProjectShell({
  projectId,
  projectName,
  children,
}: {
  projectId: string;
  projectName?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const base = `/projects/${projectId}`;
  const isActive = (href: string) => pathname === href;

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
      active ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <Link href="/projects" className="text-sm text-gray-400 transition-colors hover:text-gray-700">
          ← {t.nav.backToProjects}
        </Link>
        <span className="text-gray-200">|</span>
        <span className="truncate text-sm font-medium text-gray-900">
          {projectName ?? t.common.project}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-48 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
          <ul className="flex-1 space-y-1 px-3 py-6">
            <li>
              <Link href={base} className={linkClass(isActive(base))}>
                {t.nav.overview}
              </Link>
            </li>
            {NAV_ITEMS.map((key) => {
              const href = `${base}/${key}`;
              return (
                <li key={key}>
                  <Link href={href} className={linkClass(isActive(href))}>
                    {t.nav[key]}
                  </Link>
                </li>
              );
            })}
          </ul>
          <MockUserBadge />
        </nav>

        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
