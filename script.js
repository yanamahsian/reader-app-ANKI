```
/* ========================================================================
   AN.KI Reader Engine v2
   Part 1
   Core
   ======================================================================== */

"use strict";

/* ========================================================================
   CONFIG
   ======================================================================== */

const CONFIG = {

    VERSION: "2.0",

    HERO_IMAGES: 45,

    HERO_DELAY: 7000,

    DEFAULT_THEME: "dark",

    DEFAULT_FONT_SIZE: 22,

    MIN_FONT_SIZE: 16,

    MAX_FONT_SIZE: 34,

    PAGE_TARGET_SIZE: 6500,

    STORAGE_PREFIX: "anki_",

    API: {

        LIBRARY:
            "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-library",

        AI:
            "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-ai"

    }

};



/* ========================================================================
   STORAGE KEYS
   ======================================================================== */

const STORAGE = {

    THEME:
        CONFIG.STORAGE_PREFIX + "theme",

    FONT:
        CONFIG.STORAGE_PREFIX + "font",

    BOOK:
        CONFIG.STORAGE_PREFIX + "book",

    POSITION:
        CONFIG.STORAGE_PREFIX + "position",

    FRAGMENTS:
        CONFIG.STORAGE_PREFIX + "fragments"

};



/* ========================================================================
   APPLICATION STATE
   ======================================================================== */

const APP = {

    initialized: false,

    currentBook: null,

    currentPage: 0,

    pages: [],

    chapters: [],

    plainText: "",

    language: "ru",

    theme: CONFIG.DEFAULT_THEME,

    fontSize: CONFIG.DEFAULT_FONT_SIZE,

    heroIndex: 0,

    heroTimer: null,

    searchController: null,

    aiController: null,

    selection: "",

    touchStartX: 0,

    touchStartY: 0,

    touchEndX: 0,

    touchEndY: 0,

    isSelecting: false,

    overlayVisible: true,

    library: [],

    cache: {

        books: {},

        ai: {},

        translations: {}

    }

};



/* ========================================================================
   DOM
   ======================================================================== */

const DOM = {};



/* ========================================================================
   HERO IMAGES
   ======================================================================== */

const HERO_IMAGES = [];

for (let i = 1; i <= CONFIG.HERO_IMAGES; i++) {

    HERO_IMAGES.push(

        `Hero/hero_${i}.png`

    );

}



/* ========================================================================
   START
   ======================================================================== */

document.addEventListener(

    "DOMContentLoaded",

    initializeApplication

);



/* ========================================================================
   INITIALIZATION
   ======================================================================== */

function initializeApplication() {

    cacheDom();

    restoreSettings();

    bindEvents();

    preloadHeroImages();

    startHeroRotation();

    APP.initialized = true;

}



/* ========================================================================
   DOM CACHE
   ======================================================================== */

function cacheDom() {

    DOM.body =
        document.body;

    DOM.home =
        document.getElementById("homeView");

    DOM.reader =
        document.getElementById("readerView");

    DOM.search =
        document.getElementById("searchInput");

    DOM.language =
        document.getElementById("languageSelect");

    DOM.searchButton =
        document.getElementById("searchBtn");

    DOM.results =
        document.getElementById("results");

    DOM.preview =
        document.querySelector(".preview-card");

    DOM.viewer =
        document.getElementById("viewer");

    DOM.overlay =
        document.getElementById("readerOverlay");

    DOM.chapter =
        document.getElementById("chapterLine");

    DOM.remaining =
        document.getElementById("remainingLine");

    DOM.toolbar =
        document.getElementById("selectionToolbar");

    DOM.sheet =
        document.getElementById("actionSheet");

    DOM.backdrop =
        document.getElementById("sheetBackdrop");

}



/* ========================================================================
   SETTINGS
   ======================================================================== */

function restoreSettings() {

    APP.theme =

        localStorage.getItem(

            STORAGE.THEME

        ) ||

        CONFIG.DEFAULT_THEME;

    APP.fontSize =

        Number(

            localStorage.getItem(

                STORAGE.FONT

            )

        ) ||

        CONFIG.DEFAULT_FONT_SIZE;

    applyTheme();

    applyFontSize();

}



function applyTheme() {

    DOM.body.classList.remove(

        "theme-dark",

        "theme-light",

        "theme-sepia",

        "theme-black"

    );

    DOM.body.classList.add(

        "theme-" + APP.theme

    );

    localStorage.setItem(

        STORAGE.THEME,

        APP.theme

    );

}



function applyFontSize() {

    if (!DOM.viewer) return;

    DOM.viewer.style.fontSize =

        APP.fontSize + "px";

    localStorage.setItem(

        STORAGE.FONT,

        APP.fontSize

    );

}



/* ========================================================================
   HERO
   ======================================================================== */

function preloadHeroImages() {

    HERO_IMAGES.forEach(path => {

        const img = new Image();

        img.src = path;

    });

}



function startHeroRotation() {

    if (!DOM.preview) return;

    APP.heroIndex =

        Math.floor(

            Math.random() *

            HERO_IMAGES.length

        );

    renderHero();

    APP.heroTimer =

        setInterval(

            nextHero,

            CONFIG.HERO_DELAY

        );

}



function nextHero() {

    let next = APP.heroIndex;

    while (next === APP.heroIndex) {

        next =

            Math.floor(

                Math.random() *

                HERO_IMAGES.length

            );

    }

    APP.heroIndex = next;

    renderHero();

}



function renderHero() {

    DOM.preview.style.backgroundImage =

        `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.65)),url("${HERO_IMAGES[APP.heroIndex]}")`;

}



/* ========================================================================
   EVENTS
   ======================================================================== */

function bindEvents() {

    if (DOM.searchButton) {

        DOM.searchButton.addEventListener(

            "click",

            searchBooks

        );

    }

    if (DOM.search) {

        DOM.search.addEventListener(

            "keydown",

            event => {

                if (event.key === "Enter") {

                    searchBooks();

                }

            }

        );

    }

}



/* ========================================================================
   PLACEHOLDERS
   ======================================================================== */

async function searchBooks() {

    // Part 2

}

function openBook(book) {

    // Part 3

}

function renderPage(index) {

    // Part 4

}

function translateSelection() {

    // Part 5

}

function explainSelection() {

    // Part 5

}

function saveFragment() {

    // Part 6

}

/* ========================================================================
   PART 2
   Library Search Engine
   ======================================================================== */



/* ========================================================================
   SEARCH
   ======================================================================== */

async function searchBooks() {

    const query = DOM.search.value.trim();

    if (!query.length) {

        clearResults();

        return;

    }

    if (APP.searchController) {

        APP.searchController.abort();

    }

    APP.searchController = new AbortController();

    showSearchLoading();

    try {

        const response = await fetch(

            CONFIG.API.LIBRARY,

            {

                method: "POST",

                headers: {

                    "Content-Type": "application/json"

                },

                body: JSON.stringify({

                    query,

                    language:

                        DOM.language?.value ||

                        APP.language

                }),

                signal:

                    APP.searchController.signal

            }

        );

        if (!response.ok) {

            throw new Error("Library error");

        }

        const books =

            await response.json();

        APP.library = books;

        renderSearchResults(books);

    }

    catch (error) {

        if (error.name !== "AbortError") {

            console.error(error);

            renderSearchError(

                "Ошибка поиска."

            );

        }

    }

    finally {

        hideSearchLoading();

    }

}



/* ========================================================================
   RESULTS
   ======================================================================== */

function clearResults() {

    DOM.results.innerHTML = "";

}



function showSearchLoading() {

    DOM.searchButton.disabled = true;

    DOM.searchButton.textContent =

        "Поиск...";

}



function hideSearchLoading() {

    DOM.searchButton.disabled = false;

    DOM.searchButton.textContent =

        "Поиск";

}



function renderSearchError(message) {

    DOM.results.innerHTML =

        `

        <div class="search-error">

            ${message}

        </div>

    `;

}



function renderSearchResults(books) {

    clearResults();

    if (!Array.isArray(books)) {

        renderSearchError(

            "Некорректный ответ."

        );

        return;

    }

    if (books.length === 0) {

        renderSearchError(

            "Ничего не найдено."

        );

        return;

    }

    const fragment =

        document.createDocumentFragment();

    books.forEach(book => {

        fragment.appendChild(

            createBookCard(book)

        );

    });

    DOM.results.appendChild(

        fragment

    );

}



/* ========================================================================
   BOOK CARD
   ======================================================================== */

function createBookCard(book) {

    const card =

        document.createElement("article");

    card.className =

        "book-card";

    const cover =

        book.cover ||

        "images/no-cover.webp";

    const language =

        book.language ||

        "";

    const author =

        book.author ||

        "";

    const year =

        book.year ||

        "";

    card.innerHTML =

        `

        <div class="book-cover">

            <img

                loading="lazy"

                src="${cover}"

                alt="">

        </div>

        <div class="book-content">

            <h3>

                ${book.title}

            </h3>

            <div class="book-author">

                ${author}

            </div>

            <div class="book-meta">

                <span>${language}</span>

                <span>${year}</span>

            </div>

        </div>

    `;

    card.addEventListener(

        "click",

        () => {

            openBook(book);

        }

    );

    return card;

}



/* ========================================================================
   BOOK
   ======================================================================== */

async function openBook(book) {

    APP.currentBook = book;

    localStorage.setItem(

        STORAGE.BOOK,

        JSON.stringify(book)

    );

    try {

        const response =

            await fetch(book.url);

        if (!response.ok) {

            throw new Error(

                "Book loading failed"

            );

        }

        const text =

            await response.text();

        prepareBook(text);

    }

    catch (error) {

        console.error(error);

        alert(

            "Не удалось открыть книгу."

        );

    }

}



/* ========================================================================
   BOOK PREPARATION
   ======================================================================== */

function prepareBook(text) {

    APP.plainText =

        normalizeBook(text);

    APP.pages =

        paginateText(

            APP.plainText

        );

    APP.currentPage =

        restoreBookPosition();

    showReader();

    renderPage(

        APP.currentPage

    );

}



/* ========================================================================
   NORMALIZER
   ======================================================================== */

function normalizeBook(text) {

    return text

        .replace(/\r/g, "")

        .replace(/\t/g, " ")

        .replace(/\u00A0/g, " ")

        .replace(/\n{3,}/g, "\n\n")

        .trim();

}



/* ========================================================================
   READER
   ======================================================================== */

function showReader() {

    DOM.home.hidden = true;

    DOM.reader.hidden = false;

}



/* ========================================================================
   POSITION
   ======================================================================== */

function restoreBookPosition() {

    const saved =

        Number(

            localStorage.getItem(

                STORAGE.POSITION

            )

        );

    if (

        Number.isNaN(saved)

    ) {

        return 0;

    }

    return Math.min(

        saved,

        APP.pages.length - 1

    );

}



function saveCurrentPosition() {

    localStorage.setItem(

        STORAGE.POSITION,

        APP.currentPage

    );

}
/* ========================================================================
   PART 3
   Pagination Engine
   ======================================================================== */



/* ========================================================================
   PAGINATION
   ======================================================================== */

function paginateText(text) {

    const pages = [];

    let cursor = 0;

    while (cursor < text.length) {

        let end =

            cursor +

            CONFIG.PAGE_TARGET_SIZE;

        if (end >= text.length) {

            pages.push(

                text.substring(cursor)

            );

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

        pages.push(

            text.substring(

                cursor,

                end + 1

            )

        );

        cursor = end + 1;

    }

    return pages;

}



/* ========================================================================
   PAGE
   ======================================================================== */

function renderPage(index) {

    if (!APP.pages.length) {

        return;

    }

    index = Math.max(

        0,

        Math.min(

            index,

            APP.pages.length - 1

        )

    );

    APP.currentPage = index;

    DOM.viewer.innerHTML =

        formatPage(

            APP.pages[index]

        );

    updateProgress();

    updateChapter();

    saveCurrentPosition();

}



/* ========================================================================
   FORMATTER
   ======================================================================== */

function formatPage(text) {

    return text

        .split("\n\n")

        .map(

            paragraph =>

                `<p>${escapeHtml(paragraph)}</p>`

        )

        .join("");

}



/* ========================================================================
   HTML ESCAPE
   ======================================================================== */

function escapeHtml(text) {

    return text

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#39;");

}



/* ========================================================================
   PROGRESS
   ======================================================================== */

function updateProgress() {

    if (!DOM.remaining) {

        return;

    }

    const percent =

        Math.round(

            (

                (APP.currentPage + 1)

                /

                APP.pages.length

            ) * 100

        );

    DOM.remaining.textContent =

        `${percent}%`;

}



/* ========================================================================
   CHAPTER DETECTION
   ======================================================================== */

function updateChapter() {

    if (!DOM.chapter) {

        return;

    }

    const page =

        APP.pages[APP.currentPage];

    const lines =

        page

        .split("\n")

        .map(

            line =>

                line.trim()

        )

        .filter(Boolean);

    let title =

        "Чтение";

    for (const line of lines) {

        if (

            line.length < 70 &&

            line === line.toUpperCase()

        ) {

            title = line;

            break;

        }

        if (

            /^chapter/i.test(line)

        ) {

            title = line;

            break;

        }

        if (

            /^глава/i.test(line)

        ) {

            title = line;

            break;

        }

    }

    DOM.chapter.textContent =

        title;

}



/* ========================================================================
   NAVIGATION
   ======================================================================== */

function nextPage() {

    if (

        APP.currentPage >=

        APP.pages.length - 1

    ) {

        return;

    }

    renderPage(

        APP.currentPage + 1

    );

}



function previousPage() {

    if (

        APP.currentPage <= 0

    ) {

        return;

    }

    renderPage(

        APP.currentPage - 1

    );

}



/* ========================================================================
   TOUCH
   ======================================================================== */

function bindReaderTouch() {

    if (!DOM.viewer) {

        return;

    }

    DOM.viewer.addEventListener(

        "touchstart",

        event => {

            APP.touchStartX =

                event.changedTouches[0].clientX;

            APP.touchStartY =

                event.changedTouches[0].clientY;

        },

        {

            passive: true

        }

    );

    DOM.viewer.addEventListener(

        "touchend",

        event => {

            APP.touchEndX =

                event.changedTouches[0].clientX;

            APP.touchEndY =

                event.changedTouches[0].clientY;

            handleSwipe();

        },

        {

            passive: true

        }

    );

}



/* ========================================================================
   SWIPE
   ======================================================================== */

function handleSwipe() {

    const dx =

        APP.touchEndX -

        APP.touchStartX;

    const dy =

        APP.touchEndY -

        APP.touchStartY;

    if (

        Math.abs(dx) < 70 ||

        Math.abs(dx) < Math.abs(dy)

    ) {

        return;

    }

    if (dx < 0) {

        nextPage();

    }

    else {

        previousPage();

    }

}



/* ========================================================================
   KEYBOARD
   ======================================================================== */

function bindKeyboard() {

    window.addEventListener(

        "keydown",

        event => {

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

    );

}



/* ========================================================================
   START READER
   ======================================================================== */

function initializeReader() {

    bindReaderTouch();

    bindKeyboard();

}

/* ========================================================================
   PART 4
   Selection Engine
   AI Panel
   ======================================================================== */



/* ========================================================================
   SELECTION
   ======================================================================== */

function initializeSelection() {

    if (!DOM.viewer) return;

    document.addEventListener(

        "selectionchange",

        handleSelectionChange

    );

}



function handleSelectionChange() {

    if (!DOM.viewer) return;

    const selection = window.getSelection();

    if (!selection) return;

    if (selection.rangeCount === 0) {

        hideSelectionToolbar();

        return;

    }

    const text =

        selection.toString().trim();

    if (!text.length) {

        hideSelectionToolbar();

        return;

    }

    if (!DOM.viewer.contains(

        selection.anchorNode

    )) {

        hideSelectionToolbar();

        return;

    }

    APP.selection = text;

    showSelectionToolbar(

        selection

    );

}



/* ========================================================================
   TOOLBAR
   ======================================================================== */

function showSelectionToolbar(selection) {

    if (!DOM.toolbar) return;

    const rect =

        selection

        .getRangeAt(0)

        .getBoundingClientRect();

    DOM.toolbar.hidden = false;

    DOM.toolbar.style.left =

        rect.left +

        rect.width / 2 +

        window.scrollX +

        "px";

    DOM.toolbar.style.top =

        rect.top +

        window.scrollY -

        56 +

        "px";

}



function hideSelectionToolbar() {

    if (!DOM.toolbar) return;

    DOM.toolbar.hidden = true;

}



/* ========================================================================
   TOOLBAR EVENTS
   ======================================================================== */

function bindToolbarButtons() {

    const translate =

        document.getElementById(

            "translateBtn"

        );

    const explain =

        document.getElementById(

            "explainBtn"

        );

    const quote =

        document.getElementById(

            "saveQuoteBtn"

        );

    translate?.addEventListener(

        "click",

        translateSelection

    );

    explain?.addEventListener(

        "click",

        explainSelection

    );

    quote?.addEventListener(

        "click",

        saveFragment

    );

}



/* ========================================================================
   ACTION SHEET
   ======================================================================== */

function openActionSheet(title, html) {

    if (

        !DOM.sheet ||

        !DOM.backdrop

    ) return;

    DOM.sheet.innerHTML =

        `

        <div class="sheet-header">

            ${title}

        </div>

        <div class="sheet-content">

            ${html}

        </div>

        `;

    DOM.backdrop.hidden = false;

    DOM.sheet.hidden = false;

    requestAnimationFrame(() => {

        DOM.backdrop.classList.add(

            "visible"

        );

        DOM.sheet.classList.add(

            "visible"

        );

    });

}



function closeActionSheet() {

    if (

        !DOM.sheet ||

        !DOM.backdrop

    ) return;

    DOM.sheet.classList.remove(

        "visible"

    );

    DOM.backdrop.classList.remove(

        "visible"

    );

    setTimeout(() => {

        DOM.sheet.hidden = true;

        DOM.backdrop.hidden = true;

    }, 250);

}



/* ========================================================================
   BACKDROP
   ======================================================================== */

function bindActionSheet() {

    DOM.backdrop?.addEventListener(

        "click",

        closeActionSheet

    );

}



/* ========================================================================
   OVERLAY
   ======================================================================== */

function toggleOverlay() {

    APP.overlayVisible =

        !APP.overlayVisible;

    if (

        APP.overlayVisible

    ) {

        DOM.overlay.classList.remove(

            "hidden"

        );

    }

    else {

        DOM.overlay.classList.add(

            "hidden"

        );

    }

}



/* ========================================================================
   TAP ZONES
   ======================================================================== */

function initializeTapZones() {

    const left =

        document.getElementById(

            "leftTapZone"

        );

    const center =

        document.getElementById(

            "centerTapZone"

        );

    const right =

        document.getElementById(

            "rightTapZone"

        );

    left?.addEventListener(

        "click",

        previousPage

    );

    center?.addEventListener(

        "click",

        toggleOverlay

    );

    right?.addEventListener(

        "click",

        nextPage

    );

}



/* ========================================================================
   FONT
   ======================================================================== */

function increaseFontSize() {

    APP.fontSize = Math.min(

        CONFIG.MAX_FONT_SIZE,

        APP.fontSize + 1

    );

    applyFontSize();

    APP.pages = paginateText(

        APP.plainText

    );

    renderPage(

        APP.currentPage

    );

}



function decreaseFontSize() {

    APP.fontSize = Math.max(

        CONFIG.MIN_FONT_SIZE,

        APP.fontSize - 1

    );

    applyFontSize();

    APP.pages = paginateText(

        APP.plainText

    );

    renderPage(

        APP.currentPage

    );

}



/* ========================================================================
   THEME
   ======================================================================== */

function setTheme(theme) {

    APP.theme = theme;

    applyTheme();

}



/* ========================================================================
   READER STARTUP
   ======================================================================== */

function initializeReaderUI() {

    initializeReader();

    initializeSelection();

    initializeTapZones();

    bindToolbarButtons();

    bindActionSheet();

}

/* ========================================================================
   PART 5
   AI ENGINE
   Translation
   Explanation
   ======================================================================== */



/* ========================================================================
   AI REQUEST
   ======================================================================== */

async function requestAI(action, payload) {

    if (APP.aiController) {

        APP.aiController.abort();

    }

    APP.aiController =

        new AbortController();

    const response = await fetch(

        CONFIG.API.AI,

        {

            method: "POST",

            headers: {

                "Content-Type":

                    "application/json"

            },

            signal:

                APP.aiController.signal,

            body: JSON.stringify({

                action,

                ...payload

            })

        }

    );

    if (!response.ok) {

        throw new Error(

            "AI request failed"

        );

    }

    return await response.json();

}



/* ========================================================================
   TRANSLATE
   ======================================================================== */

async function translateSelection() {

    if (!APP.selection.length) {

        return;

    }

    const cacheKey =

        "translate_" +

        APP.selection;

    if (

        APP.cache.translations[cacheKey]

    ) {

        openActionSheet(

            "Перевод",

            APP.cache.translations[cacheKey]

        );

        return;

    }

    openActionSheet(

        "Перевод",

        loadingTemplate()

    );

    try {

        const result =

            await requestAI(

                "translate",

                {

                    text:

                        APP.selection,

                    language:

                        APP.language

                }

            );

        APP.cache.translations[cacheKey] =

            result.translation;

        updateActionSheet(

            result.translation

        );

    }

    catch (error) {

        console.error(error);

        updateActionSheet(

            errorTemplate()

        );

    }

}



/* ========================================================================
   EXPLAIN
   ======================================================================== */

async function explainSelection() {

    if (!APP.selection.length) {

        return;

    }

    const cacheKey =

        "explain_" +

        APP.selection;

    if (

        APP.cache.ai[cacheKey]

    ) {

        openActionSheet(

            "Объяснение",

            APP.cache.ai[cacheKey]

        );

        return;

    }

    openActionSheet(

        "Объяснение",

        loadingTemplate()

    );

    try {

        const result =

            await requestAI(

                "explain",

                {

                    text:

                        APP.selection,

                    language:

                        APP.language

                }

            );

        APP.cache.ai[cacheKey] =

            result.answer;

        updateActionSheet(

            result.answer

        );

    }

    catch (error) {

        console.error(error);

        updateActionSheet(

            errorTemplate()

        );

    }

}



/* ========================================================================
   SHEET UPDATE
   ======================================================================== */

function updateActionSheet(html) {

    const body =

        DOM.sheet.querySelector(

            ".sheet-content"

        );

    if (!body) {

        return;

    }

    body.innerHTML = html;

}



/* ========================================================================
   LOADING TEMPLATE
   ======================================================================== */

function loadingTemplate() {

    return `

        <div class="sheet-loading">

            <div class="loader"></div>

            <p>

                AI думает...

            </p>

        </div>

    `;

}



/* ========================================================================
   ERROR TEMPLATE
   ======================================================================== */

function errorTemplate() {

    return `

        <div class="sheet-error">

            Не удалось получить ответ.

        </div>

    `;

}



/* ========================================================================
   SUMMARY
   ======================================================================== */

async function summarizeCurrentPage() {

    openActionSheet(

        "Краткое содержание",

        loadingTemplate()

    );

    try {

        const result =

            await requestAI(

                "summary",

                {

                    text:

                        APP.pages[

                            APP.currentPage

                        ]

                }

            );

        updateActionSheet(

            result.summary

        );

    }

    catch {

        updateActionSheet(

            errorTemplate()

        );

    }

}



/* ========================================================================
   ASK AI
   ======================================================================== */

async function askAI(question) {

    if (

        !question ||

        !question.trim()

    ) {

        return;

    }

    openActionSheet(

        "Ответ",

        loadingTemplate()

    );

    try {

        const result =

            await requestAI(

                "question",

                {

                    question,

                    context:

                        APP.pages[

                            APP.currentPage

                        ]

                }

            );

        updateActionSheet(

            result.answer

        );

    }

    catch {

        updateActionSheet(

            errorTemplate()

        );

    }

}



/* ========================================================================
   CUSTOM PROMPT
   ======================================================================== */

function showAskDialog() {

    openActionSheet(

        "Задать вопрос",

        `

        <textarea

            id="aiQuestion"

            class="ai-question"

            placeholder="Введите вопрос..."></textarea>

        <button

            id="sendQuestion"

            class="primary-button">

            Спросить

        </button>

        `

    );

    document

        .getElementById(

            "sendQuestion"

        )

        ?.addEventListener(

            "click",

            () => {

                const question =

                    document

                    .getElementById(

                        "aiQuestion"

                    )

                    .value;

                askAI(

                    question

                );

            }

        );

}



/* ========================================================================
   TOOLBAR AI
   ======================================================================== */

function bindAITools() {

    document

        .getElementById(

            "summaryBtn"

        )

        ?.addEventListener(

            "click",

            summarizeCurrentPage

        );

    document

        .getElementById(

            "askAiBtn"

        )

        ?.addEventListener(

            "click",

            showAskDialog

        );

}

/* ========================================================================
   PART 6
   Bookmarks
   Quotes
   Reading History
   ======================================================================== */



/* ========================================================================
   FRAGMENTS
   ======================================================================== */

function saveFragment() {

    if (!APP.selection.trim()) {

        return;

    }

    const fragments =

        loadFragments();

    fragments.unshift({

        id: crypto.randomUUID(),

        book: APP.currentBook?.title || "",

        author: APP.currentBook?.author || "",

        page: APP.currentPage,

        text: APP.selection,

        created:

            Date.now()

    });

    localStorage.setItem(

        STORAGE.FRAGMENTS,

        JSON.stringify(fragments)

    );

    updateSavedCounter();

    hideSelectionToolbar();

}



/* ========================================================================
   LOAD FRAGMENTS
   ======================================================================== */

function loadFragments() {

    try {

        return JSON.parse(

            localStorage.getItem(

                STORAGE.FRAGMENTS

            ) || "[]"

        );

    }

    catch {

        return [];

    }

}



/* ========================================================================
   DELETE FRAGMENT
   ======================================================================== */

function deleteFragment(id) {

    const fragments =

        loadFragments()

        .filter(

            item =>

                item.id !== id

        );

    localStorage.setItem(

        STORAGE.FRAGMENTS,

        JSON.stringify(

            fragments

        )

    );

    renderFragments();

}



/* ========================================================================
   CLEAR FRAGMENTS
   ======================================================================== */

function clearFragments() {

    localStorage.removeItem(

        STORAGE.FRAGMENTS

    );

    renderFragments();

}



/* ========================================================================
   RENDER FRAGMENTS
   ======================================================================== */

function renderFragments() {

    const container =

        document.getElementById(

            "savedFragments"

        );

    if (!container) return;

    const fragments =

        loadFragments();

    if (!fragments.length) {

        container.innerHTML =

            `

            <div class="empty-state">

                Нет сохранённых цитат

            </div>

            `;

        return;

    }

    container.innerHTML =

        fragments

        .map(

            fragment =>

            `

            <article

                class="saved-fragment"

                data-id="${fragment.id}">

                <header>

                    <strong>

                        ${fragment.book}

                    </strong>

                    <span>

                        стр. ${fragment.page + 1}

                    </span>

                </header>

                <p>

                    ${fragment.text}

                </p>

                <footer>

                    <button

                        class="fragment-open"

                        data-open="${fragment.page}">

                        Открыть

                    </button>

                    <button

                        class="fragment-delete"

                        data-delete="${fragment.id}">

                        Удалить

                    </button>

                </footer>

            </article>

            `

        )

        .join("");

    bindFragmentButtons();

}



/* ========================================================================
   FRAGMENT BUTTONS
   ======================================================================== */

function bindFragmentButtons() {

    document

        .querySelectorAll(

            ".fragment-delete"

        )

        .forEach(button => {

            button.addEventListener(

                "click",

                () => {

                    deleteFragment(

                        button.dataset.delete

                    );

                }

            );

        });

    document

        .querySelectorAll(

            ".fragment-open"

        )

        .forEach(button => {

            button.addEventListener(

                "click",

                () => {

                    renderPage(

                        Number(

                            button.dataset.open

                        )

                    );

                    closeActionSheet();

                }

            );

        });

}



/* ========================================================================
   HISTORY
   ======================================================================== */

function saveReadingHistory() {

    if (!APP.currentBook) return;

    const history =

        loadReadingHistory()

        .filter(

            book =>

                book.id !==

                APP.currentBook.id

        );

    history.unshift({

        id:

            APP.currentBook.id,

        title:

            APP.currentBook.title,

        author:

            APP.currentBook.author,

        cover:

            APP.currentBook.cover,

        page:

            APP.currentPage,

        progress:

            Math.round(

                (

                    (APP.currentPage + 1)

                    /

                    APP.pages.length

                ) * 100

            ),

        updated:

            Date.now()

    });

    localStorage.setItem(

        "anki_history",

        JSON.stringify(

            history.slice(0, 30)

        )

    );

}



/* ========================================================================
   LOAD HISTORY
   ======================================================================== */

function loadReadingHistory() {

    try {

        return JSON.parse(

            localStorage.getItem(

                "anki_history"

            ) || "[]"

        );

    }

    catch {

        return [];

    }

}



/* ========================================================================
   AUTO SAVE
   ======================================================================== */

function autoSaveReader() {

    saveCurrentPosition();

    saveReadingHistory();

}



/* ========================================================================
   INTERVAL
   ======================================================================== */

function startAutoSave() {

    setInterval(

        autoSaveReader,

        30000

    );

}



/* ========================================================================
   COUNTER
   ======================================================================== */

function updateSavedCounter() {

    const counter =

        document.getElementById(

            "savedCounter"

        );

    if (!counter) return;

    counter.textContent =

        loadFragments()

        .length;

}



/* ========================================================================
   BOOKMARK
   ======================================================================== */

function createBookmark() {

    localStorage.setItem(

        "anki_bookmark",

        JSON.stringify({

            page:

                APP.currentPage,

            book:

                APP.currentBook,

            created:

                Date.now()

        })

    );

}



/* ========================================================================
   RESTORE BOOKMARK
   ======================================================================== */

function restoreBookmark() {

    try {

        return JSON.parse(

            localStorage.getItem(

                "anki_bookmark"

            )

        );

    }

    catch {

        return null;

    }

}



/* ========================================================================
   INIT STORAGE
   ======================================================================== */

function initializeStorage() {

    updateSavedCounter();

    renderFragments();

    startAutoSave();

}

/* ========================================================================
   PART 7
   Settings
   Themes
   Utilities
   Application Bootstrap
   ======================================================================== */



/* ========================================================================
   SETTINGS PANEL
   ======================================================================== */

function initializeSettings() {

    bindThemeButtons();

    bindFontButtons();

    bindReaderButtons();

}



/* ========================================================================
   THEMES
   ======================================================================== */

function bindThemeButtons() {

    document

        .querySelectorAll(

            "[data-theme]"

        )

        .forEach(button => {

            button.addEventListener(

                "click",

                () => {

                    setTheme(

                        button.dataset.theme

                    );

                }

            );

        });

}



/* ========================================================================
   FONT
   ======================================================================== */

function bindFontButtons() {

    document

        .getElementById(

            "fontPlus"

        )

        ?.addEventListener(

            "click",

            increaseFontSize

        );

    document

        .getElementById(

            "fontMinus"

        )

        ?.addEventListener(

            "click",

            decreaseFontSize

        );

}



/* ========================================================================
   READER BUTTONS
   ======================================================================== */

function bindReaderButtons() {

    document

        .getElementById(

            "backButton"

        )

        ?.addEventListener(

            "click",

            returnHome

        );

    document

        .getElementById(

            "bookmarkButton"

        )

        ?.addEventListener(

            "click",

            createBookmark

        );

}



/* ========================================================================
   HOME
   ======================================================================== */

function returnHome() {

    DOM.reader.hidden = true;

    DOM.home.hidden = false;

    hideSelectionToolbar();

    closeActionSheet();

}



/* ========================================================================
   UTILITIES
   ======================================================================== */

function debounce(callback, delay = 300) {

    let timer;

    return (...args) => {

        clearTimeout(timer);

        timer = setTimeout(

            () => callback(...args),

            delay

        );

    };

}



function throttle(callback, delay = 100) {

    let waiting = false;

    return (...args) => {

        if (waiting) {

            return;

        }

        waiting = true;

        callback(...args);

        setTimeout(

            () => {

                waiting = false;

            },

            delay

        );

    };

}



function sleep(ms) {

    return new Promise(

        resolve =>

            setTimeout(

                resolve,

                ms

            )

    );

}



/* ========================================================================
   COPY
   ======================================================================== */

async function copy(text) {

    try {

        await navigator.clipboard.writeText(

            text

        );

    }

    catch (error) {

        console.error(error);

    }

}



/* ========================================================================
   DOWNLOAD
   ======================================================================== */

function downloadText(filename, text) {

    const blob = new Blob(

        [

            text

        ],

        {

            type:

                "text/plain"

        }

    );

    const url =

        URL.createObjectURL(blob);

    const link =

        document.createElement(

            "a"

        );

    link.href = url;

    link.download = filename;

    link.click();

    URL.revokeObjectURL(

        url

    );

}



/* ========================================================================
   NOTIFICATION
   ======================================================================== */

function notify(message) {

    const toast =

        document.createElement(

            "div"

        );

    toast.className =

        "toast";

    toast.textContent =

        message;

    document.body.appendChild(

        toast

    );

    requestAnimationFrame(() => {

        toast.classList.add(

            "visible"

        );

    });

    setTimeout(() => {

        toast.classList.remove(

            "visible"

        );

        setTimeout(() => {

            toast.remove();

        }, 300);

    }, 2000);

}



/* ========================================================================
   VISIBILITY
   ======================================================================== */

document.addEventListener(

    "visibilitychange",

    () => {

        if (

            document.hidden

        ) {

            autoSaveReader();

        }

    }

);



/* ========================================================================
   BEFORE UNLOAD
   ======================================================================== */

window.addEventListener(

    "beforeunload",

    () => {

        autoSaveReader();

    }

);



/* ========================================================================
   STARTUP
   ======================================================================== */

function bootApplication() {

    initializeReaderUI();

    initializeStorage();

    initializeSettings();

    bindAITools();

}



/* ========================================================================
   FINAL BOOT
   ======================================================================== */

document.addEventListener(

    "DOMContentLoaded",

    () => {

        bootApplication();

    }

);



/* ========================================================================
   VERSION
   ======================================================================== */

console.log(

    "%cAN.KI Reader Engine v2",

    "color:#c9a96a;font-weight:bold;"

);

console.log(

    "Application initialized."

);

/* ========================================================================
   END OF SCRIPT
   ======================================================================== */
