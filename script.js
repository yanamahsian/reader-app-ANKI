'use strict';

/* =========================================================
   AN.KI
   Единая библиотека и интеллектуальная читалка
   ========================================================= */


/* =========================================================
   SUPABASE EDGE FUNCTIONS
   ========================================================= */

const AI_ENDPOINT =
  'https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-ai';

const LIBRARY_ENDPOINT =
  'https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-library';


/* =========================================================
   LOCAL STORAGE
   Старые технические ключи omnia_* сохраняются намеренно,
   чтобы не потерять пользовательские настройки.
   ========================================================= */

const STORAGE_KEYS = {
  theme: 'omnia_theme',
  fontSize: 'omnia_font_size',
  currentBook: 'omnia_current_book',
  readingPosition: 'omnia_reading_position',
  savedFragments: 'omnia_saved_fragments'
};


/* =========================================================
   DOM
   ========================================================= */

const homeView = document.getElementById('homeView');
const readerView = document.getElementById('readerView');

const searchInput = document.getElementById('searchInput');
const languageSelect = document.getElementById('languageSelect');
const searchBtn = document.getElementById('searchBtn');
const results = document.getElementById('results');

const themeDefaultBtn = document.getElementById('themeDefaultBtn');
const themeDarkBtn = document.getElementById('themeDarkBtn');
const themePurpleBtn = document.getElementById('themePurpleBtn');
const themeRedBtn = document.getElementById('themeRedBtn');

const readerOverlay = document.getElementById('readerOverlay');
const backToLibraryBtn = document.getElementById('backToLibraryBtn');
const fontMinusBtn = document.getElementById('fontMinusBtn');
const fontPlusBtn = document.getElementById('fontPlusBtn');
const readerThemeBtn = document.getElementById('readerThemeBtn');

const chapterLine = document.getElementById('chapterLine');
const viewer = document.getElementById('viewer');
const remainingLine = document.getElementById('remainingLine');

const leftTapZone = document.getElementById('leftTapZone');
const centerTapZone = document.getElementById('centerTapZone');
const rightTapZone = document.getElementById('rightTapZone');

const selectionToolbar = document.getElementById('selectionToolbar');
const toolbarTranslateBtn = document.getElementById('toolbarTranslateBtn');
const toolbarExplainBtn = document.getElementById('toolbarExplainBtn');
const toolbarSaveBtn = document.getElementById('toolbarSaveBtn');

const sheetBackdrop = document.getElementById('sheetBackdrop');
const actionSheet = document.getElementById('actionSheet');
const closeActionSheetBtn = document.getElementById('closeActionSheetBtn');

const selectedTextBox = document.getElementById('selectedTextBox');
const translateBtn = document.getElementById('translateBtn');
const explainBtn = document.getElementById('explainBtn');
const saveBtn = document.getElementById('saveBtn');
const actionResult = document.getElementById('actionResult');


/* =========================================================
   STATE
   ========================================================= */

const THEMES = ['default', 'dark', 'purple', 'red'];

const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 34;
const FONT_STEP = 2;

const DEFAULT_FONT_SIZE = 22;
const DEFAULT_TARGET_LANGUAGE = 'ru';

let currentTheme = 'dark';
let currentFontSize = DEFAULT_FONT_SIZE;

let currentBook = null;
let currentBookText = '';
let currentSections = [];
let currentSectionIndex = 0;

let selectedText = '';
let touchStartX = 0;
let touchStartY = 0;
let overlayVisible = true;

let searchRequestController = null;
let bookRequestController = null;


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  restoreSettings();
  bindEvents();
  applyTheme(currentTheme);
  applyFontSize(currentFontSize);
  showInitialLibraryMessage();
}

