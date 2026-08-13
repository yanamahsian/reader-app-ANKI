import type { Book } from "../types";
import type { FormatLoader, LoadedDocument } from "./types";
import { normalizeBook, paginateText, formatPage } from "../pagination";

// Fallback loader — always last in the detect.ts list, so canHandle()
// only needs to say "yes" once nothing more specific has claimed the
// book. Behaviour is unchanged from before formats/ existed: fetch as
// plain text, normalize, paginate the whole book by character count.
export const plaintextLoader: FormatLoader = {

  canHandle(): boolean {
    return true;
  },

  async load(book: Book): Promise<LoadedDocument> {

    const response = await fetch(book.url);

    if (!response.ok) {
      throw new Error("Book loading failed");
    }

    const raw = await response.text();
    const normalized = normalizeBook(raw);
    const rawPages = paginateText(normalized);

    return {
      hasRealChapters: false,
      chapters: [
        {
          title: null,
          pages: rawPages.map(rawText => ({
            html: formatPage(rawText),
            rawText
          }))
        }
      ]
    };

  }

};
