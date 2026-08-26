from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}\n--- needle ---\n{old[:500]}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


write("src/api/annotations.ts", r'''import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/annotations`;
const NOT_AUTHENTICATED = "Не авторизован.";

export interface Annotation {
  id: string;
  userId: string;
  workId: string;
  editionId: string;
  quoteText: string;
  noteText: string | null;
  pageIndex: number;
  startOffset: number;
  endOffset: number;
  contextBefore: string | null;
  contextAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AnnotationRow {
  id: string;
  user_id: string;
  work_id: string;
  edition_id: string;
  quote_text: string;
  note_text: string | null;
  page_index: number;
  start_offset: number;
  end_offset: number;
  context_before: string | null;
  context_after: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnotationInput {
  id: string;
  workId: string;
  editionId: string;
  quoteText: string;
  noteText: string | null;
  pageIndex: number;
  startOffset: number;
  endOffset: number;
  contextBefore: string | null;
  contextAfter: string | null;
}

function fromRow(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    userId: row.user_id,
    workId: row.work_id,
    editionId: row.edition_id,
    quoteText: row.quote_text,
    noteText: row.note_text,
    pageIndex: row.page_index,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    contextBefore: row.context_before,
    contextAfter: row.context_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new Error(NOT_AUTHENTICATED);
  return {
    "apikey": SUPABASE_PUBLISHABLE_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function throwOnError(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => "");
  console.error(`annotations ${action} failed (${response.status}):`, detail);
  throw new Error(`Не удалось выполнить действие с заметкой (${action}).`);
}

export async function listAnnotationsByEdition(editionId: string): Promise<Annotation[]> {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    edition_id: `eq.${editionId}`,
    select: "*",
    order: "updated_at.desc"
  });
  const response = await fetch(`${TABLE_ENDPOINT}?${params.toString()}`, { headers });
  await throwOnError(response, "list-edition");
  const rows = (await response.json()) as AnnotationRow[];
  return rows.map(fromRow);
}

export async function listAnnotations(): Promise<Annotation[]> {
  const headers = await authHeaders();
  const params = new URLSearchParams({ select: "*", order: "updated_at.desc" });
  const response = await fetch(`${TABLE_ENDPOINT}?${params.toString()}`, { headers });
  await throwOnError(response, "list");
  const rows = (await response.json()) as AnnotationRow[];
  return rows.map(fromRow);
}

export async function createAnnotation(userId: string, input: CreateAnnotationInput): Promise<Annotation> {
  const headers = await authHeaders({ "Prefer": "return=representation" });
  const response = await fetch(`${TABLE_ENDPOINT}?select=*`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: input.id,
      user_id: userId,
      work_id: input.workId,
      edition_id: input.editionId,
      quote_text: input.quoteText,
      note_text: input.noteText,
      page_index: input.pageIndex,
      start_offset: input.startOffset,
      end_offset: input.endOffset,
      context_before: input.contextBefore,
      context_after: input.contextAfter
    })
  });
  await throwOnError(response, "create");
  const rows = (await response.json()) as AnnotationRow[];
  if (!rows[0]) throw new Error("Сервер не вернул сохранённую заметку.");
  return fromRow(rows[0]);
}

export async function updateAnnotationNote(id: string, noteText: string | null): Promise<Annotation> {
  const headers = await authHeaders({ "Prefer": "return=representation" });
  const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });
  const response = await fetch(`${TABLE_ENDPOINT}?${params.toString()}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      note_text: noteText,
      updated_at: new Date().toISOString()
    })
  });
  await throwOnError(response, "update");
  const rows = (await response.json()) as AnnotationRow[];
  if (!rows[0]) throw new Error("Заметка не найдена.");
  return fromRow(rows[0]);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const headers = await authHeaders({ "Prefer": "return=minimal" });
  const params = new URLSearchParams({ id: `eq.${id}` });
  const response = await fetch(`${TABLE_ENDPOINT}?${params.toString()}`, {
    method: "DELETE",
    headers
  });
  await throwOnError(response, "delete");
}
''')

write("src/features/reader/engine/types.ts", r'''// Shared types for the reader engine and the API layer that feeds it.
// Kept intentionally close to the shape omnia-library already returns.

export interface Book {
  // Reader-level id is the Edition id (see catalog/toReaderBook.ts).
  id: string;
  // Work id is kept separately so edition-specific annotations can still
  // be grouped back under one canonical Work on the Notes screen.
  workId?: string;
  title: string;
  author?: string;
  language?: string;
  year?: number | string;
  cover?: string;
  url: string;
  format?: "epub" | "plaintext" | "fb2" | "pdf" | "anki-json";
}

export interface Fragment {
  id: string;
  // Edition id. Older guest fragments may still carry an old Work-scoped
  // value; new annotations always use the Edition id.
  bookId: string;
  workId?: string;
  bookTitle: string;
  author: string;
  page: number;
  text: string;
  noteText?: string | null;
  startOffset?: number;
  endOffset?: number;
  contextBefore?: string | null;
  contextAfter?: string | null;
  createdAt: number;
}

export interface ReaderLocation {
  pageIndex: number;
  startOffset: number;
  endOffset: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  pageIndex: number;
  chapterTitle: string | null;
  createdAt: number;
}

export interface ReadingPosition {
  page: number;
}
''')

write("src/features/reader/progressStore/progressStore.ts", r'''import type { Fragment, Bookmark } from "../engine/types";

export interface ProgressStore {
  getPosition(bookId: string): number | null;
  savePosition(bookId: string, page: number): void;

  getFragments(): Fragment[];
  saveFragment(fragment: Fragment): Promise<void>;
  updateFragmentNote(id: string, noteText: string | null): Promise<void>;
  deleteFragment(id: string): Promise<void>;

  getBookmarks(bookId: string): Bookmark[];
  saveBookmark(bookmark: Bookmark): void;
  deleteBookmark(id: string): void;
}
''')

