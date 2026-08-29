import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOURCE_ID = "internet-archive";
const MIN_TEXT = 20000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slug(value: string) {
  return normalize(value).replace(/\s+/g, "-").slice(0, 120);
}

function scalar(value: unknown): string {
  if (Array.isArray(value)) return value.map(x => String(x)).join(" ");
  return value == null ? "" : String(value);
}

function creatorMatches(rawCreator: unknown, expected: string) {
  const raw = normalize(scalar(rawCreator));
  const wanted = normalize(expected);
  if (!raw || !wanted) return false;
  const wantedTokens = wanted.split(" ").filter(Boolean);
  return wantedTokens.every(token => raw.includes(token));
}

function choosePlainTextFile(files: any[]): any | null {
  const candidates = files
    .filter(file => typeof file?.name === "string")
    .filter(file => /(?:_djvu\.txt|\.txt)$/i.test(file.name))
    .filter(file => !/searchtext|full text search|metadata/i.test(String(file?.format ?? "")))
    .map(file => ({ ...file, numericSize: Number(file?.size ?? 0) }))
    .filter(file => Number.isFinite(file.numericSize) && file.numericSize >= MIN_TEXT)
    .sort((a, b) => {
      const aPreferred = /_djvu\.txt$/i.test(a.name) ? 0 : 1;
      const bPreferred = /_djvu\.txt$/i.test(b.name) ? 0 : 1;
      return aPreferred - bPreferred || b.numericSize - a.numericSize;
    });
  return candidates[0] ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const token = req.headers.get("x-omnia-run-token") ?? url.searchParams.get("token") ?? "";
  const authorId = url.searchParams.get("authorId") ?? "";
  const externalId = url.searchParams.get("externalId") ?? "";
  if (!token || !authorId || !externalId) return json({ error: "Missing token, authorId, or externalId" }, 400);

  const base = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceRoleKey) return json({ error: "Missing server secrets" }, 500);
  const sb = createClient(base, serviceRoleKey);

  const tokenHash = await sha256Hex(token);
  const { data: runToken } = await sb.from("master_corpus_run_tokens")
    .select("id,expires_at,remaining_calls")
    .eq("token_hash", tokenHash).maybeSingle();
  if (!runToken || new Date(runToken.expires_at).getTime() <= Date.now() || runToken.remaining_calls <= 0) {
    return json({ error: "Invalid, expired, or exhausted token" }, 401);
  }
  await sb.from("master_corpus_run_tokens")
    .update({ remaining_calls: runToken.remaining_calls - 1, last_used_at: new Date().toISOString() })
    .eq("id", runToken.id).eq("remaining_calls", runToken.remaining_calls);

  const { data: master, error: masterError } = await sb.from("master_corpus_authors")
    .select("id,display_name,canonical_author_id,original_language,status")
    .eq("canonical_author_id", authorId).maybeSingle();
  if (masterError || !master) return json({ error: masterError?.message ?? "Master author missing" }, 404);
  if (!["ready-for-discovery", "ingesting"].includes(master.status)) return json({ error: "Author is not approved" }, 403);

  const { data: candidate, error: candidateError } = await sb.from("master_corpus_candidates")
    .select("id,title,language,status,work_id,edition_id,provider_metadata")
    .eq("master_author_id", master.id).eq("source_id", SOURCE_ID).eq("external_id", externalId).maybeSingle();
  if (candidateError || !candidate) return json({ error: candidateError?.message ?? "Candidate not found" }, 404);

  try {
    const { data: existingEdition, error: existingEditionError } = await sb.from("editions")
      .select("id,work_id,ingestion_status").eq("source_id", SOURCE_ID).eq("external_id", externalId).maybeSingle();
    if (existingEditionError) throw new Error(existingEditionError.message);
    if (existingEdition?.ingestion_status === "ready") {
      await sb.from("master_corpus_candidates").update({
        status: "ready", work_id: existingEdition.work_id, edition_id: existingEdition.id,
        last_error: null, processing_started_at: null, updated_at: new Date().toISOString()
      }).eq("id", candidate.id);
      return json({ ok: true, status: "already_ready", workId: existingEdition.work_id, editionId: existingEdition.id });
    }

    const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(externalId)}`, {
      headers: { "User-Agent": "ANKIReader/1.0 (public-domain literary ingestion; contact via project repository)" }
    });
    if (!metadataResponse.ok) throw new Error(`Internet Archive metadata HTTP ${metadataResponse.status}`);
    const item = await metadataResponse.json();
    const metadata = item?.metadata ?? {};
    const provider = candidate.provider_metadata ?? {};

    const expectedCreator = typeof provider.expectedCreator === "string" ? provider.expectedCreator : master.display_name;
    if (!creatorMatches(metadata.creator, expectedCreator)) {
      throw new Error(`Internet Archive creator mismatch: expected ${expectedCreator}; got ${scalar(metadata.creator)}`);
    }

    const metadataTitle = scalar(metadata.title);
    const expectedTitle = typeof provider.expectedTitle === "string" ? provider.expectedTitle : candidate.title;
    const titleA = normalize(metadataTitle);
    const titleB = normalize(expectedTitle);
    if (!titleA || !titleB || !(titleA.includes(titleB) || titleB.includes(titleA))) {
      throw new Error(`Internet Archive title mismatch: expected ${expectedTitle}; got ${metadataTitle}`);
    }

    const file = choosePlainTextFile(Array.isArray(item?.files) ? item.files : []);
    if (!file) throw new Error("Internet Archive item has no sufficiently large public plaintext OCR file");
    const fileUrl = `https://archive.org/download/${encodeURIComponent(externalId)}/${encodeURIComponent(file.name)}`;
    const textResponse = await fetch(fileUrl, {
      headers: { "User-Agent": "ANKIReader/1.0 (public-domain literary ingestion; contact via project repository)" }
    });
    if (!textResponse.ok) throw new Error(`Internet Archive text HTTP ${textResponse.status}`);
    const rawText = (await textResponse.text()).replace(/\r/g, "").replace(/\n{4,}/g, "\n\n\n").trim();
    if (rawText.length < MIN_TEXT) throw new Error(`Internet Archive OCR text too short (${rawText.length} chars)`);

    const { data: existingWorks, error: worksError } = await sb.from("works")
      .select("id,title,original_title").eq("author_id", authorId);
    if (worksError) throw new Error(worksError.message);
    const wantedTitle = normalize(candidate.title);
    const matches = (existingWorks ?? []).filter((work: any) =>
      [work.title, work.original_title].filter(Boolean).some((title: string) => normalize(title) === wantedTitle)
    );
    if (matches.length > 1) throw new Error("Multiple exact Work matches; review required");

    let workId: string;
    if (matches.length === 1) {
      workId = matches[0].id;
    } else {
      workId = `${slug(candidate.title)}-internet-archive`;
      const { error: workError } = await sb.from("works").insert({
        id: workId,
        title: candidate.title,
        original_title: candidate.title,
        alternative_titles: [],
        author_id: authorId,
        original_language: candidate.language ?? master.original_language ?? "de",
        available_languages: [candidate.language ?? master.original_language ?? "de"],
        publication_year: Number.isFinite(Number(metadata.date)) ? Number(metadata.date) : null,
        publication_status: "draft"
      });
      if (workError) throw new Error(`Work insert: ${workError.message}`);
    }

    const language = candidate.language ?? master.original_language ?? "de";
    const editionId = `${workId}-internet-archive-${slug(externalId)}`;
    const normalized = {
      formatVersion: 1,
      hasRealChapters: false,
      chapters: [{ title: null, text: rawText }]
    };
    const normalizedJson = JSON.stringify(normalized);
    const sourcePath = `sources/internet-archive/${slug(externalId)}/${slug(file.name)}`;
    const normalizedPath = `normalized/${editionId}/content.json`;

    const sourceUpload = await sb.storage.from("book-files").upload(sourcePath, rawText, {
      contentType: "text/plain; charset=utf-8", upsert: true
    });
    if (sourceUpload.error) throw new Error(`Source upload: ${sourceUpload.error.message}`);
    const normalizedUpload = await sb.storage.from("book-files").upload(normalizedPath, normalizedJson, {
      contentType: "application/json", upsert: true
    });
    if (normalizedUpload.error) throw new Error(`Normalized upload: ${normalizedUpload.error.message}`);

    const { error: editionError } = await sb.from("editions").upsert({
      id: editionId, work_id: workId, language, is_original: true, translator_name: null,
      source_id: SOURCE_ID, external_id: externalId, ingestion_status: "processing"
    }, { onConflict: "id" });
    if (editionError) throw new Error(`Edition upsert: ${editionError.message}`);

    await sb.from("rights_assertions").delete().eq("edition_id", editionId);
    await sb.from("book_files").delete().eq("edition_id", editionId);
    const { data: files, error: filesError } = await sb.from("book_files").insert([
      {
        edition_id: editionId, kind: "source", format: "plaintext", storage_path: sourcePath,
        byte_size: new TextEncoder().encode(rawText).byteLength, ingestion_status: "ready"
      },
      {
        edition_id: editionId, kind: "normalized", format: "anki-json", storage_path: normalizedPath,
        byte_size: new TextEncoder().encode(normalizedJson).byteLength, ingestion_status: "ready"
      }
    ]).select();
    if (filesError || !files) throw new Error(`Book files: ${filesError?.message ?? "unknown"}`);
    const normalizedFile = files.find((f: any) => f.kind === "normalized");

    const { error: rightsError } = await sb.from("rights_assertions").insert({
      edition_id: editionId,
      book_file_id: normalizedFile?.id ?? null,
      status: "unknown",
      jurisdiction: "DE",
      rights_metadata: {
        source: "internet-archive",
        item_identifier: externalId,
        item_url: `https://archive.org/details/${externalId}`,
        source_file: file.name,
        source_date: metadata.date ?? null,
        creator: metadata.creator ?? null,
        note: "Original-language OCR text only; no scan images imported. DE status is decided only by AN.KI deterministic rights backfill."
      }
    });
    if (rightsError) throw new Error(`Rights placeholder: ${rightsError.message}`);

    await sb.from("editions").update({ ingestion_status: "ready", updated_at: new Date().toISOString() }).eq("id", editionId);
    await sb.from("master_corpus_candidates").update({
      status: "ready", work_id: workId, edition_id: editionId, last_error: null,
      processing_started_at: null, updated_at: new Date().toISOString()
    }).eq("id", candidate.id);

    return json({ ok: true, status: "ingested", sourceId: SOURCE_ID, authorId, externalId,
      workId, editionId, sourceFile: file.name, textLength: rawText.length,
      rights: "unknown-DE-pending-existing-rights-engine" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sb.from("master_corpus_candidates").update({
      status: "failed", last_error: message, processing_started_at: null,
      next_attempt_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), updated_at: new Date().toISOString()
    }).eq("id", candidate.id);
    return json({ ok: false, status: "failed", authorId, externalId, error: message }, 500);
  }
});