function restoreSettings() {
  const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);

  if (THEMES.includes(storedTheme)) {
    currentTheme = storedTheme;
  }

  const storedFontSize = Number(
    localStorage.getItem(STORAGE_KEYS.fontSize)
  );

  if (
    Number.isFinite(storedFontSize) &&
    storedFontSize >= MIN_FONT_SIZE &&
    storedFontSize <= MAX_FONT_SIZE
  ) {
    currentFontSize = storedFontSize;
  }
}

function bindEvents() {
  searchBtn.addEventListener('click', searchBooks);

  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      searchBooks();
    }
  });

  themeDefaultBtn.addEventListener('click', () => {
    applyTheme('default');
  });

  themeDarkBtn.addEventListener('click', () => {
    applyTheme('dark');
  });

  themePurpleBtn.addEventListener('click', () => {
    applyTheme('purple');
  });

  themeRedBtn.addEventListener('click', () => {
    applyTheme('red');
  });

  backToLibraryBtn.addEventListener('click', closeReader);

  fontMinusBtn.addEventListener('click', event => {
    event.stopPropagation();
    changeFontSize(-FONT_STEP);
  });

  fontPlusBtn.addEventListener('click', event => {
    event.stopPropagation();
    changeFontSize(FONT_STEP);
  });

  readerThemeBtn.addEventListener('click', event => {
    event.stopPropagation();
    cycleTheme();
  });

  leftTapZone.addEventListener('click', event => {
    if (shouldIgnoreReaderTap(event)) {
      return;
    }

    showPreviousSection();
  });

  centerTapZone.addEventListener('click', event => {
    if (shouldIgnoreReaderTap(event)) {
      return;
    }

    toggleReaderOverlay();
  });

  rightTapZone.addEventListener('click', event => {
    if (shouldIgnoreReaderTap(event)) {
      return;
    }

    showNextSection();
  });

  readerView.addEventListener('touchstart', handleTouchStart, {
    passive: true
  });

  readerView.addEventListener('touchend', handleTouchEnd, {
    passive: true
  });

  document.addEventListener('selectionchange', handleSelectionChange);

  viewer.addEventListener('mouseup', () => {
    window.setTimeout(showSelectionToolbar, 20);
  });

  viewer.addEventListener('touchend', () => {
    window.setTimeout(showSelectionToolbar, 120);
  });

  toolbarTranslateBtn.addEventListener('click', () => {
    openActionSheet('translate');
  });

  toolbarExplainBtn.addEventListener('click', () => {
    openActionSheet('explain');
  });

  toolbarSaveBtn.addEventListener('click', () => {
    openActionSheet('save');
  });

  translateBtn.addEventListener('click', translateSelection);
  explainBtn.addEventListener('click', explainSelection);
  saveBtn.addEventListener('click', saveSelection);

  closeActionSheetBtn.addEventListener('click', closeActionSheet);
  sheetBackdrop.addEventListener('click', closeActionSheet);

  window.addEventListener('resize', hideSelectionToolbar);

  document.addEventListener('keydown', handleGlobalKeydown);
}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme(theme) {
  const safeTheme = THEMES.includes(theme) ? theme : 'dark';

  document.body.classList.remove(
    'theme-default',
    'theme-dark',
    'theme-purple',
    'theme-red'
  );

  document.body.classList.add(`theme-${safeTheme}`);

  currentTheme = safeTheme;

  localStorage.setItem(STORAGE_KEYS.theme, safeTheme);

  updateThemeColor(safeTheme);
  updateThemeButtons();
}

function cycleTheme() {
  const currentIndex = THEMES.indexOf(currentTheme);
  const nextIndex = (currentIndex + 1) % THEMES.length;

  applyTheme(THEMES[nextIndex]);
}

function updateThemeButtons() {
  const buttonMap = {
    default: themeDefaultBtn,
    dark: themeDarkBtn,
    purple: themePurpleBtn,
    red: themeRedBtn
  };

  Object.entries(buttonMap).forEach(([theme, button]) => {
    if (!button) {
      return;
    }

    button.setAttribute(
      'aria-pressed',
      theme === currentTheme ? 'true' : 'false'
    );
  });
}