write("src/features/reader/progressStore/localStorageStore.ts", r'''import type { ProgressStore } from "./progressStore";
import type { Fragment, Bookmark } from "../engine/types";

const PREFIX = "anki_";

const KEYS = {
  POSITION_PREFIX: PREFIX + "position_",
  FRAGMENTS: PREFIX + "fragments",
  BOOKMARKS: PREFIX + "bookmarks"
} as const;

export function createLocalStorageStore(): ProgressStore {

  function getPosition(bookId: string): number | null {
    const raw = localStorage.getItem(KEYS.POSITION_PREFIX + bookId);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isNaN(value) ? null : value;
  }

  function savePosition(bookId: string, page: number): void {
    localStorage.setItem(KEYS.POSITION_PREFIX + bookId, String(page));
  }

  function getFragments(): Fragment[] {
    try {
      const raw = localStorage.getItem(KEYS.FRAGMENTS);
      return raw ? (JSON.parse(raw) as Fragment[]) : [];
    } catch {
      return [];
    }
  }

  async function saveFragment(fragment: Fragment): Promise<void> {
    const fragments = getFragments();
    fragments.unshift(fragment);
    localStorage.setItem(KEYS.FRAGMENTS, JSON.stringify(fragments));
  }

  async function updateFragmentNote(id: string, noteText: string | null): Promise<void> {
    const fragments = getFragments().map(fragment =>
      fragment.id === id ? { ...fragment, noteText } : fragment
    );
    localStorage.setItem(KEYS.FRAGMENTS, JSON.stringify(fragments));
  }

  async function deleteFragment(id: string): Promise<void> {
    const fragments = getFragments().filter(item => item.id !== id);
    localStorage.setItem(KEYS.FRAGMENTS, JSON.stringify(fragments));
  }

  function getAllBookmarks(): Bookmark[] {
    try {
      const raw = localStorage.getItem(KEYS.BOOKMARKS);
      return raw ? (JSON.parse(raw) as Bookmark[]) : [];
    } catch {
      return [];
    }
  }

  function getBookmarks(bookId: string): Bookmark[] {
    return getAllBookmarks().filter(bookmark => bookmark.bookId === bookId);
  }

  function saveBookmark(bookmark: Bookmark): void {
    const bookmarks = getAllBookmarks();
    bookmarks.unshift(bookmark);
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  }

  function deleteBookmark(id: string): void {
    const bookmarks = getAllBookmarks().filter(item => item.id !== id);
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  }

  return {
    getPosition,
    savePosition,
    getFragments,
    saveFragment,
    updateFragmentNote,
    deleteFragment,
    getBookmarks,
    saveBookmark,
    deleteBookmark
  };

}
''')

write("src/features/reader/progressStore/supabaseProgressStore.ts", r'''import type { ProgressStore } from "./progressStore";
import type { Fragment } from "../engine/types";
import type { Annotation } from "../../../api/annotations";
import { createAnnotation, deleteAnnotation, updateAnnotationNote } from "../../../api/annotations";
import { createLocalStorageStore } from "./localStorageStore";
import { saveProgress } from "../../../api/readerProgress";

function annotationToFragment(annotation: Annotation): Fragment {
  return {
    id: annotation.id,
    bookId: annotation.editionId,
    workId: annotation.workId,
    bookTitle: "",
    author: "",
    page: annotation.pageIndex,
    text: annotation.quoteText,
    noteText: annotation.noteText,
    startOffset: annotation.startOffset,
    endOffset: annotation.endOffset,
    contextBefore: annotation.contextBefore,
    contextAfter: annotation.contextAfter,
    createdAt: Date.parse(annotation.createdAt)
  };
}

export function createSupabaseProgressStore(
  editionId: string,
  userId: string,
  initialPosition: number | null,
  initialAnnotations: Annotation[]
): ProgressStore {

  const local = createLocalStorageStore();
  let cachedPosition = initialPosition;
  let cachedFragments = initialAnnotations.map(annotationToFragment);

  function getPosition(bookId: string): number | null {
    if (bookId !== editionId) return null;
    return cachedPosition;
  }

  function savePosition(bookId: string, page: number): void {
    if (bookId !== editionId) return;
    cachedPosition = page;
    saveProgress(editionId, page).catch(error => {
      console.error("supabaseProgressStore: background position save failed:", error);
    });
  }

  function getFragments(): Fragment[] {
    return [...cachedFragments];
  }

  async function saveFragment(fragment: Fragment): Promise<void> {
    if (
      !fragment.workId ||
      fragment.bookId !== editionId ||
      fragment.startOffset === undefined ||
      fragment.endOffset === undefined
    ) {
      throw new Error("Недостаточно данных для сохранения выделения.");
    }

    const previous = cachedFragments;
    cachedFragments = [fragment, ...cachedFragments.filter(item => item.id !== fragment.id)];

    try {
      await createAnnotation(userId, {
        id: fragment.id,
        workId: fragment.workId,
        editionId,
        quoteText: fragment.text,
        noteText: fragment.noteText ?? null,
        pageIndex: fragment.page,
        startOffset: fragment.startOffset,
        endOffset: fragment.endOffset,
        contextBefore: fragment.contextBefore ?? null,
        contextAfter: fragment.contextAfter ?? null
      });
    } catch (error) {
      cachedFragments = previous;
      throw error;
    }
  }

  async function updateFragmentNote(id: string, noteText: string | null): Promise<void> {
    const previous = cachedFragments;
    cachedFragments = cachedFragments.map(fragment =>
      fragment.id === id ? { ...fragment, noteText } : fragment
    );
    try {
      await updateAnnotationNote(id, noteText);
    } catch (error) {
      cachedFragments = previous;
      throw error;
    }
  }

  async function deleteFragment(id: string): Promise<void> {
    const previous = cachedFragments;
    cachedFragments = cachedFragments.filter(fragment => fragment.id !== id);
    try {
      await deleteAnnotation(id);
    } catch (error) {
      cachedFragments = previous;
      throw error;
    }
  }

  return {
    getPosition,
    savePosition,
    getFragments,
    saveFragment,
    updateFragmentNote,
    deleteFragment,
    getBookmarks: local.getBookmarks,
    saveBookmark: local.saveBookmark,
    deleteBookmark: local.deleteBookmark
  };

}
''')

