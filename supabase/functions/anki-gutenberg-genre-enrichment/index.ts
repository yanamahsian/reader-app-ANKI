import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Free, no-AI genre_ids enrichment for Gutenberg-linked Works via Gutendex
// subjects/bookshelves. Built as an Edge Function (not a plpgsql function
// like every other deterministic enrichment pass in this codebase) because
// gutendex.com is INTERMITTENTLY unreliable (confirmed live: roughly half of
// isolated single-request probes to gutendex.com/books/<id> time out with 0
// bytes received, from Postgres extensions.http_get AND from Deno fetch()
// alike -- this is a property of gutendex.com itself, a free community-run
// API, not a one-sided Postgres-vs-Edge-Function reachability gap as an
// earlier investigation concluded from a small, unlucky sample). Running
// this from an Edge Function instead of a plpgsql function is still the
// right call: a flaky/slow upstream here cannot tie up a Postgres connection
// or trip statement_timeout the way extensions.http_get would, and
// supabase-js from Deno gives the same retry/backoff tooling this codebase
// already uses elsewhere (see anki-multilingual-discover, omnia-ingest).
//
// All write guards, idempotency, and retry/backoff bookkeeping live in SQL
// (public.record_gutenberg_genre_result, catalog_gutenberg_genre_edge_v1.sql) --
// this function only does the two things that must run here: the network
// fetch, and matching Gutendex's free-text subjects/bookshelves against the
// canonical genre taxonomy. The matching algorithm is a direct, faithful
// port of public._catalog_taxonomy_match_label /
// public._catalog_taxonomy_normalize_label (exact match against
// taxonomy_terms.label_en, or the catalog_taxonomy_source_aliases table,
// both after lowercasing/trimming/collapsing whitespace -- never a
// similarity/fuzzy comparison), plus the same LCSH structural-subdivision
// parsing (" -- " then ",") used by the dormant SQL version this replaces.
//
// verify_jwt is explicitly false: this function is called only via
// server-to-server dispatch (net.http_get from dispatch_gutenberg_genre_
// enrichment, or manual ops testing), which does not attach a Supabase
// Authorization header. Auth is instead enforced in-code via the
// x-omnia-run-token header (SHA256-checked below), matching the existing
// anki-multilingual-discover precedent (also verify_jwt:false, also
// token-authenticated in-code).
//
// Three robustness measures, all confirmed necessary by live testing against
// the real, flaky gutendex.com and against a real bug in the SQL RPC:
//   1. Each Gutendex fetch attempt is wrapped in an explicit AbortController
//      timeout (GUTENDEX_FETCH_TIMEOUT_MS) -- Deno's fetch() has no default
//      timeout, so a single stalled TCP connection could otherwise hang the
//      whole batch indefinitely (confirmed live: a request without this
//      guard produced zero bytes and no edge-function log entry even after
//      60s). This turns a stall into an ordinary 'failed' result (retried
//      later with backoff, per record_gutenberg_genre_result) instead of an
//      indefinite hang.
//   2. An overall wall-clock budget (WALL_CLOCK_BUDGET_MS) bounds the whole
//      batch, mirroring the GUTENDEX_WALL_CLOCK_BUDGET_MS pattern already
//      used by anki-multilingual-discover: with gutendex.com failing on
//      roughly half of isolated attempts, a full-size batch retried per
//      candidate can otherwise run long enough to hit the platform's own
//      Edge Function execution limit (confirmed live: a 10-candidate batch
//      with no budget check returned an unconditional 504 from the
//      platform gateway, not from this function's own code). Once the
//      budget is spent, remaining candidates are simply left untouched --
//      no attempt is recorded for them, so the next scheduled run picks
//      them up normally; this only shortens one batch, it never drops a
//      candidate.
//   3. Every record_gutenberg_genre_result RPC response is checked for an
//      `.error` -- confirmed necessary live: a real type bug in that SQL
//      function's 'succeeded' branch (GET DIAGNOSTICS into a boolean
//      variable) made every genuinely successful genre match throw and roll
//      back inside Postgres, while this function silently treated the
//      unchecked RPC response as "not written" and still reported the work
//      as succeeded in its own JSON output -- with no attempt row and no
//      genre_ids write to show for it. The SQL bug is now fixed, but the
//      response is still checked and surfaced (as a 'failed' outcome, so
//      the work is retried rather than silently misreported) as defense
//      against any future regression of the same kind.

