type JsonRecord = Record<string, unknown>;

type LibraryBook = {
  id: string;
  title: string;
  authors: string[];
  languages: string[];
};

type ReadableBook = LibraryBook & {
  text: string;
};

type GutendexPerson = {
  name?: string;
  birth_year?: number | null;
  death_year?: number | null;
};

type GutendexBook = {
  id?: number;
  title?: string;
  authors?: GutendexPerson[];
  translators?: GutendexPerson[];
  subjects?: string[];
  bookshelves?: string[];
  languages?: string[];
  copyright?: boolean | null;
  media_type?: string;
  formats?: Record<string, string>;
  download_count?: number;
};

type GutendexResponse = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: GutendexBook[];
};

type WikisourceSearchItem = {
  ns?: number;
  title?: string;
  pageid?: number;
  size?: number;
  wordcount?: number;
  snippet?: string;
  timestamp?: string;
};

type WikisourceSearchResponse = {
  query?: {
    searchinfo?: {
      totalhits?: number;
    };
    search?: WikisourceSearchItem[];
  };
};

type WikisourceParseResponse = {
  parse?: {
    title?: string;
    pageid?: number;
    text?: {
      "*"?: string;
    };
    displaytitle?: string;
  };
  error?: {
    code?: string;
    info?: string;
  };
};

type WikisourceProject = {
  code: string;
  language: string;
  host: string;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  ...CORS_HEADERS,
};

const GUTENDEX_BASE_URL = "https://gutendex.com";

const WIKISOURCE_PROJECTS: WikisourceProject[] = [
  {
    code: "en",
    language: "en",
    host: "https://en.wikisource.org",
  },
  {
    code: "ru",
    language: "ru",
    host: "https://ru.wikisource.org",
  },
  {
    code: "uk",
    language: "uk",
    host: "https://uk.wikisource.org",
  },
  {
    code: "de",
    language: "de",
    host: "https://de.wikisource.org",
  },
  {
    code: "fr",
    language: "fr",
    host: "https://fr.wikisource.org",
  },
  {
    code: "it",
    language: "it",
    host: "https://it.wikisource.org",
  },
  {
    code: "es",
    language: "es",
    host: "https://es.wikisource.org",
  },
];

const MAX_SEARCH_RESULTS = 60;
const GUTENDEX_RESULTS_LIMIT = 32;
const WIKISOURCE_RESULTS_PER_PROJECT = 8;

const MAX_BOOK_TEXT_LENGTH = 1_500_000;
const MIN_READABLE_TEXT_LENGTH = 180;

const REQUEST_TIMEOUT_MS = 18_000;

// TRANSLATE + EXPLAIN RESTORE: this project's already-configured AI
// provider is OpenAI, called via the Responses API -- the exact same
// provider/secret/endpoint shape already live in omnia-classify-ai
// (text classification) and anki-generate-cover (image generation).
// OPENAI_API_KEY is an existing project secret, read at call time,
// never hardcoded here. DEFAULT_AI_MODEL mirrors
// omnia-classify-ai's own DEFAULT_MODEL fallback for consistency with
// the rest of this project; OMNIA_AI_MODEL is this function's own
// optional override secret (kept separate from
// OMNIA_CLASSIFIER_MODEL so translate/explain can be retuned without
// touching classification).
const DEFAULT_AI_MODEL = "gpt-5.6-luna";

