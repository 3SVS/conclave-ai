"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getProject, getProjectStats } from "@/lib/mock-data";
import { getLocalProject } from "@/lib/workflow-store";
import { StatCard } from "@/components/StatCard";
import { SpecCompleteness } from "@/components/SpecCompleteness";
import { useI18n } from "@/i18n/I18nProvider";
import { statusLabel } from "@/i18n/dictionary.mjs";

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  // Locally-created projects live in localStorage (client-only); mock demos are
  // bundled. Read on the client so real projects resolve.
  const project = getLocalProject(id) ?? getProject(id);
  if (!project) return <p className="text-sm text-gray-400">{t.common.notFound}</p>;
  const stats = getProjectStats(project);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{project.name}</h1>
      <p className="mb-8 mt-1 text-sm text-gray-500">{project.description}</p>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">{t.overview.specCompleteness}</h2>
          <Link href={`/projects/${id}/spec`} className="text-xs text-brand-700 hover:underline">
            {t.common.view} →
          </Link>
        </div>
        <div className="card p-5">
          <SpecCompleteness value={project.spec.completeness} />
          {project.spec.openDecisions.length > 0 && (
            <div className="mt-4 space-y-2">
              {project.spec.openDecisions.map((d, i) => (
                <div key={i} className="flex gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">{t.overview.resultsSummary}</h2>
          <Link href={`/projects/${id}/checks`} className="text-xs text-brand-700 hover:underline">
            {t.common.viewAll} →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={statusLabel(t, "passed")} value={stats.passed} colorClass="text-green-600" />
          <StatCard label={statusLabel(t, "failed")} value={stats.failed} colorClass="text-red-600" />
          <StatCard label={statusLabel(t, "inconclusive")} value={stats.inconclusive} colorClass="text-amber-600" />
          <StatCard label={statusLabel(t, "needs_decision")} value={stats.needsDecision} colorClass="text-slate-600" />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">{t.overview.mustHaves}</h2>
          <Link href={`/projects/${id}/items`} className="text-xs text-brand-700 hover:underline">
            {t.common.viewAll} →
          </Link>
        </div>
        <div className="card divide-y divide-gray-100">
          {project.requirements.slice(0, 4).map((req) => (
            <div key={req.id} className="flex items-center gap-3 px-5 py-3.5">
              <StatusDot status={req.status} />
              <span className="flex-1 text-sm text-gray-700">{req.title}</span>
            </div>
          ))}
          {project.requirements.length > 4 && (
            <div className="px-5 py-3 text-center font-mono text-xs text-gray-400">
              + {project.requirements.length - 4} {t.common.more}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    passed: "bg-green-500",
    failed: "bg-red-500",
    inconclusive: "bg-amber-400",
    needs_decision: "bg-slate-500",
    not_started: "bg-gray-300",
    building: "bg-blue-400",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-gray-300"}`} />
  );
}
