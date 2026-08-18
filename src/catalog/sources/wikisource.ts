import type { ExternalBookRecord } from "../ingestion/types";
import type { BookFormat } from "../types";

// Wikisource (wikisource.org) is a multilingual library of
// public-domain full texts, run as separate per-language wikis under
// a shared MediaWiki API shape (ru.wikisource.org, de.wikisource.org,
// en.wikisource.org, and in principle any other
// "<lang>.wikisource.org"). Same role in this catalog as
// sources/gutenberg.ts and sources/standardEbooks.ts: everything
// outside this file only ever sees ExternalBookRecord.
//
// Wikisource is NOT itself an EPUB host -- individual pages are wiki
// text. Real EPUB generation goes through the community-run WS Export
// tool (https://ws-export.wmcloud.org), which takes a language code
// and an exact page title and produces a downloadable EPUB built from
// that page's content (and, for a multi-page work, its listed
// subpages/chapters). buildWsExportUrl below builds that URL from the
// same (lang, pageTitle) this adapter itself needs.
//
// STAGE 19 STATUS -- IMPORTANT, read before extending this file: this
// adapter is real and callable, but wikisource.org (all language
// subdomains, confirmed for both ru. and de.) could not actually be
// reached from this project's own sandbox this round -- every direct
// fetch attempt returned a "cache-only, cannot be fetched" network
// policy error, for both the assistant's own fetch tool and this
// adapter's real fetch() call would hit the exact same restriction if
// run from here. Because of that, sources/wikisourceRecords.ts
// currently has ZERO entries: candidate pages were found via search
// (real URLs, e.g. ru.wikisource.org/wiki/Мёртвые_души_(Гоголь)) but
// their actual page content, completeness, and proofreading status
// could NOT be independently confirmed by fetching them -- and this
// project's standing rule is to never attach an Edition without
// independently verifying it. See
// sources/wikisourceReviewCandidates.ts for the honest list of what
// was found but NOT attached, for a future maintenance run from an
// environment that can actually reach wikisource.org.
const WS_EXPORT_BASE_URL = "https://ws-export.wmcloud.org";

export function buildWsExportUrl(lang: string, pageTitle: string, format: "epub-3" | "epub-2" = "epub-3"): string {
  return `${WS_EXPORT_BASE_URL}/?lang=${encodeURIComponent(lang)}&format=${format}&page=${encodeURIComponent(pageTitle)}`;
}

interface WikisourceApiResponse {
  query?: {
    pages?: Record<string, {
      title: string;
      extract?: string;
      pageprops?: Record<string, string>;
    }>;
  };
}

// `lang` is the Wikisource language subdomain code (e.g. "ru", "de",
// "en"); `pageTitle` is the exact MediaWiki page title (spaces, not
// underscores -- this function encodes it). Uses Wikisource's own
// MediaWiki Action API (api.php), the same API family every Wikimedia
// project exposes, rather than scraping rendered HTML.
export async function fetchWikisourceRecord(lang: string, pageTitle: string, authorName: string): Promise<ExternalBookRecord> {

  const apiUrl = `https://${lang}.wikisource.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts|pageprops&format=json&origin=*`;

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Wikisource API request failed for ${lang}:${pageTitle}`);
  }

  const data = (await response.json()) as WikisourceApiResponse;
  const page = data.query?.pages ? Object.values(data.query.pages)[0] : undefined;

  if (!page) {
    throw new Error(`Wikisource page not found: ${lang}:${pageTitle}`);
  }

  const formats: Array<{ format: BookFormat; url: string }> = [
    { format: "epub", url: buildWsExportUrl(lang, pageTitle) }
  ];

  return {
    sourceId: "wikisource",
    externalId: `${lang}:${pageTitle}`,
    title: page.title,
    authorNames: [authorName],
    language: lang,
    translatorName: null, // Wikisource originals attached by this
    // project are original-language texts by design (see the Stage 19
    // report's priority on sourcing RU/DE originals to sidestep
    // translator rights entirely) -- a future entry attaching a
    // Wikisource TRANSLATION must not assume this.
    formats,
    // Wikisource's own rights convention: unless a specific page says
    // otherwise, texts are hosted because the underlying work is in
    // the public domain in the source country and the US -- but that
    // is a general site policy, not a page-specific rights statement
    // this adapter has actually read. Recorded as "unknown" rather
    // than guessed at "public-domain"; a real ingestion run must read
    // and confirm the specific page's rights/attribution notice
    // before this becomes "public-domain", per the Stage 19
    // requirement to never assume completeness or rights.
    rights: [{ status: "unknown", jurisdiction: null }]
  };

}
