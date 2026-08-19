import ePub from "epubjs";
import type { Book } from "../types";
import type { EpubSection } from "epubjs";
import type { FormatLoader, LoadedDocument, LoadedChapter } from "./types";
import { normalizeBook, paginateText, formatPage } from "../pagination";

// Section#load() in epub.js resolves to the section's documentElement,
// not the Document itself. Accept either shape defensively so this
// loader works with the real epub.js runtime contract and with any
// future loader that returns a full Document.
function extractReadableText(content: Document | Element): string {

  const maybeDocument = content as Document;
  const root = maybeDocument.body ?? maybeDocument.documentElement ?? (content as Element);
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
      throw new Error(`Book loading failed: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    const epub = new ePub(arrayBuffer);
    await epub.ready;

    const navigation = await epub.loaded.navigation;
    const tocByHref = new Map<string, string>();

    for (const item of navigation.toc) {
      tocByHref.set(item.href.split("#")[0], item.label.trim());
    }

    const sections: EpubSection[] = [];
    epub.spine.each(section => sections.push(section));

    // The EPUB was opened from an ArrayBuffer, so section URLs point
    // inside the zip archive. Section#load() must therefore receive
    // the Book's archive-aware loader instead of falling back to the
    // network-only default request helper.
    const bookLoad = epub.load.bind(epub);

    const chapters: LoadedChapter[] = [];
    let loadFailures = 0;
    let emptyAfterLoad = 0;

    for (const item of sections) {

      let content: Element;

      try {
        content = await item.load(bookLoad);
      } catch (error) {
        console.error(`epubLoader: failed to load spine section "${item.href}"`, error);
        loadFailures++;
        continue;
      }

      const text = normalizeBook(extractReadableText(content));

      item.unload();

      if (!text.length) {
        emptyAfterLoad++;
        continue;
      }

      const rawPages = paginateText(text);

      if (!rawPages.length) {
        emptyAfterLoad++;
        continue;
      }

      chapters.push({
        title: findChapterTitle(item.href, tocByHref),
        pages: rawPages.map(rawText => ({
          html: formatPage(rawText),
          rawText
        }))
      });

    }

    if (chapters.length === 0) {
      throw new Error(
        `epubLoader: parsed "${book.title}" but produced zero readable chapters ` +
        `(${sections.length} spine sections discovered, ${loadFailures} failed to load, ` +
        `${emptyAfterLoad} loaded with no extractable text).`
      );
    }

    return {
      hasRealChapters: true,
      chapters
    };

  }

};
