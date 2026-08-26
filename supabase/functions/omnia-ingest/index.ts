import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GUTENDEX_BASE_URL = "https://gutendex.com/books";
const GUTENBERG_ALLOWED_HOSTNAMES = new Set(["www.gutenberg.org", "gutenberg.org"]);
const GUTENBERG_ALLOWED_PATH_PREFIXES = ["/ebooks/", "/cache/epub/", "/files/"];
const MAX_REDIRECTS = 5;
const MIN_REASONABLE_TEXT_LENGTH = 20000;
const APPROXIMATE_PAGE_SIZE = 6500;

interface GutendexBook {
  id: number;
  title: string;
  authors: Array<{ name: string }>;
  translators: Array<{ name: string }>;
  languages: string[];
  formats: Record<string, string>;
}

interface DetectedChapter {
  title: string;
  text: string;
}

function isAllowedGutenbergHostAndPath(url: URL): boolean {
  if (!GUTENBERG_ALLOWED_HOSTNAMES.has(url.hostname)) return false;
  return GUTENBERG_ALLOWED_PATH_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
}

function isAllowedGutenbergUrl(url: URL): boolean {
  return url.protocol === "https:" && isAllowedGutenbergHostAndPath(url);
}

async function fetchGutenbergFile(startUrl: string): Promise<Response> {
  let current = new URL(startUrl);
  if (!isAllowedGutenbergUrl(current)) {
    throw new Error(`URL not on the Gutenberg allowlist: ${current.toString()}`);
  }

  for (let hop = 0; ; hop++) {
    if (hop > MAX_REDIRECTS) throw new Error("Too many redirects while fetching source file");

    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: { "User-Agent": "ANKI/1.0 Gutenberg ingestion" }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response had no Location header");
      let next = new URL(location, current);
      if (next.protocol === "http:" && isAllowedGutenbergHostAndPath(next)) {
        next = new URL(next.toString().replace(/^http:/, "https:"));
      }
      if (!isAllowedGutenbergUrl(next)) {
        throw new Error(`Redirect left the allowed Gutenberg host/path list: ${next.toString()}`);
      }
      current = next;
      continue;
    }

    return response;
  }
}

function pickPlaintextEntry(formats: Record<string, string>): [string, string] | null {
  const entries = Object.entries(formats ?? {}).filter(([mime, url]) =>
    mime.toLowerCase().startsWith("text/plain") && typeof url === "string" && url.length > 0
  );
  if (!entries.length) return null;

  const isReadme = (url: string) => /readme/i.test(url);
  return entries.find(([mime, url]) => /charset\s*=\s*utf-8/i.test(mime) && !isReadme(url))
    ?? entries.find(([, url]) => !isReadme(url))
    ?? entries[0];
}

function normalize(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е").trim().replace(/\s+/g, " ");
}

function normalizeBookText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CHAPTER_HEADING_PATTERN = /^(chapter|letter|book|part)\s+([ivxlcdm]+|\d+)\b/i;
const MIN_CONFIDENT_CHAPTERS = 3;

