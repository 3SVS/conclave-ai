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
  github: {
    connectTitle: "Connect repository",
    connectIntro: "Connect this project to a code repository to review pull requests against your acceptance items.",
    connectGithub: "Connect GitHub",
    connectHint: "Connect your GitHub account to choose a repository for this project.",
    connectedAs: "Connected as",
    connected: "GitHub connected — now choose a repository.",
    selectRepo: "Select repository",
    changeRepo: "Change repository",
    connectedRepo: "Connected repository",
    searchPlaceholder: "Search by name or owner",
    noMatch: "No matching repositories.",
    publicReposCount: "public repositories",
    noReposListed: "No repositories to list.",
    manualTitle: "Enter a repository manually",
    manualHint: "If your organization repository does not appear in the list, enter it as owner/repo. Public repositories only.",
    manualPlaceholder: "e.g. owner/repo",
    connect: "Connect",
    finding: "Finding…",
    linkFailed: "Could not connect the repository. Please try again.",
    runReview: "Run PR review",
    reRunRemaining: "Re-run remaining issues",
    createFixInstructions: "Create fix instructions",
    viewHistory: "View review history",
    errorNotFound: "Repository not found. Check the name, and that it is public.",
    errorPrivate: "Private repositories are not supported in this beta. Enter a public repository.",
    errorNotConnected: "Connect your GitHub account first.",
    errorInvalidName: "Use the owner/repo format, e.g. 3SVS/My-first-product.",
    reposLoadError: "We could not load repositories. Reconnect GitHub or enter a repository manually.",
  },
  review: {
    resultsTitle: "Review results",
    basisNote: "Based on the changes in the connected PR — not the whole repository or a deployed service.",
  },
  history: {
    title: "Review history",
    desc: "Track how a PR changes across review runs.",
    comparisonDesc: "See whether the PR is moving closer to acceptance.",
    emptyTitle: "No review runs yet",
    emptyBody: "Run a PR review to start tracking acceptance over time.",
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
  github: {
    connectTitle: "저장소 연결",
    connectIntro: "이 프로젝트를 코드 저장소와 연결하면, 확인 항목 기준으로 Pull Request를 확인할 수 있어요.",
    connectGithub: "GitHub 연결",
    connectHint: "GitHub 계정을 연결하면 이 프로젝트에 쓸 저장소를 고를 수 있어요.",
    connectedAs: "연결 계정",
    connected: "GitHub가 연결됐어요 — 이제 저장소를 고르세요.",
    selectRepo: "저장소 선택",
    changeRepo: "저장소 변경",
    connectedRepo: "연결된 저장소",
    searchPlaceholder: "이름 또는 owner로 검색",
    noMatch: "일치하는 저장소가 없습니다.",
    publicReposCount: "개 공개 저장소",
    noReposListed: "목록에 표시할 저장소가 없어요.",
    manualTitle: "저장소 직접 입력",
    manualHint: "조직(org) 저장소가 목록에 없으면 owner/repo 형식으로 입력하세요. 공개 저장소만 됩니다.",
    manualPlaceholder: "예: owner/repo",
    connect: "연결",
    finding: "찾는 중…",
    linkFailed: "저장소 연결에 실패했어요. 다시 시도해주세요.",
    runReview: "PR 확인 실행",
    reRunRemaining: "남은 문제 다시 확인",
    createFixInstructions: "수정 지시서 만들기",
    viewHistory: "확인 기록 보기",
    errorNotFound: "저장소를 찾을 수 없어요. 이름이 맞는지, 공개 저장소인지 확인하세요.",
    errorPrivate: "비공개 저장소는 아직 지원하지 않아요. 공개 저장소를 입력하세요.",
    errorNotConnected: "먼저 GitHub 계정을 연결하세요.",
    errorInvalidName: "owner/repo 형식으로 입력하세요. 예: 3SVS/My-first-product.",
    reposLoadError: "저장소를 불러오지 못했어요. GitHub를 다시 연결하거나 저장소를 직접 입력하세요.",
  },
  review: {
    resultsTitle: "확인 결과",
    basisNote: "연결된 PR의 변경 내용 기준입니다 — 전체 저장소나 배포된 서비스 전체가 아니에요.",
  },
  history: {
    title: "확인 기록",
    desc: "PR이 확인을 거치며 어떻게 바뀌는지 추적해요.",
    comparisonDesc: "PR이 점점 합격에 가까워지는지 봅니다.",
    emptyTitle: "아직 확인 기록이 없어요",
    emptyBody: "PR 확인을 실행하면 시간에 따른 합격 추이를 추적할 수 있어요.",
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