write("src/features/reader/engine/selection.ts", r'''export interface SelectionHandlers {
  onTranslate: () => void;
  onExplain: () => void;
  onSave: () => void;
  onNote: () => void;
}

export interface SelectionSnapshot {
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface SelectionController {
  getSelectedText(): string;
  getSelectionSnapshot(): SelectionSnapshot | null;
  destroy(): void;
}

function paragraphForNode(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement;
  return (element?.closest("p[data-text-start]") as HTMLElement | null) ?? null;
}

function absoluteOffset(viewer: HTMLElement, node: Node, offset: number): number | null {
  const paragraph = paragraphForNode(node);
  if (!paragraph || !viewer.contains(paragraph)) return null;

  const base = Number(paragraph.dataset.textStart);
  if (!Number.isFinite(base)) return null;

  const prefix = document.createRange();
  prefix.selectNodeContents(paragraph);
  try {
    prefix.setEnd(node, offset);
  } catch {
    return null;
  }

  return base + prefix.toString().length;
}

export function createSelectionController(
  viewer: HTMLElement,
  handlers: SelectionHandlers
): SelectionController {

  let selectedText = "";
  let selectedSnapshot: SelectionSnapshot | null = null;

  const toolbar = document.createElement("div");
  toolbar.className = "selection-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Действия с выделенным текстом");
  toolbar.style.display = "none";

  const translateBtn = document.createElement("button");
  translateBtn.type = "button";
  translateBtn.textContent = "Перевести";

  const explainBtn = document.createElement("button");
  explainBtn.type = "button";
  explainBtn.textContent = "Объяснить";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Выделить";

  const noteBtn = document.createElement("button");
  noteBtn.type = "button";
  noteBtn.textContent = "Заметка";

  toolbar.append(translateBtn, explainBtn, saveBtn, noteBtn);
  document.body.appendChild(toolbar);

  function hideToolbar(): void {
    toolbar.style.display = "none";
  }

  function showToolbar(range: Range): void {
    const rect = range.getBoundingClientRect();
    toolbar.style.display = "flex";
    toolbar.style.position = "fixed";
    toolbar.style.left = (rect.left + rect.width / 2) + "px";
    toolbar.style.top = (rect.top - 56) + "px";
  }

  function handleSelectionChange(): void {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      hideToolbar();
      return;
    }

    const range = selection.getRangeAt(0);
    const exactText = range.toString();

    if (
      !exactText.trim().length ||
      !viewer.contains(range.startContainer) ||
      !viewer.contains(range.endContainer)
    ) {
      hideToolbar();
      return;
    }

    const startOffset = absoluteOffset(viewer, range.startContainer, range.startOffset);
    const endOffset = absoluteOffset(viewer, range.endContainer, range.endOffset);

    if (startOffset === null || endOffset === null || endOffset <= startOffset) {
      hideToolbar();
      return;
    }

    selectedText = exactText.trim();
    selectedSnapshot = { text: exactText, startOffset, endOffset };
    showToolbar(range);
  }

  translateBtn.addEventListener("click", () => {
    hideToolbar();
    handlers.onTranslate();
  });

  explainBtn.addEventListener("click", () => {
    hideToolbar();
    handlers.onExplain();
  });

  saveBtn.addEventListener("click", () => {
    hideToolbar();
    handlers.onSave();
  });

  noteBtn.addEventListener("click", () => {
    hideToolbar();
    handlers.onNote();
  });

  document.addEventListener("selectionchange", handleSelectionChange);

  function destroy(): void {
    document.removeEventListener("selectionchange", handleSelectionChange);
    toolbar.remove();
  }

  return {
    getSelectedText: () => selectedText,
    getSelectionSnapshot: () => selectedSnapshot,
    destroy
  };

}
''')

write("src/features/reader/engine/pagination.ts", r'''const PAGE_TARGET_SIZE = 6500;

export function normalizeBook(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

// The data-text-* attributes are stable offsets into this page's rawText.
// Pagination is character-count/sentence-boundary based, not viewport
// based, so these anchors do not move when font size or screen size changes.
export function formatPage(text: string): string {
  let offset = 0;
  return text
    .split("\n\n")
    .map(paragraph => {
      const start = offset;
      const end = start + paragraph.length;
      offset = end + 2;
      return `<p data-text-start="${start}" data-text-end="${end}">${escapeHtml(paragraph)}</p>`;
    })
    .join("");
}

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
''')

write("src/features/reader/ReaderView.tsx", r'''import { useEffect, useRef } from "react";
import type { Book, ReaderLocation } from "./engine/types";
import { createReaderEngine, type ReaderEngine } from "./engine/readerEngine";
import { createLocalStorageStore } from "./progressStore/localStorageStore";
import { createSupabaseProgressStore } from "./progressStore/supabaseProgressStore";
import { getSession } from "../../auth/supabaseAuth";
import { fetchProgress } from "../../api/readerProgress";
import { listAnnotationsByEdition } from "../../api/annotations";

interface ReaderViewProps {
  book: Book;
  onExit: () => void;
  initialLocation?: ReaderLocation | null;
}

export function ReaderView({ book, onExit, initialLocation }: ReaderViewProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    async function setUpReader() {
      const session = getSession();

      let progressStore;
      if (session) {
        const [position, annotations] = await Promise.all([
          fetchProgress(book.id),
          listAnnotationsByEdition(book.id)
        ]);
        progressStore = createSupabaseProgressStore(
          book.id,
          session.user.id,
          position,
          annotations
        );
      } else {
        progressStore = createLocalStorageStore();
      }

      if (cancelled) return;

      const engine = createReaderEngine({
        container,
        progressStore,
        onExit,
        initialLocation: initialLocation ?? undefined
      });

      engineRef.current = engine;

      engine.open(book).catch(error => {
        console.error(error);
        alert("Не удалось открыть книгу.");
      });
    }

    setUpReader();

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [book, initialLocation?.pageIndex, initialLocation?.startOffset, initialLocation?.endOffset, onExit]);

  return (
    <section
      className="reader-view"
      aria-label="Режим чтения"
      ref={containerRef}
    />
  );

}
''')

