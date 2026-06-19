"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import { getLocalProject, loadExtendedProjectData, getUserKey } from "@/lib/workflow-store";
import {
  EXPERIMENT_TEMPLATES,
  buildCandidatePrompt,
  buildAllPromptsText,
  canSaveExperiment,
} from "@/lib/agent-experiment.mjs";
import type {
  AgentExperimentRole,
  SuggestedAgent,
} from "@/lib/agent-experiment.mjs";
import {
  saveExperiment,
  listExperiments,
  getExperiment,
  patchExperimentCandidate,
  type SavedExperimentListItem,
  type SavedExperiment,
  type ExperimentCandidate,
} from "@/lib/workspace-experiment-api";
import { listProjectReviewHistory, type ProjectReviewHistoryItem } from "@/lib/workspace-github-api";
import { useI18n } from "@/i18n/I18nProvider";
import type { Dictionary, Locale } from "@/i18n/dictionary.mjs";

function templateTitle(t: Dictionary, id: string): string {
  if (id === "single_agent_baseline") return t.experiment.tplSingleTitle;
  if (id === "multi_agent_split") return t.experiment.tplMultiTitle;
  return t.experiment.tplBuilderReviewerTitle;
}
function templateDesc(t: Dictionary, id: string): string {
  if (id === "single_agent_baseline") return t.experiment.tplSingleDesc;
  if (id === "multi_agent_split") return t.experiment.tplMultiDesc;
  return t.experiment.tplBuilderReviewerDesc;
}
function candidateLabel(t: Dictionary, labelKey: string): string {
  const map: Record<string, string> = {
    candSingleBuilder: t.experiment.candSingleBuilder,
    candBuilderA: t.experiment.candBuilderA,
    candBuilderB: t.experiment.candBuilderB,
    roleBuilder: t.experiment.roleBuilder,
    roleReviewer: t.experiment.roleReviewer,
    roleFixer: t.experiment.roleFixer,
  };
  return map[labelKey] ?? labelKey;
}
function roleLabel(t: Dictionary, role: AgentExperimentRole): string {
  if (role === "builder") return t.experiment.roleBuilder;
  if (role === "reviewer") return t.experiment.roleReviewer;
  if (role === "fixer") return t.experiment.roleFixer;
  return t.experiment.roleIntegrator;
}
function roleInstruction(t: Dictionary, role: AgentExperimentRole, label: string): string {
  const tpl =
    role === "reviewer"
      ? t.experiment.roleInstructionReviewer
      : role === "fixer"
        ? t.experiment.roleInstructionFixer
        : role === "integrator"
          ? t.experiment.roleInstructionIntegrator
          : t.experiment.roleInstructionBuilder;
  return tpl.replace("{label}", label);
}
function agentLabel(t: Dictionary, agent: SuggestedAgent): string {
  if (agent === "claude_code") return t.benchmark.sourceClaude;
  if (agent === "codex") return t.benchmark.sourceCodex;
  if (agent === "cursor") return t.benchmark.sourceCursor;
  if (agent === "manual") return t.benchmark.sourceManual;
  return t.benchmark.sourceOther;
}

function candidateStatusLabel(t: Dictionary, status: string): string {
  if (status === "planned") return t.experiment.statPlanned;
  if (status === "pr_linked") return t.experiment.statPrLinked;
  if (status === "reviewed") return t.experiment.statReviewed;
  if (status === "benchmarked") return t.experiment.statBenchmarked;
  return status;
}

function expDate(iso: string, locale: Locale): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

