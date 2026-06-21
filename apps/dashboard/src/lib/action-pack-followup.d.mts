// Type declarations for action-pack-followup.mjs (Stage 78).
import type {
  ActionPackFollowupStatus,
  SavedEvolutionActionPackListItem,
} from "./workspace-experiment-api";

export const FOLLOWUP_STATUSES: ActionPackFollowupStatus[];

export function followupStatusLabelKey(status: ActionPackFollowupStatus | string | null | undefined): string;

export type FollowupPayloadInput = {
  userKey: string;
  status: ActionPackFollowupStatus;
  pullRequestNumber?: number | null;
  reviewRunId?: string | null;
  benchmarkId?: string | null;
  note?: string | null;
};

export type FollowupPayload = {
  userKey: string;
  status: ActionPackFollowupStatus;
  pullRequestNumber?: number;
  reviewRunId?: string;
  benchmarkId?: string;
  note?: string;
};

export function buildFollowupPayload(input: FollowupPayloadInput): FollowupPayload;

export type MappedListItemFollowup = {
  status: ActionPackFollowupStatus;
  labelKey: string;
  pullRequestNumber?: number;
  reviewRunId?: string;
  benchmarkId?: string;
  followedAt?: string;
};

export function mapListItemFollowup(
  item: SavedEvolutionActionPackListItem | null | undefined,
): MappedListItemFollowup;
