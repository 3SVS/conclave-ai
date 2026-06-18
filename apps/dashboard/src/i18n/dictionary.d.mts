/**
 * Type declarations for dictionary.mjs (Stage 59 i18n).
 */
export type Locale = "en" | "ko";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type StatusKey =
  | "passed"
  | "failed"
  | "inconclusive"
  | "needs_decision"
  | "not_started"
  | "building";

export type StatusEntry = { label: string; desc: string };

export type Dictionary = {
  brand: { wordmark: string; tagline: string };
  lang: { label: string; english: string; korean: string };
  nav: {
    overview: string;
    idea: string;
    spec: string;
    items: string;
    checks: string;
    fixes: string;
    export: string;
    settings: string;
    github: string;
    backToProjects: string;
  };
  status: Record<StatusKey, StatusEntry>;
  comparison: {
    improved: string;
    stillOpen: string;
    newIssue: string;
    unchanged: string;
    caption: string;
  };
  projects: {
    homeTitle: string;
    homeSubtitle: string;
    newProject: string;
    emptyTitle: string;
    emptyBody: string;
  };
  actions: {
    startProject: string;
    reviewPR: string;
    reRunReview: string;
    createFixInstructions: string;
    compareRuns: string;
    postComment: string;
    previewBeforePost: string;
  };
  fix: { title: string; subtitle: string };
  common: {
    loading: string;
    save: string;
    cancel: string;
    retry: string;
    notFound: string;
    project: string;
  };
  errors: { generic: string; loadFailed: string };
};

export const LOCALES: Locale[];
export const DEFAULT_LOCALE: Locale;
export const LOCALE_STORAGE_KEY: string;
export const DICTIONARIES: Record<Locale, Dictionary>;

export function normalizeLocale(raw: unknown): Locale;
export function getDictionary(locale: unknown): Dictionary;
export function statusLabel(dict: Dictionary, status: string): string;
export function statusDescription(dict: Dictionary, status: string): string;
export function readStoredLocale(storage: StorageLike | null | undefined): Locale;
export function writeStoredLocale(storage: StorageLike | null | undefined, locale: Locale): void;
