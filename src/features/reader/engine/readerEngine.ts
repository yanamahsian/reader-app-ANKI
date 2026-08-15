import type { Book, Fragment, Bookmark } from "./types";
import type { ProgressStore } from "../progressStore/progressStore";
import { createSelectionController, type SelectionController } from "./selection";
import { translateText, explainText } from "../../../api/ai";
import { detectLoader } from "./formats/detect";
import type { LoadedDocument } from "./formats/types";

const THEMES = ["dark", "default", "purple", "red"] as const;
type Theme = (typeof THEMES)[number];

const DEFAULT_FONT_SIZE = 22;
const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 34;

const FONT_KEY = "anki_font";
const THEME_KEY = "anki_theme";

export interface ReaderEngineOptions {
  container: HTMLElement;
  progressStore: ProgressStore;
  onExit: () => void;
}

export interface ReaderEngine {
  open(book: Book): Promise<void>;
  destroy(): void;
}

// The engine keeps a single flat page array for navigation (tap
// zones, swipe, keyboard, progressStore position all stay exactly as
// they were before formats/ existed) — chapter awareness is layered
// on top per page rather than changing how paging itself works.
// Reader Complete: this same array/index is also what TOC, the
// progress slider, and bookmarks all navigate by — one global page
// index, one function (renderPage) that ever changes it.
interface FlatPage {
  html: string;
  rawText: string;
  chapterIndex: number;
  pageIndexInChapter: number;
  pagesInChapter: number;
  chapterTitle: string | null;
}

function flattenDocument(doc: LoadedDocument): FlatPage[] {

  const flat: FlatPage[] = [];

  doc.chapters.forEach((chapter, chapterIndex) => {
    chapter.pages.forEach((page, pageIndexInChapter) => {
      flat.push({
        html: page.html,
        rawText: page.rawText,
        chapterIndex,
        pageIndexInChapter,
        pagesInChapter: chapter.pages.length,
        chapterTitle: chapter.title
      });
    });
  });

  return flat;

}

