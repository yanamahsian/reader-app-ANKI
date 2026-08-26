import { useEffect, useRef, useState } from "react";
import { ShellPage } from "../shared/ShellPage";
import { BookGrid } from "../shared/BookGrid";
import { LibraryBookCard } from "../shared/LibraryBookCard";
import { getBookById } from "../../catalog";
import type { Book as CatalogBook } from "../../catalog/types";
import { useAuth } from "../../auth/supabaseAuth";
import { fetchAndMergeWorksByIds, listLibrary } from "../../api/userLibrary";
import type { LibraryEntry, LibraryStatus } from "../../api/userLibrary";

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

export function MyLibraryView({ onBack, restoreState, onOpenBookDetail, onRequireSignIn, onOpenLibrary }: MyLibraryViewProps) {

  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<MyLibraryTab>(restoreState?.tab ?? "all");

  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  const requestIdRef = useRef(0);

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

  function renderBody() {

    if (!isAuthenticated) {
      return (
        <div className="guest-notice">
          <p className="guest-notice-message">
            Здесь появятся книги, которые вы сохраните. Чтобы сохранять книги, войдите в аккаунт.
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
