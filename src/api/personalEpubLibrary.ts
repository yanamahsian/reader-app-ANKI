import ePub from "epubjs";
import type { Book } from "../features/reader/engine/types";

const DB_NAME = "anki-personal-library";
const DB_VERSION = 1;
const STORE_NAME = "epubs";
const MAX_EPUB_BYTES = 80 * 1024 * 1024;

export const PERSONAL_EPUB_URL_PREFIX = "anki-personal-epub:";

interface StoredPersonalEpub {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  fileName: string;
  fileSize: number;
  addedAt: number;
  blob: Blob;
}

export interface PersonalEpubSummary {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  fileName: string;
  fileSize: number;
  addedAt: number;
}

type ImportErrorCode =
  | "unsupported_file"
  | "empty_file"
  | "file_too_large"
  | "invalid_epub"
  | "storage_unavailable"
  | "storage_quota";

export class PersonalEpubImportError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = "PersonalEpubImportError";
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
    return Promise.reject(new PersonalEpubImportError("storage_unavailable", "IndexedDB is unavailable"));
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
    request.onerror = () => reject(request.error ?? new Error("Could not open personal library storage"));
    request.onblocked = () => reject(new Error("Personal library storage upgrade is blocked"));
  });
}

function toSummary(record: StoredPersonalEpub): PersonalEpubSummary {
  return {
    id: record.id,
    title: record.title,
    author: record.author,
    language: record.language,
    fileName: record.fileName,
    fileSize: record.fileSize,
    addedAt: record.addedAt
  };
}

function cleanMetadataString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.epub$/i, "").trim() || "Личная книга";
}

async function inspectEpub(buffer: ArrayBuffer): Promise<{ title: string | null; author: string | null; language: string | null }> {
  const epub = new ePub(buffer.slice(0));

  try {
    await epub.ready;
    const metadata = await epub.loaded.metadata as {
      title?: unknown;
      creator?: unknown;
      language?: unknown;
    };

    let spineItems = 0;
    epub.spine.each(() => {
      spineItems += 1;
    });

    if (spineItems === 0) {
      throw new Error("EPUB has no readable spine");
    }

    return {
      title: cleanMetadataString(metadata.title, 300),
      author: cleanMetadataString(metadata.creator, 200),
      language: cleanMetadataString(metadata.language, 40)
    };
  } finally {
    epub.destroy();
  }
}

function normalizeStorageError(error: unknown): never {
  if (error instanceof PersonalEpubImportError) throw error;

  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    throw new PersonalEpubImportError("storage_quota", "Browser storage quota exceeded");
  }

  throw new PersonalEpubImportError("storage_unavailable", "Personal library storage is unavailable");
}

export function personalEpubUrl(id: string): string {
  return `${PERSONAL_EPUB_URL_PREFIX}${id}`;
}

export function personalEpubIdFromUrl(url: string): string | null {
  if (!url.startsWith(PERSONAL_EPUB_URL_PREFIX)) return null;
  const id = url.slice(PERSONAL_EPUB_URL_PREFIX.length).trim();
  return id || null;
}

export function isPersonalEpubUrl(url: string): boolean {
  return personalEpubIdFromUrl(url) !== null;
}

export function isPersonalEpubBookId(bookId: string): boolean {
  return bookId.startsWith(PERSONAL_EPUB_URL_PREFIX);
}

export function isPersonalEpubBook(book: Book): boolean {
  return book.format === "epub" && (isPersonalEpubUrl(book.url) || isPersonalEpubBookId(book.id));
}

export function toPersonalEpubBook(summary: PersonalEpubSummary): Book {
  const url = personalEpubUrl(summary.id);
  return {
    id: url,
    title: summary.title,
    author: summary.author ?? undefined,
    language: summary.language ?? undefined,
    url,
    format: "epub"
  };
}

export async function importPersonalEpub(file: File): Promise<PersonalEpubSummary> {
  if (!file.name.toLowerCase().endsWith(".epub")) {
    throw new PersonalEpubImportError("unsupported_file", "Only EPUB files are supported");
  }

  if (file.size <= 0) {
    throw new PersonalEpubImportError("empty_file", "EPUB file is empty");
  }

  if (file.size > MAX_EPUB_BYTES) {
    throw new PersonalEpubImportError("file_too_large", "EPUB file is too large");
  }

  const buffer = await file.arrayBuffer();
  let metadata: { title: string | null; author: string | null; language: string | null };

  try {
    metadata = await inspectEpub(buffer);
  } catch (error) {
    console.error("personal EPUB validation failed:", error);
    throw new PersonalEpubImportError("invalid_epub", "Could not parse EPUB");
  }

  const record: StoredPersonalEpub = {
    id: crypto.randomUUID(),
    title: metadata.title ?? fileNameWithoutExtension(file.name),
    author: metadata.author,
    language: metadata.language,
    fileName: file.name,
    fileSize: file.size,
    addedAt: Date.now(),
    blob: new Blob([buffer], { type: "application/epub+zip" })
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

export async function listPersonalEpubs(): Promise<PersonalEpubSummary[]> {
  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredPersonalEpub[]>);
    await transactionDone(transaction);
    return records
      .map(toSummary)
      .sort((left, right) => right.addedAt - left.addedAt);
  } catch (error) {
    return normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

async function getPersonalEpubRecord(id: string): Promise<StoredPersonalEpub | null> {
  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredPersonalEpub | undefined>);
    await transactionDone(transaction);
    return record ?? null;
  } catch (error) {
    return normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

export async function loadPersonalEpubArrayBuffer(url: string): Promise<ArrayBuffer> {
  const id = personalEpubIdFromUrl(url);
  if (!id) throw new Error("Invalid personal EPUB URL");

  const record = await getPersonalEpubRecord(id);
  if (!record) throw new Error("Personal EPUB is no longer available on this device");

  return await record.blob.arrayBuffer();
}

export async function deletePersonalEpub(id: string): Promise<void> {
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

export function personalEpubErrorMessage(error: unknown): string {
  if (!(error instanceof PersonalEpubImportError)) {
    return "Не удалось обработать EPUB. Попробуйте другой файл.";
  }

  switch (error.code) {
    case "unsupported_file":
      return "Сейчас поддерживается только EPUB.";
    case "empty_file":
      return "Этот EPUB пустой.";
    case "file_too_large":
      return "EPUB слишком большой. Максимальный размер — 80 МБ.";
    case "invalid_epub":
      return "Не удалось прочитать EPUB. Файл может быть повреждён или защищён DRM.";
    case "storage_quota":
      return "В браузере недостаточно места для этой книги.";
    case "storage_unavailable":
      return "Локальное хранилище браузера сейчас недоступно.";
  }
}
