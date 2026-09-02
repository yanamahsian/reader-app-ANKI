export interface ParsedFb2Metadata {
  title: string | null;
  author: string | null;
  language: string | null;
}

export interface ParsedFb2Chapter {
  title: string | null;
  text: string;
}

export interface ParsedFb2Document {
  metadata: ParsedFb2Metadata;
  chapters: ParsedFb2Chapter[];
}

function localName(element: Element): string {
  return element.localName || element.nodeName.split(":").pop() || element.nodeName;
}

function directChildrenByName(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter(child => localName(child) === name);
}

function firstDirectChild(parent: Element, name: string): Element | null {
  return directChildrenByName(parent, name)[0] ?? null;
}

function firstDescendant(parent: Document | Element, name: string): Element | null {
  const namespaced = parent.getElementsByTagNameNS("*", name);
  if (namespaced.length) return namespaced[0] as Element;

  const plain = parent.getElementsByTagName(name);
  return plain.length ? (plain[0] as Element) : null;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function elementText(element: Element | null): string | null {
  return cleanText(element?.textContent);
}

function decodeFb2(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) return "";

  let encoding = "utf-8";

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
  } else {
    const probe = Array.from(bytes.slice(0, 320), byte => String.fromCharCode(byte)).join("");
    const declared = probe.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase();

    if (declared) {
      if (declared === "cp1251" || declared === "windows1251") encoding = "windows-1251";
      else if (declared === "utf8") encoding = "utf-8";
      else encoding = declared;
    }
  }

  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function chapterTitle(section: Element): string | null {
  const title = firstDirectChild(section, "title");
  return elementText(title);
}

// A real FB2's body/section nesting is at most a few levels deep (title
// page, body, a handful of nested sections for parts/chapters). This cap
// is two orders of magnitude above that -- real books never come close --
// but keeps a pathologically/maliciously deep personal FB2 import (an
// untrusted file the user picked from their device) from blowing the call
// stack. Past the limit, that branch is simply not descended into further
// rather than throwing, so the rest of the document still parses.
const MAX_WALK_DEPTH = 500;

function collectReadableText(root: Element): string {
  const blocks: string[] = [];
  const walk = (node: Element, depth: number): void => {
    const name = localName(node);

    if (name === "binary" || name === "image") return;

    if (name === "empty-line") {
      blocks.push("");
      return;
    }

    if (name === "p" || name === "subtitle" || name === "text-author" || name === "v") {
      const text = cleanText(node.textContent);
      if (text) blocks.push(text);
      return;
    }

    if (depth >= MAX_WALK_DEPTH) return;
    for (const child of Array.from(node.children)) walk(child, depth + 1);
  };

  walk(root, 0);
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseAuthor(titleInfo: Element | null): string | null {
  if (!titleInfo) return null;
  const author = firstDescendant(titleInfo, "author");
  if (!author) return null;

  const parts = [
    elementText(firstDirectChild(author, "first-name")),
    elementText(firstDirectChild(author, "middle-name")),
    elementText(firstDirectChild(author, "last-name"))
  ].filter((part): part is string => Boolean(part));

  if (parts.length) return parts.join(" ");
  return elementText(firstDirectChild(author, "nickname"));
}

export function parseFb2ArrayBuffer(buffer: ArrayBuffer): ParsedFb2Document {
  const xml = decodeFb2(buffer);
  if (!xml.trim()) throw new Error("FB2 is empty");

  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("FB2 XML is invalid");
  }

  const root = document.documentElement;
  if (!root || localName(root) !== "FictionBook") {
    throw new Error("Document is not FictionBook XML");
  }

  const description = firstDescendant(root, "description");
  const titleInfo = description ? firstDescendant(description, "title-info") : null;
  const metadata: ParsedFb2Metadata = {
    title: titleInfo ? elementText(firstDescendant(titleInfo, "book-title")) : null,
    author: parseAuthor(titleInfo),
    language: titleInfo ? elementText(firstDescendant(titleInfo, "lang")) : null
  };

  const allBodies = Array.from(root.getElementsByTagNameNS("*", "body")) as Element[];
  const mainBodies = allBodies.filter(body => {
    const bodyName = (body.getAttribute("name") ?? "").trim().toLowerCase();
    return !bodyName || (bodyName !== "notes" && bodyName !== "comments");
  });

  const chapters: ParsedFb2Chapter[] = [];

  for (const body of mainBodies) {
    const topSections = directChildrenByName(body, "section");

    if (topSections.length) {
      for (const section of topSections) {
        const text = collectReadableText(section);
        if (text) chapters.push({ title: chapterTitle(section), text });
      }
    } else {
      const text = collectReadableText(body);
      if (text) chapters.push({ title: null, text });
    }
  }

  if (!chapters.length) throw new Error("FB2 contains no readable body text");
  return { metadata, chapters };
}