const EXPECTED_RUN_TOKEN_SHA256 = "09697fd4bc452fe68c5330804e2537e2dd11008c5525614f7e22d30e38d6fa3e";
const GUTENDEX_BASE = "https://gutendex.com/books";
const MAX_GENRES_PER_WORK = 4;
const HTTP_RETRY_ATTEMPTS = 3;
const GUTENDEX_FETCH_TIMEOUT_MS = 6000;
const WALL_CLOCK_BUDGET_MS = 100_000;

type Candidate = { work_id: string; title: string; external_id: string };
type TaxonomyTerm = { id: string; label: string | null; label_en: string | null };
type AliasRow = { source_label_normalized: string; term_id: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Mirrors public._catalog_taxonomy_normalize_label exactly: lowercase, trim,
// collapse internal whitespace.
function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, " ");
}

function buildMatcher(canonicalGenres: TaxonomyTerm[], aliases: AliasRow[]) {
  const exact = new Map<string, string>();
  for (const t of canonicalGenres) {
    const label = t.label_en ?? t.label;
    if (label) exact.set(normalizeLabel(label), t.id);
  }
  const aliasMap = new Map<string, string>();
  for (const a of aliases) aliasMap.set(a.source_label_normalized, a.term_id);

  // Mirrors public._gutendex_match_genre_label's three-tier structural parse
  // of LCSH-style headings: full string, then the text before the first
  // literal " -- " subdivision separator, then the text before the first
  // comma of that. Each tier is an exact (post-normalization) lookup only --
  // never a similarity/fuzzy match.
  return function matchGenreLabel(rawLabel: string): string | null {
    const full = rawLabel;
    const head = full.split(" -- ")[0];
    const candidates = [full];
    if (head !== full) candidates.push(head);
    const headComma = head.split(",")[0];
    if (headComma !== head) candidates.push(headComma);

    for (const candidate of candidates) {
      const norm = normalizeLabel(candidate);
      const exactHit = exact.get(norm);
      if (exactHit) return exactHit;
      const aliasHit = aliasMap.get(norm);
      if (aliasHit) return aliasHit;
    }
    return null;
  };
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mirrors public._author_enrich_http_get_retry's shape (bounded attempts,
// growing backoff, honors Retry-After on 429), extended to also retry on
// timeouts/network errors -- confirmed necessary because gutendex.com's
// observed failure mode here is a stalled connection, not an HTTP error
// status. Each attempt is bounded by an AbortController timeout so a
// stalled connection cannot hang the batch.
async function fetchGutendexWithRetry(externalId: string): Promise<{ ok: true; body: any } | { ok: false; status: number | null; error: string }> {
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= HTTP_RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GUTENDEX_FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(`${GUTENDEX_BASE}/${externalId}`, {
        headers: { "User-Agent": "ANKI/1.0 Gutenberg genre enrichment" },
        signal: controller.signal,
      });
      lastStatus = r.status;
      if (r.status === 429 && attempt < HTTP_RETRY_ATTEMPTS) {
        const retryAfter = Number(r.headers.get("retry-after") ?? "");
        const waitS = Math.max(0.75, Math.min(5, Number.isFinite(retryAfter) ? retryAfter : 1)) * attempt;
        await sleep(waitS * 1000);
        continue;
      }
      if (!r.ok) return { ok: false, status: r.status, error: `HTTP ${r.status}` };
      const body = await r.json();
      return { ok: true, body };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      const message = isAbort ? `Timed out after ${GUTENDEX_FETCH_TIMEOUT_MS}ms` : (error instanceof Error ? error.message : String(error));
      if (attempt >= HTTP_RETRY_ATTEMPTS) {
        return { ok: false, status: lastStatus, error: message };
      }
      await sleep(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: lastStatus, error: "Exhausted retries" };
}

// Calls record_gutenberg_genre_result and reports whether the DB actually
// wrote something. Any RPC-level error (network hiccup between Deno and
// PostgREST, or a genuine SQL error) is surfaced via recordError rather than
// silently treated as "nothing happened" -- see robustness measure 3 above.
async function recordResult(sb: any, args: Record<string, unknown>): Promise<{ written: boolean; recordError: string | null }> {
  const { data, error } = await sb.rpc("record_gutenberg_genre_result", args);
  if (error) return { written: false, recordError: error.message ?? String(error) };
  return { written: data === true, recordError: null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("x-omnia-run-token") ?? "";
  if (!token || (await sha256Hex(token)) !== EXPECTED_RUN_TOKEN_SHA256) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? "20") || 20));
  const dryRun = url.searchParams.get("dryRun") === "1";
  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing server secrets" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const { data: candidates, error: candErr } = await sb.rpc("get_gutenberg_genre_candidates", { p_limit: limit });
  if (candErr) return json({ error: candErr.message }, 500);
  const rows = (candidates ?? []) as Candidate[];
  if (!rows.length) return json({ ok: true, processed: 0, note: "No eligible Gutenberg-linked Work needs genre enrichment" });

  const [{ data: genreTerms, error: gtErr }, { data: aliasRows, error: arErr }] = await Promise.all([
    sb.from("taxonomy_terms").select("id,label,label_en").eq("category", "genre").eq("is_canonical", true),
    sb.from("catalog_taxonomy_source_aliases").select("source_label_normalized,term_id").eq("source", "gutendex").eq("category", "genre"),
  ]);
  if (gtErr) return json({ error: gtErr.message }, 500);
  if (arErr) return json({ error: arErr.message }, 500);
  const matchGenreLabel = buildMatcher((genreTerms ?? []) as TaxonomyTerm[], (aliasRows ?? []) as AliasRow[]);

  let succeeded = 0, noValue = 0, unmapped = 0, failed = 0, written = 0, recordErrors = 0;
  const details: any[] = [];
  let truncatedByBudget = false;

  for (const c of rows) {
    if (Date.now() - startedAt > WALL_CLOCK_BUDGET_MS) { truncatedByBudget = true; break; }
    const result = await fetchGutendexWithRetry(c.external_id);

    if (!result.ok) {
      failed++;
      if (!dryRun) {
        const rec = await recordResult(sb, { p_work_id: c.work_id, p_external_id: c.external_id, p_status: "failed", p_error: result.error });
        if (rec.recordError) recordErrors++;
      }
      details.push({ work_id: c.work_id, title: c.title, external_id: c.external_id, status: "failed", error: result.error });
      continue;
    }

    const subjects: string[] = Array.isArray(result.body?.subjects) ? result.body.subjects : [];
    const bookshelves: string[] = Array.isArray(result.body?.bookshelves) ? result.body.bookshelves : [];
    const matched: string[] = [];
    const unmatchedLabels: string[] = [];

    for (const label of [...subjects.map(s => `subject:${s}`), ...bookshelves.map(s => `shelf:${s}`)]) {
      const [kind, ...rest] = label.split(":");
      const raw = rest.join(":");
      const termId = matchGenreLabel(raw);
      if (!termId) {
        unmatchedLabels.push(label);
      } else if (!matched.includes(termId) && matched.length < MAX_GENRES_PER_WORK) {
        matched.push(termId);
      }
    }

    let status: "no_value" | "unmapped" | "succeeded";
    if (subjects.length === 0 && bookshelves.length === 0) {
      status = "no_value"; noValue++;
    } else if (matched.length === 0) {
      status = "unmapped"; unmapped++;
    } else {
      status = "succeeded"; succeeded++;
    }

    let recordError: string | null = null;
    if (!dryRun) {
      const rec = await recordResult(sb, {
        p_work_id: c.work_id,
        p_external_id: c.external_id,
        p_status: status,
        p_genre_ids: status === "succeeded" ? matched : null,
        p_unmatched: status === "unmapped" ? unmatchedLabels.slice(0, 8).join(" | ") : null,
      });
      if (rec.written) written++;
      if (rec.recordError) { recordErrors++; recordError = rec.recordError; }
    }

    details.push({
      work_id: c.work_id, title: c.title, external_id: c.external_id,
      subjects, bookshelves, matched, unmatched: unmatchedLabels, status,
      ...(recordError ? { recordError } : {}),
    });
  }

  return json({
    ok: true,
    dryRun,
    processed: succeeded + noValue + unmapped + failed,
    candidatesFetched: rows.length,
    truncatedByBudget,
    succeeded, noValue, unmapped, failed,
    worksActuallyWritten: dryRun ? null : written,
    recordErrors,
    details,
  });
});
