export const LADDER_PLANS: ReadonlySet<string> = new Set(["library", "atlas", "academy"]);

export type CatalogScopeRequest = "normal" | "aestesis" | null;

export function parseCatalogScopeParam(raw: string | null): CatalogScopeRequest {
  if (raw === "aestesis") return "aestesis";
  if (raw === "normal") return "normal";
  return null;
}

const AESTESIS_SCOPE_ERROR_CODE = "aestesis_scope_requires_entitlement" as const;
export { AESTESIS_SCOPE_ERROR_CODE };

export type DiscoveryScopeResult =
  | { ok: true; freeOnly: boolean; aestesisOnly: boolean }
  | { ok: false; errorCode: typeof AESTESIS_SCOPE_ERROR_CODE };

export function resolveDiscoveryCatalogScope(
  plan: string,
  hasAestesis: boolean,
  requestedScope: CatalogScopeRequest
): DiscoveryScopeResult {
  if (requestedScope === "aestesis") {
    if (!hasAestesis) return { ok: false, errorCode: AESTESIS_SCOPE_ERROR_CODE };
    return { ok: true, freeOnly: false, aestesisOnly: true };
  }
  if (LADDER_PLANS.has(plan)) return { ok: true, freeOnly: false, aestesisOnly: false };
  if (hasAestesis) return { ok: true, freeOnly: false, aestesisOnly: true };
  return { ok: true, freeOnly: true, aestesisOnly: false };
}

export type ContentAccessMode = "full" | "aestesis" | "free";

export type ContentAccessScopeResult =
  | { ok: true; mode: ContentAccessMode }
  | { ok: false; errorCode: typeof AESTESIS_SCOPE_ERROR_CODE };

export function resolveContentAccessScope(
  plan: string,
  hasAestesis: boolean,
  requestedScope: CatalogScopeRequest
): ContentAccessScopeResult {
  if (requestedScope === "aestesis") {
    if (!hasAestesis) return { ok: false, errorCode: AESTESIS_SCOPE_ERROR_CODE };
    return { ok: true, mode: "aestesis" };
  }
  if (LADDER_PLANS.has(plan)) return { ok: true, mode: "full" };
  if (hasAestesis) return { ok: true, mode: "aestesis" };
  return { ok: true, mode: "free" };
}
