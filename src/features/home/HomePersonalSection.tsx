// HOME PRODUCT INTEGRATION v1: the personal reading layer that sits
// between Hero and the public discovery sections (Collections/Authors/
// Academy) for an AUTHENTICATED visitor only. Guests never render this
// component at all -- see the isAuthenticated gate below, which also
// gates every network call this file makes.
//
// This is a signal, not a dashboard: Continue Reading (up to 3 real
// "reading" books, reusing the exact same lastEditionId/lastLanguage ->
// initialEdition seed pattern MyLibraryView already established) plus a
// compact, deterministic Atlas/Memory summary and three quiet entry
// points (My Library / Atlas / Notes). No new backend, no AI calls, no
// new persistence -- every number here comes from listLibrary() /
// listAnnotationsForUser() / listThoughtThreads(), already-existing APIs
// this app calls elsewhere.
//
// Partial-failure safety: the three sources load independently
// (Promise-per-source, not one Promise.all/try-catch that would let a
// single failing source blank out the whole section). `null` means
// "not loaded yet, or failed to load" -- deliberately never conflated
// with a real, successfully-fetched empty array. A resource that failed
// to load simply contributes nothing to this section; it never renders
// as a fake zero.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/supabaseAuth";
import { fetchAndMergeWorksByIds, listLibrary } from "../../api/userLibrary";
import type { LibraryEntry } from "../../api/userLibrary";
import { listAnnotationsForUser } from "../../api/annotations";
import type { Annotation } from "../../api/annotations";
import { listThoughtThreads } from "../../api/thoughtThreads";
import type { ThoughtThread } from "../../api/thoughtThreads";
import { getBookById } from "../../catalog";
import type { Book as CatalogBook } from "../../catalog/types";
import { BookGrid } from "../shared/BookGrid";
import { LibraryBookCard } from "../shared/LibraryBookCard";

export interface HomePersonalSectionProps {
  // Home's own honest navigation origin (App.tsx's BookDetailOrigin now
  // has a real { type: "home" } variant) -- Book Detail remains the only
  // Edition/rights gate, Reader is never opened directly from Home. See
  // this component's own "CONTINUE READING NEVER BYPASSES BOOK DETAIL"
  // comment below.
  onOpenBookDetail: (bookId: string, initialEdition: { editionId: string; language: string } | null) => void;
  // The PUBLIC catalog Library (same prop Hero's own "Вся библиотека"
  // already uses) -- used by the "Library is empty" zero state's
  // "Открыть библиотеку" action, to help a visitor with nothing saved
  // yet find something to read.
  onOpenLibrary: () => void;
  // The visitor's own personal shelf (existing "my-library" account
  // view, reached the same way AccountMenu already reaches it) --
  // distinct from onOpenLibrary above.
  onOpenMyLibrary: () => void;
  onOpenAtlas: () => void;
  onOpenNotes: () => void;
}

