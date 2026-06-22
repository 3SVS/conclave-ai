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

export default function IntakePage() {
  const [type, setType] = useState<WorkspaceIntakeType | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [draft, setDraft] = useState<WorkspaceIntakeDraft | null>(null);

  const meta = type ? INTAKE_META[type] : null;

  function selectType(next: WorkspaceIntakeType) {
    setType(next);
    setRawInput("");
    setDraft(null);
  }

  function createDraft() {
    if (!type || !rawInput.trim()) return;
    setDraft(buildIntakeDraft(type, rawInput));
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
                setDraft(null);
              }}
              placeholder={meta.placeholder}
              rows={5}
              className="input w-full resize-none rounded-lg"
            />
            <button
              type="button"
              onClick={createDraft}
              disabled={!rawInput.trim()}
              className="btn btn-primary btn-md mt-3"
            >
              Create intake draft
            </button>
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
      </div>
    </div>
  );
}
