// NOTES + HIGHLIGHTS PHASE: converts between a live browser selection
// Range inside the viewer and a stable {startOffset, endOffset} anchor
// into a page's raw text (FlatPage.rawText, the exact string
// pagination.ts's formatPage() builds each page's HTML from) -- and back
// again, rendering saved highlights into that same HTML.
//
// Why this works at all: formatPage() is a pure function of rawText --
// text.split("\n\n").map(p => `<p>${escapeHtml(p)}</p>`).join(""). Every
// paragraph becomes exactly one <p>, in order, and escapeHtml only
// substitutes HTML entities for five characters -- it never adds or
// removes a character from the paragraph's own text content. So the
// concatenated .textContent of a paragraph's <p> element, once the
// browser has parsed/decoded it, is character-for-character identical to
// that paragraph's slice of rawText -- true whether or not the paragraph
// currently contains <mark> highlight spans, since wrapping text in an
// element never changes its text content. That identity is what makes a
// DOM Range -> rawText offset mapping (and the reverse) possible without
// any real structural ids, which this project's normalized anki-json
// documents simply don't have (confirmed via formats/ankiJson.ts).
import { escapeHtml } from "./pagination";

export interface HighlightMark {
  id: string;
  startOffset: number;
  endOffset: number;
}

// Selection -> anchor. `viewer` must be the element whose innerHTML is
// exactly the current page's rendered HTML (i.e. one <p> per paragraph,
// in document order) -- readerEngine.ts's own viewer element. Returns
// null for any selection this scheme can't safely anchor (crosses into
// non-paragraph markup, an empty/collapsed range, or a structural
// mismatch between the live DOM and rawText) rather than guessing.
export function computeAnchorFromRange(
  viewer: HTMLElement,
  rawText: string,
  range: Range
): { startOffset: number; endOffset: number } | null {

  const paragraphs = rawText.split("\n\n");
  const paragraphElements = Array.from(viewer.children).filter(
    (el): el is HTMLElement => el.tagName === "P"
  );

  if (paragraphElements.length !== paragraphs.length) return null;

  function paragraphIndexFor(node: Node): number {
    for (let i = 0; i < paragraphElements.length; i++) {
      if (paragraphElements[i].contains(node)) return i;
    }
    return -1;
  }

  // Turns a Range boundary (container + offset) into a plain character
  // offset relative to paragraph `pIndex`'s own text, by building a
  // throw-away measuring Range from the very start of the paragraph to
  // that exact boundary and reading its own .toString().length.
  //
  // RANGE BOUNDARY HARDENING: a boundary's `offset` means two different
  // things depending on what `container` is -- a character index when
  // container is a text node, or a CHILD-NODE index when container is an
  // element (e.g. the <p> itself, or a <mark> once a page already has
  // saved highlights: a boundary can legitimately land between/inside
  // <mark> spans, not just at the very start/end of the paragraph, once
  // more than one highlight exists). Range.setStart/setEnd already accept
  // both forms natively and Range.toString() concatenates the text content
  // between the two boundaries regardless of how many elements it crosses
  // -- so measuring via a real Range handles every boundary shape
  // uniformly (plain text-node case included) instead of special-casing
  // "container === root" and guessing start-vs-end from its offset, which
  // only ever covered a paragraph with zero highlights on it.
  function localOffset(pIndex: number, container: Node, offset: number): number | null {
    const root = paragraphElements[pIndex];
    try {
      const measuring = document.createRange();
      measuring.setStart(root, 0);
      measuring.setEnd(container, offset);
      return measuring.toString().length;
    } catch {
      return null;
    }
  }

  function globalOffset(pIndex: number, local: number): number {
    let base = 0;
    for (let i = 0; i < pIndex; i++) base += paragraphs[i].length + 2; // "\n\n"
    return base + local;
  }

  const startParagraph = paragraphIndexFor(range.startContainer);
  const endParagraph = paragraphIndexFor(range.endContainer);
  if (startParagraph === -1 || endParagraph === -1) return null;

  const startLocal = localOffset(startParagraph, range.startContainer, range.startOffset);
  const endLocal = localOffset(endParagraph, range.endContainer, range.endOffset);
  if (startLocal === null || endLocal === null) return null;

  const startOffset = globalOffset(startParagraph, startLocal);
  const endOffset = globalOffset(endParagraph, endLocal);

  if (endOffset <= startOffset) return null;

  return { startOffset, endOffset };

}

