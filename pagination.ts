const PAGE_TARGET_SIZE = 6500;

export function normalizeBook(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Same sentence-boundary pagination as the original plain-text engine.
export function paginateText(text: string, targetSize: number = PAGE_TARGET_SIZE): string[] {

  const pages: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {

    let end = cursor + targetSize;

    if (end >= text.length) {
      pages.push(text.substring(cursor));
      break;
    }

    while (
      end < text.length &&
      text[end] !== "\n" &&
      text[end] !== "." &&
      text[end] !== "!" &&
      text[end] !== "?"
    ) {
      end++;
    }

    pages.push(text.substring(cursor, end + 1));
    cursor = end + 1;

  }

  return pages;

}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatPage(text: string): string {
  return text
    .split("\n\n")
    .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

// Heuristic chapter title detection for plain text only. Returns "" when
// no reliable chapter marker is found — the caller shows a neutral
// "Чтение" label rather than a fabricated one. Real EPUB/FB2 structure
// (structure_nodes) replaces this heuristic once those formats land.
export function detectChapterTitle(pageText: string): string {

  const lines = pageText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {

    if (line.length < 70 && line === line.toUpperCase() && /[A-ZА-ЯЁ]/.test(line)) {
      return line;
    }

    if (/^chapter/i.test(line) || /^глава/i.test(line)) {
      return line;
    }

  }

  return "";

}
