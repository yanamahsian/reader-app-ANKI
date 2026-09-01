import type { Book } from "../features/reader/engine/types";
import { parseFb2ArrayBuffer } from "./fb2";

const DB_NAME = "anki-personal-fb2-library";
const DB_VERSION = 1;
const STORE_NAME = "fb2";
const MAX_FB2_BYTES = 40 * 1024 * 1024;

export const PERSONAL_FB2_URL_PREFIX = "anki-personal-fb2:";

interface StoredPersonalFb2 {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  fileName: string;
  fileSize: number;
  addedAt: number;
  blob: Blob;
}

export interface PersonalFb2Summary {
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
  | "invalid_fb2"
  | "storage_unavailable"
  | "storage_quota";

export class PersonalFb2ImportError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = "PersonalFb2ImportError";
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
    return Promise.reject(new PersonalFb2ImportError("storage_unavailable", "IndexedDB is unavailable"));
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
    request.onerror = () => reject(request.error ?? new Error("Could not open FB2 storage"));
    request.onblocked = () => reject(new Error("Personal FB2 storage upgrade is blocked"));
  });
}

function toSummary(record: StoredPersonalFb2): PersonalFb2Summary {
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

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.fb2$/i, "").trim() || "Личная книга";
}

function normalizeStorageError(error: unknown): never {
  if (error instanceof PersonalFb2ImportError) throw error;

  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    throw new PersonalFb2ImportError("storage_quota", "Browser storage quota exceeded");
  }

  throw new PersonalFb2ImportError("storage_unavailable", "Personal FB2 storage is unavailable");
}

export function personalFb2Url(id: string): string {
  return `${PERSONAL_FB2_URL_PREFIX}${id}`;
}

export function personalFb2IdFromUrl(url: string): string | null {
  if (!url.startsWith(PERSONAL_FB2_URL_PREFIX)) return null;
  const id = url.slice(PERSONAL_FB2_URL_PREFIX.length).trim();
  return id || null;
}

export function isPersonalFb2Url(url: string): boolean {
  return personalFb2IdFromUrl(url) !== null;
}

export function isPersonalFb2BookId(bookId: string): boolean {
  return bookId.startsWith(PERSONAL_FB2_URL_PREFIX);
}

export function isPersonalFb2Book(book: Book): boolean {
  return book.format === "fb2" && (isPersonalFb2Url(book.url) || isPersonalFb2BookId(book.id));
}

export function toPersonalFb2Book(summary: PersonalFb2Summary): Book {
  const url = personalFb2Url(summary.id);
  return {
    id: url,
    title: summary.title,
    author: summary.author ?? undefined,
    language: summary.language ?? undefined,
    url,
    format: "fb2"
  };
}

export async function importPersonalFb2(file: File): Promise<PersonalFb2Summary> {
  if (!file.name.toLowerCase().endsWith(".fb2")) {
    throw new PersonalFb2ImportError("unsupported_file", "Only FB2 files are supported");
  }

  if (file.size <= 0) {
    throw new PersonalFb2ImportError("empty_file", "FB2 file is empty");
  }

  if (file.size > MAX_FB2_BYTES) {
    throw new PersonalFb2ImportError("file_too_large", "FB2 file is too large");
  }

  const buffer = await file.arrayBuffer();
  let parsed: ReturnType<typeof parseFb2ArrayBuffer>;

  try {
    parsed = parseFb2ArrayBuffer(buffer);
  } catch (error) {
    console.error("personal FB2 validation failed:", error);
    throw new PersonalFb2ImportError("invalid_fb2", "Could not parse FB2");
  }

  const record: StoredPersonalFb2 = {
    id: crypto.randomUUID(),
    title: parsed.metadata.title ?? fileNameWithoutExtension(file.name),
    author: parsed.metadata.author,
    language: parsed.metadata.language,
    fileName: file.name,
    fileSize: file.size,
    addedAt: Date.now(),
    blob: new Blob([buffer], { type: "application/x-fictionbook+xml" })
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

export async function listPersonalFb2s(): Promise<PersonalFb2Summary[]> {
  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredPersonalFb2[]>
    );
    await transactionDone(transaction);
    return records.map(toSummary).sort((left, right) => right.addedAt - left.addedAt);
  } catch (error) {
    return normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

async function getPersonalFb2Record(id: string): Promise<StoredPersonalFb2 | null> {
  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredPersonalFb2 | undefined>
    );
    await transactionDone(transaction);
    return record ?? null;
  } catch (error) {
    return normalizeStorageError(error);
  } finally {
    database?.close();
  }
}

export async function loadPersonalFb2ArrayBuffer(url: string): Promise<ArrayBuffer> {
  const id = personalFb2IdFromUrl(url);
  if (!id) throw new Error("Invalid personal FB2 URL");

  const record = await getPersonalFb2Record(id);
  if (!record) throw new Error("Personal FB2 is no longer available on this device");

  return await record.blob.arrayBuffer();
}

export async function deletePersonalFb2(id: string): Promise<void> {
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

export function personalFb2ErrorMessage(error: unknown): string {
  if (!(error instanceof PersonalFb2ImportError)) {
    return "Не удалось обработать FB2. Попробуйте другой файл.";
  }

  switch (error.code) {
    case "unsupported_file":
      return "Сейчас поддерживаются EPUB, PDF и FB2.";
    case "empty_file":
      return "Этот FB2 пустой.";
    case "file_too_large":
      return "FB2 слишком большой. Максимальный размер — 40 МБ.";
    case "invalid_fb2":
      return "Не удалось прочитать FB2. Файл может быть повреждён или иметь неподдерживаемую структуру.";
    case "storage_quota":
      return "В браузере недостаточно места для этой книги.";
    case "storage_unavailable":
      return "Локальное хранилище браузера сейчас недоступно.";
  }
}