write("src/features/notes/NotesView.tsx", r'''import { useEffect, useMemo, useRef, useState } from "react";
import { ShellPage } from "../shared/ShellPage";
import { useAuth } from "../../auth/supabaseAuth";
import { deleteAnnotation, listAnnotations, updateAnnotationNote } from "../../api/annotations";
import type { Annotation } from "../../api/annotations";
import { fetchAndMergeWorksByIds } from "../../api/userLibrary";
import { getBookById } from "../../catalog";
import { getLanguageLabel } from "../../catalog/languages";

export interface NotesRestoreState {
  query: string;
}

interface NotesViewProps {
  onBack: () => void;
  restoreState: NotesRestoreState | null;
  onOpenAnnotation: (annotation: Annotation, state: NotesRestoreState) => void;
  onRequireSignIn: () => void;
  onOpenLibrary: () => void;
}

type Status = "loading" | "success" | "empty" | "error";

export function NotesView({
  onBack,
  restoreState,
  onOpenAnnotation,
  onRequireSignIn,
  onOpenLibrary
}: NotesViewProps) {

  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState(restoreState?.query ?? "");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setAnnotations([]);
      setStatus("empty");
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");

    (async () => {
      try {
        const rows = await listAnnotations();
        if (requestId !== requestIdRef.current) return;

        const workIds = Array.from(new Set(rows.map(row => row.workId)));
        if (workIds.length) await fetchAndMergeWorksByIds(workIds);
        if (requestId !== requestIdRef.current) return;

        setAnnotations(rows);
        setStatus(rows.length ? "success" : "empty");
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error("NotesView load failed:", error);
        setStatus("error");
      }
    })();
  }, [isAuthenticated]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return annotations;

    return annotations.filter(annotation => {
      const book = getBookById(annotation.workId);
      const haystack = [
        book?.title ?? "",
        book?.authorName ?? "",
        annotation.quoteText,
        annotation.noteText ?? ""
      ].join("\n").toLocaleLowerCase();
      return haystack.includes(needle);
    });
  }, [annotations, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const annotation of visible) {
      const list = map.get(annotation.workId) ?? [];
      list.push(annotation);
      map.set(annotation.workId, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  function snapshot(): NotesRestoreState {
    return { query };
  }

  function beginEdit(annotation: Annotation): void {
    setEditingId(annotation.id);
    setDraft(annotation.noteText ?? "");
    setActionError(null);
  }

  async function saveEdit(annotation: Annotation): Promise<void> {
    setBusyId(annotation.id);
    setActionError(null);
    try {
      const next = await updateAnnotationNote(annotation.id, draft.trim() || null);
      setAnnotations(rows => rows.map(row => row.id === next.id ? next : row));
      setEditingId(null);
      setDraft("");
    } catch (error) {
      console.error("NotesView update failed:", error);
      setActionError("Не удалось сохранить заметку.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(annotation: Annotation): Promise<void> {
    if (!window.confirm("Удалить это выделение и заметку?")) return;
    setBusyId(annotation.id);
    setActionError(null);
    const previous = annotations;
    setAnnotations(rows => rows.filter(row => row.id !== annotation.id));
    try {
      await deleteAnnotation(annotation.id);
    } catch (error) {
      console.error("NotesView delete failed:", error);
      setAnnotations(previous);
      setActionError("Не удалось удалить заметку.");
    } finally {
      setBusyId(null);
    }
  }

  function editionLabel(annotation: Annotation): string {
    const book = getBookById(annotation.workId);
    const edition = book?.editions.find(item => item.id === annotation.editionId);
    if (!edition) return annotation.editionId;
    const parts = [getLanguageLabel(edition.language)];
    if (edition.translatorName) parts.push(`пер. ${edition.translatorName}`);
    return parts.join(" · ");
  }

  function renderBody() {
    if (!isAuthenticated) {
      return (
        <div className="guest-notice">
          <p className="guest-notice-message">
            Здесь появятся ваши выделения и заметки из книг. Чтобы синхронизировать их между устройствами, войдите в аккаунт.
          </p>
          <div className="guest-notice-actions">
            <button type="button" className="primary-button" onClick={onRequireSignIn}>Войти</button>
          </div>
        </div>
      );
    }

    if (status === "loading" && annotations.length === 0) {
      return <div className="empty-state">Загрузка…</div>;
    }

    if (status === "error") {
      return <p className="notes-error">Не удалось загрузить заметки. Попробуйте обновить страницу.</p>;
    }

    if (status === "empty") {
      return (
        <div className="guest-notice">
          <p className="guest-notice-message">Здесь появятся ваши выделения и заметки из книг.</p>
          <div className="guest-notice-actions">
            <button type="button" className="primary-button" onClick={onOpenLibrary}>Перейти в библиотеку</button>
          </div>
        </div>
      );
    }

    if (groups.length === 0) {
      return <div className="empty-state">По этому запросу ничего не найдено.</div>;
    }

    return (
      <div className="notes-groups">
        {groups.map(([workId, rows]) => {
          const book = getBookById(workId);
          if (!book) return null;

          return (
            <section className="notes-work" key={workId}>
              <header className="notes-work-head">
                <h2>{book.title}</h2>
                <p>{book.authorName}</p>
              </header>

              <div className="notes-list">
                {rows.map(annotation => (
                  <article className="note-card" key={annotation.id}>
                    <button
                      type="button"
                      className="note-quote-button"
                      onClick={() => onOpenAnnotation(annotation, snapshot())}
                    >
                      <span className="note-edition">{editionLabel(annotation)}</span>
                      <blockquote>{annotation.quoteText}</blockquote>
                    </button>

                    {editingId === annotation.id ? (
                      <div className="note-editor">
                        <textarea
                          value={draft}
                          onChange={event => setDraft(event.target.value)}
                          placeholder="Добавьте свою заметку…"
                          rows={4}
                        />
                        <div className="note-actions">
                          <button
                            type="button"
                            className="primary-button"
                            disabled={busyId === annotation.id}
                            onClick={() => void saveEdit(annotation)}
                          >
                            Сохранить
                          </button>
                          <button type="button" className="text-link" onClick={() => setEditingId(null)}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {annotation.noteText && <p className="note-comment">{annotation.noteText}</p>}
                        <div className="note-actions">
                          <button type="button" className="text-link" onClick={() => beginEdit(annotation)}>
                            {annotation.noteText ? "Изменить заметку" : "Добавить заметку"}
                          </button>
                          <button
                            type="button"
                            className="text-link note-delete"
                            disabled={busyId === annotation.id}
                            onClick={() => void remove(annotation)}
                          >
                            Удалить
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Заметки">
      {isAuthenticated && (
        <div className="notes-toolbar">
          <input
            className="search-input notes-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Книга, цитата или заметка"
            aria-label="Поиск по заметкам"
          />
        </div>
      )}

      {actionError && <p className="notes-error">{actionError}</p>}
      {renderBody()}
    </ShellPage>
  );
}
''')

