"use client";

// Stage 101 — unified intake foundation UI.
// One front door with multiple starting points. Deterministic local preview
// only — no backend, no model call, no external fetch. Future stages wire real
// per-type analysis behind the same model.
import { useState } from "react";
import {
  WORKSPACE_INTAKE_TYPES,
  INTAKE_META,
  INTAKE_OUTPUT_LABELS,
  buildIntakeDraft,
} from "@/lib/intake.mjs";
import type {
  WorkspaceIntakeType,
  WorkspaceIntakeDraft,
} from "@/lib/intake.mjs";
import { buildPrdIntakePreview, SAMPLE_PRD } from "@/lib/intake-prd.mjs";
import type { PrdIntakePreview } from "@/lib/intake-prd.mjs";
import {
  buildProductUrlIntakePreview,
  SAMPLE_PRODUCT_URL,
} from "@/lib/intake-url.mjs";
import type { ProductUrlIntakePreview } from "@/lib/intake-url.mjs";
import {
  buildGitHubRepoIntakePreview,
  SAMPLE_GITHUB_REPO,
} from "@/lib/intake-github-repo.mjs";
import type { GitHubRepoIntakePreview } from "@/lib/intake-github-repo.mjs";
import {
  buildAiBuiltAppRecoveryPreview,
  SAMPLE_AI_BUILT_APP,
} from "@/lib/intake-ai-built-app.mjs";
import type { AiBuiltAppRecoveryPreview } from "@/lib/intake-ai-built-app.mjs";
import {
  buildIntakeAcceptanceMap,
  NEXT_STEP_LABELS,
} from "@/lib/intake-acceptance-map.mjs";
import type { IntakeAcceptanceMap } from "@/lib/intake-acceptance-map.mjs";
import {
  buildIntakeStagePlan,
  STAGE_STATUS_LABELS,
  STAGE_KIND_LABELS,
} from "@/lib/intake-stage-plan.mjs";
import type { IntakeStagePlan } from "@/lib/intake-stage-plan.mjs";

