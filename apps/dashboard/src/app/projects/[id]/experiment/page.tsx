"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import { getLocalProject, loadExtendedProjectData } from "@/lib/workflow-store";
import {
  EXPERIMENT_TEMPLATES,
  buildCandidatePrompt,
  buildAllPromptsText,
} from "@/lib/agent-experiment.mjs";
import type {
  AgentExperimentRole,
  SuggestedAgent,
} from "@/lib/agent-experiment.mjs";
import { useI18n } from "@/i18n/I18nProvider";
import type { Dictionary } from "@/i18n/dictionary.mjs";

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

type ResolvedCandidate = {
  id: string;
  label: string;
  role: AgentExperimentRole;
  suggestedAgent: SuggestedAgent;
  prompt: string;
};

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const project = getLocalProject(id) ?? getProject(id);

  const [selectedId, setSelectedId] = useState(EXPERIMENT_TEMPLATES[0].id);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
