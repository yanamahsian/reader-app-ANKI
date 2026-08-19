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

    // Root cause of the "Reader opens with full chrome, zero text"
    // live bug (verified against the real, installed epub.js source --
    // see epubjs.d.ts's module-level comment for the full trace, not
    // repeated here): Section#load(_request) falls back to
    // `this.request` (never set by Spine#unpack) and then to a
    // network-only default `Request` module when called with no
    // arguments. For THIS project's book -- fetched as an ArrayBuffer
    // and opened archived (`new ePub(arrayBuffer)`) -- every spine
    // section's url is an in-archive path, not a real network URL, so
    // the default Request module 404s/CORS-fails on every section,
    // every time. `epub.load.bind(epub)` is the book's own
    // archive-aware loader (Book#load -> this.archive.request(...)
    // when `this.archived` is true); passing it as Section#load's
    // `_request` argument makes every section resolve through the
    // already-opened zip instead of a doomed network fetch.
    const bookLoad = epub.load.bind(epub);

    const chapters: LoadedChapter[] = [];
    let loadFailures = 0;
    let emptyAfterLoad = 0;

    for (const item of sections) {

      let doc: Document;

      try {
        doc = await item.load(bookLoad);
      } catch (error) {
        // A section that fails to load (a genuinely broken or
        // non-XHTML manifest entry) is skipped, not turned into a
        // fabricated page -- same principle as the empty-text skip
        // below. Logged, not swallowed silently.
        console.error(`epubLoader: failed to load spine section "${item.href}"`, error);
        loadFailures++;
        continue;
      }

      const text = normalizeBook(extractReadableText(doc));

      item.unload();

      // Skip empty sections (cover pages, separators, service XHTML
      // with no block-level text) rather than inserting a blank,
      // unreadable "chapter" into the book.
      if (!text.length) {
        emptyAfterLoad++;
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

    }

    // Invariant (this project's own, not epub.js's): a "successfully"
    // parsed EPUB with zero readable chapters is not a real success --
    // it is exactly the silent-empty-Reader bug this fix addresses. If
    // every section failed to load or came back empty, that's a real,
    // diagnosable failure and must reject loudly instead of handing
    // readerEngine.open() a LoadedDocument it would happily render as
    // a blank book (see readerEngine.ts's own matching, format-agnostic
    // pages.length check for the same principle at the page level).
    if (chapters.length === 0) {
      throw new Error(
        `epubLoader: parsed "${book.title}" but produced zero readable chapters ` +
        `(${sections.length} spine sections discovered, ${loadFailures} failed to load, ` +
        `${emptyAfterLoad} loaded with no extractable text) -- refusing to open an empty book.`
      );
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
