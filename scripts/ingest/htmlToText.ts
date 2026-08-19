// Minimal, dependency-free markup helpers for EPUB ingestion.
//
// Node ships no XML/HTML parser. epubjs (this project's only
// EPUB-related dependency) ships its own Node-compatible XML fallback
// (@xmldom/xmldom, used by core.js's parse() when `DOMParser` is
// undefined) -- but that is only reachable if epubjs itself is
// actually installed, and it is not guaranteed to be in every
// environment this ingestion tool runs from. epubjs's OTHER modules
// (rendition/manager/annotations) reference real browser globals
// (window, document, localforage) that would need faking here for no
// real benefit, since ingestion only ever needs the parsing half the
// browser loader (epub.ts) already limits itself to. Rather than
// gamble on which parts of a browser-oriented package happen to work
// headless, or add a brand-new npm dependency for something this
// narrow, this file implements exactly the two things ingestion
// needs -- deliberately NOT a general XML/HTML parser:
//
//  1. extractFirstAttribute/extractElements/extractAttribute --
//     regex-based extraction from the small, fixed-schema XML files a
//     real EPUB always contains (META-INF/container.xml, the OPF
//     package document, an EPUB3 nav document). These are
//     machine-generated, single-purpose files with a narrow,
//     well-documented structure -- safe territory for careful,
//     non-recursive regex extraction, unlike arbitrary XHTML content.
//  2. htmlToReadableText -- strips script/style/nav, decodes the
//     common HTML entities, and converts block-level element
//     boundaries (p/div/h1-6/li/section/article/blockquote) into
//     paragraph breaks BEFORE removing tags, so the result reads the
//     same way epub.ts's own browser extractReadableText() does today
//     (paragraph-joined plain text, no markup) -- same semantic
//     output, different implementation, because a real DOM isn't
//     available in this environment.

const ENTITY_MAP: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
  nbsp: " ", ndash: "\u2013", mdash: "\u2014",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
  hellip: "\u2026"
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, entity: string) => {
    if (entity[0] === "#") {
      const codePoint = (entity[1] === "x" || entity[1] === "X")
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : whole;
    }
    return ENTITY_MAP[entity] ?? whole;
  });
}

// Returns a single attribute's value from the FIRST element matching
// `tagName` -- deliberately narrow, no tree, no handling of multiple
// same-name elements. Sufficient for container.xml's single
// <rootfile full-path="..."/>.
export function extractFirstAttribute(xml: string, tagName: string, attribute: string): string | null {
  const pattern = new RegExp(`<${tagName}\\b[^>]*?\\b${attribute}\\s*=\\s*"([^"]*)"[^>]*/?>`, "i");
  const match = xml.match(pattern);
  return match ? decodeEntities(match[1]) : null;
}

// Returns the raw attribute string of every SELF-CONTAINED element
// matching `tagName` (i.e. no inner content this function needs,
// e.g. OPF's <item .../> and <itemref .../>). Real EPUBs never nest
// one of these inside another of the same name, so a non-recursive
// scan is safe here.
export function extractElements(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b([^>]*?)/?>`, "gi");
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

export function extractAttribute(elementAttrs: string, attribute: string): string | null {
  const match = elementAttrs.match(new RegExp(`\\b${attribute}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

// Returns [href, innerHtml] pairs for every <a href="...">...</a> in
// `xml`. Used only against an EPUB3 nav document's TOC section, which
// never nests one <a> inside another -- a non-recursive scan is safe
// for this specific, narrow input.
export function extractLinks(xml: string): Array<{ href: string; innerHtml: string }> {
  const pattern = /<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const links: Array<{ href: string; innerHtml: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    links.push({ href: decodeEntities(match[1]), innerHtml: match[2] });
  }
  return links;
}

const BLOCK_LEVEL_TAGS = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "br", "section", "article", "blockquote"];
const BLOCK_BOUNDARY_PATTERN = new RegExp(`</?(?:${BLOCK_LEVEL_TAGS.join("|")})\\b[^>]*>`, "gi");

// Converts an XHTML/HTML fragment into plain, paragraph-joined text --
// no markup, no CSS, no images, no layout. Mirrors what epub.ts's own
// extractReadableText() already produces in the browser (block
// elements' .textContent, joined by blank lines), implemented without
// a DOM because none is available here.
export function htmlToReadableText(html: string): string {

  // A full XHTML content document carries a <head> with a <title> --
  // real prose text (e.g. "Imprint", "Titlepage") that is NOT part of
  // the readable content and must never leak into the extracted
  // chapter text the way it would if the whole document (rather than
  // just its <body>) were stripped of tags. Fragments that never had
  // a <body> to begin with (e.g. a nav link's inner HTML, passed in
  // by extractNavTocTitles) fall through unchanged, since there is
  // nothing to isolate.
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  let text = bodyMatch ? bodyMatch[1] : html;

  // Strip whole elements whose CONTENT is never readable prose.
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  // An EPUB3 content document can embed its own navigation/landmarks
  // list (rare, but valid) -- strip it so it never leaks into
  // readable prose the way it would if a real DOM's .textContent were
  // taken over the whole body including a stray <nav>.
  text = text.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ");

  // Turn block-level boundaries into paragraph breaks BEFORE removing
  // tags.
  text = text.replace(BLOCK_BOUNDARY_PATTERN, "\n\n");

  // Remove every remaining tag (inline formatting: em/strong/span/a/...).
  text = text.replace(/<[^>]+>/g, "");

  text = decodeEntities(text);

  // Collapse whitespace within a paragraph, drop empty paragraphs,
  // keep paragraph breaks.
  text = text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\s+/g, " ").trim())
    .filter(paragraph => paragraph.length > 0)
    .join("\n\n");

  return text;

}