// Reader selections are at most one paginated page (~6500 characters,
// see src/features/reader/engine/pagination.ts's PAGE_TARGET_SIZE) --
// 8000 gives headroom above that while still bounding worst-case
// request size/cost. Longer input is rejected with a clear error
// (requirement: "ограничить длину input"), never silently truncated,
// since a silently truncated translation/explanation would be a
// silently wrong answer.
const MAX_AI_TEXT_LENGTH = 8000;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const body = await readRequestBody(req);

    const action = normalizeString(body.action).toLowerCase();

    if (!action) {
      return jsonResponse(
        {
          error: "Missing action",
        },
        400,
      );
    }

    if (action === "search") {
      return await handleSearch(body);
    }

    if (action === "read" || action === "open") {
      return await handleRead(body);
    }

    if (action === "translate") {
      return await handleTranslate(body);
    }

    if (action === "explain") {
      return await handleExplain(body);
    }

    if (action === "status") {
      return jsonResponse(
        {
          ok: true,
          service: "AN.KI library",
          sources: {
            gutenberg: true,
            wikisource: WIKISOURCE_PROJECTS.map((project) =>
              project.language
            ),
          },
        },
        200,
      );
    }

    return jsonResponse(
      {
        error: "Unknown action",
      },
      400,
    );
  } catch (error) {
    console.error("AN.KI library error:", error);

    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : String(error),
      },
      500,
    );
  }
});


async function handleSearch(
  body: JsonRecord,
): Promise<Response> {
  const query =
    normalizeString(body.query) ||
    normalizeString(body.search) ||
    normalizeString(body.text);

  if (!query) {
    return jsonResponse(
      {
        error: "Missing search query",
      },
      400,
    );
  }

  if (query.length < 2) {
    return jsonResponse(
      {
        error: "Search query is too short",
      },
      400,
    );
  }

  if (query.length > 200) {
    return jsonResponse(
      {
        error: "Search query is too long",
      },
      400,
    );
  }

  const requestedLanguage = normalizeLanguageCode(
    normalizeString(body.language),
  );

  const searchTasks: Promise<LibraryBook[]>[] = [
    searchGutendex(
      query,
      requestedLanguage,
    ),
  ];

  const selectedWikisourceProjects = requestedLanguage
    ? WIKISOURCE_PROJECTS.filter((project) =>
      project.language === requestedLanguage
    )
    : WIKISOURCE_PROJECTS;

  for (const project of selectedWikisourceProjects) {
    searchTasks.push(
      searchWikisource(
        project,
        query,
      ),
    );
  }

  const settledResults = await Promise.allSettled(
    searchTasks,
  );

  const collectedBooks: LibraryBook[] = [];
  const failedSources: string[] = [];

  for (
    let index = 0;
    index < settledResults.length;
    index += 1
  ) {
    const settledResult = settledResults[index];

    if (settledResult.status === "fulfilled") {
      collectedBooks.push(...settledResult.value);
      continue;
    }

    const sourceName = index === 0
      ? "gutenberg"
      : selectedWikisourceProjects[index - 1]?.code ||
        "wikisource";

    failedSources.push(sourceName);

    console.error(
      `AN.KI search source failed: ${sourceName}`,
      settledResult.reason,
    );
  }

  const books = deduplicateBooks(collectedBooks)
    .slice(0, MAX_SEARCH_RESULTS);

  return jsonResponse(
    {
      books,
      total: books.length,
      partial: failedSources.length > 0,
      failedSources,
    },
    200,
  );
}


async function handleRead(
  body: JsonRecord,
): Promise<Response> {
  const id =
    normalizeString(body.id) ||
    normalizeString(body.bookId);

  if (!id) {
    return jsonResponse(
      {
        error: "Missing book id",
      },
      400,
    );
  }

  if (id.startsWith("gutenberg:")) {
    const book = await readGutendexBook(id);

    return jsonResponse(
      {
        book,
      },
      200,
    );
  }

  if (id.startsWith("wikisource:")) {
    const book = await readWikisourceBook(id);

    return jsonResponse(
      {
        book,
      },
      200,
    );
  }

  return jsonResponse(
    {
      error: "Unsupported book source",
    },
    400,
  );
}


// ============================================================
// TRANSLATE + EXPLAIN (restored contract)
// ============================================================
//
// Frontend contract (src/api/ai.ts, called from
// src/features/reader/engine/readerEngine.ts's runTranslate/runExplain
// via translateText/explainText):
//
//   POST { action: "translate", text, language } -> { translation: string }
//   POST { action: "explain",   text, language } -> { answer: string }
//
// Both actions send only the visitor's own selected text plus the
// requested response language -- no additional context, no document
// retrieval, no RAG (explicitly out of scope for this restore).
// Both reuse this project's existing AI provider/secret (OpenAI /
// OPENAI_API_KEY, see callOpenAI below) rather than introducing a
// second provider integration.

