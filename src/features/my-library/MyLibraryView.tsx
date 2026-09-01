import { useEffect, useRef, useState } from "react";
import { ShellPage } from "../shared/ShellPage";
import { BookGrid } from "../shared/BookGrid";
import { LibraryBookCard } from "../shared/LibraryBookCard";
import { getBookById } from "../../catalog";
import type { Book as CatalogBook } from "../../catalog/types";
import type { Book as ReaderBook } from "../reader/engine/types";
import { requestOpenPersonalEpub } from "../reader/personalEpubBridge";
import { useAuth } from "../../auth/supabaseAuth";
import { fetchAndMergeWorksByIds, listLibrary } from "../../api/userLibrary";
import type { LibraryEntry, LibraryStatus } from "../../api/userLibrary";
import {
  deletePersonalEpub,
  importPersonalEpub,
  listPersonalEpubs,
  personalEpubErrorMessage,
  toPersonalEpubBook,
  type PersonalEpubSummary
} from "../../api/personalEpubLibrary";
import "./personalEpub.css";

// USER LIBRARY PHASE: a real, Supabase-backed personal shelf --
// distinct from features/library/LibraryView.tsx (the public catalog),
// per that file's own original comment anticipating this. Reuses the
// exact same tile components (BookGrid/LibraryBookCard) the public
// Library already uses, per requirement #5 ("не копия глобальной
// Library, но переиспользуй существующую карточку"), only with the
// optional `badge` prop LibraryBookCard now supports for a quiet
// per-card status label.

export type MyLibraryTab = "all" | LibraryStatus;

export interface MyLibraryRestoreState {
  tab: MyLibraryTab;
}

interface MyLibraryViewProps {
  onBack: () => void;
  // Non-null only when arriving via "← Назад" from Book Detail --
  // restores the tab the visitor had selected, same pattern
  // LibraryView's own restoreState follows.
  restoreState: MyLibraryRestoreState | null;
  onOpenBookDetail: (
    bookId: string,
    state: MyLibraryRestoreState,
    initialEdition: { editionId: string; language: string } | null
  ) => void;
  // Optional injection kept for isolated stories/tests. Production uses the
  // top-level personal EPUB bridge so Reader can replace AppShell without
  // making App's mature navigation state own device-local files.
  onOpenPersonalBook?: (book: ReaderBook) => void;
  // Routes a signed-out visitor to the existing auth home (Profile) --
  // same destination AccountMenu and BookDetailView's own
  // "Добавить в библиотеку" already use (requirement #4).
  onRequireSignIn: () => void;
  // The empty state's "Перейти в библиотеку" action (requirement #19)
  // opens the public catalog Library, not this screen.
  onOpenLibrary: () => void;
}

const TABS: Array<{ value: MyLibraryTab; label: string }> = [
  { value: "all", label: "Все" },
  { value: "reading", label: "Читаю" },
  { value: "want_to_read", label: "Хочу прочитать" },
  { value: "finished", label: "Прочитано" }
];

const STATUS_BADGE: Record<LibraryStatus, string> = {
  want_to_read: "Хочу прочитать",
  reading: "Читаю",
  finished: "Прочитано"
};

type Status = "loading" | "success" | "empty" | "error";
type PersonalStatus = "loading" | "ready" | "error";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}

