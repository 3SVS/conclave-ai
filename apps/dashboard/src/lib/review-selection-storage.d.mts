/**
 * Type declarations for review-selection-storage.mjs (Stage 44).
 */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Versioned, per-(project, run) storage key. */
export function buildReviewSelectionStorageKey(args: {
  projectId: string;
  runId: string;
}): string;

/** Keep only valid, de-duplicated string itemIds (first-seen order). Non-array → []. */
export function normalizeStoredSelectedItemIds(args: {
  stored: unknown;
  validItemIds: string[];
}): string[];

/** null = nothing stored (→ recommended fallback); array (incl. []) = stored selection. */
export function readStoredReviewSelection(args: {
  storage: StorageLike;
  key: string;
  validItemIds: string[];
}): string[] | null;

/** Persist the selection; false on storage error. */
export function writeStoredReviewSelection(args: {
  storage: StorageLike;
  key: string;
  selectedItemIds: string[];
}): boolean;

/** Remove the stored selection; false on storage error. */
export function clearStoredReviewSelection(args: {
  storage: StorageLike;
  key: string;
}): boolean;