write("supabase/sql/annotations.sql", r'''-- Production schema snapshot for Notes + Highlights.
-- The migration `20260826141420 add_annotations_for_notes_and_highlights`
-- is already applied in Supabase. This file mirrors that live schema so
-- GitHub remains the reproducible source instead of production running
-- ahead of the repository.

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id text not null,
  edition_id text not null,
  quote_text text not null,
  note_text text null,
  page_index integer not null check (page_index >= 0),
  start_offset integer not null,
  end_offset integer not null,
  context_before text null,
  context_after text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annotations_offsets_check check (start_offset >= 0 and end_offset > start_offset)
);

create index if not exists annotations_user_id_idx
  on public.annotations(user_id);
create index if not exists annotations_user_id_edition_id_idx
  on public.annotations(user_id, edition_id);
create index if not exists annotations_user_id_work_id_idx
  on public.annotations(user_id, work_id);
create index if not exists annotations_user_id_updated_at_idx
  on public.annotations(user_id, updated_at desc);

alter table public.annotations enable row level security;

drop policy if exists annotations_select_own on public.annotations;
create policy annotations_select_own on public.annotations
  for select using (auth.uid() = user_id);

drop policy if exists annotations_insert_own on public.annotations;
create policy annotations_insert_own on public.annotations
  for insert with check (auth.uid() = user_id);

drop policy if exists annotations_update_own on public.annotations;
create policy annotations_update_own on public.annotations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists annotations_delete_own on public.annotations;
create policy annotations_delete_own on public.annotations
  for delete using (auth.uid() = user_id);
''')

# Reader book bridge: keep both canonical Work id and concrete Edition id.
replace_once(
    "src/catalog/toReaderBook.ts",
    '''  return {\n    id: resolved.edition.id,\n    title: catalogBook.title,''',
    '''  return {\n    id: resolved.edition.id,\n    workId: catalogBook.id,\n    title: catalogBook.title,'''
)

# Reader engine imports/options/state.
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    'import type { Book, Fragment, Bookmark } from "./types";',
    'import type { Book, Fragment, Bookmark, ReaderLocation } from "./types";'
)
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''export interface ReaderEngineOptions {\n  container: HTMLElement;\n  progressStore: ProgressStore;\n  onExit: () => void;\n}''',
    '''export interface ReaderEngineOptions {\n  container: HTMLElement;\n  progressStore: ProgressStore;\n  onExit: () => void;\n  initialLocation?: ReaderLocation;\n}'''
)
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''function flattenDocument(doc: LoadedDocument): FlatPage[] {\n\n  const flat: FlatPage[] = [];''',
    '''function flattenDocument(doc: LoadedDocument): FlatPage[] {\n\n  const flat: FlatPage[] = [];'''
)
# Insert highlight renderer just before createReaderEngine.
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''  return flat;\n\n}\n\nexport function createReaderEngine(options: ReaderEngineOptions): ReaderEngine {''',
    r'''  return flat;

}

interface HighlightInterval {
  start: number;
  end: number;
  hasNote: boolean;
}

