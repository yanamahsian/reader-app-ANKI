import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function consumeRunAccess(sb: any, token: string, runId: string) {
  let query = sb.from("master_corpus_run_tokens").select("id,expires_at,remaining_calls");
  if (runId) query = query.eq("id", runId);
  else if (token) query = query.eq("token_hash", await sha256Hex(token));
  else return false;
  const { data: row } = await query.maybeSingle();
  if (!row || new Date(row.expires_at).getTime() <= Date.now() || row.remaining_calls <= 0) return false;
  const { data: changed } = await sb
    .from("master_corpus_run_tokens")
    .update({ remaining_calls: row.remaining_calls - 1, last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("remaining_calls", row.remaining_calls)
    .select("id")
    .maybeSingle();
  return Boolean(changed);
}

async function addWorkLanguage(sb: any, workId: string, language: string) {
  const { data: work } = await sb.from("works").select("available_languages").eq("id", workId).maybeSingle();
  const languages = new Set<string>((work?.available_languages ?? []).filter((v: unknown): v is string => typeof v === "string"));
  languages.add(language);
  await sb.from("works").update({ available_languages: Array.from(languages) }).eq("id", workId);
}

async function getAuditedRights(sb: any, candidate: any) {
  const { data, error } = await sb
    .from("catalog_rights_import_audit")
    .select("source_id,external_id,jurisdiction,rights_status,author_name,translator_name,translator_death_year,basis,evidence_url,audited_at")
    .eq("source_id", candidate.source_id)
    .eq("external_id", candidate.external_id)
    .eq("jurisdiction", "DE")
    .eq("rights_status", "public-domain")
    .maybeSingle();
  if (error) throw new Error(`rights audit lookup failed: ${error.message}`);
  return data ?? null;
}

async function persistAuditedRights(sb: any, editionId: string, audit: any) {
  if (!audit) return;

  const { data: existing, error: existingError } = await sb
    .from("rights_assertions")
    .select("id")
    .eq("edition_id", editionId)
    .eq("status", audit.rights_status)
    .eq("jurisdiction", audit.jurisdiction)
    .limit(1);
  if (existingError) throw new Error(`rights assertion lookup failed: ${existingError.message}`);
  if ((existing ?? []).length > 0) return;

  const { error } = await sb.from("rights_assertions").insert({
    edition_id: editionId,
    book_file_id: null,
    status: audit.rights_status,
    jurisdiction: audit.jurisdiction,
    license_uri: null,
    rights_metadata: {
      audit_source: "catalog_rights_import_audit",
      source_id: audit.source_id,
      external_id: audit.external_id,
      author_name: audit.author_name,
      translator_name: audit.translator_name,
      translator_death_year: audit.translator_death_year,
      basis: audit.basis,
      evidence_url: audit.evidence_url,
      audited_at: audit.audited_at
    }
  });
  if (error) throw new Error(`audited rights assertion insert failed: ${error.message}`);
}

function candidateRights(audit: any) {
  return audit
    ? { rights_status: audit.rights_status, jurisdiction: audit.jurisdiction }
    : { rights_status: "public-domain", jurisdiction: "US" };
}

async function finalizeStoredShortWork(sb: any, candidate: any, message: string, audit: any) {
  if (!message.startsWith("reader-tested check failed:")) return null;

  const editionId = `${candidate.work_id}-gutenberg-${candidate.external_id}`;
  const { data: edition } = await sb
    .from("editions")
    .select("id,work_id,language,ingestion_status")
    .eq("id", editionId)
    .maybeSingle();
  if (!edition || edition.work_id !== candidate.work_id || edition.ingestion_status !== "processing") return null;

  const { data: files } = await sb
    .from("book_files")
    .select("id,kind,format,byte_size,ingestion_status")
    .eq("edition_id", editionId);
  const sourceFile = (files ?? []).find((f: any) => f.kind === "source");
  const normalizedFile = (files ?? []).find((f: any) => f.kind === "normalized" && f.format === "anki-json");
  if (!sourceFile || !normalizedFile || Number(sourceFile.byte_size ?? 0) < 20000 || Number(normalizedFile.byte_size ?? 0) < 1000) return null;

  const { data: rights } = await sb
    .from("rights_assertions")
    .select("id,status,jurisdiction")
    .eq("edition_id", editionId);
  const hasPublicDomainUS = (rights ?? []).some((r: any) => r.status === "public-domain" && r.jurisdiction === "US");
  if (!hasPublicDomainUS) return null;

  await persistAuditedRights(sb, editionId, audit);

  await sb.from("editions").update({ ingestion_status: "ready" }).eq("id", editionId);
  await sb.from("book_files").update({ ingestion_status: "ready" }).eq("edition_id", editionId);
  await sb.from("ingestion_jobs").update({ status: "ready", last_error: null }).eq("source_id", "gutenberg").eq("external_id", candidate.external_id);
  await addWorkLanguage(sb, candidate.work_id, candidate.language);
  await sb.from("multilingual_candidates").update({
    status: "ready",
    edition_id: editionId,
    ...candidateRights(audit),
    last_error: null,
    processing_started_at: null,
    next_attempt_at: null,
    updated_at: new Date().toISOString()
  }).eq("id", candidate.id);

  const { data: readiness } = await sb.from("work_readiness").select("reader_ready,catalog_ready,missing_requirements").eq("work_id", candidate.work_id).maybeSingle();
  return {
    candidateId: candidate.id,
    status: "ready_short_work",
    workId: candidate.work_id,
    editionId,
    language: candidate.language,
    title: candidate.title,
    jurisdiction: audit?.jurisdiction ?? "US",
    readerReady: readiness?.reader_ready ?? null,
    catalogReady: readiness?.catalog_ready ?? null
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const token = req.headers.get("x-omnia-run-token") ?? url.searchParams.get("token") ?? "";
  const runId = url.searchParams.get("runId") ?? "";
  const authorId = url.searchParams.get("authorId") ?? "";
  const requestedLimit = Number(url.searchParams.get("limit") ?? "3");
  const limit = Math.max(1, Math.min(3, Number.isFinite(requestedLimit) ? requestedLimit : 3));
  if ((!token && !runId) || !authorId) return json({ error: "Missing run access or authorId" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing server secrets" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey);

  if (!(await consumeRunAccess(sb, token, runId))) return json({ error: "Invalid, expired, or exhausted run access" }, 401);

  await sb.from("multilingual_candidates").update({
    status: "failed",
    last_error: "Recovered stale processing claim",
    processing_started_at: null,
    next_attempt_at: null,
    updated_at: new Date().toISOString()
  }).eq("author_id", authorId).eq("source_id", "gutenberg").eq("status", "processing").lt("processing_started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const nowIso = new Date().toISOString();
  const { data: candidates, error: candidatesError } = await sb
    .from("multilingual_candidates")
    .select("id,work_id,author_id,source_id,external_id,language,title,status,attempts")
    .eq("author_id", authorId)
    .eq("source_id", "gutenberg")
    .in("status", ["discovered", "failed"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("discovered_at", { ascending: true })
    .limit(limit);
  if (candidatesError) return json({ error: candidatesError.message }, 500);

  const results: any[] = [];

  for (const candidate of candidates ?? []) {
    const started = new Date().toISOString();
    const attempts = Number(candidate.attempts ?? 0) + 1;
    const { data: claimed } = await sb.from("multilingual_candidates").update({
      status: "processing", attempts, processing_started_at: started,
      last_error: null, updated_at: started
    }).eq("id", candidate.id).in("status", ["discovered", "failed"]).select("id").maybeSingle();
    if (!claimed) continue;

    try {
      const audit = await getAuditedRights(sb, candidate);

      const { data: sameSourceEditions, error: existingError } = await sb
        .from("editions")
        .select("id,work_id,language,ingestion_status")
        .eq("source_id", "gutenberg")
        .eq("external_id", candidate.external_id);
      if (existingError) throw new Error(existingError.message);

      const conflicting = (sameSourceEditions ?? []).find((edition: any) => edition.work_id !== candidate.work_id);
      if (conflicting) {
        const message = `Gutenberg ${candidate.external_id} already belongs to work ${conflicting.work_id}; manual identity review required`;
        await sb.from("multilingual_candidates").update({ status: "review", last_error: message, processing_started_at: null, updated_at: new Date().toISOString() }).eq("id", candidate.id);
        results.push({ candidateId: candidate.id, status: "review", workId: candidate.work_id, externalId: candidate.external_id, error: message });
        continue;
      }

      const alreadyReady = (sameSourceEditions ?? []).find((edition: any) => edition.work_id === candidate.work_id && edition.ingestion_status === "ready");
      if (alreadyReady) {
        await persistAuditedRights(sb, alreadyReady.id, audit);
        await addWorkLanguage(sb, candidate.work_id, candidate.language);
        await sb.from("multilingual_candidates").update({
          status: "ready",
          edition_id: alreadyReady.id,
          ...candidateRights(audit),
          last_error: null,
          processing_started_at: null,
          next_attempt_at: null,
          updated_at: new Date().toISOString()
        }).eq("id", candidate.id);
        results.push({ candidateId: candidate.id, status: "already_ready", workId: candidate.work_id, editionId: alreadyReady.id, language: candidate.language, jurisdiction: audit?.jurisdiction ?? "US" });
        continue;
      }

      const ingestUrl = new URL(`${supabaseUrl}/functions/v1/omnia-ingest`);
      ingestUrl.searchParams.set("sourceId", "gutenberg");
      ingestUrl.searchParams.set("externalId", candidate.external_id);
      ingestUrl.searchParams.set("workId", candidate.work_id);
      const response = await fetch(ingestUrl.toString(), { headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}` } });
      const text = await response.text();
      let payload: any = null;
      try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 1000) }; }
      if (!response.ok || payload?.ok !== true || typeof payload?.editionId !== "string") {
        const message = payload?.error ?? `omnia-ingest HTTP ${response.status}`;
        const repaired = await finalizeStoredShortWork(sb, candidate, message, audit);
        if (repaired) {
          results.push(repaired);
          continue;
        }
        throw new Error(message);
      }

      const editionId = payload.editionId as string;
      await persistAuditedRights(sb, editionId, audit);
      await addWorkLanguage(sb, candidate.work_id, candidate.language);

      await sb.from("multilingual_candidates").update({
        status: "ready",
        edition_id: editionId,
        ...candidateRights(audit),
        last_error: null,
        processing_started_at: null,
        next_attempt_at: null,
        updated_at: new Date().toISOString()
      }).eq("id", candidate.id);

      const { data: readiness } = await sb.from("work_readiness").select("reader_ready,catalog_ready,missing_requirements").eq("work_id", candidate.work_id).maybeSingle();
      results.push({ candidateId: candidate.id, status: "ready", workId: candidate.work_id, editionId, language: candidate.language, title: candidate.title, jurisdiction: audit?.jurisdiction ?? "US", readerReady: readiness?.reader_ready ?? null, catalogReady: readiness?.catalog_ready ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sb.from("multilingual_candidates").update({
        status: attempts >= 3 ? "review" : "failed", last_error: message,
        processing_started_at: null, next_attempt_at: attempts >= 3 ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", candidate.id);
      results.push({ candidateId: candidate.id, status: attempts >= 3 ? "review" : "failed", workId: candidate.work_id, externalId: candidate.external_id, error: message });
    }
  }

  const { count: remaining } = await sb.from("multilingual_candidates").select("id", { count: "exact", head: true }).eq("author_id", authorId).eq("source_id", "gutenberg").in("status", ["discovered", "failed"]);
  return json({ ok: true, authorId, processed: results.length, remaining: remaining ?? 0, results });
});
