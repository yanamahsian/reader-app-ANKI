import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOURCE_GUTENBERG = "gutenberg";
const SOURCE_WIKISOURCE = "wikisource";
const GUTENDEX_BASE = "https://gutendex.com/books";
const WIKIDATA_LANGUAGES = ["en","ru","uk","de","fr","es","it","pl","pt","nl","sv","fi","cs","ro","hu","da","no","el","zh","ja","tr","bg","sr","hr","sk","sl","ca","eo","la"].join("|");
const LEADING_ARTICLE = /^(?:the|a|an|der|die|das|ein|eine|einen|einem|einer|le|la|les|un|une|des|du|el|los|las|una|il|lo|i|gli|o|os|as|um|uma)\s+/iu;

type WorkRow = {
  id: string;
  title: string;
  original_title: string | null;
  alternative_titles: string[] | null;
  original_language: string | null;
};

type CandidateRow = {
  work_id: string;
  author_id: string;
  source_id: string;
  external_id: string;
  language: string;
  title: string;
  work_qid: string | null;
  status: string;
  rights_status: string | null;
  jurisdiction: string | null;
  provider_metadata: Record<string, unknown>;
  updated_at: string;
};

type GutendexBook = {
  id: number;
  title: string;
  authors?: Array<{ name?: string }>;
  languages?: string[];
};

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
  const { data: changed } = await sb.from("master_corpus_run_tokens")
    .update({ remaining_calls: row.remaining_calls - 1, last_used_at: new Date().toISOString() })
    .eq("id", row.id).eq("remaining_calls", row.remaining_calls).select("id").maybeSingle();
  return Boolean(changed);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replaceAll("ё", "е").replaceAll("&", " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function looseNameVariant(name: string) {
  const m = name.match(/^([^,]+),\s*([^,]+)(?:,.*)?$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : name;
}

function nameTokens(value: string) {
  return normalize(looseNameVariant(value)).split(" ").filter(token => token.length > 0 && !/^\d+$/.test(token));
}

function authorMatches(raw: string, knownNames: string[]) {
  const rawVariants = [normalize(raw), normalize(looseNameVariant(raw))];
  const knownNormalized = knownNames.map(normalize);
  if (rawVariants.some(value => knownNormalized.includes(value))) return true;
  const rawTokens = nameTokens(raw);
  if (rawTokens.length < 2) return false;
  const rawFirst = rawTokens[0];
  const rawLast = rawTokens[rawTokens.length - 1];
  return knownNames.some(name => {
    const tokens = nameTokens(name);
    return tokens.length >= 2 && tokens[0] === rawFirst && tokens[tokens.length - 1] === rawLast;
  });
}

function titleVariants(value: string) {
  const raw = value.trim();
  const variants = new Set<string>();
  const push = (v: string) => {
    const n = normalize(v);
    if (n.length < 3) return;
    variants.add(n);
    const withoutArticle = n.replace(LEADING_ARTICLE, "").trim();
    if (withoutArticle.length >= 3) variants.add(withoutArticle);
  };
  push(raw);
  push(raw.replace(/\s*\([^)]*\)\s*$/u, ""));
  const colon = raw.split(/[:—–]/u)[0]?.trim();
  if (colon && colon.length >= 4) push(colon);
  return variants;
}

function wikilangFromSite(site: string): string | null {
  const match = site.match(/^([a-z]{2,3})wikisource$/);
  return match ? match[1] : null;
}

function latinSearchTerms(names: string[]) {
  const candidates = names
    .map(name => name.trim())
    .filter(name => /[A-Za-zÀ-ž]/u.test(name) && !/[А-Яа-яЁё一-龯ぁ-ゟ゠-ヿ]/u.test(name))
    .filter(name => nameTokens(name).length >= 2)
    .sort((a, b) => nameTokens(a).length - nameTokens(b).length || a.length - b.length);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of candidates) {
    const n = normalize(name);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(name);
    if (out.length >= 3) break;
  }
  return out;
}

async function fetchGutendexByAuthor(knownNames: string[]) {
  const terms = latinSearchTerms(knownNames);
  const byId = new Map<number, GutendexBook>();
  let requests = 0;
  for (const term of terms) {
    let next: string | null = `${GUTENDEX_BASE}?search=${encodeURIComponent(term)}`;
    let page = 0;
    while (next && page < 30) {
      const r = await fetch(next, { headers: { "User-Agent": "ANKI/1.0 multilingual enrichment" } });
      requests++;
      if (!r.ok) throw new Error(`Gutendex HTTP ${r.status} for ${term}`);
      const data = await r.json();
      for (const book of (data?.results ?? []) as GutendexBook[]) {
        const authorOk = (book.authors ?? []).some(a => typeof a?.name === "string" && authorMatches(a.name!, knownNames));
        if (authorOk && Number.isFinite(book.id)) byId.set(book.id, book);
      }
      next = typeof data?.next === "string" ? data.next : null;
      page++;
    }
  }
  return { books: Array.from(byId.values()), terms, requests };
}