// Standard Russian one/few/many count-form selection -- same algorithm
// as AtlasOverview.tsx's own local ruCount(), kept self-contained here
// too rather than cross-imported from Atlas: Atlas is explicitly not to
// be touched or refactored on this pass, and this is one small pure
// function, not shared state.
function ruCount(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function fragmentsWord(n: number): string {
  return ruCount(n, "фрагмент", "фрагмента", "фрагментов");
}

function booksWord(n: number): string {
  return ruCount(n, "книга", "книги", "книг");
}

function threadsWord(n: number): string {
  return ruCount(n, "нить", "нити", "нитей");
}

// Same rule as ATLAS PRODUCT INTEGRATION v1's isThreadOpen() in
// AtlasView.tsx -- deliberately re-declared here (not imported) rather
// than reaching into Atlas's own file, for the same self-containment
// reason as ruCount() above. The RULE is identical; there is no second
// definition of what "open" means.
function isThreadOpen(thread: ThoughtThread): boolean {
  const hasQuestion = Boolean(thread.question && thread.question.trim().length > 0);
  const hasSynthesis = Boolean(thread.synthesisNote && thread.synthesisNote.trim().length > 0);
  return hasQuestion && !hasSynthesis;
}

// A Thread's open question is shown on Home only when short enough not
// to turn a compact signal card into a thread reader (spec: "только
// если он коротко и аккуратно помещается") -- Home never edits or
// writes Threads, this is read-only, best-effort display.
const MAX_INLINE_QUESTION_LENGTH = 90;

interface ResourceState<T> {
  // null = not loaded yet, OR failed to load. Never used to represent a
  // real zero -- a successful empty fetch is always `[]`, never `null`.
  data: T[] | null;
  loading: boolean;
}

const INITIAL_RESOURCE_STATE = { data: null, loading: true };

export function HomePersonalSection({
  onOpenBookDetail,
  onOpenLibrary,
  onOpenMyLibrary,
  onOpenAtlas,
  onOpenNotes
}: HomePersonalSectionProps) {

  const { isAuthenticated } = useAuth();

  const [library, setLibrary] = useState<ResourceState<LibraryEntry>>(INITIAL_RESOURCE_STATE);
  const [annotations, setAnnotations] = useState<ResourceState<Annotation>>(INITIAL_RESOURCE_STATE);
  const [threads, setThreads] = useState<ResourceState<ThoughtThread>>(INITIAL_RESOURCE_STATE);

  // Mount/remount + in-flight-request race safety, same requestId
  // pattern MyLibraryView already uses -- a Home -> other view -> Home
  // round trip must load fresh data, and a response that lands after a
  // newer request has started (or after unmount) must never setState.
  const requestIdRef = useRef(0);

  useEffect(() => {

    const requestId = ++requestIdRef.current;

    if (!isAuthenticated) {
      // Guest path (spec section 15): zero personal API calls, section
      // renders nothing (see the early return in the JSX below).
      setLibrary({ data: null, loading: false });
      setAnnotations({ data: null, loading: false });
      setThreads({ data: null, loading: false });
      return;
    }

    setLibrary({ data: null, loading: true });
    setAnnotations({ data: null, loading: true });
    setThreads({ data: null, loading: true });

    // Library load, then (only) the small batch Work resolve its own
    // Continue Reading cards need -- never a fetch per book, never the
    // whole catalog. This one chain is independent of the two below: a
    // Library failure never blocks Memory/Threads signals from
    // rendering, and vice versa.
    (async () => {
      try {
        const rows = await listLibrary();
        if (requestId !== requestIdRef.current) return;

        const readingWorkIds = Array.from(
          new Set(
            rows
              .filter(entry => entry.status === "reading")
              .slice(0, 3)
              .map(entry => entry.workId)
          )
        );

        if (readingWorkIds.length > 0) {
          try {
            await fetchAndMergeWorksByIds(readingWorkIds);
          } catch (mergeError) {
            // A resolve failure here must not blank out Continue
            // Reading -- getBookById() below simply returns null for
            // whichever Work(s) didn't resolve, and that one card is
            // skipped rather than rendered with fake placeholder data
            // (spec section 30/Test J).
            console.error("HomePersonalSection: resolving reading books failed:", mergeError);
          }
        }

        if (requestId !== requestIdRef.current) return;
        setLibrary({ data: rows, loading: false });
      } catch (loadError) {
        if (requestId !== requestIdRef.current) return;
        console.error("HomePersonalSection: listLibrary failed:", loadError);
        setLibrary({ data: null, loading: false });
      }
    })();

    listAnnotationsForUser()
      .then(rows => {
        if (requestId !== requestIdRef.current) return;
        setAnnotations({ data: rows, loading: false });
      })
      .catch(loadError => {
        if (requestId !== requestIdRef.current) return;
        console.error("HomePersonalSection: listAnnotationsForUser failed:", loadError);
        setAnnotations({ data: null, loading: false });
      });

    listThoughtThreads()
      .then(rows => {
        if (requestId !== requestIdRef.current) return;
        setThreads({ data: rows, loading: false });
      })
      .catch(loadError => {
        if (requestId !== requestIdRef.current) return;
        console.error("HomePersonalSection: listThoughtThreads failed:", loadError);
        setThreads({ data: null, loading: false });
      });

  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  function renderContinueReading() {

    if (library.loading && library.data === null) {
      return <p className="settings-section-note">Загружаем ваше чтение…</p>;
    }

    if (library.data === null) {
      // Real failure, not a real empty library -- stay honest and quiet
      // rather than showing "0 книг" or a blocking error banner. The
      // rest of Home (public discovery, and the Atlas/Memory signal
      // below if those two loaded) remains fully usable.
      return (
        <p className="settings-section-note">
          Не удалось загрузить ваше текущее чтение. Обновите страницу, чтобы попробовать снова.
        </p>
      );
    }

    if (library.data.length === 0) {
      return (
        <div className="guest-notice">
          <p className="guest-notice-message">Ваше чтение начнётся здесь — сохраните первую книгу.</p>
          <div className="guest-notice-actions">
            <button type="button" className="primary-button" onClick={onOpenLibrary}>Открыть библиотеку</button>
          </div>
        </div>
      );
    }

    // listLibrary() is already ordered updated_at DESC -- the most
    // recently active "reading" books, taken in that order, with no
    // secondary sort (title/author/random/AI score). Spec section 29.
    const readingEntries = library.data.filter(entry => entry.status === "reading").slice(0, 3);

    if (readingEntries.length === 0) {
      return (
        <div className="guest-notice">
          <p className="guest-notice-message">Сейчас нет книги со статусом «Читаю».</p>
          <div className="guest-notice-actions">
            <button type="button" className="text-link" onClick={onOpenMyLibrary}>Моя библиотека</button>
          </div>
        </div>
      );
    }

    const cards: Array<{ entry: LibraryEntry; book: CatalogBook }> = readingEntries
      .map(entry => {
        const book = getBookById(entry.workId);
        return book ? { entry, book } : null;
      })
      .filter((row): row is { entry: LibraryEntry; book: CatalogBook } => row !== null);

    if (cards.length === 0) {
      // Every reading entry's Work failed to resolve this time -- skip
      // the grid entirely rather than rendering broken tiles; Home
      // itself must never crash over this (Test J).
      return null;
    }

    return (
      <BookGrid>
        {cards.map(({ entry, book }) => (
          <LibraryBookCard
            key={entry.id}
            book={book}
            badge="Продолжить"
            onOpen={bookId => onOpenBookDetail(
              bookId,
              // CONTINUE READING NEVER BYPASSES BOOK DETAIL: exactly the
              // same lastEditionId/lastLanguage -> initialEdition seed
              // MyLibraryView already uses, never a resolveEditionFile/
              // fetchProgress/ReaderBook built here. Book Detail stays
              // the one canonical Edition/rights gate; Reader restores
              // the saved page position itself via ProgressStore.
              entry.lastEditionId && entry.lastLanguage
                ? { editionId: entry.lastEditionId, language: entry.lastLanguage }
                : null
            )}
          />
        ))}
      </BookGrid>
    );

  }

  function renderAtlasSignal() {

    const fragmentsCount = annotations.data?.length ?? null;
    const memoryWorkCount = annotations.data
      ? new Set(annotations.data.map(annotation => annotation.workId)).size
      : null;
    const threadsCount = threads.data?.length ?? null;
    const openThreadsCount = threads.data ? threads.data.filter(isThreadOpen).length : null;
    // Already updated_at DESC from listThoughtThreads() -- the first
    // entry is the latest active Thread, no re-sorting here.
    const latestThread = threads.data && threads.data.length > 0 ? threads.data[0] : null;

    return (
      <article className="notes-card">
        <p className="eyebrow">Atlas</p>
        <h3 className="notes-group-title">Ваше чтение продолжает жить</h3>

        {fragmentsCount === null ? null : fragmentsCount === 0 ? (
          <p className="notes-card-note">Сохранённые мысли появятся после первых выделений во время чтения.</p>
        ) : (
          <p className="notes-card-note">
            {fragmentsCount} {fragmentsWord(fragmentsCount)}
            {memoryWorkCount ? ` в ${memoryWorkCount} ${booksWord(memoryWorkCount)}` : ""}
          </p>
        )}

        {threadsCount === null ? null : threadsCount === 0 ? (
          <p className="notes-card-note">Нити мысли можно собрать в Atlas из сохранённых фрагментов.</p>
        ) : (
          <p className="notes-card-note">
            {threadsCount} {threadsWord(threadsCount)}
            {openThreadsCount ? ` · ${openThreadsCount} с открытым вопросом` : ""}
          </p>
        )}

        {latestThread && (
          <p className="notes-card-note">
            Последняя нить: «{latestThread.title}»
            {isThreadOpen(latestThread) &&
              latestThread.question &&
              latestThread.question.trim().length > 0 &&
              latestThread.question.trim().length <= MAX_INLINE_QUESTION_LENGTH
              ? ` — ${latestThread.question.trim()}`
              : ""}
          </p>
        )}

        <div className="notes-card-actions">
          <button type="button" className="text-link" onClick={onOpenAtlas}>Открыть Atlas</button>
          <button type="button" className="text-link" onClick={onOpenMyLibrary}>Моя библиотека</button>
          <button type="button" className="text-link" onClick={onOpenNotes}>Мои заметки</button>
        </div>
      </article>
    );

  }

  return (
    <section className="editorial-section home-personal-section" aria-label="Ваше чтение">

      <div className="section-heading">
        <div>
          <p className="eyebrow">Ваше чтение</p>
          <h2>Продолжить чтение</h2>
        </div>
      </div>

      {renderContinueReading()}

      <div className="notes-group-items home-personal-signal">
        {renderAtlasSignal()}
      </div>

    </section>
  );

}
