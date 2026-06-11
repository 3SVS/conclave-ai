import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/mock-data";
import { NAV_LABELS } from "@/lib/labels";

const NAV_ITEMS = [
  { key: "idea", href: "idea" },
  { key: "spec", href: "spec" },
  { key: "items", href: "items" },
  { key: "checks", href: "checks" },
  { key: "fixes", href: "fixes" },
] as const;

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← 목록
        </Link>
        <span className="text-gray-200">|</span>
        <span className="text-sm font-medium text-gray-900 truncate">{project.name}</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-48 bg-white border-r border-gray-200 py-6 px-3 flex-shrink-0">
          <ul className="space-y-1">
            <li>
              <Link
                href={`/projects/${id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                개요
              </Link>
            </li>
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link
                  href={`/projects/${id}/${item.href}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  {NAV_LABELS[item.key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