function updateThemeColor(theme) {
  const themeColors = {
    default: '#f4efe6',
    dark: '#0c0d10',
    purple: '#22172b',
    red: '#2a1014'
  };

  const themeColorMeta = document.querySelector(
    'meta[name="theme-color"]'
  );

  if (themeColorMeta) {
    themeColorMeta.setAttribute(
      'content',
      themeColors[theme] || themeColors.dark
    );
  }
}


/* =========================================================
   SEARCH
   ========================================================= */

async function searchBooks() {
  const query = searchInput.value.trim();
  const language = languageSelect.value.trim();

  if (!query) {
    showResultsMessage(
      'Введите автора или название книги.'
    );

    searchInput.focus();
    return;
  }

  if (searchRequestController) {
    searchRequestController.abort();
  }

  searchRequestController = new AbortController();

  setSearchLoading(true);
  showResultsMessage('Ищу книги…');

  try {
    const response = await fetch(LIBRARY_ENDPOINT, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        action: 'search',
        query,
        language
      }),

      signal: searchRequestController.signal
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        payload.error ||
        payload.message ||
        'Не удалось выполнить поиск.'
      );
    }

    const books = normalizeBookList(payload);

    renderSearchResults(books);
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }

    console.error('Search error:', error);

    showResultsMessage(
      error.message ||
      'Поиск временно недоступен. Попробуйте ещё раз.'
    );
  } finally {
    setSearchLoading(false);
  }
}

function normalizeBookList(payload) {
  const sourceList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.books)
      ? payload.books
      : Array.isArray(payload.results)
        ? payload.results
        : [];

  return sourceList
    .map((book, index) => normalizeBook(book, index))
    .filter(book => book.id && book.title);
}

function normalizeBook(book, index) {
  const authors = normalizeAuthors(
    book.authors ||
    book.author ||
    book.creator ||
    book.creators
  );

  const languages = normalizeLanguages(
    book.languages ||
    book.language
  );

  return {
    id: String(
      book.id ||
      book.bookId ||
      book.key ||
      book.identifier ||
      `book-${index}`
    ),

    title: String(
      book.title ||
      book.name ||
      'Без названия'
    ).trim(),

    authors,
    languages,

    description: String(
      book.description ||
      book.summary ||
      ''
    ).trim()
  };
}

function normalizeAuthors(value) {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return value
      .split(/\s*;\s*|\s*\|\s*/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(author => {
      if (typeof author === 'string') {
        return author.trim();
      }

      if (author && typeof author === 'object') {
        return String(
          author.name ||
          author.fullName ||
          author.displayName ||
          ''
        ).trim();
      }

      return '';
    })
    .filter(Boolean);
}

function normalizeLanguages(value) {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return value
      .split(/[\s,;|]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => String(item).trim())
    .filter(Boolean);
}

function renderSearchResults(books) {
  results.innerHTML = '';

  if (!books.length) {
    showResultsMessage(
      'В AN.KI не найдено книг, которые можно открыть для чтения.'
    );

    return;
  }

  books.forEach(book => {
    results.appendChild(createBookCard(book));
  });
}

function createBookCard(book) {
  const card = document.createElement('article');
  card.className = 'book-card';

  const title = document.createElement('div');
  title.className = 'book-title';
  title.textContent = book.title;

  const meta = document.createElement('div');
  meta.className = 'book-meta';

  const authorText = book.authors.length
    ? book.authors.join(', ')
    : 'Автор не указан';

  const languageText = book.languages.length
    ? book.languages
      .map(getLanguageName)
      .join(', ')
    : 'Язык не указан';

  meta.textContent = `${authorText} · ${languageText}`;

  const actions = document.createElement('div');
  actions.className = 'book-actions';

  const readButton = document.createElement('button');
  readButton.type = 'button';
  readButton.textContent = 'Читать';

  readButton.addEventListener('click', () => {
    openBook(book, readButton);
  });

  actions.appendChild(readButton);

  card.appendChild(title);
  card.appendChild(meta);

  if (book.description) {
    const description = document.createElement('div');
    description.className = 'book-meta';
    description.textContent = truncateText(book.description, 220);

    card.appendChild(description);
  }

  card.appendChild(actions);

  return card;
}

function showInitialLibraryMessage() {
  showResultsMessage(
    'Введите автора или название книги.'
  );
}

function showResultsMessage(message) {
  results.innerHTML = '';

  const element = document.createElement('div');
  element.className = 'book-meta';
  element.textContent = message;

  results.appendChild(element);
}

function setSearchLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchInput.disabled = isLoading;
  languageSelect.disabled = isLoading;

  searchBtn.textContent = isLoading
    ? 'Поиск…'
    : 'Найти';
}


