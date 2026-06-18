"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";

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
    `block rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
      active
        ? "bg-gray-100 font-medium text-gray-900"
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
    }`;

  return (
    <div className="flex flex-1 overflow-hidden">
      <nav className="flex w-52 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-3 py-3">
          <Link
            href="/projects"
            className="text-xs text-gray-400 transition-colors hover:text-gray-700"
          >
            ← {t.nav.backToProjects}
          </Link>
          <p className="mt-1.5 truncate text-sm font-medium text-gray-900">
            {projectName ?? t.common.project}
          </p>
        </div>
        <ul className="flex-1 space-y-0.5 p-2">
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
      </nav>

      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