async function handleTranslate(
  body: JsonRecord,
): Promise<Response> {
  const text = normalizeString(body.text);

  if (!text) {
    return jsonResponse(
      {
        error: "Missing text",
      },
      400,
    );
  }

  if (text.length > MAX_AI_TEXT_LENGTH) {
    return jsonResponse(
      {
        error: `Text is too long (max ${MAX_AI_TEXT_LENGTH} characters)`,
      },
      400,
    );
  }

  const language = normalizeString(body.language) || "ru";
  const languageName = languageDisplayName(language);

  let translation: string;

  try {
    translation = await callOpenAI(
      `You are a precise literary translator. Translate the user's text into ${languageName} (ISO language code: ${language}). Preserve the original meaning, tone and register as closely as natural phrasing allows. Respond with ONLY the translated text -- no quotation marks, no notes, no explanations, no restating the source text.`,
      text,
      3000,
    );
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }

  return jsonResponse(
    {
      translation,
    },
    200,
  );
}


async function handleExplain(
  body: JsonRecord,
): Promise<Response> {
  const text = normalizeString(body.text);

  if (!text) {
    return jsonResponse(
      {
        error: "Missing text",
      },
      400,
    );
  }

  if (text.length > MAX_AI_TEXT_LENGTH) {
    return jsonResponse(
      {
        error: `Text is too long (max ${MAX_AI_TEXT_LENGTH} characters)`,
      },
      400,
    );
  }

  const language = normalizeString(body.language) || "ru";
  const languageName = languageDisplayName(language);

  let answer: string;

  try {
    answer = await callOpenAI(
      `You are a literary reading companion built into an ebook reader. The user selected a short passage while reading and wants help understanding it. Explain it concisely -- meaning, context, references, or vocabulary, whichever is actually relevant to this passage -- so a curious reader understands it better. Answer in ${languageName} (ISO language code: ${language}) only, in plain text with no markdown formatting, in at most a short paragraph or two. Do not simply restate or repeat the passage itself.`,
      text,
      700,
    );
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }

  return jsonResponse(
    {
      answer,
    },
    200,
  );
}


// Small, best-effort code -> English name map so the model gets an
// unambiguous target language name rather than a bare ISO code alone
// (both are sent either way) -- falls back to the raw code itself for
// anything not listed here rather than blocking on an unrecognized
// code.
function languageDisplayName(code: string): string {
  const names: Record<string, string> = {
    ru: "Russian",
    en: "English",
    uk: "Ukrainian",
    de: "German",
    fr: "French",
    es: "Spanish",
    it: "Italian",
    pt: "Portuguese",
    pl: "Polish",
    nl: "Dutch",
    sv: "Swedish",
    da: "Danish",
    fi: "Finnish",
    hu: "Hungarian",
    zh: "Chinese",
    ja: "Japanese",
    la: "Latin",
    grc: "Ancient Greek",
  };

  return names[code.toLowerCase()] || code;
}


// Same OpenAI Responses API shape already used by omnia-classify-ai
// (https://api.openai.com/v1/responses, store: false, output read via
// output_text / output[].content[].text) -- reused here rather than a
// second, differently-shaped provider call.
async function callOpenAI(
  systemPrompt: string,
  userText: string,
  maxOutputTokens: number,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }

  const model = Deno.env.get("OMNIA_AI_MODEL") || DEFAULT_AI_MODEL;

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        store: false,
        max_output_tokens: maxOutputTokens,
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");

    throw new Error(
      `OpenAI request failed: ${response.status} ${errText.slice(0, 500)}`,
    );
  }

  const responseBody = await response.json();
  const outputText = extractOutputText(responseBody);

  if (!outputText) {
    throw new Error("OpenAI response did not contain output text");
  }

  return outputText.trim();
}


