import ePub from "epubjs";
import type { Book } from "../types";
import type { EpubSection } from "epubjs";
import type { FormatLoader, LoadedDocument, LoadedChapter } from "./types";
import { normalizeBook, paginateText, formatPage } from "../pagination";

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

    // spine.items holds lightweight descriptors without a working
    // load() -- spine.each() is what yields real Section instances
    // (confirmed against a working example on the epub.js issue
    // tracker, not assumed). each() is callback-based/synchronous, so
    // sections are collected here first to then be loaded in spine
    // order, sequentially, below.
    const sections: EpubSection[] = [];
    epub.spine.each(section => sections.push(section));

    const chapters: LoadedChapter[] = [];

    for (const item of sections) {

      let doc: Document;

      try {
        doc = await item.load();
      } catch (error) {
        // A section that fails to load (a genuinely broken or
        // non-XHTML manifest entry) is skipped, not turned into a
        // fabricated page -- same principle as the empty-text skip
        // below. Logged, not swallowed silently.
        console.error(`epubLoader: failed to load spine section "${item.href}"`, error);
        continue;
      }

      const text = normalizeBook(extractReadableText(doc));

      item.unload();

      // Skip empty sections (cover pages, separators, service XHTML
      // with no block-level text) rather than inserting a blank,
      // unreadable "chapter" into the book.
      if (!text.length) continue;

      const rawPages = paginateText(text);

      chapters.push({
        title: findChapterTitle(item.href, tocByHref),
        pages: rawPages.map(rawText => ({
          html: formatPage(rawText),
          rawText
        }))
      });

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

    return {
      hasRealChapters: true,
      chapters
    };

  }

};