function detectChapters(text: string): DetectedChapter[] | null {
  const lines = text.split("\n");
  const headingLineIndices: number[] = [];
  lines.forEach((line, index) => {
    if (CHAPTER_HEADING_PATTERN.test(line.trim())) headingLineIndices.push(index);
  });
  if (headingLineIndices.length < MIN_CONFIDENT_CHAPTERS) return null;

  const chapters: DetectedChapter[] = [];
  for (let i = 0; i < headingLineIndices.length; i++) {
    const startLine = headingLineIndices[i];
    const endLine = i + 1 < headingLineIndices.length ? headingLineIndices[i + 1] : lines.length;
    const title = lines[startLine].trim();
    const body = lines.slice(startLine + 1, endLine).join("\n").trim();
    if (body.length > 0) chapters.push({ title, text: body });
  }
  return chapters.length >= MIN_CONFIDENT_CHAPTERS ? chapters : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed -- use GET with ?sourceId=&externalId=", { status: 405 });
  }

  const url = new URL(req.url);
  const sourceId = url.searchParams.get("sourceId");
  const externalId = url.searchParams.get("externalId");
  const providedWorkId = url.searchParams.get("workId");

  if (sourceId !== "gutenberg" || !externalId) {
    return new Response('Only sourceId="gutenberg" is supported right now. Usage: ?sourceId=gutenberg&externalId=1342', { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in function environment", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existingJob } = await supabase
    .from("ingestion_jobs")
    .select("*")
    .eq("source_id", sourceId)
    .eq("external_id", externalId)
    .maybeSingle();

  let jobId: string;
  if (existingJob) {
    jobId = existingJob.id;
    await supabase.from("ingestion_jobs")
      .update({ status: "discovered", attempts: Number(existingJob.attempts ?? 0) + 1, last_error: null })
      .eq("id", jobId);
  } else {
    const { data: inserted, error } = await supabase
      .from("ingestion_jobs")
      .insert({ source_id: sourceId, external_id: externalId, status: "discovered" })
      .select()
      .single();
    if (error || !inserted) return new Response(`Failed to create ingestion job: ${error?.message}`, { status: 500 });
    jobId = inserted.id;
  }

  async function fail(message: string, error?: unknown): Promise<Response> {
    console.error(`ingestion_job ${jobId} failed: ${message}`, error);
    await supabase.from("ingestion_jobs").update({ status: "failed", last_error: message }).eq("id", jobId);
    return new Response(JSON.stringify({ ok: false, jobId, error: message }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let gutendexRecord: GutendexBook;
  try {
    const metaResponse = await fetch(`${GUTENDEX_BASE_URL}/${externalId}`, {
      headers: { "User-Agent": "ANKI/1.0 Gutenberg ingestion" }
    });
    if (!metaResponse.ok) throw new Error(`Gutendex request failed: ${metaResponse.status}`);
    gutendexRecord = await metaResponse.json();
  } catch (error) {
    return await fail("Failed to fetch Gutendex metadata", error);
  }

  const plaintextEntry = pickPlaintextEntry(gutendexRecord.formats ?? {});
  if (!plaintextEntry) return await fail("No plaintext format available from Gutendex for this book");
  const plaintextUrl = plaintextEntry[1];

  let sourceBytes: Uint8Array;
  try {
    const fileResponse = await fetchGutenbergFile(plaintextUrl);
    if (!fileResponse.ok) throw new Error(`Upstream file fetch failed: ${fileResponse.status}`);
    sourceBytes = new Uint8Array(await fileResponse.arrayBuffer());
  } catch (error) {
    return await fail("Failed to fetch source plaintext file from Gutenberg", error);
  }

  await supabase.from("ingestion_jobs").update({ status: "fetched" }).eq("id", jobId);

  let matchedWorkId: string | null = null;
  let matchedWorkOriginalLanguage: string | null = null;
  const rawAuthorName = gutendexRecord.authors?.[0]?.name ?? "";
  const bookLanguage = gutendexRecord.languages?.[0] ?? "en";

  if (providedWorkId) {
    const { data: work, error: workLookupError } = await supabase
      .from("works")
      .select("id, original_language")
      .eq("id", providedWorkId)
      .maybeSingle();
    if (workLookupError) return await fail("Failed to look up the provided workId", workLookupError);
    if (!work) return await fail(`workId "${providedWorkId}" does not exist -- refusing to ingest against an unknown Work`);
    matchedWorkId = work.id;
    matchedWorkOriginalLanguage = work.original_language;
  } else {
    const normalizedTitle = normalize(gutendexRecord.title ?? "");
    const lastFirstMatch = rawAuthorName.match(/^([^,]+),\s*([^,]+)/);
    const looseAuthorVariant = lastFirstMatch
      ? normalize(`${lastFirstMatch[2].trim()} ${lastFirstMatch[1].trim()}`)
      : normalize(rawAuthorName);

    const { data: candidateWorks, error: worksError } = await supabase
      .from("works")
      .select("id, title, original_title, author_id, original_language")
      .eq("original_language", bookLanguage);
    if (worksError) return await fail("Failed to query works table for matching", worksError);

    for (const work of candidateWorks ?? []) {
      const titleMatches = normalize(work.title) === normalizedTitle ||
        (work.original_title && normalize(work.original_title) === normalizedTitle);
      if (!titleMatches) continue;

      const { data: author } = await supabase
        .from("authors")
        .select("name, alternative_names")
        .eq("id", work.author_id)
        .single();
      const authorCandidates = [author?.name, ...(author?.alternative_names ?? [])]
        .filter((name): name is string => Boolean(name))
        .map(normalize);
      if (authorCandidates.includes(looseAuthorVariant) || authorCandidates.includes(normalize(rawAuthorName))) {
        matchedWorkId = work.id;
        matchedWorkOriginalLanguage = work.original_language;
        break;
      }
    }

    if (!matchedWorkId) {
      await supabase.from("ingestion_jobs").update({ status: "failed", last_error: "No high-confidence Work match found" }).eq("id", jobId);
      await supabase.from("match_review_queue").insert({
        ingestion_job_id: jobId,
        candidate_work_id: null,
        confidence: "none",
        reasons: [`No exact title+author match for "${gutendexRecord.title}" by "${rawAuthorName}"`]
      });
      return new Response(JSON.stringify({ ok: false, jobId, error: "No confident Work match -- sent to review queue, no Work created" }, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  await supabase.from("ingestion_jobs").update({ status: "matched", work_id: matchedWorkId }).eq("id", jobId);

  const hasTranslator = (gutendexRecord.translators ?? []).length > 0;
  const isOriginal = hasTranslator
    ? false
    : (matchedWorkOriginalLanguage && matchedWorkOriginalLanguage === bookLanguage ? true : null);
  const translatorName = hasTranslator
    ? gutendexRecord.translators.map(translator => translator.name).join("; ")
    : null;

  const sourceStoragePath = `sources/${sourceId}/${externalId}/original.txt`;
  const { error: uploadSourceError } = await supabase.storage
    .from("book-files")
    .upload(sourceStoragePath, sourceBytes, { contentType: "text/plain; charset=utf-8", upsert: true });
  if (uploadSourceError) return await fail("Failed to upload source asset to Storage", uploadSourceError);

  const rawText = new TextDecoder("utf-8").decode(sourceBytes);
  if (rawText.trim().length < MIN_REASONABLE_TEXT_LENGTH) {
    return await fail(`Extracted text is implausibly short (${rawText.trim().length} chars) -- refusing to mark ready`);
  }

  await supabase.from("ingestion_jobs").update({ status: "validated" }).eq("id", jobId);

  const normalizedText = normalizeBookText(rawText);
  const detectedChapters = detectChapters(normalizedText);
  const normalizedDocument = detectedChapters
    ? {
        formatVersion: 1,
        hasRealChapters: true,
        chapters: detectedChapters.map(chapter => ({ title: chapter.title, text: chapter.text }))
      }
    : {
        formatVersion: 1,
        hasRealChapters: false,
        chapters: [{ title: null, text: normalizedText }]
      };

  await supabase.from("ingestion_jobs").update({ status: "normalized" }).eq("id", jobId);

  const editionId = `${matchedWorkId}-gutenberg-${externalId}`;
  const { error: editionError } = await supabase.from("editions").upsert({
    id: editionId,
    work_id: matchedWorkId,
    language: bookLanguage,
    is_original: isOriginal,
    translator_name: translatorName,
    source_id: sourceId,
    external_id: externalId,
    ingestion_status: "processing"
  });
  if (editionError) return await fail("Failed to upsert edition", editionError);

  const normalizedStoragePath = `normalized/${editionId}/content.json`;
  const normalizedJsonString = JSON.stringify(normalizedDocument);
  const { error: uploadNormalizedError } = await supabase.storage
    .from("book-files")
    .upload(normalizedStoragePath, normalizedJsonString, { contentType: "application/json", upsert: true });
  if (uploadNormalizedError) return await fail("Failed to upload normalized content to Storage", uploadNormalizedError);

  const { error: deleteRightsError } = await supabase.from("rights_assertions").delete().eq("edition_id", editionId);
  if (deleteRightsError) return await fail("Failed to clear previous rights_assertions rows before re-ingestion", deleteRightsError);
  const { error: deleteFilesError } = await supabase.from("book_files").delete().eq("edition_id", editionId);
  if (deleteFilesError) return await fail("Failed to clear previous book_files rows before re-ingestion", deleteFilesError);

  const { data: insertedFiles, error: filesError } = await supabase
    .from("book_files")
    .insert([
      {
        edition_id: editionId,
        kind: "source",
        format: "plaintext",
        storage_path: sourceStoragePath,
        byte_size: sourceBytes.byteLength,
        ingestion_status: "processing"
      },
      {
        edition_id: editionId,
        kind: "normalized",
        format: "anki-json",
        storage_path: normalizedStoragePath,
        byte_size: normalizedJsonString.length,
        ingestion_status: "processing"
      }
    ])
    .select();
  if (filesError || !insertedFiles) return await fail("Failed to insert book_files rows", filesError);

  const normalizedFileRow = insertedFiles.find(file => file.kind === "normalized");
  if (!normalizedFileRow) return await fail("Normalized book file row missing after insert");

  const { error: insertRightsError } = await supabase.from("rights_assertions").insert({
    edition_id: editionId,
    book_file_id: normalizedFileRow.id,
    status: "public-domain",
    jurisdiction: "US"
  });
  if (insertRightsError) return await fail("Failed to insert rights_assertions row", insertRightsError);

  await supabase.from("ingestion_jobs").update({ status: "stored" }).eq("id", jobId);

  const estimatedPageCount = Math.ceil(normalizedText.length / APPROXIMATE_PAGE_SIZE);
  // A short complete work is still a valid book. The earlier "<5 pages = fail"
  // rule was novel-specific and incorrectly rejected short fiction.
  await supabase.from("ingestion_jobs").update({ status: "reader-tested" }).eq("id", jobId);

  await supabase.from("editions").update({ ingestion_status: "ready" }).eq("id", editionId);
  await supabase.from("book_files").update({ ingestion_status: "ready" }).eq("edition_id", editionId);
  await supabase.from("ingestion_jobs").update({ status: "ready", last_error: null }).eq("id", jobId);

  return new Response(JSON.stringify({
    ok: true,
    jobId,
    workId: matchedWorkId,
    editionId,
    sourceStoragePath,
    normalizedStoragePath,
    plaintextUrl,
    estimatedPageCount,
    normalizedTextLength: normalizedText.length
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});
