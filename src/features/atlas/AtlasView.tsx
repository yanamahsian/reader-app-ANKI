import { useEffect, useState } from "react";
import { useAuth } from "../../auth/supabaseAuth";
import { fetchAndMergeWorksByIds, listLibrary, type LibraryEntry } from "../../api/userLibrary";
import { listAnnotationsForUser, type Annotation } from "../../api/annotations";
import { getBookById } from "../../catalog";
import type { Book } from "../../catalog";
import type { Book as ReaderBook } from "../reader/engine/types";
import type { ReaderNavigationTarget } from "../reader/ReaderView";
import { resolveEditionFile, toReaderBook } from "../../catalog/toReaderBook";
import { useReaderJurisdiction } from "../book-detail/readerJurisdiction";
import { GuestNotice } from "../shared/GuestNotice";
import { ShellPage } from "../shared/ShellPage";
import { buildAtlasConnections, type AtlasConnection } from "./buildAtlas";

interface AtlasViewProps {
  onBack: () => void;
  onOpenBookDetail: (bookId: string) => void;
  onOpenAnnotationInReader: (book: ReaderBook, target: ReaderNavigationTarget) => void;
  onRequireSignIn: () => void;
}

interface AtlasState {
  entries: LibraryEntry[];
  annotations: Annotation[];
  activeBooks: Book[];
  connections: AtlasConnection[];
}

