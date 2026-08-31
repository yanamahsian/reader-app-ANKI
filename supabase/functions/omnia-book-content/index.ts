import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// omnia-book-content — rights/jurisdiction + Free/Library catalog boundary.
// Public endpoint by design; identity is optional and resolved inside the
// function. Rights/jurisdiction always outrank subscription access.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization"
};

const PAID_PLANS = new Set(["library", "atlas", "academy"]);

interface RightsAssertionRow {
  status: string;
  jurisdiction: string | null;
  license_uri: string | null;
}

function isAccessAllowed(rows: RightsAssertionRow[], jurisdiction: string): boolean {
  return rows.some(r =>
    (r.status === "public-domain" || r.status === "open-license") &&
    r.jurisdiction !== null &&
    r.jurisdiction === jurisdiction
  );
}

function jsonError(message: string, status: number, code: string) {
  return new Response(JSON.stringify({ ok: false, error: message, code }, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonError("Method not allowed -- use GET with ?editionId=&jurisdiction=", 405, "method_not_allowed");

  const url = new URL(req.url);
  const editionId = url.searchParams.get("editionId");
  if (!editionId) return jsonError("Missing editionId parameter", 400, "missing_edition_id");

  const jurisdiction = (url.searchParams.get("jurisdiction") ?? "").trim();
  if (!jurisdiction) return jsonError("Missing required jurisdiction parameter", 400, "missing_jurisdiction");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in function environment", 500, "server_misconfigured");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let effectivePlan = "free";
  if (req.headers.has("Authorization")) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonError("Invalid or expired session", 401, "unauthorized");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonError("Invalid or expired session", 401, "unauthorized");
    }

    const { data: planData, error: planError } = await supabase.rpc("effective_plan_for_user", {
      p_user_id: userData.user.id
    });
    if (planError) {
      console.error(`omnia-book-content: effective_plan_for_user failed for user ${userData.user.id}`, planError);
      return jsonError("Failed to resolve subscription plan", 500, "plan_lookup_failed");
    }
    effectivePlan = typeof planData === "string" && planData ? planData : "free";
  }

  const { data: edition, error: editionError } = await supabase
    .from("editions")
    .select("id,work_id,ingestion_status")
    .eq("id", editionId)
    .maybeSingle();
  if (editionError) {
    console.error(`omnia-book-content: editions query failed for ${editionId}`, editionError);
    return jsonError("Failed to look up edition", 500, "lookup_failed");
  }
  if (!edition) return jsonError("Edition not found", 404, "edition_not_found");
  if (edition.ingestion_status !== "ready") {
    return jsonError(`Edition is not ready (status: ${edition.ingestion_status})`, 403, "edition_not_ready");
  }

  const { data: bookFile, error: bookFileError } = await supabase
    .from("book_files")
    .select("id,storage_path,ingestion_status")
    .eq("edition_id", editionId)
    .eq("kind", "normalized")
    .eq("format", "anki-json")
    .eq("ingestion_status", "ready")
    .maybeSingle();
  if (bookFileError) {
    console.error(`omnia-book-content: book_files query failed for ${editionId}`, bookFileError);
    return jsonError("Failed to look up normalized content file", 500, "lookup_failed");
  }
  if (!bookFile) return jsonError("No ready normalized (anki-json) file for this edition", 404, "content_not_found");

  const { data: rightsAssertions, error: rightsError } = await supabase
    .from("rights_assertions")
    .select("status,jurisdiction,license_uri")
    .eq("edition_id", editionId);
  if (rightsError) {
    console.error(`omnia-book-content: rights_assertions query failed for ${editionId}`, rightsError);
    return jsonError("Failed to look up rights for this edition", 500, "lookup_failed");
  }
  if (!isAccessAllowed((rightsAssertions ?? []) as RightsAssertionRow[], jurisdiction)) {
    return jsonError(`This edition's rights do not permit reading it in jurisdiction "${jurisdiction}"`, 403, "rights_not_permitted");
  }

  if (!PAID_PLANS.has(effectivePlan)) {
    const { data: freeEntry, error: freeError } = await supabase
      .from("free_catalog_works")
      .select("work_id")
      .eq("work_id", edition.work_id)
      .eq("enabled", true)
      .maybeSingle();
    if (freeError) {
      console.error(`omnia-book-content: free_catalog_works query failed for work ${edition.work_id}`, freeError);
      return jsonError("Failed to look up Free catalog membership", 500, "lookup_failed");
    }
    if (!freeEntry) {
      return jsonError("This book is part of the full Library catalog -- a Library, Atlas, or Academy plan is required to read it", 403, "catalog_plan_required");
    }
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("book-files")
    .download(bookFile.storage_path);
  if (downloadError || !fileBlob) {
    console.error(`omnia-book-content: storage download failed for ${bookFile.storage_path}`, downloadError);
    return jsonError("Failed to read normalized content from storage", 500, "storage_error");
  }

  return new Response(fileBlob, {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
});
