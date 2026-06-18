/**
 * Stage 59 — dictionary-first i18n for the dashboard.
 *
 * English is the default; Korean is a selectable locale. Pure data + helpers live
 * here (.mjs) so they are testable under Node 20 CI; React glue lives in
 * I18nProvider.tsx. Internal code enums (passed/failed/...) are unchanged — only the
 * user-facing copy layer is localized.
 */

export const LOCALES = ["en", "ko"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_STORAGE_KEY = "conclave:locale";

/** Coerce any untrusted value to a supported locale (default en). */
export function normalizeLocale(raw) {
  return LOCALES.includes(raw) ? raw : DEFAULT_LOCALE;
}

const EN = {
  brand: { wordmark: "Conclave", tagline: "Acceptance workspace for AI-built software" },
  lang: { label: "Language", english: "English", korean: "한국어" },
  nav: {
    overview: "Overview",
    idea: "Idea",
    spec: "Product brief",
    items: "Acceptance items",
    checks: "Review results",
    fixes: "Remaining issues",
    export: "Builder pack",
    settings: "Repository",
    github: "Pull requests",
    backToProjects: "Projects",
  },
  status: {
    passed: { label: "Passed", desc: "The PR appears to satisfy this item." },
    failed: { label: "Issue found", desc: "The PR appears to miss or break this item." },
    inconclusive: { label: "Not verified", desc: "Conclave could not confirm this from the available diff." },
    needs_decision: { label: "Needs decision", desc: "A product decision is needed before this can be judged." },
    not_started: { label: "Not started", desc: "" },
    building: { label: "Building", desc: "" },
  },
  comparison: {
    improved: "Improved",
    stillOpen: "Still open",
    newIssue: "New issue",
    unchanged: "Unchanged",
    caption: "Track whether the PR is moving closer to acceptance.",
  },
  projects: {
    homeTitle: "Projects",
    homeSubtitle: "Acceptance workspaces for your product ideas and pull requests.",
    newProject: "New project",
    emptyTitle: "No projects yet",
    emptyBody: "Create your first acceptance workspace from a product idea or a pull request.",
  },
  actions: {
    startProject: "Start a project",
    reviewPR: "Review a pull request",
    reRunReview: "Re-run review",
    createFixInstructions: "Create fix instructions",
    compareRuns: "Compare with previous run",
    postComment: "Post comment to PR",
    previewBeforePost: "Preview before posting to GitHub.",
  },
  fix: {
    title: "Fix instructions",
    subtitle: "Clear instructions you can hand to Claude Code, Codex, or a teammate.",
  },
  common: {
    loading: "Loading…",
    save: "Save",
    cancel: "Cancel",
    retry: "Try again",
    notFound: "Not found.",
    project: "Project",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    loadFailed: "Could not load. Please try again.",
  },
};

const KO = {
  brand: { wordmark: "Conclave", tagline: "AI가 만든 소프트웨어를 검수하는 작업공간" },
  lang: { label: "언어", english: "English", korean: "한국어" },
  nav: {
    overview: "개요",
    idea: "아이디어",
    spec: "제품 설명서",
    items: "확인 항목",
    checks: "확인 결과",
    fixes: "남은 문제",
    export: "빌더 팩",
    settings: "저장소",
    github: "Pull Request",
    backToProjects: "프로젝트",
  },
  status: {
    passed: { label: "통과", desc: "이 항목을 충족하는 것으로 보입니다." },
    failed: { label: "안 맞음", desc: "이 항목을 충족하지 못하거나 깨뜨린 것으로 보입니다." },
    inconclusive: { label: "확인 부족", desc: "현재 변경 내용만으로는 확인하기 어렵습니다." },
    needs_decision: { label: "결정 필요", desc: "판단하기 전에 제품 결정이 필요합니다." },
    not_started: { label: "시작 전", desc: "" },
    building: { label: "만드는 중", desc: "" },
  },
  comparison: {
    improved: "좋아진 항목",
    stillOpen: "아직 남은 항목",
    newIssue: "새로 생긴 문제",
    unchanged: "변화 없음",
    caption: "PR이 점점 합격에 가까워지는지 추적합니다.",
  },
  projects: {
    homeTitle: "프로젝트",
    homeSubtitle: "제품 아이디어와 Pull Request를 위한 검수 작업공간.",
    newProject: "새 프로젝트",
    emptyTitle: "아직 프로젝트가 없어요",
    emptyBody: "제품 아이디어나 Pull Request로 첫 검수 작업공간을 만들어 보세요.",
  },
  actions: {
    startProject: "프로젝트 시작",
    reviewPR: "Pull Request 확인",
    reRunReview: "다시 확인",
    createFixInstructions: "수정 지시서 만들기",
    compareRuns: "이전 확인과 비교",
    postComment: "PR에 코멘트 남기기",
    previewBeforePost: "GitHub에 게시하기 전에 미리 봅니다.",
  },
  fix: {
    title: "수정 지시서",
    subtitle: "Claude Code, Codex, 또는 동료에게 그대로 넘길 수 있는 수정 안내입니다.",
  },
  common: {
    loading: "불러오는 중…",
    save: "저장",
    cancel: "취소",
    retry: "다시 시도",
    notFound: "찾을 수 없습니다.",
    project: "프로젝트",
  },
  errors: {
    generic: "문제가 발생했어요. 다시 시도해주세요.",
    loadFailed: "불러오지 못했어요. 다시 시도해주세요.",
  },
};

export const DICTIONARIES = { en: EN, ko: KO };

/** Get the full dictionary for a locale (falls back to en). */
export function getDictionary(locale) {
  return DICTIONARIES[normalizeLocale(locale)];
}

/** User-facing status label for an internal status enum. */
export function statusLabel(dict, status) {
  return dict.status[status]?.label ?? status;
}

/** Optional one-line explanation for a status (empty string when none). */
export function statusDescription(dict, status) {
  return dict.status[status]?.desc ?? "";
}

/** Read the persisted locale from a StorageLike (default en). Never throws. */
export function readStoredLocale(storage) {
  try {
    return normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Persist the locale to a StorageLike. Never throws. */
export function writeStoredLocale(storage, locale) {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, normalizeLocale(locale));
  } catch {
    /* ignore */
  }
}