export default function IntakePage() {
  const [type, setType] = useState<WorkspaceIntakeType | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [draft, setDraft] = useState<WorkspaceIntakeDraft | null>(null);
  const [prdPreview, setPrdPreview] = useState<PrdIntakePreview | null>(null);
  const [urlPreview, setUrlPreview] = useState<ProductUrlIntakePreview | null>(null);
  const [repoPreview, setRepoPreview] = useState<GitHubRepoIntakePreview | null>(null);
  const [appPreview, setAppPreview] = useState<AiBuiltAppRecoveryPreview | null>(null);
  const [acceptanceMap, setAcceptanceMap] = useState<IntakeAcceptanceMap | null>(null);
  const [stagePlan, setStagePlan] = useState<IntakeStagePlan | null>(null);

  const meta = type ? INTAKE_META[type] : null;

  function resetPreviews() {
    setDraft(null);
    setPrdPreview(null);
    setUrlPreview(null);
    setRepoPreview(null);
    setAppPreview(null);
    setAcceptanceMap(null);
    setStagePlan(null);
  }

  function selectType(next: WorkspaceIntakeType) {
    setType(next);
    setRawInput("");
    resetPreviews();
  }

  function createDraft() {
    if (!type || !rawInput.trim()) return;
    setDraft(buildIntakeDraft(type, rawInput));
    // Stage 102/103: deterministic per-type previews (prd / product_url only).
    setPrdPreview(type === "prd" ? buildPrdIntakePreview(rawInput) : null);
    setUrlPreview(
      type === "product_url" ? buildProductUrlIntakePreview(rawInput) : null,
    );
    setRepoPreview(
      type === "github_repo" ? buildGitHubRepoIntakePreview(rawInput) : null,
    );
    setAppPreview(
      type === "ai_built_app" ? buildAiBuiltAppRecoveryPreview(rawInput) : null,
    );
    // Stage 106/107: shared acceptance map + ordered stage plan for every type.
    setAcceptanceMap(buildIntakeAcceptanceMap({ type, rawInput }));
    setStagePlan(buildIntakeStagePlan({ type, rawInput }));
  }

  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          What do you want Simsa to review?
        </h1>
        <p className="mb-8 mt-2 text-sm text-gray-500">
          Start from anything. Simsa turns it into a staged acceptance workflow.
        </p>

        {/* Step 1 — pick a starting point */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WORKSPACE_INTAKE_TYPES.map((t) => {
            const m = INTAKE_META[t];
            const selected = t === type;
            return (
              <button
                key={t}
                type="button"
                onClick={() => selectType(t)}
                className={`rounded-lg border px-4 py-3 text-left transition-all ${
                  selected
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                <span className="block text-sm font-medium text-gray-900">
                  {m.label}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {m.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Step 2 — paste what you have */}
        {meta && (
          <div className="mt-8">
            <label className="mb-2 block text-sm font-medium text-gray-900">
              Paste what you have.
            </label>
            <p className="mb-2 text-xs text-gray-400">{meta.inputHint}</p>
            <textarea
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                resetPreviews();
              }}
              placeholder={meta.placeholder}
              rows={5}
              className="input w-full resize-none rounded-lg"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={createDraft}
                disabled={!rawInput.trim()}
                className="btn btn-primary btn-md"
              >
                Create intake draft
              </button>
              {type === "product_url" && (
                <button
                  type="button"
                  onClick={() => {
                    setRawInput(SAMPLE_PRODUCT_URL);
                    resetPreviews();
                  }}
                  className="btn btn-secondary btn-md"
                >
                  Use example URL
                </button>
              )}
              {type === "github_repo" && (
                <button
                  type="button"
                  onClick={() => {
                    setRawInput(SAMPLE_GITHUB_REPO);
                    resetPreviews();
                  }}
                  className="btn btn-secondary btn-md"
                >
                  Use example repo
                </button>
              )}
              {type === "ai_built_app" && (
                <button
                  type="button"
                  onClick={() => {
                    setRawInput(SAMPLE_AI_BUILT_APP);
                    resetPreviews();
                  }}
                  className="btn btn-secondary btn-md"
                >
                  Use example app
                </button>
              )}
              {type === "prd" && (
                <button
                  type="button"
                  onClick={() => {
                    setRawInput(SAMPLE_PRD);
                    resetPreviews();
                  }}
                  className="btn btn-secondary btn-md"
                >
                  Use example PRD
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — deterministic local preview */}
        {draft && (
          <div className="card mt-8 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Intake draft (preview)
            </p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">
              {draft.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{draft.sourceSummary}</p>

            <p className="mt-5 text-sm font-medium text-gray-900">
              Simsa will turn this into:
            </p>
            <ul className="mt-2 space-y-1">
              {draft.expectedOutputs.map((out) => (
                <li
                  key={out}
                  className="rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                >
                  {INTAKE_OUTPUT_LABELS[out]}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-gray-400">
              Preview only — staged analysis arrives in later stages.
            </p>
          </div>
        )}

        {/* Stage 102 — deterministic PRD / spec preview (prd type only) */}
        {prdPreview && (
          <div className="card mt-6 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              PRD / spec preview · confidence: {prdPreview.confidence}
            </p>

            <p className="mt-3 text-sm font-medium text-gray-900">
              Product intent
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {prdPreview.productIntent}
            </p>

            <p className="mt-4 text-sm font-medium text-gray-900">
              Likely users
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {prdPreview.likelyUsers.map((u) => (
                <span
                  key={u}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-600"
                >
                  {u}
                </span>
              ))}
            </div>

            <PrdList title="Candidate user flows" items={prdPreview.candidateUserFlows} />
            <PrdList
              title="Candidate acceptance items"
              items={prdPreview.candidateAcceptanceItems}
            />
            <PrdList title="Missing questions" items={prdPreview.missingQuestions} />

            <p className="mt-4 text-xs text-gray-400">
              Preview only — deterministic PRD parsing. Full staged analysis
              arrives in later stages.
            </p>
          </div>
        )}

        {/* Stage 103 — deterministic Product URL preview (product_url type only) */}
        {urlPreview && (
          <div className="card mt-6 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Product URL preview · confidence: {urlPreview.confidence}
            </p>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-400">Normalized URL</dt>
                <dd className="break-all text-sm text-gray-700">
                  {urlPreview.normalizedUrl || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Domain</dt>
                <dd className="text-sm text-gray-700">{urlPreview.domain}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Surface type</dt>
                <dd className="text-sm text-gray-700">{urlPreview.pathType}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Likely surface</dt>
                <dd className="text-sm text-gray-700">{urlPreview.likelySurface}</dd>
              </div>
            </dl>

            <PrdList title="Review focus areas" items={urlPreview.reviewFocusAreas} />
            <PrdList
              title="Candidate acceptance items"
              items={urlPreview.candidateAcceptanceItems}
            />
            <PrdList title="Missing questions" items={urlPreview.missingQuestions} />

            <p className="mt-4 text-xs text-gray-400">
              Preview only — no live crawl or external fetch.
            </p>
          </div>
        )}

        {/* Stage 104 — deterministic GitHub repo preview (github_repo type only) */}
        {repoPreview && (
          <div className="card mt-6 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              GitHub repo preview · confidence: {repoPreview.confidence}
            </p>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-400">Normalized repo</dt>
                <dd className="text-sm text-gray-700">{repoPreview.normalizedRepo}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Owner</dt>
                <dd className="text-sm text-gray-700">{repoPreview.owner}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Repository</dt>
                <dd className="text-sm text-gray-700">{repoPreview.repo}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Likely repo type</dt>
                <dd className="text-sm text-gray-700">{repoPreview.likelyRepoType}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-400">Repo URL</dt>
                <dd className="break-all text-sm text-gray-700">
                  {repoPreview.repoUrl || "—"}
                </dd>
              </div>
            </dl>

            <PrdList title="Review focus areas" items={repoPreview.reviewFocusAreas} />
            <PrdList
              title="Candidate acceptance items"
              items={repoPreview.candidateAcceptanceItems}
            />
            <PrdList title="Missing questions" items={repoPreview.missingQuestions} />

            <p className="mt-4 text-xs text-gray-400">
              Preview only — no GitHub API, clone, or remote file fetch.
            </p>
          </div>
        )}

        {/* Stage 105 — deterministic AI-built app recovery (ai_built_app only) */}
        {appPreview && (
          <div className="card mt-6 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Existing app recovery preview · confidence: {appPreview.confidence}
            </p>

            <p className="mt-3 text-sm font-medium text-gray-900">
              Current state summary
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {appPreview.currentStateSummary}
            </p>

            <p className="mt-4 text-sm font-medium text-gray-900">
              Likely product surface
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {appPreview.likelyProductSurface}
            </p>

            <p className="mt-4 text-sm font-medium text-gray-900">
              Recommended next action
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {appPreview.recommendedNextAction.replace(/_/g, " ")}
            </p>

            <PrdList title="Recovery focus areas" items={appPreview.recoveryFocusAreas} />
            <PrdList
              title="Candidate acceptance items"
              items={appPreview.candidateAcceptanceItems}
            />
            <PrdList title="Likely risks" items={appPreview.likelyRisks} />

            <p className="mt-4 text-sm font-medium text-gray-900">
              Fix vs rebuild signals
            </p>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FixRebuild title="Likely keep" items={appPreview.fixVsRebuildSignals.likelyKeep} />
              <FixRebuild title="Likely fix" items={appPreview.fixVsRebuildSignals.likelyFix} />
              <FixRebuild title="Likely rebuild" items={appPreview.fixVsRebuildSignals.likelyRebuild} />
              <FixRebuild
                title="Needs verification"
                items={appPreview.fixVsRebuildSignals.needsVerification}
              />
            </div>

            <PrdList title="Missing questions" items={appPreview.missingQuestions} />

            <p className="mt-4 text-xs text-gray-400">
              Preview only — no live inspection, repo scan, or external fetch.
            </p>
          </div>
        )}

        {/* Stage 106 — shared Acceptance Map (all intake types) */}
        {acceptanceMap && (
          <div className="card mt-6 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Acceptance Map · confidence: {acceptanceMap.confidence}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Simsa organizes your input into candidate acceptance areas,
              questions, and next steps.
            </p>

            <p className="mt-4 text-sm font-medium text-gray-900">Summary</p>
            <p className="mt-1 text-sm text-gray-600">{acceptanceMap.summary}</p>

            <p className="mt-4 text-sm font-medium text-gray-900">Areas</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {acceptanceMap.areas.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-600"
                >
                  {a.replace(/_/g, " ")}
                </span>
              ))}
            </div>

            <p className="mt-4 text-sm font-medium text-gray-900">
              Acceptance items
            </p>
            <ul className="mt-1 space-y-1">
              {acceptanceMap.items.map((it) => (
                <li
                  key={it.title}
                  className="rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                >
                  <span>{it.title}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    · {it.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>

            <PrdList title="Missing questions" items={acceptanceMap.missingQuestions} />

            <p className="mt-4 text-sm font-medium text-gray-900">
              Recommended next step
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {NEXT_STEP_LABELS[acceptanceMap.recommendedNextStep]}
            </p>

            <p className="mt-4 text-xs text-gray-400">
              Preview only — acceptance map is deterministic and not yet saved.
            </p>
          </div>
        )}

        {/* Stage 107 — shared Stage Plan (all intake types) */}
        {stagePlan && (
          <div className="card mt-6 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Stage Plan · confidence: {stagePlan.confidence}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Simsa turns the acceptance map into an ordered review workflow.
            </p>
            <p className="mt-3 text-sm text-gray-700">
              Recommended start: stage {stagePlan.recommendedStartStage}
            </p>

            <div className="mt-3 space-y-2">
              {stagePlan.stages.map((s) => (
                <div
                  key={s.number}
                  className={`rounded-lg border p-3 ${
                    s.number === stagePlan.recommendedStartStage
                      ? "border-brand-300 bg-brand-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      Stage {s.number}: {s.title}
                    </span>
                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                      {STAGE_KIND_LABELS[s.kind]}
                    </span>
                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                      {STAGE_STATUS_LABELS[s.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{s.goal}</p>
                  <StageDetail label="Candidate checks" items={s.candidateChecks} />
                  <StageDetail label="Evidence to collect" items={s.evidenceToCollect} />
                  <StageDetail label="Exit criteria" items={s.exitCriteria} />
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-900">
                {stagePlan.releaseGate.title}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-600">
                {stagePlan.releaseGate.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>

            <p className="mt-4 text-xs text-gray-400">
              Preview only — stage plan is deterministic and not yet saved.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StageDetail({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-gray-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function FixRebuild({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-sm text-gray-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrdList({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <p className="mt-4 text-sm font-medium text-gray-900">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
          >
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}