export function MyLibraryView({
  onBack,
  restoreState,
  onOpenBookDetail,
  onOpenPersonalBook,
  onRequireSignIn,
  onOpenLibrary
}: MyLibraryViewProps) {

  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<MyLibraryTab>(restoreState?.tab ?? "all");

  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  const [personalBooks, setPersonalBooks] = useState<PersonalEpubSummary[]>([]);
  const [personalStatus, setPersonalStatus] = useState<PersonalStatus>("loading");
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deletingPersonalId, setDeletingPersonalId] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openPersonalBook = onOpenPersonalBook ?? requestOpenPersonalEpub;

  // Personal EPUBs are intentionally independent of auth in v1. The file is
  // stored in this browser's IndexedDB and never uploaded to AN.KI/Supabase.
  // This keeps Free personal reading genuinely useful while avoiding a false
  // promise of cross-device file sync before that storage product is designed.
  useEffect(() => {
    let active = true;
    setPersonalStatus("loading");
    setPersonalError(null);

    listPersonalEpubs()
      .then(books => {
        if (!active) return;
        setPersonalBooks(books);
        setPersonalStatus("ready");
      })
      .catch(error => {
        if (!active) return;
        console.error("personal EPUB library load failed:", error);
        setPersonalStatus("error");
        setPersonalError(personalEpubErrorMessage(error));
      });

    return () => {
      active = false;
    };
  }, []);

  // Batch load (requirement #15 -- no N+1): one listLibrary() call for
  // the membership rows, then a SINGLE fetchAndMergeWorksByIds() call
  // for every distinct Work those rows reference, via
  // omnia-library-catalog's auth-gated `workIds` mode -- never one
  // request per row.
  useEffect(() => {

    if (!isAuthenticated) {
      setStatus("empty");
      setEntries([]);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");

    (async () => {
      try {

        const rows = await listLibrary(tab === "all" ? {} : { status: tab });
        if (requestId !== requestIdRef.current) return;

        const workIds = Array.from(new Set(rows.map(row => row.workId)));
        if (workIds.length > 0) {
          await fetchAndMergeWorksByIds(workIds);
        }
        if (requestId !== requestIdRef.current) return;

        setEntries(rows);
        setStatus(rows.length ? "success" : "empty");

      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error("MyLibraryView load failed:", error);
        setStatus("error");
      }
    })();

  }, [isAuthenticated, tab]);

  function snapshot(): MyLibraryRestoreState {
    return { tab };
  }

  async function handleImportPersonalEpub(file: File): Promise<void> {
    setImporting(true);
    setPersonalError(null);

    try {
      const imported = await importPersonalEpub(file);
      setPersonalBooks(current => [imported, ...current.filter(book => book.id !== imported.id)]);
      setPersonalStatus("ready");
      openPersonalBook(toPersonalEpubBook(imported));
    } catch (error) {
      console.error("personal EPUB import failed:", error);
      setPersonalError(personalEpubErrorMessage(error));
      setPersonalStatus("ready");
    } finally {
      setImporting(false);
    }
  }

  async function handleDeletePersonalEpub(book: PersonalEpubSummary): Promise<void> {
    if (!window.confirm(`Удалить «${book.title}» с этого устройства?`)) return;

    setDeletingPersonalId(book.id);
    setPersonalError(null);

    try {
      await deletePersonalEpub(book.id);
      setPersonalBooks(current => current.filter(item => item.id !== book.id));
    } catch (error) {
      console.error("personal EPUB delete failed:", error);
      setPersonalError(personalEpubErrorMessage(error));
    } finally {
      setDeletingPersonalId(null);
    }
  }

  function renderPersonalShelf() {
    return (
      <section className="personal-library-section" aria-labelledby="personal-library-heading">
        <div className="personal-library-head">
          <h2 id="personal-library-heading" className="personal-library-heading">Личные книги</h2>
          <button
            type="button"
            className="primary-button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Импорт…" : "Импорт EPUB"}
          </button>
          <input
            ref={fileInputRef}
            className="personal-library-file-input"
            type="file"
            accept=".epub,application/epub+zip"
            onChange={event => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              if (file) void handleImportPersonalEpub(file);
            }}
          />
        </div>

        <p className="personal-library-copy">
          EPUB сохраняется только в этом браузере и не загружается на сервер. Прогресс и закладки этой книги тоже остаются на устройстве.
        </p>

        {personalError && <p className="personal-library-error">{personalError}</p>}

        {personalStatus === "loading" && (
          <p className="personal-library-loading">Загрузка личных книг…</p>
        )}

        {personalStatus === "error" && !personalError && (
          <p className="personal-library-error">Не удалось открыть локальную библиотеку.</p>
        )}

        {personalStatus === "ready" && personalBooks.length === 0 && (
          <p className="personal-library-empty">Здесь появятся EPUB, которые вы добавите с устройства.</p>
        )}

        {personalBooks.length > 0 && (
          <div className="personal-epub-grid">
            {personalBooks.map(book => (
              <article key={book.id} className="personal-epub-card">
                <button
                  type="button"
                  className="personal-epub-open"
                  onClick={() => openPersonalBook(toPersonalEpubBook(book))}
                >
                  <span className="personal-epub-format">EPUB · Личный файл</span>
                  <span className="personal-epub-title">{book.title}</span>
                  {book.author && <span className="personal-epub-author">{book.author}</span>}
                  <span className="personal-epub-meta">
                    {book.language ? `${book.language.toUpperCase()} · ` : ""}{formatFileSize(book.fileSize)}
                  </span>
                </button>
                <div className="personal-epub-actions">
                  <button
                    type="button"
                    className="personal-epub-delete"
                    disabled={deletingPersonalId === book.id}
                    onClick={() => void handleDeletePersonalEpub(book)}
                  >
                    {deletingPersonalId === book.id ? "Удаление…" : "Удалить с устройства"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderBody() {

    if (!isAuthenticated) {
      return (
        <div className="guest-notice">
          <p className="guest-notice-message">
            Здесь появятся книги AN.KI, которые вы сохраните. Чтобы синхронизировать каталог между устройствами, войдите в аккаунт.
          </p>
          <div className="guest-notice-actions">
            <button type="button" className="primary-button" onClick={onRequireSignIn}>Войти</button>
          </div>
        </div>
      );
    }

    if (status === "loading" && entries.length === 0) {
      return <div className="empty-state">Загрузка…</div>;
    }

    if (status === "error") {
      return <p className="my-library-error">Не удалось загрузить библиотеку. Попробуйте обновить страницу.</p>;
    }

    if (status === "empty") {
      return (
        <div className="guest-notice">
          <p className="guest-notice-message">Здесь появятся книги, которые вы сохраните.</p>
          <div className="guest-notice-actions">
            <button type="button" className="primary-button" onClick={onOpenLibrary}>Перейти в библиотеку</button>
          </div>
        </div>
      );
    }

    // getBookById re-reads through the shared catalog store (same
    // pattern LibraryView.tsx uses) rather than trusting a separate
    // copy -- a row whose Work failed to resolve (e.g. a transient
    // fetch error) is skipped rather than rendered as a broken tile;
    // it will simply reappear once fetchAndMergeWorksByIds succeeds on
    // a later load.
    const books: Array<{ entry: LibraryEntry; book: CatalogBook }> = entries
      .map(entry => {
        const book = getBookById(entry.workId);
        return book ? { entry, book } : null;
      })
      .filter((row): row is { entry: LibraryEntry; book: CatalogBook } => row !== null);

    return (
      <BookGrid>
        {books.map(({ entry, book }) => (
          <LibraryBookCard
            key={entry.id}
            book={book}
            badge={STATUS_BADGE[entry.status]}
            onOpen={bookId => onOpenBookDetail(
              bookId,
              snapshot(),
              // USER LIBRARY PHASE (requirement #9): seeds Book Detail's
              // language/edition selection with the last-read edition,
              // so "Продолжить чтение" (choosing this card again) lands
              // on the same edition rather than a re-derived default --
              // still just a seed, not a Reader bypass (see
              // BookDetailView's own comment on initialEdition).
              entry.lastEditionId && entry.lastLanguage
                ? { editionId: entry.lastEditionId, language: entry.lastLanguage }
                : null
            )}
          />
        ))}
      </BookGrid>
    );

  }

  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Моя библиотека">

      {renderPersonalShelf()}

      <h2 className="my-library-catalog-heading">Книги AN.KI</h2>

      {isAuthenticated && (
        <div className="my-library-tabs" role="tablist" aria-label="Фильтр библиотеки">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "my-library-tab my-library-tab-active" : "my-library-tab"}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {renderBody()}

    </ShellPage>
  );

}
