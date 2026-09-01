import type { Book } from "../types";
import type { FormatLoader, LoadedChapter, LoadedDocument } from "./types";
import { formatPage, normalizeBook, paginateText } from "../pagination";
import { extractPdfPageText, getDocument } from "../../../../api/pdfJs";
import { isPersonalPdfUrl, loadPersonalPdfArrayBuffer } from "../../../../api/personalPdfLibrary";

export const pdfLoader: FormatLoader = {
  canHandle(book: Book): boolean {
    return book.format === "pdf" || book.url.toLowerCase().endsWith(".pdf");
  },

  async load(book: Book): Promise<LoadedDocument> {
    let arrayBuffer: ArrayBuffer;

    if (isPersonalPdfUrl(book.url)) {
      arrayBuffer = await loadPersonalPdfArrayBuffer(book.url);
    } else {
      const response = await fetch(book.url);
      if (!response.ok) {
        throw new Error(`Book loading failed: HTTP ${response.status}`);
      }
      arrayBuffer = await response.arrayBuffer();
    }

    const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
    const document = await loadingTask.promise;
    const chapters: LoadedChapter[] = [];
    let readablePdfPages = 0;

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const text = normalizeBook(await extractPdfPageText(page));
        page.cleanup();

        if (!text) continue;

        const rawPages = paginateText(text);
        if (!rawPages.length) continue;

        readablePdfPages += 1;
        chapters.push({
          // A PDF physical page is not a semantic chapter. Keeping titles null
          // preserves Reader's "no fabricated TOC" behaviour while still
          // allowing the existing flat-page engine to reflow extracted text.
          title: null,
          pages: rawPages.map(rawText => ({
            rawText,
            html: formatPage(rawText)
          }))
        });
      }

      if (!chapters.length) {
        throw new Error(
          `pdfLoader: parsed "${book.title}" (${document.numPages} pages) but found no extractable text. ` +
          "Scanned/image-only PDFs require OCR and are not supported yet."
        );
      }

      return {
        hasRealChapters: false,
        chapters
      };
    } finally {
      if (readablePdfPages === 0) {
        console.warn(`pdfLoader: no readable PDF pages found for "${book.title}"`);
      }
      await document.destroy();
    }
  }
};