/* =========================================================
   OPEN BOOK
   ========================================================= */

async function openBook(book, button) {
  if (!book || !book.id) {
    return;
  }

  if (bookRequestController) {
    bookRequestController.abort();
  }

  bookRequestController = new AbortController();

  const originalButtonText = button.textContent;

  button.disabled = true;
  button.textContent = 'Открываю…';

  try {
    const response = await fetch(LIBRARY_ENDPOINT, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        action: 'read',
        id: book.id
      }),

      signal: bookRequestController.signal
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        payload.error ||
        payload.message ||
        'Не удалось открыть книгу.'
      );
    }

    const loadedBook = normalizeLoadedBook(payload, book);

    if (!loadedBook.text) {
      throw new Error(
        'Для этой книги не удалось получить текст.'
      );
    }

    initializeReader(loadedBook);
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }

    console.error('Book loading error:', error);

    button.textContent = 'Ошибка';

    window.setTimeout(() => {
      button.textContent = originalButtonText;
      button.disabled = false;
    }, 1600);

    showResultsMessage(
      error.message ||
      'Книга временно недоступна.'
    );
  } finally {
    if (button.textContent === 'Открываю…') {
      button.textContent = originalButtonText;
      button.disabled = false;
    }
  }
}

function normalizeLoadedBook(payload, fallbackBook) {
  const source = payload.book || payload.result || payload;

  const rawText =
    source.text ||
    source.content ||
    source.plainText ||
    source.body ||
    '';

  return {
    id: String(
      source.id ||
      fallbackBook.id
    ),

    title: String(
      source.title ||
      fallbackBook.title ||
      'Без названия'
    ).trim(),

    authors: normalizeAuthors(
      source.authors ||
      source.author ||
      fallbackBook.authors
    ),

    languages: normalizeLanguages(
      source.languages ||
      source.language ||
      fallbackBook.languages
    ),

    text: cleanBookText(String(rawText))
  };
}

function initializeReader(book) {
  currentBook = {
    id: book.id,
    title: book.title,
    authors: book.authors,
    languages: book.languages
  };

  currentBookText = book.text;
  currentSections = splitTextIntoSections(currentBookText);

  if (!currentSections.length) {
    currentSections = [currentBookText];
  }

  currentSectionIndex = restoreReadingPosition(book.id);

  if (
    currentSectionIndex < 0 ||
    currentSectionIndex >= currentSections.length
  ) {
    currentSectionIndex = 0;
  }

  localStorage.setItem(
    STORAGE_KEYS.currentBook,
    JSON.stringify(currentBook)
  );

  showReader();
  renderCurrentSection();

  window.scrollTo({
    top: 0,
    behavior: 'auto'
  });
}

function showReader() {
  homeView.classList.add('hidden');
  readerView.classList.remove('hidden');

  overlayVisible = true;
  readerOverlay.classList.add('visible');

  document.body.style.overflow = 'hidden';
}