const EMPTY_ATLAS: AtlasState = {
  entries: [],
  annotations: [],
  activeBooks: [],
  connections: []
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export function AtlasView({
  onBack,
  onOpenBookDetail,
  onOpenAnnotationInReader,
  onRequireSignIn
}: AtlasViewProps) {
  const { isAuthenticated } = useAuth();
  const [readerJurisdiction] = useReaderJurisdiction();
  const [atlas, setAtlas] = useState<AtlasState>(EMPTY_ATLAS);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailableId, setUnavailableId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setAtlas(EMPTY_ATLAS);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    async function loadAtlas(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        // ATLAS MEMORY BRIDGE v1: Reader-created memory is now a first-class
        // Atlas input. Library status and annotations are fetched independently
        // and merged by Work id; no AI or semantic inference is involved here.
        const [entries, annotations] = await Promise.all([
          listLibrary(),
          listAnnotationsForUser()
        ]);

        const activeEntries = entries.filter(entry => entry.status === "reading" || entry.status === "finished");
        const libraryWorkIds = activeEntries.map(entry => entry.workId);
        const memoryWorkIds = annotations.map(annotation => annotation.workId);
        const workIds = Array.from(new Set([...libraryWorkIds, ...memoryWorkIds]));

        await fetchAndMergeWorksByIds(workIds);

        if (cancelled) return;

        const activeBooks = workIds
          .map(workId => getBookById(workId))
          .filter((book): book is Book => Boolean(book));

        setAtlas({
          entries,
          annotations,
          activeBooks,
          connections: buildAtlasConnections(activeBooks)
        });
      } catch (loadError) {
        console.error("Atlas load failed:", loadError);
        if (!cancelled) setError("Не удалось собрать Atlas из вашей истории чтения.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAtlas();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const readingCount = atlas.entries.filter(entry => entry.status === "reading").length;
  const finishedCount = atlas.entries.filter(entry => entry.status === "finished").length;
  const wantToReadCount = atlas.entries.filter(entry => entry.status === "want_to_read").length;
  const memoryWorkCount = new Set(atlas.annotations.map(annotation => annotation.workId)).size;
  const recentMemory = atlas.annotations.slice(0, 12);

  function handleOpenMemory(annotation: Annotation): void {
    const book = getBookById(annotation.workId);
    const resolved = book
      ? resolveEditionFile(book, annotation.editionId, readerJurisdiction ?? undefined)
      : null;

    if (!book || !resolved) {
      setUnavailableId(annotation.id);
      return;
    }

    setUnavailableId(null);
    onOpenAnnotationInReader(
      toReaderBook(book, resolved, readerJurisdiction ?? undefined),
      { pageIndex: annotation.pageIndex, annotationId: annotation.id }
    );
  }

  return (
    <ShellPage
      onBack={onBack}
      eyebrow="Atlas"
      title="Ваш интеллектуальный Atlas"
      subtitle="Книги, связи и мысли, которые продолжают существовать после чтения."
    >
      {!isAuthenticated ? (
        <>
          <GuestNotice message="Atlas собирается из вашей личной истории чтения. Войдите, чтобы AN.KI мог помнить прочитанные книги, сохранённые фрагменты и связи между ними." />
          <button type="button" className="primary-button" onClick={onRequireSignIn}>
            Войти
          </button>
        </>
      ) : isLoading ? (
        <GuestNotice message="Собираем Atlas из вашей истории чтения…" />
      ) : error ? (
        <GuestNotice message={error} />
      ) : (
        <>
          <section className="subscription-current">
            <h2>Atlas уже помнит то, что вы заметили</h2>
            <p className="settings-section-note">
              Atlas использует вашу библиотеку, выделения и заметки как реальные сигналы чтения. Связи между книгами пока строятся только из проверяемых данных AN.KI — авторов, тем, направлений, эпох, жанров, литературных традиций, подборок и времени публикации. AI здесь ничего не придумывает.
            </p>
          </section>

          <section className="subscription-blocks" aria-label="Состояние Atlas">
            <div className="subscription-block">
              <h2>{atlas.activeBooks.length}</h2>
              <p className="settings-section-note">книг уже участвуют в Atlas</p>
            </div>
            <div className="subscription-block">
              <h2>{atlas.annotations.length}</h2>
              <p className="settings-section-note">сохранённых фрагментов и мыслей</p>
            </div>
            <div className="subscription-block">
              <h2>{memoryWorkCount}</h2>
              <p className="settings-section-note">книг с личной памятью</p>
            </div>
            <div className="subscription-block">
              <h2>{atlas.connections.length}</h2>
              <p className="settings-section-note">проверяемых связей найдено</p>
            </div>
          </section>

          {recentMemory.length > 0 && (
            <section className="notes-group" aria-label="Личная память чтения">
              <header className="notes-group-header">
                <div>
                  <p className="eyebrow">Memory</p>
                  <h2 className="notes-group-title">Ваши сохранённые мысли</h2>
                  <p className="notes-group-author">Последние фрагменты, которые вы решили не потерять.</p>
                </div>
              </header>

              <div className="notes-group-items">
                {recentMemory.map(annotation => {
                  const book = getBookById(annotation.workId);
                  return (
                    <article key={annotation.id} className="notes-card">
                      <p className="notes-card-edition">
                        {book?.title ?? "Книга больше не найдена"}
                        {book?.authorName ? ` · ${book.authorName}` : ""}
                      </p>
                      <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>
                      {annotation.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
                      <div className="notes-card-actions">
                        {book && (
                          <button type="button" className="text-link" onClick={() => onOpenBookDetail(annotation.workId)}>
                            Открыть книгу
                          </button>
                        )}
                        <button type="button" className="text-link" onClick={() => handleOpenMemory(annotation)}>
                          Вернуться к фрагменту
                        </button>
                      </div>
                      {unavailableId === annotation.id && (
                        <p className="book-detail-unavailable">
                          Это издание сейчас недоступно в вашей юрисдикции.
                        </p>
                      )}
                      <p className="notes-card-date">{formatDate(annotation.updatedAt)}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {wantToReadCount > 0 && (
            <p className="settings-section-note">
              Ещё {wantToReadCount} книг в «Хочу прочитать» сами по себе пока не влияют на Atlas: книга входит в интеллектуальную историю, когда чтение началось или в ней появилась сохранённая мысль.
            </p>
          )}

          {atlas.activeBooks.length < 2 ? (
            <GuestNotice message="Для первой связи нужны хотя бы две книги из вашей реальной истории чтения." />
          ) : atlas.connections.length === 0 ? (
            <GuestNotice message="Книги уже в Atlas, но по текущим проверяемым метаданным между ними пока нет достаточно сильной связи." />
          ) : (
            <section className="subscription-plans" aria-label="Связи между книгами">
              {atlas.connections.map(connection => (
                <article
                  key={connection.id}
                  className={connection.strength === "strong" ? "plan-card plan-card-highlighted" : "plan-card"}
                >
                  <p className="eyebrow">{connection.strength === "strong" ? "Сильная связь" : "Связь"}</p>
                  <h3 className="plan-card-name">{connection.left.title}</h3>
                  <p className="settings-section-note">{connection.left.authorName}</p>
                  <p className="plan-card-price" aria-hidden="true">↔</p>
                  <h3 className="plan-card-name">{connection.right.title}</h3>
                  <p className="settings-section-note">{connection.right.authorName}</p>
                  <ul className="plan-card-features">
                    {connection.reasons.map(reason => (
                      <li key={`${connection.id}-${reason.kind}-${reason.label}`}>{reason.label}</li>
                    ))}
                  </ul>
                  <div>
                    <button type="button" className="text-link" onClick={() => onOpenBookDetail(connection.left.id)}>
                      Открыть «{connection.left.title}»
                    </button>
                  </div>
                  <div>
                    <button type="button" className="text-link" onClick={() => onOpenBookDetail(connection.right.id)}>
                      Открыть «{connection.right.title}»
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <section className="subscription-current">
            <h2>Что добавит AI позже</h2>
            <p className="settings-section-note">
              Следующий интеллектуальный слой будет искать смысловые связи между уже существующими сигналами: общие идеи в сохранённых фрагментах, противоречия, повторяющиеся вопросы и развитие темы между книгами. AI будет связывать накопленную память, а не заменять её.
            </p>
          </section>

          {(readingCount > 0 || finishedCount > 0) && (
            <p className="settings-section-note">
              Сейчас в библиотеке: читаете — {readingCount}, завершено — {finishedCount}.
            </p>
          )}
        </>
      )}
    </ShellPage>
  );
}
