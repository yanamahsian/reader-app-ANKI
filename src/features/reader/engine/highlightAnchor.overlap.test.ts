// NOTES + HIGHLIGHTS PHASE — OVERLAP / NESTING HARDENING: standalone,
// dependency-free tests for formatPageWithHighlights()'s sweep-line
// segmentation (see highlightAnchor.ts's own "OVERLAP / NESTING HARDENING"
// comment). Deliberately framework-free (this repo has no test runner
// configured yet) -- plain functions + node:assert/strict, runnable today
// via `tsc` + `node` with zero extra dependencies, and trivially wrappable
// in describe()/it() if/when a real runner is added later.
//
// What every scenario checks:
//   1. Every input annotation id has its OWN deterministic DOM target --
//      i.e. `[data-annotation-ids~="<id>"]` (the real selector
//      readerEngine.ts's renderPage() uses for Notes -> exact-annotation
//      focus/scroll) matches something in the rendered HTML. This is the
//      property that broke in the pre-fix renderer: a mark whose range a
//      prior mark already "consumed" via a shared cursor got no <mark> at
//      all, so its id had no DOM target to focus/scroll to.
//   2. No data loss: stripping tags from the rendered HTML and decoding
//      entities reconstructs the exact original paragraph text.
import assert from "node:assert/strict";
import { formatPageWithHighlights, type HighlightMark } from "./highlightAnchor";

function unescapeHtml(html: string): string {
  return html
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function visibleText(renderedPageHtml: string): string {
  return unescapeHtml(renderedPageHtml.replace(/<[^>]+>/g, ""));
}

// Mirrors the CSS attribute-list selector `[data-annotation-ids~="<id>"]`
// readerEngine.ts actually queries with: matches only a whole
// space-separated token, never a bare substring (so id "a" must not
// spuriously match a mark tagged data-annotation-ids="ab").
function hasFocusTarget(renderedPageHtml: string, id: string): boolean {
  const idListPattern = /data-annotation-ids="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = idListPattern.exec(renderedPageHtml))) {
    if (match[1].split(" ").includes(id)) return true;
  }
  return false;
}

interface TestCase {
  name: string;
  run: () => void;
}

const tests: TestCase[] = [];
function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

// -- Scenario: partially overlapping A/B -----------------------------
// A = 0..10, B = 5..15 inside a 20-char single-paragraph page.
test("partially overlapping A/B: both ids get a focus target, text preserved", () => {
  const rawText = "0123456789ABCDEFGHIJ"; // length 20, single paragraph
  const marks: HighlightMark[] = [
    { id: "A", startOffset: 0, endOffset: 10 },
    { id: "B", startOffset: 5, endOffset: 15 }
  ];
  const html = formatPageWithHighlights(rawText, marks);

  assert.ok(hasFocusTarget(html, "A"), "A must have its own DOM target");
  assert.ok(hasFocusTarget(html, "B"), "B must have its own DOM target");
  assert.equal(visibleText(html), rawText, "no character may be lost or duplicated");

  // The overlap segment [5,10) must be tagged with BOTH ids on one
  // element, not two stacked/duplicated marks.
  const overlapMatch = /data-annotation-ids="([^"]*)">56789</.exec(html);
  assert.ok(overlapMatch, "the [5,10) overlap segment must exist as its own tagged run");
  assert.deepEqual(overlapMatch![1].split(" ").sort(), ["A", "B"]);
});