// deno-lint-ignore no-explicit-any
function extractOutputText(body: any): string | null {
  if (typeof body?.output_text === "string" && body.output_text.length > 0) {
    return body.output_text;
  }

  const output = Array.isArray(body?.output) ? body.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];

    for (const contentItem of content) {
      if (
        typeof contentItem?.text === "string" &&
        contentItem.text.length > 0
      ) {
        return contentItem.text;
      }
    }
  }

  return null;
}


async function searchGutendex(
  query: string,
  language: string,
): Promise<LibraryBook[]> {
  const url = new URL(
    "/books/",
    GUTENDEX_BASE_URL,
  );

  url.searchParams.set("search", query);

  if (language) {
    url.searchParams.set(
      "languages",
      language,
    );
  }

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: externalRequestHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Gutendex search failed with status ${response.status}`,
    );
  }

  const data = await response.json() as GutendexResponse;

  const results = Array.isArray(data.results)
    ? data.results
    : [];

  return results
    .filter(isReadableGutendexBook)
    .slice(0, GUTENDEX_RESULTS_LIMIT)
    .map((book): LibraryBook => {
      const numericId = Number(book.id);

      return {
        id: `gutenberg:${numericId}`,
        title: cleanBookTitle(
          normalizeString(book.title),
        ),
        authors: normalizeGutendexAuthors(
          book.authors,
        ),
        languages: normalizeLanguages(
          book.languages,
        ),
      };
    })
    .filter((book) =>
      Boolean(book.title) &&
      book.id !== "gutenberg:NaN"
    );
}


function isReadableGutendexBook(
  book: GutendexBook,
): boolean {
  if (
    typeof book.id !== "number" ||
    !normalizeString(book.title)
  ) {
    return false;
  }

  const formats = book.formats || {};

  return Boolean(
    chooseGutendexTextUrl(formats),
  );
}


function chooseGutendexTextUrl(
  formats: Record<string, string>,
): string {
  const preferredFormatKeys = [
    "text/html; charset=utf-8",
    "text/html; charset=us-ascii",
    "text/html",
    "text/plain; charset=utf-8",
    "text/plain; charset=us-ascii",
    "text/plain",
  ];

  for (const formatKey of preferredFormatKeys) {
    const candidate = normalizeString(
      formats[formatKey],
    );

    if (isUsableRemoteUrl(candidate)) {
      return candidate;
    }
  }

  for (const [format, remoteUrl] of Object.entries(formats)) {
    const normalizedFormat = format.toLowerCase();
    const normalizedUrl = normalizeString(remoteUrl);

    if (
      (
        normalizedFormat.startsWith("text/html") ||
        normalizedFormat.startsWith("text/plain")
      ) &&
      isUsableRemoteUrl(normalizedUrl)
    ) {
      return normalizedUrl;
    }
  }

  return "";
}


async function readGutendexBook(
  encodedId: string,
): Promise<ReadableBook> {
  const rawId = encodedId.slice(
    "gutenberg:".length,
  );

  if (!/^\d+$/.test(rawId)) {
    throw new Error("Invalid Gutenberg book id");
  }

  const metadataResponse = await fetchWithTimeout(
    `${GUTENDEX_BASE_URL}/books/${rawId}/`,
    {
      headers: externalRequestHeaders(),
    },
  );

  if (!metadataResponse.ok) {
    if (metadataResponse.status === 404) {
      throw new Error("Book not found");
    }

    throw new Error(
      `Gutendex book request failed with status ${metadataResponse.status}`,
    );
  }

  const book = await metadataResponse
    .json() as GutendexBook;

  const textUrl = chooseGutendexTextUrl(
    book.formats || {},
  );

  if (!textUrl) {
    throw new Error(
      "This book has no readable text format",
    );
  }

  const textResponse = await fetchWithTimeout(
    textUrl,
    {
      headers: externalRequestHeaders(),
    },
  );

  if (!textResponse.ok) {
    throw new Error(
      `Book text request failed with status ${textResponse.status}`,
    );
  }

  const contentType =
    textResponse.headers.get("content-type") ||
    "";

  const rawText = await textResponse.text();

  const text = contentType
      .toLowerCase()
      .includes("html") ||
      looksLikeHtml(rawText)
    ? htmlToReadableText(rawText)
    : cleanPlainText(rawText);

  const finalText = limitBookText(
    removeGutenbergWrapper(text),
  );

  if (
    finalText.length < MIN_READABLE_TEXT_LENGTH
  ) {
    throw new Error(
      "The readable text of this book is empty or unavailable",
    );
  }

  return {
    id: `gutenberg:${rawId}`,
    title: cleanBookTitle(
      normalizeString(book.title) ||
        `Book ${rawId}`,
    ),
    authors: normalizeGutendexAuthors(
      book.authors,
    ),
    languages: normalizeLanguages(
      book.languages,
    ),
    text: finalText,
  };
}


async function searchWikisource(
  project: WikisourceProject,
  query: string,
): Promise<LibraryBook[]> {
  const url = new URL(
    "/w/api.php",
    project.host,
  );

  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srnamespace", "0");
  url.searchParams.set(
    "srlimit",
    String(WIKISOURCE_RESULTS_PER_PROJECT),
  );
  url.searchParams.set("srprop", "size|wordcount");
  url.searchParams.set("utf8", "1");

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: externalRequestHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `${project.code} Wikisource search failed with status ${response.status}`,
    );
  }

  const data =
    await response.json() as WikisourceSearchResponse;

  const results = Array.isArray(
      data.query?.search,
    )
    ? data.query?.search || []
    : [];

  return results
    .filter((item) =>
      isLikelyReadableWikisourceResult(
        item,
        query,
      )
    )
    .map((item): LibraryBook => {
      const title = cleanBookTitle(
        normalizeString(item.title),
      );

      return {
        id: createWikisourceId(
          project.code,
          title,
        ),
        title,
        authors: [],
        languages: [project.language],
      };
    })
    .filter((book) =>
      Boolean(book.title)
    );
}


function isLikelyReadableWikisourceResult(
  item: WikisourceSearchItem,
  query: string,
): boolean {
  const title = normalizeString(
    item.title,
  );

  if (!title || item.ns !== 0) {
    return false;
  }

  if (isExcludedWikisourceTitle(title)) {
    return false;
  }

  const wordCount =
    typeof item.wordcount === "number"
      ? item.wordcount
      : 0;

  const normalizedTitle = normalizeForComparison(
    title,
  );

  const normalizedQuery = normalizeForComparison(
    query,
  );

  const titleMatches =
    normalizedTitle.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedTitle);

  return titleMatches || wordCount >= 80;
}


function isExcludedWikisourceTitle(
  title: string,
): boolean {
  const normalized = title
    .trim()
    .toLowerCase();

  const excludedPrefixes = [
    "author:",
    "автор:",
    "portal:",
    "портал:",
    "category:",
    "категория:",
    "template:",
    "шаблон:",
    "help:",
    "справка:",
    "special:",
    "служебная:",
    "user:",
    "участник:",
    "file:",
    "файл:",
    "index:",
    "индекс:",
    "page:",
    "страница:",
    "discussion:",
    "обсуждение:",
  ];

  if (
    excludedPrefixes.some((prefix) =>
      normalized.startsWith(prefix)
    )
  ) {
    return true;
  }

  const excludedExactTitles = [
    "main page",
    "главная страница",
    "hauptseite",
    "accueil",
    "pagina principale",
    "portada",
  ];

  return excludedExactTitles.includes(normalized);
}


async function readWikisourceBook(
  encodedId: string,
): Promise<ReadableBook> {
  const parsedId = parseWikisourceId(
    encodedId,
  );

  const project = WIKISOURCE_PROJECTS.find(
    (item) => item.code === parsedId.projectCode,
  );

  if (!project) {
    throw new Error(
      "Unsupported Wikisource language",
    );
  }

  const url = new URL(
    "/w/api.php",
    project.host,
  );

  url.searchParams.set("action", "parse");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("page", parsedId.title);
  url.searchParams.set("prop", "text|displaytitle");
  url.searchParams.set("disableeditsection", "1");
  url.searchParams.set("disabletoc", "1");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("utf8", "1");

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: externalRequestHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `${project.code} Wikisource page request failed with status ${response.status}`,
    );
  }

  const data =
    await response.json() as WikisourceParseResponse;

  if (data.error) {
    throw new Error(
      data.error.info ||
        "Wikisource returned an error",
    );
  }

  const parsedHtml = normalizeString(
    data.parse?.text?.["*"],
  );

  if (!parsedHtml) {
    throw new Error(
      "Wikisource returned an empty page",
    );
  }

  const text = limitBookText(
    cleanWikisourceText(
      htmlToReadableText(parsedHtml),
    ),
  );

  if (
    text.length < MIN_READABLE_TEXT_LENGTH
  ) {
    throw new Error(
      "This Wikisource page contains no readable book text",
    );
  }

  const parsedTitle = cleanBookTitle(
    stripHtml(
      normalizeString(data.parse?.displaytitle),
    ) ||
      normalizeString(data.parse?.title) ||
      parsedId.title,
  );

  return {
    id: createWikisourceId(
      project.code,
      parsedId.title,
    ),
    title: parsedTitle,
    authors: [],
    languages: [project.language],
    text,
  };
}


function createWikisourceId(
  projectCode: string,
  title: string,
): string {
  return `wikisource:${projectCode}:${encodeURIComponent(title)}`;
}


function parseWikisourceId(
  id: string,
): {
  projectCode: string;
  title: string;
} {
  const match = id.match(
    /^wikisource:([a-z-]+):(.+)$/i,
  );

  if (!match) {
    throw new Error(
      "Invalid Wikisource book id",
    );
  }

  const projectCode = match[1]
    .trim()
    .toLowerCase();

  let title = "";

  try {
    title = decodeURIComponent(match[2]);
  } catch {
    throw new Error(
      "Invalid Wikisource title encoding",
    );
  }

  title = title.trim();

  if (!title) {
    throw new Error(
      "Missing Wikisource page title",
    );
  }

  return {
    projectCode,
    title,
  };
}


function deduplicateBooks(
  books: LibraryBook[],
): LibraryBook[] {
  const seenExactIds = new Set<string>();

  const groupedByIdentity = new Map<
    string,
    LibraryBook
  >();

  for (const book of books) {
    if (
      !book.id ||
      !book.title ||
      seenExactIds.has(book.id)
    ) {
      continue;
    }

    seenExactIds.add(book.id);

    const identity = createBookIdentity(book);

    const existing = groupedByIdentity.get(identity);

    if (!existing) {
      groupedByIdentity.set(
        identity,
        book,
      );

      continue;
    }

    if (
      shouldReplaceDuplicate(existing, book)
    ) {
      groupedByIdentity.set(
        identity,
        book,
      );
    }
  }

  return Array.from(groupedByIdentity.values())
    .sort(compareBooks);
}


function createBookIdentity(
  book: LibraryBook,
): string {
  const title = normalizeForComparison(
    book.title,
  );

  const firstAuthor = normalizeForComparison(
    book.authors[0] || "",
  );

  const firstLanguage =
    normalizeLanguageCode(
      book.languages[0] || "",
    );

  if (firstAuthor) {
    return `${title}|${firstAuthor}|${firstLanguage}`;
  }

  return `${title}|${firstLanguage}`;
}


function shouldReplaceDuplicate(
  currentBook: LibraryBook,
  candidateBook: LibraryBook,
): boolean {
  const currentIsGutenberg =
    currentBook.id.startsWith("gutenberg:");

  const candidateIsGutenberg =
    candidateBook.id.startsWith("gutenberg:");

  if (
    candidateIsGutenberg &&
    !currentIsGutenberg
  ) {
    return true;
  }

  if (
    candidateBook.authors.length >
    currentBook.authors.length
  ) {
    return true;
  }

  return false;
}


function compareBooks(
  firstBook: LibraryBook,
  secondBook: LibraryBook,
): number {
  const firstHasAuthor =
    firstBook.authors.length > 0
      ? 0
      : 1;

  const secondHasAuthor =
    secondBook.authors.length > 0
      ? 0
      : 1;

  if (firstHasAuthor !== secondHasAuthor) {
    return firstHasAuthor - secondHasAuthor;
  }

  return firstBook.title.localeCompare(
    secondBook.title,
    undefined,
    {
      sensitivity: "base",
    },
  );
}


function normalizeGutendexAuthors(
  authors: GutendexPerson[] | undefined,
): string[] {
  if (!Array.isArray(authors)) {
    return [];
  }

  const normalizedAuthors = authors
    .map((author) =>
      normalizePersonName(
        normalizeString(author?.name),
      )
    )
    .filter(Boolean);

  return uniqueStrings(normalizedAuthors);
}


function normalizePersonName(
  name: string,
): string {
  if (!name) {
    return "";
  }

  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`
      .replace(/\s+/g, " ")
      .trim();
  }

  return name
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeLanguages(
  languages: unknown,
): string[] {
  if (!Array.isArray(languages)) {
    return [];
  }

  return uniqueStrings(
    languages
      .map((language) =>
        normalizeLanguageCode(
          normalizeString(language),
        )
      )
      .filter(Boolean),
  );
}