function renderHighlights(viewer: HTMLElement, pageIndex: number, fragments: Fragment[]): void {
  const anchored = fragments.filter(fragment =>
    fragment.page === pageIndex &&
    typeof fragment.startOffset === "number" &&
    typeof fragment.endOffset === "number" &&
    fragment.endOffset > fragment.startOffset
  );

  if (!anchored.length) return;

  for (const paragraph of Array.from(viewer.querySelectorAll<HTMLElement>("p[data-text-start]"))) {
    const text = paragraph.textContent ?? "";
    const paragraphStart = Number(paragraph.dataset.textStart);
    if (!Number.isFinite(paragraphStart)) continue;
    const paragraphEnd = paragraphStart + text.length;

    const intervals: HighlightInterval[] = anchored
      .map(fragment => ({
        start: Math.max(fragment.startOffset as number, paragraphStart),
        end: Math.min(fragment.endOffset as number, paragraphEnd),
        hasNote: Boolean(fragment.noteText?.trim())
      }))
      .filter(interval => interval.end > interval.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    if (!intervals.length) continue;

    const merged: HighlightInterval[] = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
        last.hasNote = last.hasNote || interval.hasNote;
      } else {
        merged.push({ ...interval });
      }
    }

    paragraph.textContent = "";
    let cursor = 0;

    for (const interval of merged) {
      const relativeStart = interval.start - paragraphStart;
      const relativeEnd = interval.end - paragraphStart;
      if (relativeStart > cursor) {
        paragraph.appendChild(document.createTextNode(text.slice(cursor, relativeStart)));
      }

      const mark = document.createElement("mark");
      mark.className = interval.hasNote ? "reader-highlight reader-highlight-note" : "reader-highlight";
      mark.textContent = text.slice(relativeStart, relativeEnd);
      if (interval.hasNote) mark.title = "К выделению добавлена заметка";
      paragraph.appendChild(mark);
      cursor = relativeEnd;
    }

    if (cursor < text.length) {
      paragraph.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }
}

export function createReaderEngine(options: ReaderEngineOptions): ReaderEngine {'''
)
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''  const { container, progressStore, onExit } = options;''',
    '''  const { container, progressStore, onExit, initialLocation } = options;'''
)
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''  let currentPage = 0;\n  let bookmarks: Bookmark[] = [];''',
    '''  let currentPage = 0;\n  let bookmarks: Bookmark[] = [];\n  let fragments: Fragment[] = [];'''
)

# Action sheet gets a distinct Note action.
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''  const sheetSaveBtn = document.createElement("button");\n  sheetSaveBtn.type = "button";\n  sheetSaveBtn.textContent = "Сохранить";\n\n  sheetActions.append(sheetTranslateBtn, sheetExplainBtn, sheetSaveBtn);''',
    '''  const sheetSaveBtn = document.createElement("button");\n  sheetSaveBtn.type = "button";\n  sheetSaveBtn.textContent = "Выделить";\n\n  const sheetNoteBtn = document.createElement("button");\n  sheetNoteBtn.type = "button";\n  sheetNoteBtn.textContent = "Заметка";\n\n  sheetActions.append(sheetTranslateBtn, sheetExplainBtn, sheetSaveBtn, sheetNoteBtn);'''
)

old_save = r'''  function runSave(): void {

    const text = selection.getSelectedText();
    if (!text.trim() || !currentBook) return;

    const fragment: Fragment = {
      id: crypto.randomUUID(),
      bookId: currentBook.id,
      bookTitle: currentBook.title,
      author: currentBook.author || "",
      page: currentPage,
      text,
      createdAt: Date.now()
    };

    progressStore.saveFragment(fragment);
    notify("Сохранено");

    if (!actionSheet.classList.contains("hidden")) {
      updateActionSheet(`<div class="sheet-error" style="color:var(--reader-gold)">Фрагмент сохранён.</div>`);
    }

  }

  const selection: SelectionController = createSelectionController(viewer, {
    onTranslate: runTranslate,
    onExplain: runExplain,
    onSave: runSave
  });

  sheetTranslateBtn.addEventListener("click", runTranslate);
  sheetExplainBtn.addEventListener("click", runExplain);
  sheetSaveBtn.addEventListener("click", runSave);
  closeActionSheetBtn.addEventListener("click", closeActionSheet);
  sheetBackdrop.addEventListener("click", closeActionSheet);'''

new_save = r'''  function fragmentFromSelection(noteText: string | null): Fragment | null {
    const snapshot = selection.getSelectionSnapshot();
    if (!snapshot || !currentBook) return null;

    const page = pages[currentPage];
    if (!page) return null;

    const startOffset = Math.max(0, Math.min(snapshot.startOffset, page.rawText.length));
    const endOffset = Math.max(startOffset, Math.min(snapshot.endOffset, page.rawText.length));
    if (endOffset <= startOffset) return null;

    const text = page.rawText.slice(startOffset, endOffset);
    if (!text.trim()) return null;

    const contextRadius = 96;

    return {
      id: crypto.randomUUID(),
      bookId: currentBook.id,
      workId: currentBook.workId ?? currentBook.id,
      bookTitle: currentBook.title,
      author: currentBook.author || "",
      page: currentPage,
      text,
      noteText,
      startOffset,
      endOffset,
      contextBefore: page.rawText.slice(Math.max(0, startOffset - contextRadius), startOffset) || null,
      contextAfter: page.rawText.slice(endOffset, Math.min(page.rawText.length, endOffset + contextRadius)) || null,
      createdAt: Date.now()
    };
  }

  async function persistSelection(noteText: string | null): Promise<void> {
    const fragment = fragmentFromSelection(noteText);
    if (!fragment) return;

    fragments = [fragment, ...fragments];
    renderHighlights(viewer, currentPage, fragments);

    try {
      await progressStore.saveFragment(fragment);
      notify(noteText ? "Заметка сохранена" : "Выделение сохранено");
      if (!actionSheet.classList.contains("hidden")) {
        updateActionSheet(`<div class="sheet-success">${noteText ? "Заметка сохранена." : "Выделение сохранено."}</div>`);
      }
    } catch (error) {
      console.error("readerEngine: annotation save failed:", error);
      fragments = fragments.filter(item => item.id !== fragment.id);
      renderPage(currentPage, false);
      notify("Не удалось сохранить");
      if (!actionSheet.classList.contains("hidden")) {
        updateActionSheet(`<div class="sheet-error">Не удалось сохранить.</div>`);
      }
    }
  }

  function runSave(): void {
    void persistSelection(null);
  }

  function runNote(): void {
    if (!selection.getSelectionSnapshot()) return;

    openActionSheet("Заметка", "");
    actionResult.textContent = "";

    const textarea = document.createElement("textarea");
    textarea.className = "reader-note-input";
    textarea.rows = 4;
    textarea.placeholder = "Добавьте свою заметку…";

    const saveNoteBtn = document.createElement("button");
    saveNoteBtn.type = "button";
    saveNoteBtn.className = "reader-note-save";
    saveNoteBtn.textContent = "Сохранить заметку";
    saveNoteBtn.addEventListener("click", () => {
      void persistSelection(textarea.value.trim() || null);
    });

    actionResult.append(textarea, saveNoteBtn);
    textarea.focus();
  }

  const selection: SelectionController = createSelectionController(viewer, {
    onTranslate: runTranslate,
    onExplain: runExplain,
    onSave: runSave,
    onNote: runNote
  });

  sheetTranslateBtn.addEventListener("click", runTranslate);
  sheetExplainBtn.addEventListener("click", runExplain);
  sheetSaveBtn.addEventListener("click", runSave);
  sheetNoteBtn.addEventListener("click", runNote);
  closeActionSheetBtn.addEventListener("click", closeActionSheet);
  sheetBackdrop.addEventListener("click", closeActionSheet);'''
