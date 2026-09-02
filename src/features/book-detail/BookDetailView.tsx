import { useEffect, useState } from "react";
import {
  getBookById,
  getAuthorById,
  getCollectionById,
  countries,
  centuries,
  epochs,
  movements,
  genres,
  themes
} from "../../catalog";
import type { Book as ReaderBook } from "../reader/engine/types";
import { listReadableEditions, toReaderBook, hasAnyPhysicalEdition } from "../../catalog/toReaderBook";
import type { ReadableEdition } from "../../catalog/toReaderBook";
import { useReaderJurisdiction } from "./readerJurisdiction";
import { CoverFallback } from "../shared/CoverFallback";
import { LANGUAGE_OPTIONS } from "../../catalog/languages";
import { getEffectivePreferredBookLanguages } from "../../i18n/bookLanguagePreference";
import { resolveDefaultBookLanguage } from "../../catalog/defaultEditionLanguage";
import { useAuth } from "../../auth/supabaseAuth";
import {
  addToLibrary,
  getLibraryEntry,
  recordRealRead,
  removeFromLibrary,
  setLibraryStatus as setLibraryStatusApi
} from "../../api/userLibrary";
import type { LibraryEntry, LibraryStatus } from "../../api/userLibrary";

interface BookDetailViewProps {
  bookId: string;
  onBack: () => void;
  onOpenBook: (book: ReaderBook) => void;
  onOpenAuthorDetail: (authorId: string) => void;
  onOpenCollection: (collectionId: string) => void;
  // USER LIBRARY PHASE: routes a signed-out visitor to the existing
  // auth home (Profile) when they try to save a Work -- the same
  // destination AccountMenu's own "Создать аккаунт"/"Войти" buttons
  // already use, so this reuses the existing auth flow rather than
  // inventing a second one (requirement #4). App.tsx wires this to
  // navigate to the "profile" view.
  onRequireSignIn: () => void;
  // USER LIBRARY PHASE (requirement #9): when arriving here from a
  // saved Work in My Library, the visitor's last-read language/edition
  // -- used only to SEED the same selectedLanguage/selectedEditionId
  // state this view already had (see below), never to open the Reader
  // directly. This still goes through the exact same
  // listReadableEditions/effectiveEditionId rights gate as every other
  // entry point: if the saved edition is no longer readable for the
  // current jurisdiction, effectiveEditionId below simply falls back
  // to the first available edition instead -- Book Detail is shown
  // either way, satisfying "no bypass" (requirement #16/#9) without a
  // separate "Продолжить" control that would need its own rights
  // check duplicated elsewhere.
  initialEdition?: { editionId: string; language: string } | null;
}

function labelFor(id: string | null, dictionary: Array<{ id: string; label: string }>): string | null {
  if (!id) return null;
  return dictionary.find(term => term.id === id)?.label ?? null;
}

function labelsFor(ids: string[], dictionary: Array<{ id: string; label: string }>): string[] {
  return ids
    .map(id => dictionary.find(term => term.id === id)?.label)
    .filter((label): label is string => Boolean(label));
}

// Reuses the same human-readable names as the Home/Library language
// filters (catalog/languages.ts) rather than a third, separately
// hand-typed list -- falls back to the raw code itself (e.g. an
// ingested language not yet in that shared list) rather than hiding
// the option or showing something misleading.
function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find(option => option.value === code)?.label ?? code;
}

interface MetaRowProps {
  label: string;
  value: string | null;
}

function MetaRow({ label, value }: MetaRowProps) {
  if (!value) return null;
  return (
    <div className="book-detail-meta-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <section className="book-detail">
      <button className="text-link" type="button" onClick={onBack}>← Назад</button>
      <p className="book-detail-not-found">Книга не найдена в каталоге.</p>
    </section>
  );
}

// Only country codes this catalog can currently say anything
// meaningful about are listed below the select itself, not baked into
// this list -- adding a code here does NOT mean that jurisdiction has
// verified rights data (right now, only "US" does, via Project
// Gutenberg's own "public domain in the USA" assertions). This is a
// small, honest picker, not a claim of broad international coverage.
const JURISDICTION_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "US", label: "США" },
  { code: "DE", label: "Германия" },
  { code: "FR", label: "Франция" },
  { code: "GB", label: "Великобритания" },
  { code: "RU", label: "Россия" }
];