async function fetchWikidata(ids: string[]) {
  const entities: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const u = new URL("https://www.wikidata.org/w/api.php");
    for (const [k, v] of Object.entries({ action: "wbgetentities", format: "json", ids: batch.join("|"), props: "labels|aliases|sitelinks", languages: WIKIDATA_LANGUAGES, origin: "*" })) u.searchParams.set(k, v);
    const r = await fetch(u.toString(), { headers: { "User-Agent": "ANKI/1.0 multilingual enrichment" } });
    if (!r.ok) throw new Error(`Wikidata API ${r.status}`);
    const data = await r.json();
    Object.assign(entities, data.entities ?? {});
  }
  return entities;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const token = req.headers.get("x-omnia-run-token") ?? url.searchParams.get("token") ?? "";
  const runId = url.searchParams.get("runId") ?? "";
  const authorId = url.searchParams.get("authorId") ?? "";
  if ((!token && !runId) || !authorId) return json({ error: "Missing run access or authorId" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing server secrets" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey);
  if (!(await consumeRunAccess(sb, token, runId))) return json({ error: "Invalid, expired, or exhausted run access" }, 401);

  const { data: author, error: authorError } = await sb.from("authors").select("id,name,alternative_names").eq("id", authorId).maybeSingle();
  if (authorError || !author) return json({ error: authorError?.message ?? "Author not found" }, 404);
  const { data: master } = await sb.from("master_corpus_authors").select("search_names").eq("canonical_author_id", authorId).maybeSingle();
  const knownNames = Array.from(new Set([author.name, ...(author.alternative_names ?? []), ...(master?.search_names ?? [])].filter(Boolean))) as string[];

  const { data: works, error: worksError } = await sb.from("works").select("id,title,original_title,alternative_titles,original_language").eq("author_id", authorId);
  if (worksError) return json({ error: worksError.message }, 500);
  const workRows = (works ?? []) as WorkRow[];
  if (!workRows.length) return json({ ok: true, authorId, discovered: 0, message: "No works for author" });

  const workIds = workRows.map(w => w.id);
  const { data: identityCandidates, error: identityError } = await sb.from("master_corpus_candidates").select("work_id,provider_metadata").in("work_id", workIds);
  if (identityError) return json({ error: identityError.message }, 500);
  const qidByWork = new Map<string, string>();
  for (const row of identityCandidates ?? []) {
    const qid = row?.provider_metadata?.workQid;
    if (typeof row.work_id === "string" && typeof qid === "string" && /^Q\d+$/.test(qid) && !qidByWork.has(row.work_id)) qidByWork.set(row.work_id, qid);
  }

  const qids = Array.from(new Set(qidByWork.values()));
  let entities: Record<string, any> = {};
  try { entities = await fetchWikidata(qids); } catch (error) { console.error("Wikidata enrichment failed", error); }

  const aliasToWorks = new Map<string, Set<string>>();
  const addAlias = (workId: string, value: string | null | undefined) => {
    if (!value) return;
    for (const variant of titleVariants(value)) {
      const set = aliasToWorks.get(variant) ?? new Set<string>();
      set.add(workId); aliasToWorks.set(variant, set);
    }
  };
  for (const work of workRows) {
    addAlias(work.id, work.title); addAlias(work.id, work.original_title);
    for (const alt of work.alternative_titles ?? []) addAlias(work.id, alt);
    const qid = qidByWork.get(work.id); const entity = qid ? entities[qid] : null;
    if (entity) {
      for (const label of Object.values(entity.labels ?? {}) as any[]) addAlias(work.id, label?.value);
      for (const list of Object.values(entity.aliases ?? {}) as any[][]) for (const alias of list ?? []) addAlias(work.id, alias?.value);
      for (const link of Object.values(entity.sitelinks ?? {}) as any[]) addAlias(work.id, link?.title);
    }
  }

  const { data: existingCandidates } = await sb.from("multilingual_candidates").select("source_id,external_id,work_id,status,edition_id").eq("author_id", authorId);
  const existingCandidateByKey = new Map<string, any>();
  for (const c of existingCandidates ?? []) existingCandidateByKey.set(`${c.source_id}|${c.external_id}|${c.work_id}`, c);
  const { data: existingEditions, error: existingEditionsError } = await sb.from("editions").select("id,work_id,language,source_id,external_id,ingestion_status").in("work_id", workIds);
  if (existingEditionsError) return json({ error: existingEditionsError.message }, 500);
  const readyLanguagesByWork = new Map<string, Set<string>>();
  const editionBySourceExternal = new Map<string, any>();
  for (const e of existingEditions ?? []) {
    if (e.ingestion_status === "ready") {
      const set = readyLanguagesByWork.get(e.work_id) ?? new Set<string>(); set.add(e.language); readyLanguagesByWork.set(e.work_id, set);
    }
    if (e.source_id && e.external_id) editionBySourceExternal.set(`${e.source_id}|${e.external_id}`, e);
  }

  const rows: CandidateRow[] = []; const now = new Date().toISOString();
  let wikidataSitelinks = 0; let wikisourceQueuedForReview = 0;
  for (const work of workRows) {
    const qid = qidByWork.get(work.id); const entity = qid ? entities[qid] : null;
    if (!qid || !entity) continue;
    const readyLanguages = readyLanguagesByWork.get(work.id) ?? new Set<string>();
    for (const [site, link] of Object.entries(entity.sitelinks ?? {}) as Array<[string, any]>) {
      const language = wikilangFromSite(site); const title = typeof link?.title === "string" ? link.title.trim() : "";
      if (!language || !title) continue;
      wikidataSitelinks++; if (readyLanguages.has(language)) continue;
      const externalId = `${language}:${title}`;
      const existingEdition = editionBySourceExternal.get(`${SOURCE_WIKISOURCE}|${externalId}`);
      const old = existingCandidateByKey.get(`${SOURCE_WIKISOURCE}|${externalId}|${work.id}`);
      const status = existingEdition?.work_id === work.id && existingEdition?.ingestion_status === "ready" ? "ready" : (old?.status === "ready" ? "ready" : "review");
      rows.push({ work_id: work.id, author_id: authorId, source_id: SOURCE_WIKISOURCE, external_id: externalId, language, title, work_qid: qid, status, rights_status: "unknown", jurisdiction: null, provider_metadata: { workQid: qid, wikiLanguage: language, pageTitle: title, identity: "wikidata-sitelink-exact" }, updated_at: now });
      if (status === "review") wikisourceQueuedForReview++;
    }
  }

  let gutenbergMatched = 0; let gutenbergAmbiguous = 0; let gutenbergAuthorRows = 0;
  let gutendexTerms: string[] = []; let gutendexRequests = 0;
  try {
    const found = await fetchGutendexByAuthor(knownNames);
    gutendexTerms = found.terms; gutendexRequests = found.requests; gutenbergAuthorRows = found.books.length;
    for (const book of found.books) {
      const externalId = String(book.id); const title = (book.title ?? "").trim(); if (!externalId || !title) continue;
      const matchedWorkIds = new Set<string>();
      for (const variant of titleVariants(title)) for (const id of aliasToWorks.get(variant) ?? []) matchedWorkIds.add(id);
      if (matchedWorkIds.size !== 1) { if (matchedWorkIds.size > 1) gutenbergAmbiguous++; continue; }
      const workId = Array.from(matchedWorkIds)[0];
      const language = (book.languages ?? []).find(Boolean) ?? "en";
      const existingEdition = editionBySourceExternal.get(`${SOURCE_GUTENBERG}|${externalId}`);
      if (existingEdition && existingEdition.work_id !== workId) { gutenbergAmbiguous++; continue; }
      const old = existingCandidateByKey.get(`${SOURCE_GUTENBERG}|${externalId}|${workId}`);
      const status = existingEdition?.work_id === workId && existingEdition?.ingestion_status === "ready" ? "ready" : (old?.status === "ready" ? "ready" : "discovered");
      rows.push({ work_id: workId, author_id: authorId, source_id: SOURCE_GUTENBERG, external_id: externalId, language, title, work_qid: qidByWork.get(workId) ?? null, status, rights_status: "public-domain", jurisdiction: "US", provider_metadata: { titleMatch: "exact-normalized-alias-or-article-stripped", gutendexSearch: true }, updated_at: now });
      gutenbergMatched++;
    }
  } catch (error) { console.error("Gutendex multilingual discovery failed", error); }

  const deduped = new Map<string, CandidateRow>(); for (const row of rows) deduped.set(`${row.source_id}|${row.external_id}|${row.work_id}`, row);
  const finalRows = Array.from(deduped.values());
  if (finalRows.length) {
    const { error: upsertError } = await sb.from("multilingual_candidates").upsert(finalRows, { onConflict: "source_id,external_id,work_id" });
    if (upsertError) return json({ error: `Candidate upsert failed: ${upsertError.message}` }, 500);
  }
  const bySource = finalRows.reduce((acc: Record<string, number>, row) => { acc[row.source_id] = (acc[row.source_id] ?? 0) + 1; return acc; }, {});
  return json({ ok: true, authorId, authorName: author.name, works: workRows.length, worksWithQid: qids.length, wikidataSitelinks, wikisourceQueuedForReview, gutendexTerms, gutendexRequests, gutenbergAuthorRows, gutenbergMatched, gutenbergAmbiguous, storedCandidates: finalRows.length, bySource, rule: "Gutendex author search + exact identity matching; Wikisource QID sitelinks stay rights-review" });
});