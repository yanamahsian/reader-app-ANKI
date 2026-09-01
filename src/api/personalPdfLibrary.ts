import type { Book } from "../features/reader/engine/types";
import { extractPdfPageText, getDocument, readPdfMetadata } from "./pdfJs";

const DB_NAME = "anki-personal-pdf-library";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const VALIDATION_PAGE_LIMIT = 8;

export const PERSONAL_PDF_URL_PREFIX = "anki-personal-pdf:";

interface StoredPersonalPdf {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  fileName: string;
  fileSize: number;
  pageCount: number;
  addedAt: number;
  blob: Blob;
}

export interface PersonalPdfSummary {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  fileName: string;
  fileSize: number;
  pageCount: number;
  addedAt: number;
}

type ImportErrorCode =
  | "unsupported_file"
  | "empty_file"
  | "file_too_large"
  | "invalid_pdf"
  | "no_text_layer"
  | "storage_unavailable"
  | "storage_quota";

export class PersonalPdfImportError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = "PersonalPdfImportError";
    this.code = code;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new PersonalPdfImportError("storage_unavailable", "IndexedDB is unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open PDF storage"));
    request.onblocked = () => reject(new Error("Personal PDF storage upgrade is blocked"));
  });
}

function toSummary(record: StoredPersonalPdf): PersonalPdfSummary {
  return {
    id: record.id,
    title: record.title,
    author: record.author,
    language: record.language,
    fileName: record.fileName,
    fileSize: record.fileSize,
    pageCount: record.pageCount,
    addedAt: record.addedAt
  };
}

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").trim() || "Личная книга";
}

async function inspectPdf(buffer: ArrayBuffer): Promise<{
  title: string | null;
  author: string | null;
  language: string | null;
  pageCount: number;
}> {
  const loadingTask = getDocument({ data: new Uint8Array(buffer.slice(0)) });
  const document = await loadingTask.promise;

  try {
    if (document.numPages <= 0) throw new Error("PDF has no pages");

    const metadata = await readPdfMetadata(document);
    let foundReadableText = false;
    const pageLimit = Math.min(document.numPages, VALIDATION_PAGE_LIMIT);

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await extractPdfPageText(page);
      page.cleanup();
      if (text.trim().length >= 20) {
        foundReadableText = true;
        break;
      }
    }

    if (!foundReadableText) {
      throw new PersonalPdfImportError(
        "no_text_layer",
        "PDF has no extractable text in its first pages"
      );
    }

    return { ...metadata, pageCount: document.numPages };
  } finally {
    await document.destroy();
  }
}

function normalizeStorageError(error: unknown): never {
  if (error instanceof PersonalPdfImportError) throw error;

  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    throw new PersonalPdfImportError("storage_quota", "Browser storage quota exceeded");
  }

  throw new PersonalPdfImportError("storage_unavailable", "Personal PDF storage is unavailable");
}

export function personalPdfUrl(id: string): string {
  return `${PERSONAL_PDF_URL_PREFIX}${id}`;
}

export function personalPdfIdFromUrl(url: string): string | null {
  if (!url.startsWith(PERSONAL_PDF_URL_PREFIX)) return null;
  const id = url.slice(PERSONAL_PDF_URL_PREFIX.length).trim();
  return id || null;
}

export function isPersonalPdfUrl(url: string): boolean {
  return personalPdfIdFromUrl(url) !== null;
}

export function isPersonalPdfBookId(bookId: string): boolean {
  return bookId.startsWith(PERSONAL_PDF_URL_PREFIX);
}

export function isPersonalPdfBook(book: Book): boolean {
  return book.format === "pdf" && (isPersonalPdfUrl(book.url) || isPersonalPdfBookId(book.id));
}

export function toPersonalPdfBook(summary: PersonalPdfSummary): Book {
  const url = personalPdfUrl(summary.id);
  return {
    id: url,
    title: summary.title,
    author: summary.author ?? undefined,
    language: summary.language ?? undefined,
    url,
    format: "pdf"
  };
}

export async function importPersonalPdf(file: File): Promise<PersonalPdfSummary> {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new PersonalPdfImportError("unsupported_file", "Only PDF files are supported");
  }

  if (file.size <= 0) {
    throw new PersonalPdfImportError("empty_file", "PDF file is empty");
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new PersonalPdfImportError("file_too_large", "PDF file is too large");
  }

  const buffer = await file.arrayBuffer();
  let metadata: Awaited<ReturnType<typeof inspectPdf>>;

  try {
    metadata = await inspectPdf(buffer);
  } catch (error) {
    if (error instanceof PersonalPdfImportError) throw error;
    console.error("personal PDF validation failed:", error);
    throw new PersonalPdfImportError(
      "invalid_pdf",
      "Could not parse PDF"
    );
  }

  const record: StoredPersonalPdf = {
    id: crypto.randomUUID(),
    title: metadata.title ?? fileNameWithoutExtension(file.name),
    author: metadata.author,
    language: metadata.language,
    fileName: file.name,
    fileSize: file.size,
    pageCount: metadata.pageCount,
    addedAt: Date.now(),
    blob: new Blob([buffer], { type: "application/pdf" })
  };

  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
    return toSummary(record);
  } catch (error) {
    return normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

export async function listPersonalPdfs(): Promise<PersonalPdfSummary[]> {
  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredPersonalPdf[]>
    );
    await transactionDone(transaction);
    return records.map(toSummary).sort((left, right) => right.addedAt - left.addedAt);
  } catch (error) {
    return normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

async function getPersonalPdfRecord(id: string): Promise<StoredPersonalPdf | null> {
  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredPersonalPdf | undefined>
    );
    await transactionDone(transaction);
    return record ?? null;
  } catch (error) {
    return normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

export async function loadPersonalPdfArrayBuffer(url: string): Promise<ArrayBuffer> {
  const id = personalPdfIdFromUrl(url);
  if (!id) throw new Error("Invalid personal PDF URL");

  const record = await getPersonalPdfRecord(id);
  if (!record) throw new Error("Personal PDF is no longer available on this device");

  return await record.blob.arrayBuffer();
}

export async function deletePersonalPdf(id: string): Promise<void> {
  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  } catch (error) {
    normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

export function personalPdfErrorMessage(error: unknown): string {
  if (!(error instanceof PersonalPdfImportError)) {
    return "Не удалось обработать PDF. Попробуйте другой файл.";
  }

  switch (error.code) {
    case "unsupported_file":
      return "Сейчас поддерживаются EPUB и PDF.";
    case "empty_file":
      return "Этот PDF пустой.";
    case "file_too_large":
      return "PDF слишком большой. Максимальный размер — 100 МБ.";
    case "invalid_pdf":
      return "Не удалось прочитать PDF. Файл может быть повреждён или защищён паролем.";
    case "no_text_layer":
      return "В этом PDF не найден текстовый слой. Сканированные PDF без OCR пока не поддерживаются.";
    case "storage_quota":
      return "В браузере недостаточно места для этой книги.";
    case "storage_unavailable":
      return "Локальное хранилище браузера сейчас недоступно.";
  }
}