interface JurisdictionPromptProps {
  readerJurisdiction: string | null;
  onChange: (jurisdiction: string) => void;
}

// Shown instead of a flat "unavailable" message when a Work genuinely
// has a physical file, but resolving it depends on a jurisdiction this
// app doesn't know yet (or knows, and it doesn't clear the book's
// rights). This is deliberately not an onboarding flow or a full
// account/location system -- one inline choice, persisted locally,
// nothing more.
function JurisdictionPrompt({ readerJurisdiction, onChange }: JurisdictionPromptProps) {
  return (
    <div className="book-detail-jurisdiction-prompt">
      <p className="book-detail-unavailable">
        {readerJurisdiction
          ? "У этой книги есть текст, но, по имеющимся у нас данным о правах, он не подтверждён как доступный для выбранной юрисдикции."
          : "У этой книги есть текст, но его законная доступность зависит от вашей страны, а она ещё не указана."}
      </p>
      <label className="book-detail-jurisdiction-label">
        Ваша юрисдикция (для проверки доступности):{" "}
        <select
          value={readerJurisdiction ?? ""}
          onChange={event => { if (event.target.value) onChange(event.target.value); }}
        >
          <option value="" disabled>Выбрать…</option>
          {JURISDICTION_OPTIONS.map(option => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="book-detail-jurisdiction-note">
        Доступность проверяется отдельно для каждой страны по данным о правах конкретного издания. Для части книг в каталоге уже подтверждена доступность в США и Германии; для других стран или отдельных изданий данных может пока не быть.
      </p>
    </div>
  );
}

// USER LIBRARY PHASE: secondary, quiet library-membership control --
// deliberately separate from the primary "Читать" button (requirement
// #3: "не панель кнопок", the main CTA stays primary). Membership is
// Work-level and independent of whether the Work currently has a
// readable edition (requirement #16) -- the caller renders this
// regardless of which of the three "Читать" branches is active.
type LibraryActionStatus = "idle" | "loading" | "saving" | "removing" | "error";

interface LibraryActionProps {
  isAuthenticated: boolean;
  entry: LibraryEntry | null;
  status: LibraryActionStatus;
  error: string | null;
  onAdd: () => void;
  onRemove: () => void;
  onSetStatus: (status: LibraryStatus) => void;
  onRequireSignIn: () => void;
}

const STATUS_LABELS: Record<LibraryStatus, string> = {
  want_to_read: "Хочу прочитать",
  reading: "Читаю",
  finished: "Прочитано"
};

function LibraryAction({
  isAuthenticated,
  entry,
  status,
  error,
  onAdd,
  onRemove,
  onSetStatus,
  onRequireSignIn
}: LibraryActionProps) {

  if (!isAuthenticated) {
    return (
      <div className="book-detail-library-action">
        <button type="button" className="text-link" onClick={onRequireSignIn}>
          Добавить в библиотеку
        </button>
      </div>
    );
  }

  // Nothing rendered while the initial getLibraryEntry() lookup is in
  // flight -- requirement #13 ("не должно мигать"): showing "Добавить"
  // and then immediately swapping to "В библиотеке" a moment later
  // reads as a flicker/bug; a brief blank beat while the real state
  // loads, then the single correct label, does not.
  if (status === "loading") {
    return <div className="book-detail-library-action" />;
  }

  return (
    <div className="book-detail-library-action">

      {entry ? (
        <>
          <span className="book-detail-library-state">В библиотеке</span>
          <select
            className="book-detail-library-status-select"
            aria-label="Статус чтения"
            value={entry.status}
            disabled={status === "saving" || status === "removing"}
            onChange={event => onSetStatus(event.target.value as LibraryStatus)}
          >
            {(Object.keys(STATUS_LABELS) as LibraryStatus[]).map(value => (
              <option key={value} value={value}>{STATUS_LABELS[value]}</option>
            ))}
          </select>
          <button
            type="button"
            className="text-link"
            onClick={onRemove}
            disabled={status === "saving" || status === "removing"}
          >
            {status === "removing" ? "Удаление…" : "Убрать из библиотеки"}
          </button>
        </>
      ) : (
        <button type="button" className="text-link" onClick={onAdd} disabled={status === "saving"}>
          {status === "saving" ? "Сохранение…" : "Добавить в библиотеку"}
        </button>
      )}

      {status === "error" && error && (
        <p className="book-detail-library-error">
          {error}{" "}
          <button type="button" className="text-link" onClick={entry ? onRemove : onAdd}>Повторить</button>
        </p>
      )}

    </div>
  );

}

export function BookDetailView({
  bookId,
  onBack,
  onOpenBook,
  onOpenAuthorDetail,
  onOpenCollection,
  onRequireSignIn,
  initialEdition
}: BookDetailViewProps) {

  const book = getBookById(bookId);

  // Called unconditionally, before the early return below, per the
  // Rules of Hooks -- bookId can change from valid to not-found (or
  // back) across re-renders of the same component instance, and a
  // hook can never become conditional based on that.
  const [readerJurisdiction, setReaderJurisdiction] = useReaderJurisdiction();
  const [coverFailed, setCoverFailed] = useState(false);

  const { isAuthenticated, user } = useAuth();
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntry | null>(null);
  const [libraryActionStatus, setLibraryActionStatus] = useState<LibraryActionStatus>("idle");
  const [libraryActionError, setLibraryActionError] = useState<string | null>(null);

  // Loads the current membership row (if any) for THIS Work whenever
  // the visitor lands on a different book, or signs in/out while
  // already here. Guests never issue this request at all (getLibraryEntry
  // would just throw "Не авторизован" -- checked here instead of relying
  // on that throw, so signed-out is a clean, silent "not saved" state).
  useEffect(() => {

    if (!book) return;

    if (!isAuthenticated) {
      setLibraryEntry(null);
      setLibraryActionStatus("idle");
      setLibraryActionError(null);
      return;
    }

    let cancelled = false;
    setLibraryActionStatus("loading");

    getLibraryEntry(book.id)
      .then(entry => {
        if (cancelled) return;
        setLibraryEntry(entry);
        setLibraryActionStatus("idle");
      })
      .catch(error => {
        if (cancelled) return;
        console.error("getLibraryEntry failed:", error);
        setLibraryEntry(null);
        setLibraryActionStatus("idle");
      });

    return () => { cancelled = true; };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, isAuthenticated]);

  async function handleAddToLibrary(): Promise<void> {

    if (!book || !user) return;

    const previous = libraryEntry;
    const nowIso = new Date().toISOString();

    // Optimistic UI (requirement #13) -- shows "В библиотеке" the
    // instant the visitor clicks, rolled back to the previous state
    // (null, here) if the request actually fails below.
    setLibraryActionStatus("saving");
    setLibraryActionError(null);
    setLibraryEntry({
      id: "optimistic",
      workId: book.id,
      status: "want_to_read",
      addedAt: nowIso,
      updatedAt: nowIso,
      lastEditionId: null,
      lastLanguage: null
    });

    try {
      await addToLibrary(user.id, book.id);
    } catch (error) {
      setLibraryEntry(previous);
      setLibraryActionStatus("error");
      setLibraryActionError((error as Error).message);
      return;
    }

    // addToLibrary itself returns no row (return=minimal) -- re-fetch
    // the canonical one so the id/timestamps shown/used afterwards are
    // real, not the optimistic placeholder above.
    try {
      const fresh = await getLibraryEntry(book.id);
      setLibraryEntry(fresh);
    } catch {
      // The write already succeeded -- a failed re-fetch just means the
      // optimistic placeholder stays on screen a little longer; not
      // worth surfacing as an error for an action that already worked.
    }
    setLibraryActionStatus("idle");

  }

  async function handleRemoveFromLibrary(): Promise<void> {

    if (!book) return;

    const previous = libraryEntry;
    setLibraryActionStatus("removing");
    setLibraryActionError(null);
    setLibraryEntry(null);

    try {
      await removeFromLibrary(book.id);
      setLibraryActionStatus("idle");
    } catch (error) {
      setLibraryEntry(previous);
      setLibraryActionStatus("error");
      setLibraryActionError((error as Error).message);
    }

  }

  async function handleSetLibraryStatus(status: LibraryStatus): Promise<void> {

    if (!book || !libraryEntry) return;

    const previous = libraryEntry;
    setLibraryEntry({ ...libraryEntry, status, updatedAt: new Date().toISOString() });
    setLibraryActionStatus("saving");
    setLibraryActionError(null);

    try {
      await setLibraryStatusApi(book.id, status);
      setLibraryActionStatus("idle");
    } catch (error) {
      setLibraryEntry(previous);
      setLibraryActionStatus("error");
      setLibraryActionError((error as Error).message);
    }

  }

  // The visitor's own explicit choices, when they've made one. Both
  // start unset -- on first render (and whenever a choice no longer
  // applies to the current book, see effectiveLanguage/
  // effectiveEditionId below) a real default is derived fresh from
  // this book's own genuinely readable editions rather than carried
  // over from whatever the previous book happened to have. This also
  // means a fresh mount of this component (e.g. navigating to a
  // different book id) never needs an extra effect just to reset these
  // -- an invalid selection for the new book is simply never used.
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(initialEdition?.language ?? null);
  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(initialEdition?.editionId ?? null);

  if (!book) {
    return <NotFound onBack={onBack} />;
  }

  const author = getAuthorById(book.authorId);
  const relatedCollections = book.collectionIds
    .map(id => getCollectionById(id))
    .filter((collection): collection is NonNullable<typeof collection> => Boolean(collection));

  const countryLabel = labelFor(book.countryId, countries);
  const centuryLabel = labelFor(book.centuryId, centuries);
  const epochLabel = labelFor(book.epochId, epochs);
  const movementLabel = labelFor(book.movementId, movements);
  const genreLabels = labelsFor(book.genreIds, genres);
  const themeLabels = labelsFor(book.themeIds, themes);

  // The real, non-decorative truth this Work can actually be read in --
  // never book.availableLanguages, which is catalog/browse metadata
  // only and has been proven to claim a language (e.g. `ru`) that has
  // no genuinely readable edition behind it. Every entry here already
  // passed the same rights/jurisdiction/format gate
  // pickPreferredEditionAndFile itself enforces (see toReaderBook.ts) --
  // if a language has no qualifying edition for this visitor's
  // jurisdiction, it simply doesn't appear as an option at all, rather
  // than appearing and then failing silently.
  const readableEditions = listReadableEditions(book, readerJurisdiction ?? undefined);

  // Preserves the Work's own edition order (never alphabetized/sorted
  // by this view) while listing each language once -- multiple
  // editions in the same language are NOT collapsed here, only the
  // language list itself is deduplicated; editionsForLanguage below
  // keeps every one of them.
  const availableLanguages = Array.from(new Set(readableEditions.map(re => re.edition.language)));

  // See resolveDefaultBookLanguage's own comment (module scope, above
  // this component) for the full priority chain this applies.
  const effectiveLanguage = resolveDefaultBookLanguage({
    availableLanguages,
    originalLanguage: book.originalLanguage,
    preferredBookLanguages: getEffectivePreferredBookLanguages(),
    explicitSelection: selectedLanguage
  });

  const editionsForLanguage: ReadableEdition[] = effectiveLanguage
    ? readableEditions.filter(re => re.edition.language === effectiveLanguage)
    : [];

  // Default edition within that language: the visitor's own pick, if
  // it still belongs to the current language selection; otherwise the
  // first qualifying edition in the Work's own order. A language
  // change (handleLanguageSelect below) always clears selectedEditionId
  // so this never carries an id from one language over into another by
  // accident.
  const effectiveEditionId = selectedEditionId && editionsForLanguage.some(re => re.edition.id === selectedEditionId)
    ? selectedEditionId
    : editionsForLanguage[0]?.edition.id ?? null;

  const selectedResolved = editionsForLanguage.find(re => re.edition.id === effectiveEditionId) ?? null;

  function handleLanguageSelect(language: string): void {
    setSelectedLanguage(language);
    // A different language means a different set of editions entirely
    // -- never carry over an editionId that belonged to the previous
    // language's list.
    setSelectedEditionId(null);
  }

  function handleEditionSelect(editionId: string): void {
    setSelectedEditionId(editionId);
  }

  const showCover = Boolean(book.cover) && !coverFailed;

  return (
    <section className="book-detail book-detail-page">

      <button className="text-link" type="button" onClick={onBack}>
        ← Назад
      </button>

      <div className="book-detail-hero">

        <div className="book-detail-cover">
          {showCover ? (
            <img
              loading="lazy"
              src={book.cover ?? undefined}
              alt=""
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <CoverFallback title={book.title} />
          )}
        </div>

        <div className="book-detail-info">

          <header className="book-detail-header">

            <p className="eyebrow">Произведение</p>

            <h1 className="book-detail-title">{book.title}</h1>

            {book.originalTitle && (
              <p className="book-detail-original-title">{book.originalTitle}</p>
            )}

            {author && (
              <button
                className="book-detail-author-link"
                type="button"
                onClick={() => onOpenAuthorDetail(author.id)}
              >
                {author.name}
              </button>
            )}

          </header>

          <dl className="book-detail-quick-meta">
            <MetaRow label="Год публикации" value={book.publicationYear ? String(book.publicationYear) : null} />
          </dl>

          <div className="book-detail-language-select">

            {availableLanguages.length > 1 && (
              <label className="book-detail-language-field">
                Язык текста
                <select
                  className="language-select"
                  aria-label="Язык текста"
                  value={effectiveLanguage ?? ""}
                  onChange={event => handleLanguageSelect(event.target.value)}
                >
                  {availableLanguages.map(language => (
                    <option key={language} value={language}>{languageLabel(language)}</option>
                  ))}
                </select>
              </label>
            )}

            {availableLanguages.length === 1 && (
              <p className="book-detail-language-single">
                Язык текста: {languageLabel(availableLanguages[0])}
              </p>
            )}

            {editionsForLanguage.length > 1 && (
              <label className="book-detail-language-field">
                Перевод / издание
                <select
                  className="language-select"
                  aria-label="Перевод или издание"
                  value={effectiveEditionId ?? ""}
                  onChange={event => handleEditionSelect(event.target.value)}
                >
                  {editionsForLanguage.map((re, index) => (
                    <option key={re.edition.id} value={re.edition.id}>
                      {re.edition.translatorName?.trim() || `Издание ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}

          </div>

          <div className="book-detail-read">
            {selectedResolved ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  onOpenBook(toReaderBook(book, selectedResolved, readerJurisdiction ?? undefined));
                  // USER LIBRARY PHASE (requirements #9/#10): fired only
                  // once the visitor actually opens the Reader on a real
                  // edition -- never merely from viewing Book Detail.
                  // Best-effort/fire-and-forget: a failure here must
                  // never block the Reader, which is already opening via
                  // onOpenBook above (see recordRealRead's own comment).
                  if (isAuthenticated) {
                    recordRealRead(book.id, selectedResolved.edition.id, selectedResolved.edition.language)
                      .catch(error => console.error("recordRealRead failed:", error));
                    setLibraryEntry(prev => prev ? {
                      ...prev,
                      status: prev.status === "want_to_read" ? "reading" : prev.status,
                      lastEditionId: selectedResolved.edition.id,
                      lastLanguage: selectedResolved.edition.language,
                      updatedAt: new Date().toISOString()
                    } : prev);
                  }
                }}
              >
                Читать
              </button>
            ) : hasAnyPhysicalEdition(book) ? (
              <JurisdictionPrompt readerJurisdiction={readerJurisdiction} onChange={setReaderJurisdiction} />
            ) : (
              <p className="book-detail-unavailable">Книга пока недоступна для чтения</p>
            )}
          </div>

          <LibraryAction
            isAuthenticated={isAuthenticated}
            entry={libraryEntry}
            status={libraryActionStatus}
            error={libraryActionError}
            onAdd={handleAddToLibrary}
            onRemove={handleRemoveFromLibrary}
            onSetStatus={handleSetLibraryStatus}
            onRequireSignIn={onRequireSignIn}
          />

        </div>

      </div>

      <div className="book-detail-body">

        {book.description && (
          <p className="book-detail-description">{book.description}</p>
        )}

        <dl className="book-detail-meta">
          <MetaRow label="Оригинальный язык" value={book.originalLanguage || null} />
          <MetaRow label="Страна" value={countryLabel} />
          <MetaRow label="Век" value={centuryLabel} />
          <MetaRow label="Эпоха" value={epochLabel} />
          <MetaRow label="Направление" value={movementLabel} />
          <MetaRow label="Жанры" value={genreLabels.length ? genreLabels.join(" · ") : null} />
          <MetaRow label="Темы" value={themeLabels.length ? themeLabels.join(" · ") : null} />
        </dl>

        {relatedCollections.length > 0 && (
          <div className="book-detail-collections">
            <p className="eyebrow">Подборки</p>
            <div className="book-detail-collections-list">
              {relatedCollections.map(collection => (
                <button
                  key={collection.id}
                  className="text-link"
                  type="button"
                  onClick={() => onOpenCollection(collection.id)}
                >
                  {collection.title}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

    </section>
  );

}
