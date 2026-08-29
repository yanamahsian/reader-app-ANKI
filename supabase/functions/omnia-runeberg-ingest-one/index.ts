import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOURCE_ID = "runeberg";
const MIN_TEXT = 20000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function cleanMarkup(value: string) {
  return decodeEntities(value)
    .replace(/<tab\s*\/?\s*>/gi, "\t")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRuneberg(raw: string) {
  const chapters: Array<{ title: string | null; text: string }> = [];
  const re = /<chapter\s+name="([^"]*)"\s*>([\s\S]*?)<\/chapter>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const title = decodeEntities(match[1]).trim() || null;
    const text = cleanMarkup(match[2]);
    if (text.length >= 40) chapters.push({ title, text });
  }
  if (!chapters.length) {
    const text = cleanMarkup(raw);
    if (text) chapters.push({ title: null, text });
  }
  const textLength = chapters.reduce((sum, chapter) => sum + chapter.text.length, 0);
  const sourceText = chapters
    .map(chapter => `${chapter.title ? `${chapter.title}\n\n` : ""}${chapter.text}`)
    .join("\n\n")
    .trim();
  return { chapters, textLength, sourceText };
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
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
  const { data: runToken } = await sb
    .from("master_corpus_run_tokens")
    .select("id,expires_at,remaining_calls")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!runToken || new Date(runToken.expires_at).getTime() <= Date.now() || runToken.remaining_calls <= 0) {
    return json({ error: "Invalid, expired, or exhausted token" }, 401);
  }
  await sb
    .from("master_corpus_run_tokens")
    .update({ remaining_calls: runToken.remaining_calls - 1, last_used_at: new Date().toISOString() })
    .eq("id", runToken.id)
    .eq("remaining_calls", runToken.remaining_calls);

  const { data: master, error: masterError } = await sb
    .from("master_corpus_authors")
    .select("id,display_name,canonical_author_id,original_language,status")
    .eq("canonical_author_id", authorId)
    .maybeSingle();
  if (masterError || !master) return json({ error: masterError?.message ?? "Master author missing" }, 404);
  if (!["ready-for-discovery", "ingesting"].includes(master.status)) return json({ error: "Author is not approved" }, 403);

  const { data: candidate, error: candidateError } = await sb
    .from("master_corpus_candidates")
    .select("id,title,language,status,work_id,edition_id,provider_metadata")
    .eq("master_author_id", master.id)
    .eq("source_id", SOURCE_ID)
    .eq("external_id", externalId)
    .maybeSingle();
  if (candidateError || !candidate) return json({ error: candidateError?.message ?? "Candidate not found" }, 404);

  try {
    const { data: existingEdition, error: existingEditionError } = await sb
      .from("editions")
      .select("id,work_id,ingestion_status")
      .eq("source_id", SOURCE_ID)
      .eq("external_id", externalId)
      .maybeSingle();
    if (existingEditionError) throw new Error(existingEditionError.message);
    if (existingEdition?.ingestion_status === "ready") {
      await sb.from("master_corpus_candidates").update({
        status: "ready",
        work_id: existingEdition.work_id,
        edition_id: existingEdition.id,
        last_error: null,
        processing_started_at: null,
        updated_at: new Date().toISOString()
      }).eq("id", candidate.id);
      return json({ ok: true, status: "already_ready", workId: existingEdition.work_id, editionId: existingEdition.id });
    }

    const meta = candidate.provider_metadata ?? {};
    const downloadUrl = typeof meta.ocrTextUrl === "string"
      ? meta.ocrTextUrl
      : `https://runeberg.org/download.pl?mode=ocrtext&work=${encodeURIComponent(externalId)}`;

    const response = await fetch(downloadUrl, {
      headers: { "User-Agent": "ANKIReader/1.0 (public-domain literary ingestion; contact via project repository)" }
    });
    if (!response.ok) throw new Error(`Project Runeberg HTTP ${response.status}`);
    const raw = await response.text();
    const book = parseRuneberg(raw);
    if (book.textLength < MIN_TEXT) throw new Error(`Project Runeberg text too short (${book.textLength} chars)`);

    const { data: existingWorks, error: worksError } = await sb
      .from("works")
      .select("id,title,original_title")
      .eq("author_id", authorId);
    if (worksError) throw new Error(worksError.message);

    const target = candidate.title.trim().toLocaleLowerCase("sv");
    const matches = (existingWorks ?? []).filter((w: any) =>
      [w.title, w.original_title].filter(Boolean).some((t: string) => t.trim().toLocaleLowerCase("sv") === target)
    );
    if (matches.length > 1) throw new Error("Multiple exact Work matches; review required");

    let workId: string;
    if (matches.length === 1) {
      workId = matches[0].id;
    } else {
      workId = `${slug(candidate.title)}-runeberg`;
      const { error: workError } = await sb.from("works").insert({
        id: workId,
        title: candidate.title,
        original_title: candidate.title,
        alternative_titles: [],
        author_id: authorId,
        original_language: candidate.language ?? master.original_language ?? "sv",
        available_languages: [candidate.language ?? master.original_language ?? "sv"],
        publication_year: typeof meta.sourcePublicationYear === "number" ? meta.sourcePublicationYear : null,
        publication_status: "draft"
      });
      if (workError) throw new Error(`Work insert: ${workError.message}`);
    }

    const language = candidate.language ?? master.original_language ?? "sv";
    const editionId = `${workId}-runeberg-${slug(externalId)}`;
    const normalized = { formatVersion: 1, hasRealChapters: book.chapters.length > 1, chapters: book.chapters };
    const normalizedJson = JSON.stringify(normalized);
    const sourcePath = `sources/runeberg/${slug(externalId)}/original.txt`;
    const normalizedPath = `normalized/${editionId}/content.json`;

    const sourceUpload = await sb.storage.from("book-files").upload(sourcePath, book.sourceText, {
      contentType: "text/plain; charset=utf-8",
      upsert: true
    });
    if (sourceUpload.error) throw new Error(`Source upload: ${sourceUpload.error.message}`);
    const normalizedUpload = await sb.storage.from("book-files").upload(normalizedPath, normalizedJson, {
      contentType: "application/json",
      upsert: true
    });
    if (normalizedUpload.error) throw new Error(`Normalized upload: ${normalizedUpload.error.message}`);

    const { error: editionError } = await sb.from("editions").upsert({
      id: editionId,
      work_id: workId,
      language,
      is_original: true,
      translator_name: null,
      source_id: SOURCE_ID,
      external_id: externalId,
      ingestion_status: "processing"
    }, { onConflict: "id" });
    if (editionError) throw new Error(`Edition upsert: ${editionError.message}`);

    await sb.from("rights_assertions").delete().eq("edition_id", editionId);
    await sb.from("book_files").delete().eq("edition_id", editionId);

    const { data: files, error: filesError } = await sb.from("book_files").insert([
      {
        edition_id: editionId,
        kind: "source",
        format: "plaintext",
        storage_path: sourcePath,
        byte_size: new TextEncoder().encode(book.sourceText).byteLength,
        ingestion_status: "ready"
      },
      {
        edition_id: editionId,
        kind: "normalized",
        format: "anki-json",
        storage_path: normalizedPath,
        byte_size: new TextEncoder().encode(normalizedJson).byteLength,
        ingestion_status: "ready"
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
        source: "project-runeberg",
        source_url: typeof meta.sourcePageUrl === "string" ? meta.sourcePageUrl : null,
        note: "Rights remain subject to AN.KI jurisdiction-aware deterministic backfill; source artwork is not ingested."
      }
    });
    if (rightsError) throw new Error(`Rights placeholder: ${rightsError.message}`);

    await sb.from("editions").update({ ingestion_status: "ready", updated_at: new Date().toISOString() }).eq("id", editionId);
    await sb.from("master_corpus_candidates").update({
      status: "ready",
      work_id: workId,
      edition_id: editionId,
      last_error: null,
      processing_started_at: null,
      updated_at: new Date().toISOString()
    }).eq("id", candidate.id);

    return json({
      ok: true,
      status: "ingested",
      sourceId: SOURCE_ID,
      authorId,
      externalId,
      workId,
      editionId,
      chapters: book.chapters.length,
      textLength: book.textLength,
      rights: "unknown-DE-pending-existing-rights-engine"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sb.from("master_corpus_candidates").update({
      status: "failed",
      last_error: message,
      processing_started_at: null,
      next_attempt_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", candidate.id);
    return json({ ok: false, status: "failed", authorId, externalId, error: message }, 500);
  }
});