// -- Scenario: B fully inside A ---------------------------------------
// A = 0..20, B = 5..10 -- the exact shape that silently dropped B under
// the old "advance a single shared cursor" renderer (see
// highlightAnchor.ts's own comment: A's cursor jump past offset 20 left
// nothing for B to claim).
test("B fully inside A: B still gets its own focus target, not silently dropped", () => {
  const rawText = "0123456789ABCDEFGHIJKLMNOPQRST"; // length 30
  const marks: HighlightMark[] = [
    { id: "A", startOffset: 0, endOffset: 20 },
    { id: "B", startOffset: 5, endOffset: 10 }
  ];
  const html = formatPageWithHighlights(rawText, marks);

  assert.ok(hasFocusTarget(html, "A"), "A must have its own DOM target");
  assert.ok(hasFocusTarget(html, "B"), "B (nested inside A) must still have its own DOM target");
  assert.equal(visibleText(html), rawText, "no character may be lost or duplicated");

  // Three segments expected: [0,5) A-only, [5,10) A+B, [10,20) A-only.
  const marksFound = Array.from(html.matchAll(/data-annotation-ids="([^"]*)"/g)).map(m => m[1]);
  assert.equal(marksFound.length, 3, `expected 3 distinct highlighted segments, got ${marksFound.length}`);
  assert.deepEqual(marksFound.map(ids => ids.split(" ").sort()), [["A"], ["A", "B"], ["A"]]);
});

// -- Scenario: same exact range A/B ------------------------------------
test("same exact range A/B: one element carries both ids, both focus targets resolve to it", () => {
  const rawText = "0123456789ABCDEFGHIJ"; // length 20
  const marks: HighlightMark[] = [
    { id: "A", startOffset: 3, endOffset: 8 },
    { id: "B", startOffset: 3, endOffset: 8 }
  ];
  const html = formatPageWithHighlights(rawText, marks);

  assert.ok(hasFocusTarget(html, "A"));
  assert.ok(hasFocusTarget(html, "B"));
  assert.equal(visibleText(html), rawText);

  // Must be exactly one <mark> for the identical range, tagged with both.
  const marksFound = Array.from(html.matchAll(/data-annotation-ids="([^"]*)"/g)).map(m => m[1]);
  assert.equal(marksFound.length, 1, "an identical range must collapse to one element, not two stacked marks");
  assert.deepEqual(marksFound[0].split(" ").sort(), ["A", "B"]);
});

// -- Scenario: focusAnnotationId exists in DOM for every id, generally --
// A denser mix (3 annotations, mutual partial overlap + nesting) to
// confirm the "every id gets a target" property isn't scenario-specific.
test("focusAnnotationId exists in DOM for every annotation id, including a 3-way overlap", () => {
  const rawText = "The quick brown fox jumps over the lazy dog in the old garden.";
  const marks: HighlightMark[] = [
    { id: "quick-brown", startOffset: 4, endOffset: 15 },   // "quick brown"
    { id: "brown-fox", startOffset: 10, endOffset: 19 },    // "brown fox" (overlaps quick-brown)
    { id: "fox-only", startOffset: 16, endOffset: 19 }      // "fox" (nested inside brown-fox)
  ];
  const html = formatPageWithHighlights(rawText, marks);

  for (const mark of marks) {
    assert.ok(hasFocusTarget(html, mark.id), `${mark.id} must resolve to a DOM target`);
  }
  assert.equal(visibleText(html), rawText);
});

// -- Regression baseline: non-overlapping marks and the empty-marks case
// must still render exactly as before this fix (no unrelated behavior
// change for the common, non-overlapping case).
test("non-overlapping marks: unaffected, one target each", () => {
  const rawText = "0123456789ABCDEFGHIJ";
  const marks: HighlightMark[] = [
    { id: "A", startOffset: 0, endOffset: 5 },
    { id: "B", startOffset: 10, endOffset: 15 }
  ];
  const html = formatPageWithHighlights(rawText, marks);
  assert.ok(hasFocusTarget(html, "A"));
  assert.ok(hasFocusTarget(html, "B"));
  assert.equal(visibleText(html), rawText);
});

test("no marks: degrades byte-for-byte to the plain formatPage() shape", () => {
  const rawText = "Two paragraphs.\n\nSecond one.";
  const html = formatPageWithHighlights(rawText, []);
  assert.equal(html, "<p>Two paragraphs.</p><p>Second one.</p>");
});

// -- Runner -------------------------------------------------------------
let failed = 0;
for (const { name, run } of tests) {
  try {
    run();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) {
  // eslint-disable-next-line no-process-exit
  process.exit(1);
}
