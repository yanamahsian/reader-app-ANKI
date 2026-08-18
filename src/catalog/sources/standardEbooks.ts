import type { ExternalBookRecord } from "../ingestion/types";

// Standard Ebooks (standardebooks.org) publishes professionally
// re-typeset, semantically-marked-up EPUB editions of public-domain
// English-language works. Same role in this catalog as
// sources/gutenberg.ts: everything outside this file only ever sees
// ExternalBookRecord, never a Standard-Ebooks-specific shape.
//
// Standard Ebooks exposes a real OPDS feed (standardebooks.org/opds)
// and per-book pages at a predictable
// standardebooks.org/ebooks/<author-slug>/<title-slug> URL. This
// adapter fetches that per-book page's OPDS entry (not the HTML page)
// for the fields this catalog needs. It is, like fetchGutenbergRecord,
// intentionally UNUSED by the app's runtime path -- see
// sources/standardEbooksRecords.ts's own comment for why -- and exists
// so a future offline maintenance script has a real, working adapter
// to call instead of hand-copying data again.
//
// IMPORTANT rights nuance (Stage 19): Standard Ebooks dedicates its
// OWN production work (typesetting, markup, cover art) to the public
// domain via CC0 -- but that is a claim about their markup, not about
// the underlying Work. Every Standard Ebooks page this project
// actually checked also states a SEPARATE, narrower claim about the
// text itself: "this ebook is thought to be free of copyright
// restrictions in the United States" (US-scoped), often with an
// explicit "it may still be under copyright in other countries"
// caveat. This adapter records that US-scoped textual claim as the
// ExternalBookRecord's `rights` -- never CC0, never "worldwide" --
// exactly so a caller can't mistake "their markup is CC0" for "this
// text is legally available everywhere". Any additional jurisdiction
// (e.g. Germany) is a separate, independent catalog-level assessment
// -- see rights/assessGermanRights.ts -- never inferred from Standard
// Ebooks' CC0 badge.
const STANDARD_EBOOKS_BASE_URL = "https://standardebooks.org/ebooks";

interface StandardEbooksOpdsEntry {
  title: string;
  author: string;
  language: string;
  epubUrl: string;
}

// Real OPDS/Atom parsing is intentionally minimal here (regex over the
// known, stable Standard Ebooks OPDS entry shape) rather than pulling
// in an XML parser dependency for a single, unused-at-runtime adapter.
// A future maintenance script extending this is free to swap this for
// a real XML parser.
function parseOpdsEntry(xml: string): StandardEbooksOpdsEntry {
  const title = /<title>([^<]+)<\/title>/.exec(xml)?.[1] ?? "";
  const author = /<author>\s*<name>([^<]+)<\/name>/.exec(xml)?.[1] ?? "";
  const language = /<dc:language>([^<]+)<\/dc:language>/.exec(xml)?.[1] ?? "en";
  const epubUrl = /href="([^"]+\.epub)"/.exec(xml)?.[1] ?? "";
  return { title, author, language, epubUrl };
}

// `slug` is the "<author-slug>/<title-slug>" path segment, e.g.
// "virginia-woolf/to-the-lighthouse" -- exactly what
// sources/standardEbooksManifest.ts stores per Work.
export async function fetchStandardEbooksRecord(slug: string): Promise<ExternalBookRecord> {

  const response = await fetch(`${STANDARD_EBOOKS_BASE_URL}/${slug}/opds`);

  if (!response.ok) {
    throw new Error(`Standard Ebooks OPDS request failed for slug ${slug}`);
  }

  const xml = await response.text();
  const entry = parseOpdsEntry(xml);

  return {
    sourceId: "standard-ebooks",
    externalId: slug,
    title: entry.title,
    authorNames: [entry.author],
    language: entry.language,
    // Standard Ebooks credits a translator on the ebook page itself
    // for non-English-original works (rare in their catalog, which is
    // overwhelmingly English-original literature) -- this adapter
    // does not currently parse that field out of the OPDS entry,
    // since none of this round's real, verified records needed it
    // (every one attached is an English original). A future extension
    // adding a non-English-original Standard Ebooks title must not
    // assume translatorName: null without actually checking the page.
    translatorName: null,
    formats: entry.epubUrl ? [{ format: "epub", url: entry.epubUrl }] : [],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  };

}