// Anchor -> HTML. Same paragraph-splitting formatPage() already does,
// with <mark> spans inserted at the right character offsets inside each
// paragraph -- everything outside a highlighted range is still escaped
// exactly as formatPage() would escape it; nothing about the existing,
// non-highlighted rendering path changes when `marks` is empty (this
// degrades to formatPage()'s own output byte-for-byte in that case).
export function formatPageWithHighlights(rawText: string, marks: HighlightMark[]): string {

  if (marks.length === 0) {
    return rawText.split("\n\n").map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("");
  }

  const paragraphs = rawText.split("\n\n");
  const htmlParts: string[] = [];
  let cursor = 0;

  for (const paragraph of paragraphs) {

    const paraStart = cursor;
    const paraEnd = cursor + paragraph.length;
    cursor = paraEnd + 2;

    const relevant = marks
      .map(mark => ({
        id: mark.id,
        s: Math.max(mark.startOffset, paraStart) - paraStart,
        e: Math.min(mark.endOffset, paraEnd) - paraStart
      }))
      .filter(mark => mark.s < mark.e);

    if (relevant.length === 0) {
      htmlParts.push(`<p>${escapeHtml(paragraph)}</p>`);
      continue;
    }

    htmlParts.push(`<p>${renderParagraphMarks(paragraph, relevant)}</p>`);

  }

  return htmlParts.join("");

}

interface RelativeMark {
  id: string;
  s: number;
  e: number;
}

// OVERLAP / NESTING HARDENING: renders every annotation on this paragraph
// as a deterministic, independently-addressable DOM target, no matter how
// its range relates to any other annotation's range on the same paragraph
// (partial overlap, full nesting, or an identical range) -- a plain
// "advance a single cursor past whichever mark comes first" renderer
// (the previous version) silently drops any mark whose range a prior mark
// already consumed, since it never gets its own <mark> at all, which
// breaks Notes -> exact-annotation focus/scroll for that id.
//
// Classic interval sweep: collect every mark's start/end as boundary
// points, sort them, and treat each [point[i], point[i+1]) slice as one
// indivisible segment. Every character in the paragraph then belongs to
// exactly one segment, and each segment is covered by some (possibly
// empty, possibly multi-id) SET of marks -- so segments never overlap
// each other even when the source marks do. A covered segment becomes one
// <mark> carrying every covering id as a space-separated
// data-annotation-ids list; `[data-annotation-ids~="<id>"]` (the CSS
// attribute-list selector) then finds that id's own segment(s) directly,
// giving every annotation -- including ones fully nested inside another,
// or byte-for-byte identical to another -- a real element to scroll/focus
// on, without needing actually-nested <mark> elements (unreliable for
// inline highlight styling) to show the overlap visually.
function renderParagraphMarks(paragraph: string, relevant: RelativeMark[]): string {

  const boundaries = new Set<number>([0, paragraph.length]);
  for (const mark of relevant) {
    boundaries.add(mark.s);
    boundaries.add(mark.e);
  }
  const points = Array.from(boundaries).sort((a, b) => a - b);

  let html = "";

  for (let i = 0; i < points.length - 1; i++) {

    const segStart = points[i];
    const segEnd = points[i + 1];
    if (segStart >= segEnd) continue;

    const coveringIds = relevant
      .filter(mark => mark.s <= segStart && mark.e >= segEnd)
      .map(mark => mark.id);

    const text = escapeHtml(paragraph.slice(segStart, segEnd));

    html += coveringIds.length === 0
      ? text
      : `<mark class="reader-highlight" data-annotation-ids="${coveringIds.join(" ")}">${text}</mark>`;

  }

  return html;

}
