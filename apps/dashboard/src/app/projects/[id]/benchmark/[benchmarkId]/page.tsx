"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import { getLocalProject, getUserKey } from "@/lib/workflow-store";
import { getSavedBenchmark, type SavedBenchmark } from "@/lib/workspace-benchmark-api";
import { buildBenchmarkSummaryText } from "@/lib/agent-benchmark.mjs";
import type {
  AgentCandidate,
  CandidateMode,
  CandidateSource,
  AgentCandidateMetrics,
  BenchmarkRationaleItem,
} from "@/lib/agent-benchmark.mjs";
import { useI18n } from "@/i18n/I18nProvider";
import { statusLabel } from "@/i18n/dictionary.mjs";
import type { Dictionary, Locale } from "@/i18n/dictionary.mjs";

function modeLabel(t: Dictionary, mode: CandidateMode): string {
  if (mode === "single_agent") return t.benchmark.modeSingle;
  if (mode === "multi_agent") return t.benchmark.modeMulti;
  if (mode === "reviewer_agent") return t.benchmark.modeReviewer;
  return t.benchmark.modeHybrid;
}

function sourceLabel(t: Dictionary, source: CandidateSource): string {
  if (source === "claude_code") return t.benchmark.sourceClaude;
  if (source === "codex") return t.benchmark.sourceCodex;
  if (source === "cursor") return t.benchmark.sourceCursor;
  if (source === "manual") return t.benchmark.sourceManual;
  return t.benchmark.sourceOther;
}

function rationaleText(t: Dictionary, item: BenchmarkRationaleItem): string {
  switch (item.code) {
    case "pass_comparison":
      return t.benchmark.rationalePassComparison
        .replace("{winner}", item.winnerLabel)
        .replace("{winnerPassed}", String(item.winnerPassed))
        .replace("{winnerTotal}", String(item.winnerTotal))
        .replace("{runner}", item.runnerLabel)
        .replace("{runnerPassed}", String(item.runnerPassed))
        .replace("{runnerTotal}", String(item.runnerTotal));
    case "fewer_critical":
      return t.benchmark.rationaleFewerCritical
        .replace("{winner}", item.winnerLabel)
        .replace("{runner}", item.runnerLabel);
    case "runner_not_verified":
      return t.benchmark.rationaleRunnerNotVerified
        .replace("{runner}", item.runnerLabel)
        .replace("{count}", String(item.count));
    default:
      return "";
  }
}