replace_once("src/features/reader/engine/readerEngine.ts", old_save, new_save)

replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''  function renderPage(index: number): void {''',
    '''  function renderPage(index: number, saveProgress = true): void {'''
)
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''    const page = pages[currentPage];\n    viewer.innerHTML = page.html;''',
    '''    const page = pages[currentPage];\n    viewer.innerHTML = page.html;\n    renderHighlights(viewer, currentPage, fragments);'''
)
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''    if (currentBook) {\n      progressStore.savePosition(currentBook.id, currentPage);\n    }''',
    '''    if (currentBook && saveProgress) {\n      progressStore.savePosition(currentBook.id, currentPage);\n    }'''
)
replace_once(
    "src/features/reader/engine/readerEngine.ts",
    '''    bookmarks = progressStore.getBookmarks(book.id);\n\n    const savedPosition = progressStore.getPosition(book.id);\n    currentPage = savedPosition !== null ? Math.min(savedPosition, pages.length - 1) : 0;\n\n    renderPage(currentPage);''',
    '''    bookmarks = progressStore.getBookmarks(book.id);\n    fragments = progressStore.getFragments().filter(fragment => fragment.bookId === book.id);\n\n    const savedPosition = progressStore.getPosition(book.id);\n    currentPage = initialLocation\n      ? Math.max(0, Math.min(initialLocation.pageIndex, pages.length - 1))\n      : savedPosition !== null\n        ? Math.min(savedPosition, pages.length - 1)\n        : 0;\n\n    // Opening an old annotation is a navigation target, not a reading\n    // progress update. The first render therefore does not overwrite the\n    // user's saved reading position; the next real page turn behaves as\n    // usual and resumes normal progress persistence.\n    renderPage(currentPage, !initialLocation);'''
)

# App navigation: Notes -> exact Edition/anchor -> Reader, with rights check.
replace_once(
    "src/App.tsx",
    '''import { NotesView } from "./features/notes/NotesView";''',
    '''import { NotesView } from "./features/notes/NotesView";\nimport type { NotesRestoreState } from "./features/notes/NotesView";\nimport type { Annotation } from "./api/annotations";'''
)
replace_once(
    "src/App.tsx",
    '''import { loadRemoteCatalog } from "./catalog";\nimport type { Book } from "./features/reader/engine/types";''',
    '''import { getBookById, loadRemoteCatalog } from "./catalog";\nimport { resolveEditionFile, toReaderBook } from "./catalog/toReaderBook";\nimport { getStoredReaderJurisdiction } from "./features/book-detail/readerJurisdiction";\nimport type { Book, ReaderLocation } from "./features/reader/engine/types";'''
)
replace_once(
    "src/App.tsx",
    '''  | { type: "my-library"; state: MyLibraryRestoreState };''',
    '''  | { type: "my-library"; state: MyLibraryRestoreState }\n  | { type: "notes"; state: NotesRestoreState };'''
)
replace_once(
    "src/App.tsx",
    '''  const [myLibraryRestoreState, setMyLibraryRestoreState] = useState<MyLibraryRestoreState | null>(null);''',
    '''  const [myLibraryRestoreState, setMyLibraryRestoreState] = useState<MyLibraryRestoreState | null>(null);\n  const [notesRestoreState, setNotesRestoreState] = useState<NotesRestoreState | null>(null);\n  const [readerOrigin, setReaderOrigin] = useState<"home" | "book-detail" | "notes">("home");\n  const [readerInitialLocation, setReaderInitialLocation] = useState<ReaderLocation | null>(null);'''
)
replace_once(
    "src/App.tsx",
    '''      setCurrentBook(TEST_EPUB_BOOK);\n      setView("reader");''',
    '''      setReaderOrigin("home");\n      setReaderInitialLocation(null);\n      setCurrentBook(TEST_EPUB_BOOK);\n      setView("reader");'''
)
replace_once(
    "src/App.tsx",
    '''  function handleOpenBook(book: Book): void {\n    setCurrentBook(book);\n    setView("reader");\n  }\n\n  function handleExitReader(): void {\n    if (selectedBookId) {\n      setView("book-detail");\n    } else {\n      setView("home");\n    }\n  }''',
    '''  function handleOpenBook(book: Book): void {\n    setReaderOrigin("book-detail");\n    setReaderInitialLocation(null);\n    setCurrentBook(book);\n    setView("reader");\n  }\n\n  function handleExitReader(): void {\n    setReaderInitialLocation(null);\n    if (readerOrigin === "notes") {\n      setView("notes");\n      return;\n    }\n    if (selectedBookId) {\n      setView("book-detail");\n    } else {\n      setView("home");\n    }\n  }'''
)
replace_once(
    "src/App.tsx",
    '''    if (bookDetailOrigin?.type === "my-library") {\n      setMyLibraryRestoreState(bookDetailOrigin.state);\n      setView("my-library");\n      return;\n    }\n\n    setView("home");''',
    '''    if (bookDetailOrigin?.type === "my-library") {\n      setMyLibraryRestoreState(bookDetailOrigin.state);\n      setView("my-library");\n      return;\n    }\n\n    if (bookDetailOrigin?.type === "notes") {\n      setNotesRestoreState(bookDetailOrigin.state);\n      setView("notes");\n      return;\n    }\n\n    setView("home");'''
)

