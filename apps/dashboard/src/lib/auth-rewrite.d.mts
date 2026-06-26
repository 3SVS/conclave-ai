export const DEFAULT_CENTRAL_PLANE_AUTH_ORIGIN: string;
export function resolveCentralPlaneAuthOrigin(
  env: Record<string, string | undefined> | undefined,
): string;
export function buildAuthRewrites(
  origin: string,
): { source: string; destination: string }[];