function normalizeLanguageCode(
  language: string,
): string {
  const normalized = language
    .trim()
    .toLowerCase();

  const languageAliases: Record<string, string> = {
    english: "en",
    russian: "ru",
    ukrainian: "uk",
    german: "de",
    french: "fr",
    italian: "it",
    spanish: "es",
    portuguese: "pt",
    polish: "pl",
    dutch: "nl",
    swedish: "sv",
    norwegian: "no",
    danish: "da",
    finnish: "fi",
    greek: "el",
    latin: "la",
    chinese: "zh",
    japanese: "ja",
    korean: "ko",
    arabic: "ar",
    turkish: "tr",
    czech: "cs",
    romanian: "ro",
    hungarian: "hu",
  };

  return languageAliases[normalized] ||
    normalized;
}


function cleanBookTitle(
  title: string,
): string {
  return decodeHtmlEntities(title)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}


function cleanPlainText(
  text: string,
): string {
  return normalizeReadableWhitespace(
    decodeHtmlEntities(text)
      .replace(/\r\n?/g, "\n"),
  );
}


function cleanWikisourceText(
  text: string,
): string {
  let cleaned = text;

  const unwantedPhrases = [
    "Return to the main page",
    "Retrieved from",
    "Privacy policy",
    "About Wikisource",
    "Disclaimers",
    "Mobile view",
    "Скрытые категории",
    "Материал из Викитеки",
    "Политика конфиденциальности",
    "Описание Викитеки",
    "Отказ от ответственности",
  ];

  for (const phrase of unwantedPhrases) {
    cleaned = cleaned.replace(
      new RegExp(
        escapeRegExp(phrase),
        "gi",
      ),
      "",
    );
  }

  return normalizeReadableWhitespace(cleaned);
}


