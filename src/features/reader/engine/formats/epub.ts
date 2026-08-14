import ePub from "epubjs";
import type { Book } from "../types";
import type { FormatLoader, LoadedDocument, LoadedChapter } from "./types";
import { normalizeBook, paginateText, formatPage } from "../pagination";

// Pulls readable text out of a spine section's raw (X)HTML: prefers
// block-level text elements so paragraph breaks survive into
// normalizeBook/paginateText, same as the plain-text pipeline expects.
function extractReadableText(html: string): string {

  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = Array.from(doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, li"));
  const source = blocks.length ? blocks : [doc.body];

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

    for (const item of epub.spine.items) {

      const rawHtml = await epub.archive.getText(item.href);
      const text = normalizeBook(extractReadableText(rawHtml));

      // Skip empty sections (cover pages, separators) rather than
      // inserting a blank, unreadable "chapter" into the book.
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
    // book.archive/book.spine/book.loaded.navigation, by design, to
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
