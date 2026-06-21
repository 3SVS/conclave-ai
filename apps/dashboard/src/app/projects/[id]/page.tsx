"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getProject, getProjectStats } from "@/lib/mock-data";
import { getLocalProject, getUserKey } from "@/lib/workflow-store";
import { StatCard } from "@/components/StatCard";
import { SpecCompleteness } from "@/components/SpecCompleteness";
import { useI18n } from "@/i18n/I18nProvider";
import { statusLabel } from "@/i18n/dictionary.mjs";
import {
  getProjectEvolutionLearning,
  type ProjectEvolutionLearningSignals,
  type ProjectLearningSignal,
} from "@/lib/workspace-experiment-api";
import {
  topSignalLabelKey,
  formatRatePercent,
  formatAverageDeltaPercent,
  formatAverageDeltaCount,
  learningHasNoData,
} from "@/lib/project-evolution-learning.mjs";
import type { Dictionary } from "@/i18n/dictionary.mjs";

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

      <section className="mb-8">
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

      {/* Stage 81: project-level Evolution Learning Signals */}
      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">{t.evolution.learningTitle}</h2>
        </div>
        <EvolutionLearningCard projectId={id} t={t} />
      </section>
    </div>
  );
}

function EvolutionLearningCard({ projectId, t }: { projectId: string; t: Dictionary }) {
  const [learning, setLearning] = useState<ProjectEvolutionLearningSignals | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [userKey, setUserKey] = useState<string>("");

  useEffect(() => {
    setUserKey(getUserKey());
  }, []);

  useEffect(() => {
    if (!userKey) return;
    let cancelled = false;
    setPhase("loading");
    getProjectEvolutionLearning(projectId, userKey).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setLearning(res.learning);
        setPhase("ready");
      } else {
        setLearning(null);
        setPhase("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, userKey]);

  if (phase === "loading") {
    return <p className="card p-5 text-xs text-gray-400">{t.outcome.loading}</p>;
  }
  if (phase === "error") {
    return <p className="card p-5 text-xs text-red-600">{t.errors.loadFailed}</p>;
  }
  if (!learning) {
    return <p className="card p-5 text-xs text-gray-400">{t.evolution.learningEmpty}</p>;
  }

  return (
    <div className="card p-5">
      <p className="text-xs text-gray-500">{t.evolution.learningDesc}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
          <dt className="text-gray-400">{t.evolution.learningExperiments}</dt>
          <dd className="font-semibold text-gray-800">{learning.experimentCount}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
          <dt className="text-gray-400">{t.evolution.learningActionPacks}</dt>
          <dd className="font-semibold text-gray-800">{learning.actionPackCount}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
          <dt className="text-gray-400">{t.evolution.learningFollowedPacks}</dt>
          <dd className="font-semibold text-gray-800">{learning.followedPackCount}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
          <dt className="text-gray-400">{t.evolution.learningComparablePacks}</dt>
          <dd className="font-semibold text-gray-800">{learning.comparablePackCount}</dd>
        </div>
      </dl>

      {learningHasNoData(learning) ? (
        <p className="mt-3 text-xs text-gray-500">{t.evolution.learningEmpty}</p>
      ) : (
        <>
          {/* Verdict counts */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
            <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
              <dt className="text-gray-400">{t.evolution.summaryImprovedPacks}</dt>
              <dd className="font-semibold text-emerald-700">{learning.verdictCounts.improved}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
              <dt className="text-gray-400">{t.evolution.summaryRegressedPacks}</dt>
              <dd className="font-semibold text-red-700">{learning.verdictCounts.regressed}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
              <dt className="text-gray-400">{t.evolution.summaryUnchangedPacks}</dt>
              <dd className="font-semibold text-gray-700">{learning.verdictCounts.unchanged}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-0.5">
              <dt className="text-gray-400">{t.evolution.summaryInconclusivePacks}</dt>
              <dd className="font-semibold text-amber-700">{learning.verdictCounts.inconclusive}</dd>
            </div>
          </div>

          {/* Average change */}
          <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{t.evolution.learningAverageChange}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-4">
              <div className="flex justify-between"><dt className="text-gray-400">{t.evolution.impactPassRate}</dt><dd className="font-semibold text-gray-700">{formatAverageDeltaPercent(learning.averageDelta.passRateDelta)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">{t.evolution.impactCritical}</dt><dd className="font-semibold text-gray-700">{formatAverageDeltaCount(learning.averageDelta.criticalIssueDelta)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">{t.evolution.impactNotVerified}</dt><dd className="font-semibold text-gray-700">{formatAverageDeltaCount(learning.averageDelta.notVerifiedDelta)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">{t.evolution.impactBlockers}</dt><dd className="font-semibold text-gray-700">{formatAverageDeltaCount(learning.averageDelta.blockerDelta)}</dd></div>
            </dl>
          </div>

          {/* Recommended action effectiveness table */}
          {learning.recommendedActionEffectiveness.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t.evolution.learningEffectiveness}</p>
              <ul className="mt-1 space-y-1 text-xs">
                {learning.recommendedActionEffectiveness.map((r) => (
                  <li
                    key={r.recommendedAction}
                    className="grid grid-cols-3 items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1"
                  >
                    <span className="font-mono text-[11px] text-gray-600">{r.recommendedAction}</span>
                    <span className="text-[11px] text-gray-500">
                      {r.comparable}/{r.total} · <span className="text-emerald-700">↑{r.improved}</span> · <span className="text-red-700">↓{r.regressed}</span> · <span className="text-amber-700">?{r.inconclusive}</span>
                    </span>
                    <span className="text-right text-[11px] text-gray-500">
                      <span className="text-emerald-700">{t.evolution.learningImprovementRate} {formatRatePercent(r.improvementRate)}</span>
                      <span className="mx-1 text-gray-300">·</span>
                      <span className="text-red-700">{t.evolution.learningRegressionRate} {formatRatePercent(r.regressionRate)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Top signals — always shown so the empty state has a place to live */}
      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t.evolution.learningTopSignals}</p>
        <ul className="mt-1 space-y-1 text-xs text-gray-700">
          {learning.topSignals.map((sig, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-md border border-gray-100 bg-white px-2 py-1">
              <TopSignalText signal={sig} t={t} />
            </li>
          ))}
        </ul>
      </div>

      {learning.limitations.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t.evolution.summaryLimitationsLabel}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {learning.limitations.map((l) => (
              <li
                key={l}
                className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-mono text-gray-500"
              >
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">{t.evolution.learningDisclaimer}</p>
    </div>
  );
}

function TopSignalText({ signal, t }: { signal: ProjectLearningSignal; t: Dictionary }) {
  if (signal.type === "not_enough_data") {
    return <span className="text-gray-500">{t.evolution.signalNotEnoughData}</span>;
  }
  const labelKey = topSignalLabelKey(signal);
  const label = t.evolution[labelKey as keyof typeof t.evolution];
  if (signal.type === "action_often_improves") {
    return (
      <>
        <span className="font-semibold text-gray-700">{t.evolution.learningEarlySignal}</span>
        <span className="font-mono text-[11px] text-gray-700">{signal.recommendedAction}</span>
        <span className="text-emerald-700">{label}</span>
        <span className="text-gray-400">
          ({signal.improved}/{signal.totalComparable})
        </span>
      </>
    );
  }
  // action_often_regresses
  return (
    <>
      <span className="font-semibold text-gray-700">{t.evolution.learningEarlySignal}</span>
      <span className="font-mono text-[11px] text-gray-700">{signal.recommendedAction}</span>
      <span className="text-red-700">{label}</span>
      <span className="text-gray-400">
        ({signal.regressed}/{signal.totalComparable})
      </span>
    </>
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
