// Stage 75: pure mappers from scorecard codes to i18n keys (in the `outcome`
// namespace). Keeps the server's code↔label contract testable and the UI thin.

export function gradeLabelKey(grade) {
  return {
    strong: "gradeStrong",
    promising: "gradePromising",
    needs_work: "gradeNeedsWork",
    inconclusive: "gradeInconclusive",
  }[grade] ?? "gradeInconclusive";
}

export function actionLabelKey(action) {
  return {
    accept: "actionAccept",
    fix_selected: "actionFixSelected",
    rerun_experiment: "actionRerun",
    clarify_acceptance_items: "actionClarify",
    create_benchmark: "actionCreateBenchmark",
  }[action] ?? "actionAccept";
}

export function reasonLabelKey(code) {
  return {
    selected_candidate_has_remaining_blockers: "reasonBlockers",
    acceptance_set_misaligned: "reasonMisaligned",
    high_not_verified_count: "reasonNotVerified",
    strong_acceptance_result: "reasonStrong",
    missing_benchmark: "reasonNoBenchmark",
    missing_selected_candidate: "reasonNoSelected",
  }[code] ?? code;
}