type ResolvedCandidate = {
  id: string;
  label: string;
  role: AgentExperimentRole;
  suggestedAgent: SuggestedAgent;
  prompt: string;
};

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const project = getLocalProject(id) ?? getProject(id);
  const userKey = getUserKey();

  const [selectedId, setSelectedId] = useState(EXPERIMENT_TEMPLATES[0].id);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Stage 72: persistence + candidate linking
  const [titleInput, setTitleInput] = useState("");
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saved, setSaved] = useState<SavedExperimentListItem[]>([]);
  const [openExp, setOpenExp] = useState<SavedExperiment | null>(null);
  const [reviewRuns, setReviewRuns] = useState<ProjectReviewHistoryItem[]>([]);

  const loadSaved = useCallback(async () => {
    if (!userKey) return;
    const res = await listExperiments(id, userKey);
    if (res.ok) setSaved(res.experiments);
  }, [id, userKey]);

  useEffect(() => {
    void loadSaved();
    (async () => {
      const res = await listProjectReviewHistory(id, userKey ?? "", { limit: 50 });
      if (res.ok) setReviewRuns(res.runs);
    })();
  }, [id, userKey, loadSaved]);

  if (!project) return <p className="text-sm text-gray-400">{t.common.notFound}</p>;

  const ext = loadExtendedProjectData(id);
  const spec = ext?.productSpec as { oneLine?: string; problem?: string } | undefined;
  const brief = (spec?.oneLine || spec?.problem || project.spec?.goal || "").trim() || t.experiment.briefFallback;
  const acceptanceItems = (project.requirements ?? []).map((r) => r.title);

  const template = EXPERIMENT_TEMPLATES.find((tpl) => tpl.id === selectedId) ?? EXPERIMENT_TEMPLATES[0];

  const candidates: ResolvedCandidate[] = template.candidates.map((c) => {
    const label = candidateLabel(t, c.labelKey);
    const prompt = buildCandidatePrompt({
      roleInstruction: roleInstruction(t, c.role, label),
      contextHeading: t.experiment.promptContextHeading,
      context: t.experiment.projectContextLine.replace("{title}", project.name),
      briefHeading: t.experiment.promptBriefHeading,
      brief,
      acceptanceHeading: t.experiment.promptAcceptanceHeading,
      acceptanceItems,
      constraintsHeading: t.experiment.promptConstraintsHeading,
      constraints: [t.experiment.constraintScope, t.experiment.constraintReviewable],
      outputHeading: t.experiment.promptOutputHeading,
      output: t.experiment.promptOutput,
      reportHeading: t.experiment.promptReportHeading,
      report: t.experiment.promptReport,
    });
    return { id: c.id, label, role: c.role, suggestedAgent: c.suggestedAgent, prompt };
  });

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    }).catch(() => {});
  }

  function copyAll() {
    const text = buildAllPromptsText({
      heading: t.experiment.copyAllHeading,
      candidatePrefix: t.experiment.candidatePrefix,
      candidates: candidates.map((c) => ({ label: c.label, prompt: c.prompt })),
    });
    copy("__all__", text);
  }

  async function handleSaveExperiment() {
    if (!userKey || !canSaveExperiment(titleInput, template.id)) return;
    setSavePhase("saving");
    const res = await saveExperiment(id, {
      userKey,
      title: titleInput.trim(),
      templateId: template.id,
      candidates: candidates.map((c) => ({ id: c.id, label: c.label, mode: template.mode, role: c.role, suggestedAgent: c.suggestedAgent })),
    });
    if (res.ok) {
      setSavePhase("saved");
      setTitleInput("");
      await loadSaved();
      setOpenExp(res.experiment);
      setTimeout(() => setSavePhase((p) => (p === "saved" ? "idle" : p)), 2000);
    } else {
      setSavePhase("error");
    }
  }

  async function handleOpenExperiment(experimentId: string) {
    if (!userKey) return;
    const res = await getExperiment(id, experimentId, userKey);
    if (res.ok) setOpenExp(res.experiment);
  }

  async function handlePatchCandidate(
    candidateRowId: string,
    patch: { pullRequestNumber?: number; reviewRunId?: string },
  ): Promise<boolean> {
    if (!userKey || !openExp) return false;
    const res = await patchExperimentCandidate(id, openExp.id, candidateRowId, { userKey, ...patch });
    if (res.ok) {
      setOpenExp({ ...openExp, candidates: openExp.candidates.map((c) => (c.id === candidateRowId ? res.candidate : c)) });
      return true;
    }
    return false;
  }

  const steps = [t.experiment.step1, t.experiment.step2, t.experiment.step3, t.experiment.step4, t.experiment.step5, t.experiment.step6];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">{t.experiment.title}</h2>
        <p className="mt-0.5 text-sm text-gray-500">{t.experiment.subtitle}</p>
        <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{t.experiment.purposeNote}</p>
      </div>

      {/* Template selector */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{t.experiment.chooseTemplate}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXPERIMENT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setSelectedId(tpl.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${tpl.id === selectedId ? "border-indigo-300 bg-indigo-50/50" : "border-gray-200 bg-white hover:border-indigo-200"}`}
            >
              <p className="text-sm font-semibold text-gray-800">{templateTitle(t, tpl.id)}</p>
              <p className="mt-1 text-xs text-gray-500">{templateDesc(t, tpl.id)}</p>
            </button>
          ))}
        </div>
      </section>

      {/* No brief / items hint */}
      {acceptanceItems.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{t.experiment.noBrief}</div>
      )}

      {/* Candidate prompts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{templateTitle(t, template.id)}</h3>
          <button
            onClick={copyAll}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copiedKey === "__all__" ? t.experiment.copied : t.experiment.copyAllPrompts}
          </button>
        </div>
        {candidates.map((c) => (
          <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {t.experiment.roleLabel}: {roleLabel(t, c.role)} · {t.experiment.suggestedAgentLabel}: {agentLabel(t, c.suggestedAgent)}
                </p>
              </div>
              <button
                onClick={() => copy(c.id, c.prompt)}
                className="flex-shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
              >
                {copiedKey === c.id ? t.experiment.copied : t.experiment.copyPrompt}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-gray-700">{c.prompt}</pre>
            </div>
          </div>
        ))}
      </section>

      {/* Save experiment */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-800">{t.experiment.createExperiment}</h3>
        <p className="mt-0.5 text-xs text-gray-400">{t.experiment.saveHint}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder={t.experiment.titlePlaceholder}
            maxLength={120}
            className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={handleSaveExperiment}
            disabled={!canSaveExperiment(titleInput, template.id) || savePhase === "saving"}
            className="flex-shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            {savePhase === "saving" ? t.experiment.saving : t.experiment.saveExperiment}
          </button>
        </div>
        {savePhase === "saved" && <p className="mt-2 text-xs text-green-600">{t.experiment.saved}</p>}
        {savePhase === "error" && <p className="mt-2 text-xs text-red-500">{t.experiment.saveError}</p>}
      </section>

      {/* Saved experiments */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-800">{t.experiment.savedExperiments}</h3>
        {saved.length === 0 ? (
          <p className="mt-2 text-xs text-gray-400">{t.experiment.noSavedExperiments}</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {saved.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-gray-700">{e.title}</p>
                  <p className="truncate text-[11px] text-gray-400">{templateTitle(t, e.templateId)} · {e.candidateCount} · {expDate(e.createdAt, locale)}</p>
                </div>
                <button onClick={() => handleOpenExperiment(e.id)} className="flex-shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  {t.experiment.open}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Candidate linking for the opened experiment */}
      {openExp && (
        <section className="rounded-xl border border-indigo-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-800">{openExp.title}</h3>
          <p className="mt-0.5 text-xs text-gray-400">{templateTitle(t, openExp.templateId)}</p>
          <div className="mt-3 space-y-3">
            {openExp.candidates.map((c) => (
              <CandidateLinkCard key={c.id} candidate={c} reviewRuns={reviewRuns} onPatch={handlePatchCandidate} t={t} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Workflow guide */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-800">{t.experiment.workflowTitle}</h3>
        <ol className="mt-2 space-y-1.5 text-sm text-gray-600">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex-shrink-0 font-semibold text-indigo-500">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Benchmark link */}
      <section className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
        <p className="text-xs text-gray-500">{t.experiment.afterReview}</p>
        <p className="mt-0.5 text-xs text-gray-400">{t.experiment.benchmarkHint}</p>
        <Link
          href={`/projects/${id}/benchmark`}
          className="mt-2 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
        >
          {t.experiment.openBenchmark}
        </Link>
      </section>
    </div>
  );
}

// Stage 72: per-candidate PR / review-run linking card.
function CandidateLinkCard({
  candidate,
  reviewRuns,
  onPatch,
  t,
  locale,
}: {
  candidate: ExperimentCandidate;
  reviewRuns: ProjectReviewHistoryItem[];
  onPatch: (candidateRowId: string, patch: { pullRequestNumber?: number; reviewRunId?: string }) => Promise<boolean>;
  t: Dictionary;
  locale: Locale;
}) {
  const [pr, setPr] = useState(candidate.pullRequestNumber ? String(candidate.pullRequestNumber) : "");
  const [runId, setRunId] = useState(candidate.reviewRunId ?? "");
  const [phase, setPhase] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function update() {
    setPhase("saving");
    const prNum = pr.trim() ? Number(pr) : undefined;
    const ok = await onPatch(candidate.id, {
      pullRequestNumber: prNum && Number.isInteger(prNum) && prNum > 0 ? prNum : undefined,
      reviewRunId: runId || undefined,
    });
    setPhase(ok ? "saved" : "error");
    if (ok) setTimeout(() => setPhase((p) => (p === "saved" ? "idle" : p)), 2000);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-800">{candidate.label}</span>
        <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600">
          {t.experiment.candidateStatus}: {candidateStatusLabel(t, candidate.status)}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label className="mb-0.5 block text-[11px] text-gray-500">{t.experiment.prNumber}</label>
          <input
            type="number"
            min={1}
            value={pr}
            onChange={(e) => setPr(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="flex-1">
          <label className="mb-0.5 block text-[11px] text-gray-500">{t.experiment.linkReviewRun}</label>
          <select
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">{t.experiment.selectReviewRun}</option>
            {reviewRuns.map((r) => (
              <option key={r.id} value={r.id}>
                PR #{r.prNumber} · {expDate(r.createdAt, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={update}
            disabled={phase === "saving"}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-white disabled:opacity-40"
          >
            {phase === "saving" ? t.experiment.updating : t.experiment.update}
          </button>
        </div>
      </div>
      {phase === "saved" && <p className="mt-1 text-[11px] text-green-600">{t.experiment.updated}</p>}
      {phase === "error" && <p className="mt-1 text-[11px] text-red-500">{t.experiment.updateError}</p>}
    </div>
  );
}