function closeReader() {
  saveReadingPosition();

  hideSelectionToolbar();
  closeActionSheet();

  readerView.classList.add('hidden');
  homeView.classList.remove('hidden');

  document.body.style.overflow = '';
}


/* =========================================================
   TEXT PREPARATION
   ========================================================= */

function cleanBookText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function splitTextIntoSections(text) {
  const normalizedText = cleanBookText(text);

  if (!normalizedText) {
    return [];
  }

  const chapterPattern =
    /(?=^(?:chapter|book|part|volume|глава|часть|книга|том)\s+(?:[ivxlcdm\d]+|[а-яёa-z]+)[^\n]*$)/gimu;

  const chapterParts = normalizedText
    .split(chapterPattern)
    .map(part => part.trim())
    .filter(Boolean);

  const sourceParts = chapterParts.length > 1
    ? chapterParts
    : [normalizedText];

  const sections = [];

  sourceParts.forEach(part => {
    const chunks = splitLongSection(part, 6500);

    chunks.forEach(chunk => {
      if (chunk.trim()) {
        sections.push(chunk.trim());
      }
    });
  });

  return sections;
}

function splitLongSection(text, preferredLength) {
  if (text.length <= preferredLength) {
    return [text];
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let currentChunk = '';

  paragraphs.forEach(paragraph => {
    const nextChunk = currentChunk
      ? `${currentChunk}\n\n${paragraph}`
      : paragraph;

    if (
      nextChunk.length <= preferredLength ||
      !currentChunk
    ) {
      currentChunk = nextChunk;
      return;
    }

    chunks.push(currentChunk);
    currentChunk = paragraph;
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.flatMap(chunk => {
    if (chunk.length <= preferredLength * 1.5) {
      return [chunk];
    }

    return splitOversizedParagraph(chunk, preferredLength);
  });
}

function splitOversizedParagraph(text, preferredLength) {
  const sentences = text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g);

  if (!sentences) {
    return [
      text.slice(0, preferredLength),
      ...splitOversizedParagraph(
        text.slice(preferredLength),
        preferredLength
      )
    ].filter(Boolean);
  }

  const chunks = [];
  let currentChunk = '';

  sentences.forEach(sentence => {
    const cleanSentence = sentence.trim();

    if (!cleanSentence) {
      return;
    }

    const nextChunk = currentChunk
      ? `${currentChunk} ${cleanSentence}`
      : cleanSentence;

    if (
      nextChunk.length <= preferredLength ||
      !currentChunk
    ) {
      currentChunk = nextChunk;
    } else {
      chunks.push(currentChunk);
      currentChunk = cleanSentence;
    }
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}


/* =========================================================
   READER RENDERING
   ========================================================= */

function renderCurrentSection() {
  const section = currentSections[currentSectionIndex] || '';

  viewer.innerHTML = '';

  const paragraphs = section
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    viewer.textContent = section;
  } else {
    paragraphs.forEach(paragraphText => {
      const paragraph = document.createElement('p');
      paragraph.textContent = paragraphText;

      viewer.appendChild(paragraph);
    });
  }

  chapterLine.textContent = buildChapterLine(section);

  const remaining = Math.max(
    currentSections.length - currentSectionIndex - 1,
    0
  );

  remainingLine.textContent =
    `До конца книги: ${remaining} ${getPageWord(remaining)}`;

  saveReadingPosition();

  viewer.scrollTop = 0;

  window.scrollTo({
    top: 0,
    behavior: 'auto'
  });

  hideSelectionToolbar();
}

function buildChapterLine(section) {
  const firstLine = section
    .split('\n')
    .map(line => line.trim())
    .find(Boolean);

  const bookTitle = currentBook?.title || 'AN.KI';

  if (
    firstLine &&
    firstLine.length <= 110 &&
    /^(chapter|book|part|volume|глава|часть|книга|том)\b/i.test(firstLine)
  ) {
    return `${bookTitle} · ${firstLine}`;
  }

  return `${bookTitle} · ${currentSectionIndex + 1} / ${currentSections.length}`;
}

function showNextSection() {
  if (currentSectionIndex >= currentSections.length - 1) {
    return;
  }

  currentSectionIndex += 1;
  renderCurrentSection();
}

function showPreviousSection() {
  if (currentSectionIndex <= 0) {
    return;
  }

  currentSectionIndex -= 1;
  renderCurrentSection();
}

function saveReadingPosition() {
  if (!currentBook?.id) {
    return;
  }

  const positions = readStoredPositions();

  positions[currentBook.id] = {
    sectionIndex: currentSectionIndex,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(
    STORAGE_KEYS.readingPosition,
    JSON.stringify(positions)
  );
}

function restoreReadingPosition(bookId) {
  const positions = readStoredPositions();
  const position = positions[bookId];

  if (!position) {
    return 0;
  }

  return Number(position.sectionIndex) || 0;
}

function readStoredPositions() {
  try {
    const stored = localStorage.getItem(
      STORAGE_KEYS.readingPosition
    );

    const parsed = stored
      ? JSON.parse(stored)
      : {};

    return parsed && typeof parsed === 'object'
      ? parsed
      : {};
  } catch {
    return {};
  }
}


/* =========================================================
   FONT SIZE
   ========================================================= */

function changeFontSize(amount) {
  const nextSize = Math.min(
    MAX_FONT_SIZE,
    Math.max(
      MIN_FONT_SIZE,
      currentFontSize + amount
    )
  );

  applyFontSize(nextSize);
}

function applyFontSize(size) {
  currentFontSize = size;

  viewer.style.fontSize = `${size}px`;

  localStorage.setItem(
    STORAGE_KEYS.fontSize,
    String(size)
  );
}


/* =========================================================
   READER CONTROLS
   ========================================================= */

function toggleReaderOverlay() {
  overlayVisible = !overlayVisible;

  readerOverlay.classList.toggle(
    'visible',
    overlayVisible
  );
}

function shouldIgnoreReaderTap(event) {
  if (
    actionSheet &&
    !actionSheet.classList.contains('hidden')
  ) {
    return true;
  }

  const selection = window.getSelection();

  if (
    selection &&
    selection.toString().trim()
  ) {
    return true;
  }

  return Boolean(
    event.target.closest(
      'button, input, select, a, .selection-toolbar, .action-sheet'
    )
  );
}


/* =========================================================
   SWIPE
   ========================================================= */

function handleTouchStart(event) {
  if (!event.changedTouches.length) {
    return;
  }

  touchStartX = event.changedTouches[0].clientX;
  touchStartY = event.changedTouches[0].clientY;
}

function handleTouchEnd(event) {
  if (!event.changedTouches.length) {
    return;
  }

  if (
    actionSheet &&
    !actionSheet.classList.contains('hidden')
  ) {
    return;
  }

  const endX = event.changedTouches[0].clientX;
  const endY = event.changedTouches[0].clientY;

  const deltaX = endX - touchStartX;
  const deltaY = endY - touchStartY;

  if (
    Math.abs(deltaX) < 55 ||
    Math.abs(deltaX) <= Math.abs(deltaY)
  ) {
    return;
  }

  const selection = window.getSelection();

  if (
    selection &&
    selection.toString().trim()
  ) {
    return;
  }

  if (deltaX < 0) {
    showNextSection();
  } else {
    showPreviousSection();
  }
}


/* =========================================================
   TEXT SELECTION
   ========================================================= */

function handleSelectionChange() {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    selectedText = '';
    hideSelectionToolbar();
    return;
  }

  const text = selection.toString().trim();

  if (!text || !isSelectionInsideViewer(selection)) {
    selectedText = '';
    hideSelectionToolbar();
    return;
  }

  selectedText = text.slice(0, 12000);
}

function isSelectionInsideViewer(selection) {
  if (!selection.rangeCount) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;

  const element = commonAncestor.nodeType === Node.ELEMENT_NODE
    ? commonAncestor
    : commonAncestor.parentElement;

  return Boolean(element && viewer.contains(element));
}

function showSelectionToolbar() {
  const selection = window.getSelection();

  if (
    !selection ||
    selection.rangeCount === 0 ||
    !selectedText ||
    !isSelectionInsideViewer(selection)
  ) {
    hideSelectionToolbar();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (!rect || (!rect.width && !rect.height)) {
    hideSelectionToolbar();
    return;
  }

  selectionToolbar.style.display = 'flex';

  const toolbarRect = selectionToolbar.getBoundingClientRect();

  let left =
    rect.left +
    rect.width / 2 -
    toolbarRect.width / 2;

  let top =
    rect.top -
    toolbarRect.height -
    10;

  left = Math.max(
    8,
    Math.min(
      left,
      window.innerWidth - toolbarRect.width - 8
    )
  );

  if (top < 8) {
    top = rect.bottom + 10;
  }

  selectionToolbar.style.left = `${left}px`;
  selectionToolbar.style.top = `${top}px`;
}

function hideSelectionToolbar() {
  selectionToolbar.style.display = 'none';
}


/* =========================================================
   ACTION SHEET
   ========================================================= */

function openActionSheet(initialAction = '') {
  if (!selectedText) {
    return;
  }

  selectedTextBox.textContent = selectedText;
  actionResult.textContent = 'Выбери действие.';

  sheetBackdrop.classList.remove('hidden');
  actionSheet.classList.remove('hidden');

  hideSelectionToolbar();

  if (initialAction === 'translate') {
    translateSelection();
  }

  if (initialAction === 'explain') {
    explainSelection();
  }

  if (initialAction === 'save') {
    saveSelection();
  }
}

function closeActionSheet() {
  sheetBackdrop.classList.add('hidden');
  actionSheet.classList.add('hidden');

  actionResult.textContent = 'Выбери действие.';

  clearNativeSelection();
}

function clearNativeSelection() {
  const selection = window.getSelection();

  if (selection) {
    selection.removeAllRanges();
  }

  hideSelectionToolbar();
}


/* =========================================================
   AI
   ========================================================= */

async function translateSelection() {
  if (!selectedText) {
    return;
  }

  const targetLanguage =
    languageSelect.value ||
    DEFAULT_TARGET_LANGUAGE;

  setActionLoading(
    true,
    'Перевожу…'
  );

  try {
    const result = await callAI({
      action: 'translate',
      text: selectedText,
      targetLanguage
    });

    actionResult.textContent = result;
  } catch (error) {
    console.error('Translation error:', error);

    actionResult.textContent =
      error.message ||
      'Не удалось выполнить перевод.';
  } finally {
    setActionLoading(false);
  }
}

async function explainSelection() {
  if (!selectedText) {
    return;
  }

  setActionLoading(
    true,
    'Объясняю…'
  );

  try {
    const result = await callAI({
      action: 'explain',
      text: selectedText,
      targetLanguage:
        languageSelect.value ||
        DEFAULT_TARGET_LANGUAGE
    });

    actionResult.textContent = result;
  } catch (error) {
    console.error('Explanation error:', error);

    actionResult.textContent =
      error.message ||
      'Не удалось получить объяснение.';
  } finally {
    setActionLoading(false);
  }
}

async function callAI({
  action,
  text,
  targetLanguage
}) {
  const response = await fetch(AI_ENDPOINT, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json'
    },

    body: JSON.stringify({
      action,
      text,
      targetLanguage
    })
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      payload.error ||
      payload.message ||
      'Сервис временно недоступен.'
    );
  }

  const result =
    payload.result ||
    payload.output ||
    payload.text ||
    '';

  if (!result) {
    throw new Error(
      'Сервис вернул пустой ответ.'
    );
  }

  return String(result).trim();
}

function setActionLoading(isLoading, message = '') {
  translateBtn.disabled = isLoading;
  explainBtn.disabled = isLoading;
  saveBtn.disabled = isLoading;

  toolbarTranslateBtn.disabled = isLoading;
  toolbarExplainBtn.disabled = isLoading;
  toolbarSaveBtn.disabled = isLoading;

  if (isLoading && message) {
    actionResult.textContent = message;
  }
}


/* =========================================================
   SAVE FRAGMENT
   ========================================================= */

function saveSelection() {
  if (!selectedText) {
    return;
  }

  const savedFragments = readSavedFragments();

  const fragment = {
    id: createLocalId(),
    text: selectedText,
    bookId: currentBook?.id || null,
    bookTitle: currentBook?.title || 'Без названия',
    authors: currentBook?.authors || [],
    sectionIndex: currentSectionIndex,
    createdAt: new Date().toISOString()
  };

  savedFragments.unshift(fragment);

  localStorage.setItem(
    STORAGE_KEYS.savedFragments,
    JSON.stringify(savedFragments.slice(0, 500))
  );

  actionResult.textContent =
    'Фрагмент сохранён в памяти браузера.';
}

function readSavedFragments() {
  try {
    const stored = localStorage.getItem(
      STORAGE_KEYS.savedFragments
    );

    const parsed = stored
      ? JSON.parse(stored)
      : [];

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}


/* =========================================================
   KEYBOARD
   ========================================================= */

function handleGlobalKeydown(event) {
  if (readerView.classList.contains('hidden')) {
    return;
  }

  if (
    actionSheet &&
    !actionSheet.classList.contains('hidden')
  ) {
    if (event.key === 'Escape') {
      closeActionSheet();
    }

    return;
  }

  const activeTag =
    document.activeElement?.tagName?.toLowerCase();

  if (
    activeTag === 'input' ||
    activeTag === 'select' ||
    activeTag === 'textarea'
  ) {
    return;
  }

  if (
    event.key === 'ArrowRight' ||
    event.key === 'PageDown'
  ) {
    event.preventDefault();
    showNextSection();
  }

  if (
    event.key === 'ArrowLeft' ||
    event.key === 'PageUp'
  ) {
    event.preventDefault();
    showPreviousSection();
  }

  if (event.key === 'Escape') {
    closeReader();
  }

  if (event.key === '+') {
    changeFontSize(FONT_STEP);
  }

  if (event.key === '-') {
    changeFontSize(-FONT_STEP);
  }
}


/* =========================================================
   HELPERS
   ========================================================= */

async function parseJsonResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    if (!response.ok) {
      throw new Error(rawText);
    }

    return {
      text: rawText
    };
  }
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}…`;
}

function getLanguageName(code) {
  const normalizedCode = String(code)
    .trim()
    .toLowerCase();

  const languages = {
    ru: 'Русский',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    it: 'Italiano',
    es: 'Español',
    pt: 'Português',
    zh: '中文',
    la: 'Latina',
    uk: 'Українська',
    pl: 'Polski',
    nl: 'Nederlands',
    sv: 'Svenska',
    no: 'Norsk',
    da: 'Dansk',
    fi: 'Suomi',
    el: 'Ελληνικά',
    grc: 'Древнегреческий'
  };

  return languages[normalizedCode] || code;
}

function getPageWord(number) {
  const absoluteNumber = Math.abs(number) % 100;
  const lastDigit = absoluteNumber % 10;

  if (
    absoluteNumber > 10 &&
    absoluteNumber < 20
  ) {
    return 'страниц';
  }

  if (lastDigit === 1) {
    return 'страница';
  }

  if (
    lastDigit >= 2 &&
    lastDigit <= 4
  ) {
    return 'страницы';
  }

  return 'страниц';
}

function createLocalId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2)
  ].join('-');
}
