import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Vite bundles the pdf.js worker as an ordinary static asset. Setting it once
// here keeps every PDF caller (import validation + Reader loader) on the same
// runtime configuration instead of silently falling back to an unavailable CDN
// worker under GitHub Pages.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { getDocument };
export type { PDFDocumentProxy, PDFPageProxy };

export interface PdfMetadataSummary {
  title: string | null;
  author: string | null;
  language: string | null;
}

function cleanMetadataString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function metadataValue(metadata: unknown, key: string): unknown {
  if (!metadata || typeof metadata !== "object") return null;
  const maybe = metadata as { get?: (name: string) => unknown };
  return typeof maybe.get === "function" ? maybe.get(key) : null;
}

export async function readPdfMetadata(document: PDFDocumentProxy): Promise<PdfMetadataSummary> {
  const result = await document.getMetadata() as {
    info?: Record<string, unknown>;
    metadata?: unknown;
  };
  const info = result.info ?? {};

  return {
    title: cleanMetadataString(
      metadataValue(result.metadata, "dc:title") ?? info.Title,
      300
    ),
    author: cleanMetadataString(
      metadataValue(result.metadata, "dc:creator") ?? info.Author,
      200
    ),
    language: cleanMetadataString(
      metadataValue(result.metadata, "dc:language") ?? info.Language,
      40
    )
  };
}

// pdf.js returns positioned text items rather than paragraphs. For AN.KI's
// reflowing Reader we preserve explicit line endings and otherwise insert a
// single space between neighbouring text items. The normal Reader pagination
// layer performs the final whitespace normalization.
export async function extractPdfPageText(page: PDFPageProxy): Promise<string> {
  const textContent = await page.getTextContent();
  const parts: string[] = [];

  for (const raw of textContent.items as Array<{ str?: unknown; hasEOL?: unknown }>) {
    if (typeof raw.str !== "string" || raw.str.length === 0) continue;
    parts.push(raw.str);
    parts.push(raw.hasEOL === true ? "\n" : " ");
  }

  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