anchor_handler = r'''  function handleOpenAnnotationFromNotes(annotation: Annotation, state: NotesRestoreState): void {
    setNotesRestoreState(state);

    const book = getBookById(annotation.workId);
    if (!book) return;

    const jurisdiction = getStoredReaderJurisdiction() ?? undefined;
    const resolved = resolveEditionFile(book, annotation.editionId, jurisdiction);

    if (!resolved) {
      const edition = book.editions.find(item => item.id === annotation.editionId);
      handleOpenBookDetail(
        annotation.workId,
        { type: "notes", state },
        edition ? { editionId: edition.id, language: edition.language } : null
      );
      return;
    }

    setSelectedBookId(annotation.workId);
    setBookDetailOrigin({ type: "notes", state });
    setCurrentBook(toReaderBook(book, resolved, jurisdiction));
    setReaderInitialLocation({
      pageIndex: annotation.pageIndex,
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset
    });
    setReaderOrigin("notes");
    setView("reader");
  }

'''
replace_once(
    "src/App.tsx",
    '''  function handleOpenAuthorDetail(authorId: string): void {''',
    anchor_handler + '''  function handleOpenAuthorDetail(authorId: string): void {'''
)
replace_once(
    "src/App.tsx",
    '''    return <ReaderView book={currentBook} onExit={handleExitReader} />;''',
    '''    return <ReaderView book={currentBook} onExit={handleExitReader} initialLocation={readerInitialLocation} />;'''
)
replace_once(
    "src/App.tsx",
    '''  } else if (view === "notes") {\n    content = <NotesView onBack={handleBackFromAccountShell} />;''',
    '''  } else if (view === "notes") {\n    content = (\n      <NotesView\n        onBack={handleBackFromAccountShell}\n        restoreState={notesRestoreState}\n        onOpenAnnotation={handleOpenAnnotationFromNotes}\n        onRequireSignIn={handleRequireSignIn}\n        onOpenLibrary={handleOpenLibrary}\n      />\n    );'''
)

# Reader/Notes visual additions, deliberately appended so existing design tokens stay authoritative.
css = Path("src/styles/global.css")
css_text = css.read_text(encoding="utf-8")
css_add = r'''

/* Notes + Highlights --------------------------------------------------- */
.reader-highlight {
  background: color-mix(in srgb, var(--reader-gold) 22%, transparent);
  color: inherit;
  border-radius: 0.12em;
  box-shadow: inset 0 -0.08em 0 color-mix(in srgb, var(--reader-gold) 38%, transparent);
}

.reader-highlight-note {
  background: color-mix(in srgb, var(--reader-gold) 28%, transparent);
  box-shadow: inset 0 -0.11em 0 color-mix(in srgb, var(--reader-gold) 58%, transparent);
}

.reader-note-input,
.note-editor textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid rgba(218, 183, 120, 0.28);
  background: rgba(18, 14, 13, 0.72);
  color: inherit;
  border-radius: 10px;
  padding: 12px 14px;
  font: inherit;
  line-height: 1.55;
}

.reader-note-input:focus,
.note-editor textarea:focus {
  outline: 1px solid rgba(218, 183, 120, 0.58);
  border-color: rgba(218, 183, 120, 0.5);
}

.reader-note-save {
  margin-top: 12px;
}

.sheet-success {
  color: var(--reader-gold);
}

.notes-toolbar {
  max-width: 760px;
  margin: 0 0 28px;
}

.notes-search {
  width: 100%;
}

.notes-groups {
  display: grid;
  gap: 42px;
}

.notes-work {
  display: grid;
  gap: 18px;
}

.notes-work-head {
  display: grid;
  gap: 5px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(229, 205, 166, 0.14);
}

.notes-work-head h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(1.25rem, 2vw, 1.7rem);
  font-weight: 500;
}

.notes-work-head p {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.notes-list {
  display: grid;
  gap: 14px;
}

.note-card {
  padding: 18px 20px;
  border: 1px solid rgba(229, 205, 166, 0.14);
  background: rgba(13, 10, 10, 0.42);
  backdrop-filter: blur(6px);
}

.note-quote-button {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.note-edition {
  display: block;
  margin-bottom: 9px;
  color: var(--muted);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.note-card blockquote {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.02rem;
  line-height: 1.65;
}

.note-comment {
  margin: 14px 0 0;
  padding-top: 13px;
  border-top: 1px solid rgba(229, 205, 166, 0.1);
  color: rgba(245, 238, 226, 0.88);
  line-height: 1.6;
  white-space: pre-wrap;
}

.note-editor {
  margin-top: 14px;
}

.note-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 13px;
}

.note-delete {
  opacity: 0.72;
}

.notes-error {
  color: #e1a7a7;
  margin: 0 0 20px;
}

@media (max-width: 700px) {
  .selection-toolbar {
    max-width: calc(100vw - 24px);
    overflow-x: auto;
  }

  .note-card {
    padding: 16px;
  }
}
'''
if "/* Notes + Highlights" not in css_text:
    css.write_text(css_text.rstrip() + css_add + "\n", encoding="utf-8")

print("notes/highlights source changes applied")