function htmlToReadableText(
  html: string,
): string {
  let text = html;

  text = text.replace(
    /<!--[\s\S]*?-->/g,
    " ",
  );

  text = text.replace(
    /<(script|style|noscript|svg|math|figure|nav|footer|header|form|button|input|select|textarea|audio|video|canvas|iframe)[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );

  text = text.replace(
    /<(br|hr)\s*\/?>/gi,
    "\n",
  );

  text = text.replace(
    /<\/(p|div|section|article|blockquote|pre|h1|h2|h3|h4|h5|h6|li|tr|table|ul|ol|dl|dt|dd)>/gi,
    "\n\n",
  );

  text = text.replace(
    /<li[^>]*>/gi,
    "\n",
  );

  text = text.replace(
    /<[^>]+>/g,
    " ",
  );

  text = decodeHtmlEntities(text);

  return normalizeReadableWhitespace(text);
}


function stripHtml(
  html: string,
): string {
  return decodeHtmlEntities(
    html.replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}


function decodeHtmlEntities(
  value: string,
): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    laquo: "«",
    raquo: "»",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    copy: "©",
    reg: "®",
    trade: "™",
  };

  return value
    .replace(
      /&#(\d+);/g,
      (_match, decimal: string) => {
        const codePoint = Number(decimal);

        return Number.isFinite(codePoint)
          ? safeCodePoint(codePoint)
          : "";
      },
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_match, hexadecimal: string) => {
        const codePoint = Number.parseInt(
          hexadecimal,
          16,
        );

        return Number.isFinite(codePoint)
          ? safeCodePoint(codePoint)
          : "";
      },
    )
    .replace(
      /&([a-z]+);/gi,
      (match, entityName: string) => {
        return namedEntities[
          entityName.toLowerCase()
        ] ?? match;
      },
    );
}


