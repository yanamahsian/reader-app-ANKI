// Converts real EPUB bytes into the project's existing AN.KI
// normalized content contract -- the same shape
// src/features/reader/engine/formats/ankiJson.ts already validates
// and loads in the browser (formatVersion/hasRealChapters/chapters:
// [{title, text}]). This file is intentionally provider-agnostic: it
// takes only raw bytes and knows nothing about Gutenberg, Standard
// Ebooks, Wikisource, or any specific Work -- the exact same function
// runs for every EPUB, regardless of where its bytes came from.
//
// Deliberately scoped: EPUB3 nav-document tables of contents are
// parsed (Standard Ebooks -- this Stage's real target -- always ships
// one); a legacy EPUB2 NCX is NOT parsed in this version. A missing or
// unparseable TOC never fails ingestion -- chapters simply keep
// title: null, per the "never invent a chapter title" requirement.
// This is a disclosed, deliberate scope limit, not an oversight.

import { ZipArchive } from "./zip";
import {
  extractFirstAttribute,
  extractElements,
  extractAttribute,
  extractLinks,
  htmlToReadableText,
  decodeEntities
} from "./htmlToText";

export interface AnkiJsonChapter {
  title: string | null;
  text: string;
}

export interface AnkiJsonDocument {
  formatVersion: 1;
  hasRealChapters: boolean;
  chapters: AnkiJsonChapter[];
}

export interface EpubConversionDiagnostics {
  spineItemCount: number;
  loadFailures: number;
  emptyAfterExtraction: number;
  tocSource: "nav" | "none";
}

export interface EpubConversionResult {
  document: AnkiJsonDocument;
  diagnostics: EpubConversionDiagnostics;
}

interface ManifestItem {
  href: string;
  mediaType: string | null;
  properties: string | null;
}

// Resolves an OPF-relative href (manifest/nav hrefs are relative to
// the OPF file's own directory, not the archive root) against the
// OPF's real path inside the archive -- the same kind of resolution a
// browser performs for a relative URL, done by hand since there is no
// URL/DOM context here.
function resolveOpfRelativePath(opfPath: string, relativePath: string): string {

  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const combined = baseDir + relativePath;
  const segments = combined.split("/");
  const resolved: string[] = [];

  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") { resolved.pop(); continue; }
    resolved.push(segment);
  }

  return resolved.join("/");

}

// Extracts href -> chapter title from an EPUB3 nav document's TOC
// section specifically (epub:type="toc"), not its landmarks/page-list
// sections (if present) -- those use the same <a> markup but their
// labels ("Cover", "Titlepage", "Copyright") do not correspond 1:1 to
// spine reading order and must never leak into chapter titles.
function extractNavTocTitles(navXml: string): Map<string, string> {

  const titleByHref = new Map<string, string>();

  const tocSectionMatch = /<nav\b[^>]*\bepub:type\s*=\s*"toc"[^>]*>([\s\S]*?)<\/nav>/i.exec(navXml);
  const scope = tocSectionMatch ? tocSectionMatch[1] : navXml;

  for (const link of extractLinks(scope)) {
    const href = link.href.split("#")[0];
    const title = htmlToReadableText(link.innerHtml).replace(/\n+/g, " ").trim();
    if (href && title && !titleByHref.has(href)) {
      titleByHref.set(href, title);
    }
  }

  return titleByHref;

}

export function convertEpubToAnkiJson(epubBytes: Buffer): EpubConversionResult {

  const zip = new ZipArchive(epubBytes);

  // 1. META-INF/container.xml -- points at the real OPF path, which
  // is NOT fixed by the spec (it is whatever the publisher named it).
  const containerXml = zip.read("META-INF/container.xml");
  if (!containerXml) {
    throw new Error("epub: META-INF/container.xml not found -- not a valid EPUB (missing the required container file)");
  }

  const opfPath = extractFirstAttribute(containerXml.toString("utf-8"), "rootfile", "full-path");
  if (!opfPath) {
    throw new Error("epub: META-INF/container.xml has no <rootfile full-path=\"...\"/> -- cannot locate the package document");
  }

  // 2. The OPF package document -- manifest (id -> href/media-type/
  // properties) and spine (reading order, as manifest idrefs).
  const opfBytes = zip.read(opfPath);
  if (!opfBytes) {
    throw new Error(`epub: OPF package document not found at "${opfPath}" (declared by container.xml) -- archive is incomplete`);
  }
  const opfXml = opfBytes.toString("utf-8");

  const manifestById = new Map<string, ManifestItem>();
  for (const attrs of extractElements(opfXml, "item")) {
    const id = extractAttribute(attrs, "id");
    const href = extractAttribute(attrs, "href");
    if (!id || !href) continue;
    manifestById.set(id, {
      href,
      mediaType: extractAttribute(attrs, "media-type"),
      properties: extractAttribute(attrs, "properties")
    });
  }

  if (manifestById.size === 0) {
    throw new Error(`epub: OPF at "${opfPath}" has no usable <item> manifest entries`);
  }

  const spineIdrefs = extractElements(opfXml, "itemref")
    .map(attrs => extractAttribute(attrs, "idref"))
    .filter((idref): idref is string => Boolean(idref));

  if (spineIdrefs.length === 0) {
    throw new Error(`epub: OPF at "${opfPath}" <spine> has no <itemref> entries -- no reading order to ingest`);
  }

  // 3. Table of contents (EPUB3 nav document only -- see file header
  // comment). Optional: a missing/unreadable nav never fails
  // ingestion.
  const navItem = Array.from(manifestById.values())
    .find(item => (item.properties ?? "").split(/\s+/).includes("nav"));

  let titleByHref = new Map<string, string>();
  let tocSource: "nav" | "none" = "none";

  if (navItem) {
    const navPath = resolveOpfRelativePath(opfPath, navItem.href);
    const navBytes = zip.read(navPath);
    if (navBytes) {
      titleByHref = extractNavTocTitles(navBytes.toString("utf-8"));
      tocSource = titleByHref.size > 0 ? "nav" : "none";
    }
  }

  // 4. Walk the spine in order, extracting readable text per section --
  // the same per-item try/skip-on-empty pattern epub.ts's browser
  // loader already uses, so a single unreadable/empty section (a
  // blank half-title page, a cover image with no text) degrades to a
  // skipped chapter rather than failing the whole book.
  const chapters: AnkiJsonChapter[] = [];
  let loadFailures = 0;
  let emptyAfterExtraction = 0;

  for (const idref of spineIdrefs) {

    const manifestItem = manifestById.get(idref);
    if (!manifestItem) {
      loadFailures++;
      continue;
    }

    const itemPath = resolveOpfRelativePath(opfPath, manifestItem.href);
    const contentBytes = zip.read(itemPath);

    if (!contentBytes) {
      loadFailures++;
      continue;
    }

    const text = htmlToReadableText(contentBytes.toString("utf-8"));

    if (!text.trim().length) {
      emptyAfterExtraction++;
      continue;
    }

    const rawTitle = titleByHref.get(manifestItem.href);
    chapters.push({
      title: rawTitle ? decodeEntities(rawTitle) : null,
      text
    });

  }

  if (chapters.length === 0) {
    throw new Error(
      `epub: parsed but produced zero readable chapters (${spineIdrefs.length} spine items, ` +
      `${loadFailures} failed to load, ${emptyAfterExtraction} loaded with no extractable text)`
    );
  }

  return {
    document: { formatVersion: 1, hasRealChapters: true, chapters },
    diagnostics: {
      spineItemCount: spineIdrefs.length,
      loadFailures,
      emptyAfterExtraction,
      tocSource
    }
  };

}
