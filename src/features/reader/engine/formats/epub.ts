import ePub from "epubjs";
import type { Book } from "../types";
import type { FormatLoader, LoadedDocument, LoadedChapter } from "./types";
import { normalizeBook, paginateText, formatPage } from "../pagination";

// ============================================================
// TEMPORARY DIAGNOSTIC BUILD — logging only, no logic changes.
// Extraction algorithm, pagination, and the LoadedDocument contract
// are byte-for-byte the same as the last committed version. Every
// console.log/console.error call below is additive and safe to
// strip once the runtime evidence is captured. Search "DIAG:" to
// find every line added for this build.
// ============================================================

// Pulls readable text out of a spine section's already-parsed
// Document (returned by Section#load — see load() below): prefers
// block-level text elements so paragraph breaks survive into
// normalizeBook/paginateText, same as the plain-text pipeline expects.
function extractReadableText(doc: Document): string {

  const root = doc.body ?? doc.documentElement;
  const blocks = Array.from(root.querySelectorAll("p, h1, h2, h3, h4, h5, li"));
  const source = blocks.length ? blocks : [root];

  return source
    .map(element => (element.textContent || "").trim())
    .filter(Boolean)
    .join("\n\n");

}

function findChapterTitle(href: string, tocByHref: Map<string, string>): string | null {
  return tocByHref.get(href.split("#")[0]) ?? null;
}

export const epubLoader: FormatLoader = {

  canHandle(book: Book): boolean {
    return book.format === "epub" || book.url.toLowerCase().endsWith(".epub");
  },

  async load(book: Book): Promise<LoadedDocument> {

    const response = await fetch(book.url);

    if (!response.ok) {
      throw new Error("Book loading failed");
    }

    const arrayBuffer = await response.arrayBuffer();

    const epub = new ePub(arrayBuffer);
    await epub.ready;

    const navigation = await epub.loaded.navigation;
    const tocByHref = new Map<string, string>();

    for (const item of navigation.toc) {
      tocByHref.set(item.href.split("#")[0], item.label.trim());
    }

    const chapters: LoadedChapter[] = [];

    // DIAG: counters for the post-loop summary.
    let diagLoadedCount = 0;
    let diagAddedCount = 0;
    const diagTotalSections = epub.spine.items.length;

    console.log(`DIAG: total spine sections = ${diagTotalSections}`);

    let diagIndex = -1;

    for (const item of epub.spine.items) {

      diagIndex++;
      console.log(`DIAG[${diagIndex}] href = ${item.href}`);

      let doc: Document;

      try {
        doc = await item.load(epub.load.bind(epub));
      } catch (error) {
        // DIAG: log the real error instead of silently continuing.
        console.error(`DIAG[${diagIndex}] section.load() threw:`, error);
        console.log(`DIAG[${diagIndex}] SKIPPED — reason: load() rejected`);
        continue;
      }

      diagLoadedCount++;

      const isDocument = doc instanceof Document;
      const hasDocumentElement = Boolean(doc?.documentElement);
      const hasBody = Boolean(doc?.body);
      const rawTextContentPreview = (doc?.documentElement?.textContent ?? "").slice(0, 200);

      let pCount = -1;
      let h1to5Count = -1;
      let liCount = -1;

      try {
        const root = doc.body ?? doc.documentElement;
        pCount = root.querySelectorAll("p").length;
        h1to5Count = root.querySelectorAll("h1, h2, h3, h4, h5").length;
        liCount = root.querySelectorAll("li").length;
      } catch (countError) {
        console.error(`DIAG[${diagIndex}] element-count query threw:`, countError);
      }

      console.log(`DIAG[${diagIndex}] typeof load() result = ${typeof doc}`);
      console.log(`DIAG[${diagIndex}] result instanceof Document = ${isDocument}`);
      console.log(`DIAG[${diagIndex}] documentElement exists = ${hasDocumentElement}`);
      console.log(`DIAG[${diagIndex}] body exists = ${hasBody}`);
      console.log(`DIAG[${diagIndex}] textContent (first 200 chars) = ${JSON.stringify(rawTextContentPreview)}`);
      console.log(`DIAG[${diagIndex}] counts: p=${pCount} h1-h5=${h1to5Count} li=${liCount}`);

      const text = normalizeBook(extractReadableText(doc));

      console.log(`DIAG[${diagIndex}] final extracted text length = ${text.length}`);

      item.unload();

      // Skip empty sections (cover pages, separators, service XHTML
      // with no block-level text) rather than inserting a blank,
      // unreadable "chapter" into the book.
      if (!text.length) {
        console.log(`DIAG[${diagIndex}] SKIPPED — reason: extracted text length is 0`);
        continue;
      }

      const rawPages = paginateText(text);

      chapters.push({
        title: findChapterTitle(item.href, tocByHref),
        pages: rawPages.map(rawText => ({
          html: formatPage(rawText),
          rawText
        }))
      });

      diagAddedCount++;
      console.log(`DIAG[${diagIndex}] ADDED to chapters (chapters.length now = ${chapters.length})`);

    }

    // Deliberately NOT calling epub.destroy() here: this Book
    // instance never had a Rendition/View attached (we only ever use
    // book.spine/book.loaded.navigation/section.load, by design, to
    // reuse our own pagination instead of epub.js's renderer). In
    // that state, epub.js's destroy() unconditionally tries to tear
    // down rendition-related internals that were never initialized,
    // which throws "Cannot read properties of undefined (reading
    // 'replaceCss')" -- replaceCss is a real epub.js method that only
    // exists on the View/Contents objects a Rendition creates.
    // `epub` is a local variable scoped to this function; once
    // load() returns, nothing references it and it is garbage
    // collected normally without an explicit destroy call.

    const result: LoadedDocument = {
      hasRealChapters: true,
      chapters
    };

    // DIAG: post-loop summary.
    console.log(`DIAG SUMMARY: total sections = ${diagTotalSections}`);
    console.log(`DIAG SUMMARY: sections loaded successfully = ${diagLoadedCount}`);
    console.log(`DIAG SUMMARY: sections added to chapters = ${diagAddedCount}`);
    console.log(`DIAG SUMMARY: chapters.length = ${chapters.length}`);

    if (chapters.length > 0) {
      const first = chapters[0];
      const firstTextLength = first.pages.reduce((sum, page) => sum + page.rawText.length, 0);
      console.log(`DIAG SUMMARY: first chapter title = ${JSON.stringify(first.title)}`);
      console.log(`DIAG SUMMARY: first chapter total text length = ${firstTextLength}`);
    } else {
      console.log("DIAG SUMMARY: no chapters were added — chapters array is empty");
    }

    console.log("DIAG SUMMARY: final LoadedDocument =", result);

    return result;

  }

};