function formatDate(iso: string, locale: Locale): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default function BenchmarkDetailPage() {
  const { id, benchmarkId } = useParams<{ id: string; benchmarkId: string }>();
  const { t, locale } = useI18n();
  const project = getLocalProject(id) ?? getProject(id);
  const userKey = getUserKey();

  const [phase, setPhase] = useState<"loading" | "done" | "not_found" | "error">("loading");
  const [data, setData] = useState<SavedBenchmark | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPhase("loading");
      const res = await getSavedBenchmark(id, benchmarkId, userKey ?? "");
      if (cancelled) return;
      if (res.ok) {
        setData(res.benchmark);
        setPhase("done");
      } else if (res.error === "not_found") {
        setPhase("not_found");
      } else {
        setPhase("error");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, benchmarkId, userKey]);

  if (!project) return <p className="text-sm text-gray-400">{t.common.notFound}</p>;

  const backUrl = `/projects/${id}/benchmark`;

  if (phase === "loading") {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
          {t.benchmark.detailLoading}
        </div>
      </div>
    );
  }
  if (phase === "not_found" || phase === "error" || !data) {
    return (
      <div className="max-w-3xl space-y-4">
        <Link href={backUrl} className="text-xs text-gray-400 hover:text-indigo-600">{t.benchmark.detailBack}</Link>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          {phase === "not_found" ? t.benchmark.notFoundDetail : t.benchmark.loadErrorDetail}
        </div>
      </div>
    );
  }

  const savedTitle = data.title;
  const result = data.result;
  const candidates = result.candidates ?? [];
  const metricsBy = result.metricsByCandidate ?? {};
  const ranked = candidates
    .map((c) => ({ candidate: c, metrics: metricsBy[c.id] }))
    .filter((r): r is { candidate: AgentCandidate; metrics: AgentCandidateMetrics } => Boolean(r.metrics))
    .sort((a, b) => b.metrics.score - a.metrics.score);
  const winnerId = result.recommendation?.winnerCandidateId;
  const winner = candidates.find((c) => c.id === winnerId);
  const alignment = result.acceptanceSetAlignment;
  const winnerBlocker = result.recommendation?.blockers.find((b) => b.candidateId === winnerId);

  const rationaleLines = (result.recommendation?.rationale ?? [])
    .filter((r) => r.code !== "no_clear_winner")
    .map((r) => rationaleText(t, r));

  // ── Deterministic copy summary (UI language) ──
  function handleCopy() {
    const candidateLines = ranked.map(({ candidate, metrics }) =>
      t.benchmark.summaryCandidateLine
        .replace("{label}", candidate.label)
        .replace("{passed}", String(metrics.passed))
        .replace("{total}", String(metrics.totalItems))
        .replace("{critical}", String(metrics.criticalIssueCount))
        .replace("{notVerified}", String(metrics.notVerifiedCount))
        .replace("{score}", String(metrics.score)),
    );
    const blockerLines = winnerId
      ? winnerBlocker
        ? [
            `${winner?.label ?? winnerId}: ${winnerBlocker.failed} ${statusLabel(t, "failed")} · ${winnerBlocker.needsDecision} ${statusLabel(t, "needs_decision")} · ${winnerBlocker.inconclusive} ${statusLabel(t, "inconclusive")}`,
          ]
        : []
      : (result.recommendation?.blockers ?? []).map(
          (b) => `${b.candidateLabel}: ${b.failed} ${statusLabel(t, "failed")} · ${b.needsDecision} ${statusLabel(t, "needs_decision")} · ${b.inconclusive} ${statusLabel(t, "inconclusive")}`,
        );

    const text = buildBenchmarkSummaryText({
      heading: t.benchmark.summaryHeading,
      projectLine: `${t.benchmark.summaryProject}: ${id}`,
      benchmarkLine: `${t.benchmark.summaryBenchmark}: ${savedTitle || "—"}`,
      recommendationLine: `${t.benchmark.summaryRecommendation}: ${winner ? winner.label : t.benchmark.noClearWinner}`,
      candidatesHeading: t.benchmark.summaryCandidates,
      candidateLines,
      whyHeading: t.benchmark.why,
      whyLines: rationaleLines,
      blockersHeading: t.benchmark.blockersTitle,
      blockerLines,
      noBlockersLine: t.benchmark.noRemainingBlockers,
    });
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link href={backUrl} className="text-xs text-gray-400 hover:text-indigo-600">{t.benchmark.detailBack}</Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">{t.benchmark.detailTitle}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{t.benchmark.detailSubtitle}</p>
          </div>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copied ? t.benchmark.copied : t.benchmark.copySummary}
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
        {data.title && <span className="font-medium text-gray-700">{data.title}</span>}
        <span>{t.benchmark.createdLabel}: {formatDate(data.createdAt, locale)}</span>
        <span>{t.benchmark.detailCandidates}: {data.candidateCount}</span>
      </div>

      {/* Acceptance set alignment */}
      {alignment && (
        alignment.aligned ? (
          <p className="text-xs text-gray-400">{t.benchmark.sameAcceptanceSet}</p>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {t.benchmark.acceptanceSetWarning}
          </div>
        )
      )}

      {/* Recommendation */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{t.benchmark.intro}</p>
        {winner ? (
          <>
            <h3 className="mt-3 text-sm font-semibold text-gray-800">{t.benchmark.recommendedCandidate}</h3>
            <p className="mt-1 text-sm font-semibold text-indigo-700">{winner.label}</p>
            <p className="mt-1 text-xs text-gray-500">{t.benchmark.recommendedBody}</p>
            {winner.reviewRunId && (
              <Link
                href={`/projects/${id}/github/history/${winner.reviewRunId}`}
                className="mt-2 inline-block rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {t.benchmark.openReviewRun}
              </Link>
            )}
          </>
        ) : (
          <>
            <h3 className="mt-3 text-sm font-semibold text-gray-700">{t.benchmark.noClearWinner}</h3>
            <p className="mt-1 text-xs text-gray-500">{t.benchmark.noClearWinnerBody}</p>
          </>
        )}
      </section>

      {/* Why */}
      {rationaleLines.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-800">{t.benchmark.why}</h3>
          <ul className="mt-2 space-y-1">
            {rationaleLines.map((line, i) => (
              <li key={i} className="text-xs text-gray-600">{line}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Candidate comparison table */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">{t.benchmark.candidateComparison}</h3>
          <p className="mt-0.5 text-[11px] text-gray-400">{t.benchmark.scoreNote}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2 text-left font-medium">{t.benchmark.colCandidate}</th>
                <th className="px-4 py-2 text-left font-medium">{t.benchmark.colMode}</th>
                <th className="px-4 py-2 text-left font-medium">{t.benchmark.colSource}</th>
                <th className="px-4 py-2 text-right font-medium">{t.benchmark.colPassed}</th>
                <th className="px-4 py-2 text-right font-medium">{t.benchmark.colCritical}</th>
                <th className="px-4 py-2 text-right font-medium">{t.benchmark.colNotVerified}</th>
                <th className="px-4 py-2 text-right font-medium">{t.benchmark.colScore}</th>
                <th className="px-4 py-2 text-right font-medium">{t.benchmark.colRun}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ candidate, metrics }) => (
                <tr key={candidate.id} className={`border-t border-gray-100 ${candidate.id === winnerId ? "bg-indigo-50/40" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{candidate.label}</td>
                  <td className="px-4 py-2.5 text-gray-600">{modeLabel(t, candidate.mode)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{sourceLabel(t, candidate.source)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{metrics.passed} / {metrics.totalItems}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{metrics.criticalIssueCount}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{metrics.notVerifiedCount}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{metrics.score}</td>
                  <td className="px-4 py-2.5 text-right">
                    {candidate.reviewRunId ? (
                      <Link href={`/projects/${id}/github/history/${candidate.reviewRunId}`} className="text-xs text-indigo-600 hover:underline">
                        {candidate.pullRequestNumber ? `PR #${candidate.pullRequestNumber}` : t.benchmark.openReviewRun}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Metrics detail per candidate (raw counts alongside score) */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">{t.benchmark.metricsTitle}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {ranked.map(({ candidate, metrics }) => (
            <div key={candidate.id} className={`rounded-xl border p-4 ${candidate.id === winnerId ? "border-indigo-300 bg-indigo-50/40" : "border-gray-200 bg-white"}`}>
              <p className="mb-2 text-sm font-semibold text-gray-800">{candidate.label}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label={t.benchmark.acceptancePassRate} value={pct(metrics.acceptancePassRate)} strong />
                <Stat label={t.benchmark.score} value={String(metrics.score)} />
                <Stat label={t.benchmark.passed} value={`${metrics.passed} / ${metrics.totalItems}`} />
                <Stat label={t.benchmark.criticalIssues} value={String(metrics.criticalIssueCount)} />
                <Stat label={statusLabel(t, "needs_decision")} value={String(metrics.needsDecision)} />
                <Stat label={t.benchmark.notVerified} value={String(metrics.notVerifiedCount)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Remaining blockers (winner) */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-800">{t.benchmark.blockersTitle}</h3>
        {winnerId && winnerBlocker ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {winnerBlocker.failed > 0 && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-red-700">{statusLabel(t, "failed")}: {winnerBlocker.failed}</span>
            )}
            {winnerBlocker.needsDecision > 0 && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-slate-700">{statusLabel(t, "needs_decision")}: {winnerBlocker.needsDecision}</span>
            )}
            {winnerBlocker.inconclusive > 0 && (
              <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-0.5 text-yellow-700">{statusLabel(t, "inconclusive")}: {winnerBlocker.inconclusive}</span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400">{t.benchmark.noRemainingBlockers}</p>
        )}
      </section>

      {/* Source review runs */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-800">{t.benchmark.sourceRuns}</h3>
        <ul className="mt-2 space-y-1.5">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-600">
                {c.label} · {modeLabel(t, c.mode)} · {sourceLabel(t, c.source)}
                {c.pullRequestNumber ? ` · PR #${c.pullRequestNumber}` : ""}
              </span>
              {c.reviewRunId && (
                <Link href={`/projects/${id}/github/history/${c.reviewRunId}`} className="flex-shrink-0 text-indigo-600 hover:underline">
                  {t.benchmark.openReviewRun}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`${strong ? "text-base font-bold text-gray-900" : "text-sm font-medium text-gray-700"}`}>{value}</p>
    </div>
  );
}