function safeCodePoint(
  codePoint: number,
): string {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return "";
  }
}


function normalizeReadableWhitespace(
  text: string,
): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([.!?…]) {2,}/g, "$1 ")
    .trim();
}


function removeGutenbergWrapper(
  text: string,
): string {
  let cleaned = text;

  const startPatterns = [
    /\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]{0,300}?\*{3}/i,
    /\*{3}\s*START OF THE PROJECT GUTENBERG EBOOK[\s\S]{0,300}?\*{3}/i,
    /START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i,
  ];

  for (const pattern of startPatterns) {
    const match = cleaned.match(pattern);

    if (
      match &&
      typeof match.index === "number"
    ) {
      cleaned = cleaned.slice(
        match.index + match[0].length,
      );

      break;
    }
  }

  const endPatterns = [
    /\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i,
    /END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i,
    /End of Project Gutenberg/i,
  ];

  for (const pattern of endPatterns) {
    const match = cleaned.match(pattern);

    if (
      match &&
      typeof match.index === "number"
    ) {
      cleaned = cleaned.slice(
        0,
        match.index,
      );

      break;
    }
  }

  return normalizeReadableWhitespace(cleaned);
}


function looksLikeHtml(
  text: string,
): boolean {
  const beginning = text.slice(0, 1200);

  return /<!doctype\s+html|<html|<body|<p[\s>]|<div[\s>]/i
    .test(beginning);
}


function limitBookText(
  text: string,
): string {
  if (
    text.length <= MAX_BOOK_TEXT_LENGTH
  ) {
    return text;
  }

  return text
    .slice(0, MAX_BOOK_TEXT_LENGTH)
    .trim();
}


function normalizeForComparison(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function uniqueStrings(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}


function isUsableRemoteUrl(
  value: string,
): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" ||
      url.protocol === "http:";
  } catch {
    return false;
  }
}


function externalRequestHeaders(): HeadersInit {
  return {
    "Accept":
      "application/json, text/html, text/plain;q=0.9, */*;q=0.8",
    "User-Agent":
      "AN.KI/1.0 digital reading application",
  };
}


async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "External library request timed out",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}


async function readRequestBody(
  req: Request,
): Promise<JsonRecord> {
  const contentType =
    req.headers.get("content-type") ||
    "";

  if (
    !contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    throw new Error(
      "Request body must be JSON",
    );
  }

  const body = await req.json();

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new Error(
      "Invalid request body",
    );
  }

  return body as JsonRecord;
}


function normalizeString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}


function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}


function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: JSON_HEADERS,
    },
  );
}
