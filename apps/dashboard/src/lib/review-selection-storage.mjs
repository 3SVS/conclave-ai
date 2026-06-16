/**
 * lib/review-selection-storage.mjs
 *
 * Stage 44: client-side persistence of the run-detail item selection.
 *
 * Plain ESM (.mjs) + .d.mts so `node --test` runs on the Node 20 CI floor
 * (which can't type-strip .ts). Pure + storage-injected for easy testing.
 *
 * Key contract: a stored `[]` is an INTENTIONAL empty selection (user cleared
 * everything) and is distinct from `null` (nothing stored → recommended fallback).
 *
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }} StorageLike
 */

const STORAGE_VERSION = "v1";

/** Versioned, per-(project, run) storage key. Bump the version to migrate/ignore old shapes. */
export function buildReviewSelectionStorageKey({ projectId, runId }) {
  return `conclave:review-selection:${STORAGE_VERSION}:${projectId}:${runId}`;
}

/**
 * Clean a parsed stored value: keep only strings that are still valid itemIds,
 * de-duplicated, preserving first-seen order. Non-array → [].
 */
export function normalizeStoredSelectedItemIds({ stored, validItemIds }) {
  if (!Array.isArray(stored)) return [];
  const valid = new Set(validItemIds);
  const seen = new Set();
  const out = [];
  for (const entry of stored) {
    if (typeof entry !== "string") continue;
    if (!valid.has(entry)) continue; // drop stale itemIds no longer in the run
    if (seen.has(entry)) continue; // dedup
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/**
 * Read + normalize the stored selection.
 * Returns `null` when nothing is stored / value is unreadable (→ recommended fallback);
 * returns an array (possibly `[]`) when a valid selection is stored.
 */
export function readStoredReviewSelection({ storage, key, validItemIds }) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw == null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // invalid JSON → treat as nothing stored
  }
  if (!Array.isArray(parsed)) return null;
  return normalizeStoredSelectedItemIds({ stored: parsed, validItemIds });
}

/** Persist the selection. Returns false on any storage error (quota, private mode, …). */
export function writeStoredReviewSelection({ storage, key, selectedItemIds }) {
  try {
    storage.setItem(key, JSON.stringify([...selectedItemIds]));
    return true;
  } catch {
    return false;
  }
}

/** Remove the stored selection. Returns false on storage error. */
export function clearStoredReviewSelection({ storage, key }) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