export function createReaderEngine(options: ReaderEngineOptions): ReaderEngine {

  const { container, progressStore, onExit } = options;

  let currentBook: Book | null = null;
  let loadedDocument: LoadedDocument | null = null;
  let pages: FlatPage[] = [];
  let currentPage = 0;
  let bookmarks: Bookmark[] = [];
  let fontSize = Number(localStorage.getItem(FONT_KEY)) || DEFAULT_FONT_SIZE;
  let theme: Theme = (localStorage.getItem(THEME_KEY) as Theme) || "dark";

  let translateAbort: AbortController | null = null;
  let explainAbort: AbortController | null = null;
  const translationCache = new Map<string, string>();
  const explanationCache = new Map<string, string>();

  /* ------------------------------------------------------------------
     DOM — reader chrome, built inside the container React hands us
     ------------------------------------------------------------------ */

  const overlay = document.createElement("div");
  overlay.className = "reader-overlay visible";

  const overlayTop = document.createElement("div");
  overlayTop.className = "reader-overlay-top";

  const backToLibraryBtn = document.createElement("button");
  backToLibraryBtn.className = "ghost-btn";
  backToLibraryBtn.type = "button";
  backToLibraryBtn.setAttribute("aria-label", "Вернуться в библиотеку");
  backToLibraryBtn.textContent = "← Библиотека";

  const overlayActions = document.createElement("div");
  overlayActions.className = "reader-overlay-actions";

  const fontMinusBtn = document.createElement("button");
  fontMinusBtn.className = "ghost-btn";
  fontMinusBtn.type = "button";
  fontMinusBtn.setAttribute("aria-label", "Уменьшить шрифт");
  fontMinusBtn.textContent = "A−";

  const fontPlusBtn = document.createElement("button");
  fontPlusBtn.className = "ghost-btn";
  fontPlusBtn.type = "button";
  fontPlusBtn.setAttribute("aria-label", "Увеличить шрифт");
  fontPlusBtn.textContent = "A+";

  const themeBtn = document.createElement("button");
  themeBtn.className = "ghost-btn";
  themeBtn.type = "button";
  themeBtn.setAttribute("aria-label", "Сменить тему чтения");
  themeBtn.textContent = "Тема";

  // Reader Complete: table of contents — only shown for books with
  // real chapter structure (set in open(), see below). Hidden by
  // default so a plaintext book never shows a pointless empty TOC.
  const tocBtn = document.createElement("button");
  tocBtn.className = "ghost-btn";
  tocBtn.type = "button";
  tocBtn.setAttribute("aria-label", "Оглавление");
  tocBtn.textContent = "Оглавление";
  tocBtn.style.display = "none";

  const bookmarkToggleBtn = document.createElement("button");
  bookmarkToggleBtn.className = "ghost-btn";
  bookmarkToggleBtn.type = "button";
  bookmarkToggleBtn.setAttribute("aria-label", "Добавить или убрать закладку на этой странице");

  const bookmarksListBtn = document.createElement("button");
  bookmarksListBtn.className = "ghost-btn";
  bookmarksListBtn.type = "button";
  bookmarksListBtn.setAttribute("aria-label", "Список закладок");
  bookmarksListBtn.textContent = "Закладки";

  overlayActions.append(fontMinusBtn, fontPlusBtn, themeBtn, tocBtn, bookmarkToggleBtn, bookmarksListBtn);
  overlayTop.append(backToLibraryBtn, overlayActions);
  overlay.appendChild(overlayTop);

  const chapterLine = document.createElement("div");
  chapterLine.className = "chapter-line";
  chapterLine.setAttribute("aria-live", "polite");
  chapterLine.textContent = "";

  const readerShell = document.createElement("div");
  readerShell.className = "reader-shell";

  const viewer = document.createElement("article");
  viewer.className = "viewer-text";
  viewer.tabIndex = 0;
  viewer.setAttribute("aria-label", "Текст книги");
  readerShell.appendChild(viewer);

  const remainingLine = document.createElement("div");
  remainingLine.className = "remaining-line";
  remainingLine.setAttribute("aria-live", "polite");
  remainingLine.textContent = "";

  const leftTapZone = document.createElement("div");
  leftTapZone.className = "tap-zone tap-zone-left";
  leftTapZone.setAttribute("aria-label", "Предыдущая страница");

  const centerTapZone = document.createElement("div");
  centerTapZone.className = "tap-zone tap-zone-center";
  centerTapZone.setAttribute("aria-label", "Показать или скрыть управление");

  const rightTapZone = document.createElement("div");
  rightTapZone.className = "tap-zone tap-zone-right";
  rightTapZone.setAttribute("aria-label", "Следующая страница");

  // Reader Complete: bottom bar — visible prev/next arrows + progress
  // slider. Shown/hidden together with the top overlay (same
  // overlayVisible toggle, see toggleOverlay below) so tapping the
  // center of the page shows or hides all chrome at once, not two
  // independent mechanisms.
  const bottomBar = document.createElement("div");
  bottomBar.className = "reader-bottom-bar visible";

  const prevArrowBtn = document.createElement("button");
  prevArrowBtn.className = "reader-nav-arrow reader-nav-arrow-prev";
  prevArrowBtn.type = "button";
  prevArrowBtn.setAttribute("aria-label", "Предыдущая страница");
  prevArrowBtn.textContent = "‹";

  const progressSlider = document.createElement("input");
  progressSlider.type = "range";
  progressSlider.className = "reader-progress-slider";
  progressSlider.min = "0";
  progressSlider.max = "0";
  progressSlider.value = "0";
  progressSlider.setAttribute("aria-label", "Позиция в книге");

  const nextArrowBtn = document.createElement("button");
  nextArrowBtn.className = "reader-nav-arrow reader-nav-arrow-next";
  nextArrowBtn.type = "button";
  nextArrowBtn.setAttribute("aria-label", "Следующая страница");
  nextArrowBtn.textContent = "›";

  bottomBar.append(prevArrowBtn, progressSlider, nextArrowBtn);

  container.append(
    overlay, chapterLine, readerShell, remainingLine,
    leftTapZone, centerTapZone, rightTapZone, bottomBar
  );

  /* ------------------------------------------------------------------
     Action sheet + backdrop (global overlay, same as original markup)
     ------------------------------------------------------------------ */

  const sheetBackdrop = document.createElement("div");
  sheetBackdrop.className = "sheet-backdrop hidden";

  const actionSheet = document.createElement("section");
  actionSheet.className = "action-sheet hidden";
  actionSheet.setAttribute("role", "dialog");
  actionSheet.setAttribute("aria-modal", "true");

  const sheetHandle = document.createElement("div");
  sheetHandle.className = "sheet-handle";
  sheetHandle.setAttribute("aria-hidden", "true");

  const sheetHead = document.createElement("div");
  sheetHead.className = "sheet-head";

  const sheetTitle = document.createElement("div");
  sheetTitle.className = "sheet-title";
  sheetTitle.textContent = "Фрагмент";

  const closeActionSheetBtn = document.createElement("button");
  closeActionSheetBtn.className = "ghost-btn";
  closeActionSheetBtn.type = "button";
  closeActionSheetBtn.setAttribute("aria-label", "Закрыть");
  closeActionSheetBtn.textContent = "Закрыть";

  sheetHead.append(sheetTitle, closeActionSheetBtn);

  const selectedTextBox = document.createElement("div");
  selectedTextBox.className = "selected-text-box";

  const sheetActions = document.createElement("div");
  sheetActions.className = "sheet-actions";

  const sheetTranslateBtn = document.createElement("button");
  sheetTranslateBtn.type = "button";
  sheetTranslateBtn.textContent = "Перевести";

  const sheetExplainBtn = document.createElement("button");
  sheetExplainBtn.type = "button";
  sheetExplainBtn.textContent = "Объяснить";

  const sheetSaveBtn = document.createElement("button");
  sheetSaveBtn.type = "button";
  sheetSaveBtn.textContent = "Сохранить";

  sheetActions.append(sheetTranslateBtn, sheetExplainBtn, sheetSaveBtn);

  const actionResult = document.createElement("div");
  actionResult.className = "action-result";
  actionResult.setAttribute("aria-live", "polite");
  actionResult.textContent = "Выбери действие.";

  actionSheet.append(sheetHandle, sheetHead, selectedTextBox, sheetActions, actionResult);

  /* ------------------------------------------------------------------
     Reader Complete: table of contents panel (only used when
     hasRealChapters is true — see open()/tocBtn above)
     ------------------------------------------------------------------ */

  const tocBackdrop = document.createElement("div");
  tocBackdrop.className = "sheet-backdrop hidden";

  const tocPanel = document.createElement("section");
  tocPanel.className = "toc-panel hidden";
  tocPanel.setAttribute("role", "dialog");
  tocPanel.setAttribute("aria-modal", "true");

  const tocHead = document.createElement("div");
  tocHead.className = "sheet-head";

  const tocTitle = document.createElement("div");
  tocTitle.className = "sheet-title";
  tocTitle.textContent = "Содержание";

  const closeTocBtn = document.createElement("button");
  closeTocBtn.className = "ghost-btn";
  closeTocBtn.type = "button";
  closeTocBtn.setAttribute("aria-label", "Закрыть оглавление");
  closeTocBtn.textContent = "Закрыть";

  tocHead.append(tocTitle, closeTocBtn);

  const tocList = document.createElement("div");
  tocList.className = "toc-list";

  tocPanel.append(tocHead, tocList);

  /* ------------------------------------------------------------------
     Reader Complete: bookmarks panel
     ------------------------------------------------------------------ */

  const bookmarksBackdrop = document.createElement("div");
  bookmarksBackdrop.className = "sheet-backdrop hidden";

  const bookmarksPanel = document.createElement("section");
  bookmarksPanel.className = "toc-panel hidden";
  bookmarksPanel.setAttribute("role", "dialog");
  bookmarksPanel.setAttribute("aria-modal", "true");

  const bookmarksHead = document.createElement("div");
  bookmarksHead.className = "sheet-head";

  const bookmarksTitle = document.createElement("div");
  bookmarksTitle.className = "sheet-title";
  bookmarksTitle.textContent = "Закладки";

  const closeBookmarksBtn = document.createElement("button");
  closeBookmarksBtn.className = "ghost-btn";
  closeBookmarksBtn.type = "button";
  closeBookmarksBtn.setAttribute("aria-label", "Закрыть список закладок");
  closeBookmarksBtn.textContent = "Закрыть";

  bookmarksHead.append(bookmarksTitle, closeBookmarksBtn);

  const bookmarksList = document.createElement("div");
  bookmarksList.className = "toc-list";

  bookmarksPanel.append(bookmarksHead, bookmarksList);

  document.body.append(sheetBackdrop, actionSheet, tocBackdrop, tocPanel, bookmarksBackdrop, bookmarksPanel);

  function openActionSheet(title: string, resultHtml: string): void {
    sheetTitle.textContent = title;
    selectedTextBox.textContent = selection.getSelectedText();
    actionResult.innerHTML = resultHtml;
    sheetBackdrop.classList.remove("hidden");
    actionSheet.classList.remove("hidden");
  }

  function updateActionSheet(html: string): void {
    actionResult.innerHTML = html;
  }

  function closeActionSheet(): void {
    actionSheet.classList.add("hidden");
    sheetBackdrop.classList.add("hidden");
  }

  function loadingTemplate(): string {
    return `<div class="sheet-loading"><div class="loader"></div><p>AI думает...</p></div>`;
  }

  function errorTemplate(): string {
    return `<div class="sheet-error">Не удалось получить ответ.</div>`;
  }

  /* ------------------------------------------------------------------
     AI actions (shared by the floating toolbar and the action sheet)
     ------------------------------------------------------------------ */

  async function runTranslate(): Promise<void> {

    const text = selection.getSelectedText();
    if (!text.length) return;

    const cacheKey = `${text}::translate`;
    const cached = translationCache.get(cacheKey);

    if (cached) {
      openActionSheet("Перевод", cached);
      return;
    }

    openActionSheet("Перевод", loadingTemplate());

    translateAbort?.abort();
    translateAbort = new AbortController();

    try {
      const translation = await translateText(text, "ru", translateAbort.signal);
      translationCache.set(cacheKey, translation);
      updateActionSheet(translation);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        updateActionSheet(errorTemplate());
      }
    }

  }

  async function runExplain(): Promise<void> {

    const text = selection.getSelectedText();
    if (!text.length) return;

    const cacheKey = `${text}::explain`;
    const cached = explanationCache.get(cacheKey);

    if (cached) {
      openActionSheet("Объяснение", cached);
      return;
    }

    openActionSheet("Объяснение", loadingTemplate());

    explainAbort?.abort();
    explainAbort = new AbortController();

    try {
      const answer = await explainText(text, "ru", explainAbort.signal);
      explanationCache.set(cacheKey, answer);
      updateActionSheet(answer);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        updateActionSheet(errorTemplate());
      }
    }

  }

  function runSave(): void {

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
  sheetBackdrop.addEventListener("click", closeActionSheet);

  /* ------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------ */

  function notify(message: string): void {

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("visible"));

    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 2000);

  }

  /* ------------------------------------------------------------------
     Reader Complete: table of contents
     ------------------------------------------------------------------ */

  function getChapterStarts(): Array<{ pageIndex: number; title: string }> {

    const starts: Array<{ pageIndex: number; title: string }> = [];

    pages.forEach((page, index) => {
      if (page.pageIndexInChapter === 0) {
        starts.push({
          pageIndex: index,
          title: page.chapterTitle || `Глава ${page.chapterIndex + 1}`
        });
      }
    });

    return starts;

  }

  function openToc(): void {

    tocList.innerHTML = "";

    for (const chapter of getChapterStarts()) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "toc-item";
      item.textContent = chapter.title;
      item.addEventListener("click", () => {
        closeToc();
        renderPage(chapter.pageIndex);
      });
      tocList.appendChild(item);
    }

    tocBackdrop.classList.remove("hidden");
    tocPanel.classList.remove("hidden");

  }

  function closeToc(): void {
    tocPanel.classList.add("hidden");
    tocBackdrop.classList.add("hidden");
  }

  tocBtn.addEventListener("click", openToc);
  closeTocBtn.addEventListener("click", closeToc);
  tocBackdrop.addEventListener("click", closeToc);

  /* ------------------------------------------------------------------
     Reader Complete: bookmarks
     ------------------------------------------------------------------ */

  function isCurrentPageBookmarked(): boolean {
    return bookmarks.some(bookmark => bookmark.pageIndex === currentPage);
  }

  function updateBookmarkButton(): void {
    const active = isCurrentPageBookmarked();
    bookmarkToggleBtn.textContent = active ? "★ Закладка" : "☆ Закладка";
    bookmarkToggleBtn.setAttribute("aria-pressed", String(active));
  }

  function renderBookmarksList(): void {

    bookmarksList.innerHTML = "";

    if (!bookmarks.length) {
      const empty = document.createElement("p");
      empty.className = "toc-empty";
      empty.textContent = "Пока нет закладок.";
      bookmarksList.appendChild(empty);
      return;
    }

    const sorted = [...bookmarks].sort((a, b) => a.pageIndex - b.pageIndex);

    for (const bookmark of sorted) {

      const row = document.createElement("div");
      row.className = "toc-item-row";

      const jumpBtn = document.createElement("button");
      jumpBtn.type = "button";
      jumpBtn.className = "toc-item";
      jumpBtn.textContent = bookmark.chapterTitle
        ? `${bookmark.chapterTitle} · стр. ${bookmark.pageIndex + 1}`
        : `Страница ${bookmark.pageIndex + 1}`;
      jumpBtn.addEventListener("click", () => {
        closeBookmarks();
        renderPage(bookmark.pageIndex);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "toc-item-delete";
      deleteBtn.setAttribute("aria-label", "Удалить закладку");
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", () => {
        progressStore.deleteBookmark(bookmark.id);
        bookmarks = bookmarks.filter(item => item.id !== bookmark.id);
        renderBookmarksList();
        updateBookmarkButton();
      });

      row.append(jumpBtn, deleteBtn);
      bookmarksList.appendChild(row);

    }

  }

  function openBookmarks(): void {
    renderBookmarksList();
    bookmarksBackdrop.classList.remove("hidden");
    bookmarksPanel.classList.remove("hidden");
  }

  function closeBookmarks(): void {
    bookmarksPanel.classList.add("hidden");
    bookmarksBackdrop.classList.add("hidden");
  }

  function toggleBookmark(): void {

    if (!currentBook) return;

    const existing = bookmarks.find(bookmark => bookmark.pageIndex === currentPage);

    if (existing) {
      progressStore.deleteBookmark(existing.id);
      bookmarks = bookmarks.filter(bookmark => bookmark.id !== existing.id);
      notify("Закладка удалена");
    } else {
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        bookId: currentBook.id,
        pageIndex: currentPage,
        chapterTitle: pages[currentPage]?.chapterTitle ?? null,
        createdAt: Date.now()
      };
      progressStore.saveBookmark(bookmark);
      bookmarks = [bookmark, ...bookmarks];
      notify("Закладка добавлена");
    }

    updateBookmarkButton();

  }

  bookmarkToggleBtn.addEventListener("click", toggleBookmark);
  bookmarksListBtn.addEventListener("click", openBookmarks);
  closeBookmarksBtn.addEventListener("click", closeBookmarks);
  bookmarksBackdrop.addEventListener("click", closeBookmarks);

  /* ------------------------------------------------------------------
     Rendering / pagination
     ------------------------------------------------------------------ */

  function applyFontSize(): void {
    viewer.style.fontSize = fontSize + "px";
    localStorage.setItem(FONT_KEY, String(fontSize));
  }

  function applyTheme(): void {
    THEMES.forEach(name => document.body.classList.remove("theme-" + name));
    document.body.classList.add("theme-" + theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function renderPage(index: number): void {

    if (!pages.length) return;

    currentPage = Math.max(0, Math.min(index, pages.length - 1));
    const page = pages[currentPage];
    viewer.innerHTML = page.html;

    const percent = Math.round(((currentPage + 1) / pages.length) * 100);

    if (loadedDocument?.hasRealChapters) {

      // Line 1: real chapter title · global page / total · overall %.
      const title = page.chapterTitle || `Глава ${page.chapterIndex + 1}`;
      chapterLine.textContent = `${title} · ${currentPage + 1} / ${pages.length} · ${percent}%`;

      // Line 2: pages left in the current chapter only.
      const remaining = page.pagesInChapter - page.pageIndexInChapter - 1;
      remainingLine.textContent = remaining > 0
        ? `До конца главы: ${remaining} стр.`
        : "Последняя страница главы";

    } else {

      // No real chapter structure: never show a fabricated chapter
      // name or a meaningless "pages left in chapter" — only overall
      // book progress, on line 1; line 2 stays empty.
      chapterLine.textContent = `${currentPage + 1} / ${pages.length} · ${percent}%`;
      remainingLine.textContent = "";

    }

    progressSlider.value = String(currentPage);
    updateBookmarkButton();

    if (currentBook) {
      progressStore.savePosition(currentBook.id, currentPage);
    }

  }

  function nextPage(): void {
    if (currentPage < pages.length - 1) renderPage(currentPage + 1);
  }

  function previousPage(): void {
    if (currentPage > 0) renderPage(currentPage - 1);
  }

  function repaginate(): void {
    if (!loadedDocument) return;
    pages = flattenDocument(loadedDocument);
    progressSlider.max = String(Math.max(0, pages.length - 1));
    renderPage(currentPage);
  }

  /* ------------------------------------------------------------------
     Reader Complete: progress slider + visible arrows
     ------------------------------------------------------------------ */

  progressSlider.addEventListener("input", () => {
    renderPage(Number(progressSlider.value));
  });

  prevArrowBtn.addEventListener("click", previousPage);
  nextArrowBtn.addEventListener("click", nextPage);

  /* ------------------------------------------------------------------
     Overlay toggle
     ------------------------------------------------------------------ */

  let overlayVisible = true;

  function toggleOverlay(): void {
    overlayVisible = !overlayVisible;
    overlay.classList.toggle("visible", overlayVisible);
    bottomBar.classList.toggle("visible", overlayVisible);
  }

  /* ------------------------------------------------------------------
     Touch / keyboard
     ------------------------------------------------------------------ */

  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(event: TouchEvent): void {
    touchStartX = event.changedTouches[0].clientX;
    touchStartY = event.changedTouches[0].clientY;
  }

  function handleTouchEnd(event: TouchEvent): void {

    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) nextPage(); else previousPage();

  }

  function handleKeydown(event: KeyboardEvent): void {

    switch (event.key) {

      case "ArrowRight":
      case "PageDown":
      case " ":
        event.preventDefault();
        nextPage();
        break;

      case "ArrowLeft":
      case "PageUp":
        event.preventDefault();
        previousPage();
        break;

    }

  }

  /* ------------------------------------------------------------------
     Bindings
     ------------------------------------------------------------------ */

  backToLibraryBtn.addEventListener("click", () => {
    closeActionSheet();
    closeToc();
    closeBookmarks();
    onExit();
  });

  fontPlusBtn.addEventListener("click", () => {
    fontSize = Math.min(MAX_FONT_SIZE, fontSize + 1);
    applyFontSize();
    repaginate();
  });

  fontMinusBtn.addEventListener("click", () => {
    fontSize = Math.max(MIN_FONT_SIZE, fontSize - 1);
    applyFontSize();
    repaginate();
  });

  themeBtn.addEventListener("click", () => {
    const index = THEMES.indexOf(theme);
    theme = THEMES[(index + 1) % THEMES.length];
    applyTheme();
  });

  leftTapZone.addEventListener("click", previousPage);
  centerTapZone.addEventListener("click", toggleOverlay);
  rightTapZone.addEventListener("click", nextPage);

  viewer.addEventListener("touchstart", handleTouchStart, { passive: true });
  viewer.addEventListener("touchend", handleTouchEnd, { passive: true });

  window.addEventListener("keydown", handleKeydown);

  applyFontSize();
  applyTheme();

  /* ------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------ */

  async function open(book: Book): Promise<void> {

    currentBook = book;

    const loader = detectLoader(book);
    loadedDocument = await loader.load(book);
    pages = flattenDocument(loadedDocument);

    tocBtn.style.display = loadedDocument.hasRealChapters ? "" : "none";

    progressSlider.min = "0";
    progressSlider.max = String(Math.max(0, pages.length - 1));

    bookmarks = progressStore.getBookmarks(book.id);

    const savedPosition = progressStore.getPosition(book.id);
    currentPage = savedPosition !== null ? Math.min(savedPosition, pages.length - 1) : 0;

    renderPage(currentPage);

  }

  function destroy(): void {

    window.removeEventListener("keydown", handleKeydown);

    translateAbort?.abort();
    explainAbort?.abort();

    selection.destroy();

    sheetBackdrop.remove();
    actionSheet.remove();
    tocBackdrop.remove();
    tocPanel.remove();
    bookmarksBackdrop.remove();
    bookmarksPanel.remove();

    container.innerHTML = "";

  }

  return { open, destroy };

}
