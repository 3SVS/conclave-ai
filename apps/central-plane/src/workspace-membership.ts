/**
 * Stage 249 — Workspace membership types + validators (schema foundation, code-readiness).
 *
 * Pure constants/types/guards for the `0048_workspace_membership_foundation.sql` schema. NO
 * endpoint behaviour, NO DB access, NO auto-claim, NO userKey migration — just the role/status/
 * type vocabulary so later stages (membership endpoints, claim flow) share one source of truth.
 */

/** Membership roles. `owner` > `admin` > `member` > `viewer`. */
export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Membership status lifecycle. */
export const WORKSPACE_MEMBER_STATUSES = ["active", "invited", "removed"] as const;
export type WorkspaceMemberStatus = (typeof WORKSPACE_MEMBER_STATUSES)[number];

/** Workspace kind. A personal workspace is auto-implied per auth user; team is explicit. */
export const WORKSPACE_TYPES = ["personal", "team"] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

/** The default role assigned to a newly-invited member (until a richer policy exists). */
export const DEFAULT_INVITED_ROLE: WorkspaceRole = "member";

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceMemberStatus(value: unknown): value is WorkspaceMemberStatus {
  return typeof value === "string" && (WORKSPACE_MEMBER_STATUSES as readonly string[]).includes(value);
}

export function isWorkspaceType(value: unknown): value is WorkspaceType {
  return typeof value === "string" && (WORKSPACE_TYPES as readonly string[]).includes(value);
}

/**
 * Coarse role capability check (planning-level; not an authorization enforcement layer yet).
 * Returns true if `role` is at least as privileged as `minimum` in the owner>admin>member>viewer order.
 */
export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  const rank: Record<WorkspaceRole, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
  return rank[role] >= rank[minimum];
}
