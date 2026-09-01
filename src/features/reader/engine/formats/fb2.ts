import type { Book } from "../types";
import type { FormatLoader, LoadedChapter, LoadedDocument } from "./types";
import { formatPage, normalizeBook, paginateText } from "../pagination";
import { parseFb2ArrayBuffer } from "../../../../api/fb2";
import { isPersonalFb2Url, loadPersonalFb2ArrayBuffer } from "../../../../api/personalFb2Library";

export const fb2Loader: FormatLoader = {
  canHandle(book: Book): boolean {
    return book.format === "fb2" || book.url.toLowerCase().endsWith(".fb2");
  },

  async load(book: Book): Promise<LoadedDocument> {
    let arrayBuffer: ArrayBuffer;

    if (isPersonalFb2Url(book.url)) {
      arrayBuffer = await loadPersonalFb2ArrayBuffer(book.url);
    } else {
      const response = await fetch(book.url);
      if (!response.ok) {
        throw new Error(`Book loading failed: HTTP ${response.status}`);
      }
      arrayBuffer = await response.arrayBuffer();
    }

    const parsed = parseFb2ArrayBuffer(arrayBuffer);
    const chapters: LoadedChapter[] = [];

    for (const sourceChapter of parsed.chapters) {
      const text = normalizeBook(sourceChapter.text);
      if (!text) continue;

      const rawPages = paginateText(text);
      if (!rawPages.length) continue;

      chapters.push({
        title: sourceChapter.title,
        pages: rawPages.map(rawText => ({
          rawText,
          html: formatPage(rawText)
        }))
      });
    }

    if (!chapters.length) {
      throw new Error(`fb2Loader: parsed "${book.title}" but produced zero readable chapters.`);
    }

    return {
      hasRealChapters: chapters.length > 1 || chapters.some(chapter => Boolean(chapter.title)),
      chapters
    };
  }
};
