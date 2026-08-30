import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/supabaseAuth";
import { fetchAndMergeWorksByIds, listLibrary, type LibraryEntry } from "../../api/userLibrary";
import { listAnnotationsForUser, type Annotation } from "../../api/annotations";
import {
  createThoughtThread,
  deleteThoughtThread,
  listThoughtThreads,
  replaceThoughtThread,
  ThoughtThreadReplaceError,
  type ThoughtThread
} from "../../api/thoughtThreads";
import { getBookById } from "../../catalog";
import type { Book } from "../../catalog";
import type { Book as ReaderBook } from "../reader/engine/types";
import type { ReaderNavigationTarget } from "../reader/ReaderView";
import { resolveEditionFile, toReaderBook } from "../../catalog/toReaderBook";
import { useReaderJurisdiction } from "../book-detail/readerJurisdiction";
import { GuestNotice } from "../shared/GuestNotice";
import { ShellPage } from "../shared/ShellPage";
import { buildAtlasConnections, type AtlasConnection } from "./buildAtlas";
import { AtlasQuestionsSection } from "./AtlasQuestionsSection";
import { AtlasContradictionsSection } from "./AtlasContradictionsSection";

interface AtlasViewProps {
  onBack: () => void;
  onOpenBookDetail: (bookId: string) => void;
  onOpenAnnotationInReader: (book: ReaderBook, target: ReaderNavigationTarget) => void;
  onRequireSignIn: () => void;
}

interface AtlasState {
  entries: LibraryEntry[];
  annotations: Annotation[];
  threads: ThoughtThread[];
  activeBooks: Book[];
  connections: AtlasConnection[];
}

const EMPTY_ATLAS: AtlasState = {
  entries: [],
  annotations: [],
  threads: [],
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

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  // THOUGHT THREAD OPTIMISTIC CONCURRENCY v1: the updated_at snapshot the
  // editor was opened at -- the token replaceThoughtThread() must echo
  // back unchanged. Deliberately set ONLY by openEditThread() and
  // handleLoadLatestThreadVersion() below, never by loadAtlas()/
  // refreshThreads() while the editor is open: the whole point is that
  // this stays frozen at the version the visitor actually started editing
  // from, even if atlas.threads itself refreshes in the background.
  const [editingThreadExpectedUpdatedAt, setEditingThreadExpectedUpdatedAt] = useState<string | null>(null);
  const [isThreadComposerOpen, setThreadComposerOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadQuestion, setThreadQuestion] = useState("");
  const [threadSynthesis, setThreadSynthesis] = useState("");
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [isSavingThread, setSavingThread] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  // True only for the specific "someone else changed this Thread since
  // you opened it" failure -- gates the "Загрузить актуальную версию"
  // action below. Every other save failure (auth/thread-unavailable/
  // annotation-unavailable/generic) shows threadError the same way it
  // always has, with the composer left open and nothing discarded.
  const [isThreadConflict, setThreadConflict] = useState(false);
  const [isLoadingLatestThread, setLoadingLatestThread] = useState(false);

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
        // Reading Memory and explicit Thought Threads are independent personal inputs.
        // Automatic Atlas connections remain metadata-only in buildAtlasConnections().
        const [entries, annotations, threads] = await Promise.all([
          listLibrary(),
          listAnnotationsForUser(),
          listThoughtThreads()
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
          threads,
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

  const annotationById = useMemo(
    () => new Map(atlas.annotations.map(annotation => [annotation.id, annotation])),
    [atlas.annotations]
  );

  const readingCount = atlas.entries.filter(entry => entry.status === "reading").length;
  const finishedCount = atlas.entries.filter(entry => entry.status === "finished").length;
  const wantToReadCount = atlas.entries.filter(entry => entry.status === "want_to_read").length;
  const memoryWorkCount = new Set(atlas.annotations.map(annotation => annotation.workId)).size;
  const recentMemory = atlas.annotations.slice(0, 12);

  // Shared exact-reopen gate: the same jurisdiction-aware check
  // (resolveEditionFile -> toReaderBook) used by every Atlas surface that
  // reopens a saved fragment. Returns whether the Edition was actually
  // openable so a caller with its own layout (e.g. AtlasQuestionsSection's
  // evidence cards) can show its own unavailable state, without a second
  // Reader-opening mechanism anywhere in Atlas.
  function resolveAndOpenMemory(annotation: Annotation): boolean {
    const book = getBookById(annotation.workId);
    const resolved = book
      ? resolveEditionFile(book, annotation.editionId, readerJurisdiction ?? undefined)
      : null;

    if (!book || !resolved) return false;

    onOpenAnnotationInReader(
      toReaderBook(book, resolved, readerJurisdiction ?? undefined),
      { pageIndex: annotation.pageIndex, annotationId: annotation.id }
    );
    return true;
  }

  function handleOpenMemory(annotation: Annotation): void {
    setUnavailableId(resolveAndOpenMemory(annotation) ? null : annotation.id);
  }

  function resetThreadComposer(): void {
    setEditingThreadId(null);
    setEditingThreadExpectedUpdatedAt(null);
    setThreadComposerOpen(false);
    setThreadTitle("");
    setThreadQuestion("");
    setThreadSynthesis("");
    setSelectedAnnotationIds([]);
    setThreadError(null);
    setThreadConflict(false);
  }

  function openCreateThread(): void {
    setEditingThreadId(null);
    setEditingThreadExpectedUpdatedAt(null);
    setThreadTitle("");
    setThreadQuestion("");
    setThreadSynthesis("");
    setSelectedAnnotationIds([]);
    setThreadError(null);
    setThreadConflict(false);
    setThreadComposerOpen(true);
  }

  function openEditThread(thread: ThoughtThread): void {
    setEditingThreadId(thread.id);
    // Captured once, here -- see this state's own declaration comment for
    // why it must not track later atlas.threads refreshes.
    setEditingThreadExpectedUpdatedAt(thread.updatedAt);
    setThreadTitle(thread.title);
    setThreadQuestion(thread.question ?? "");
    setThreadSynthesis(thread.synthesisNote ?? "");
    // THOUGHT THREAD OPTIMISTIC CONCURRENCY v1 correction: thread.annotationIds
    // IS Thread membership -- it must be taken as-is, never filtered through
    // this tab's annotationById lookup. atlas.annotations and atlas.threads
    // come from two separate reads (Promise.all in loadAtlas is not a single
    // transactional snapshot), so an id can legitimately be missing from
    // annotationById here even though the server still considers it part of
    // this Thread. Filtering it out would silently drop it from
    // selectedAnnotationIds while editingThreadExpectedUpdatedAt still
    // matches the current DB version, so the very next save could delete it
    // with no OCC conflict at all.
    setSelectedAnnotationIds([...thread.annotationIds]);
    setThreadError(null);
    setThreadConflict(false);
    setThreadComposerOpen(true);
  }

  function toggleAnnotation(id: string): void {
    setSelectedAnnotationIds(current =>
      current.includes(id) ? current.filter(candidate => candidate !== id) : [...current, id]
    );
  }

  async function refreshThreads(): Promise<void> {
    const threads = await listThoughtThreads();
    setAtlas(current => ({ ...current, threads }));
  }

  async function handleSaveThread(): Promise<void> {
    const title = threadTitle.trim();
    if (!title) {
      setThreadError("Введите название нити.");
      return;
    }

    if (!editingThreadId && new Set(selectedAnnotationIds).size < 2) {
      setThreadError("Для первой нити выберите минимум два сохранённых фрагмента.");
      return;
    }

    setSavingThread(true);
    setThreadError(null);
    setThreadConflict(false);

    const input = {
      title,
      question: normalizeOptional(threadQuestion),
      synthesisNote: normalizeOptional(threadSynthesis),
      annotationIds: Array.from(new Set(selectedAnnotationIds))
    };

    try {
      if (editingThreadId) {
        if (!editingThreadExpectedUpdatedAt) {
          // Defensive only -- openEditThread() always sets this together
          // with editingThreadId, so this should be unreachable. Fail the
          // same way a real conflict would rather than ever sending a
          // replace with no version token at all.
          throw new ThoughtThreadReplaceError("conflict", "Отсутствует версия нити для сохранения.");
        }
        await replaceThoughtThread(editingThreadId, input, editingThreadExpectedUpdatedAt);
      } else {
        await createThoughtThread(input);
      }
      // Success is shown only after a confirmed server write and a fresh RLS-backed read.
      await refreshThreads();
      resetThreadComposer();
    } catch (saveError) {
      console.error("Thought Thread save failed:", saveError);

      if (saveError instanceof ThoughtThreadReplaceError) {
        switch (saveError.kind) {
          case "conflict":
            // THOUGHT THREAD OPTIMISTIC CONCURRENCY v1: this is the whole
            // point of this feature -- never silently merge, never
            // auto-discard the visitor's in-progress edit. The composer
            // stays open, title/question/synthesis/selectedAnnotationIds
            // are untouched, and the visitor explicitly decides via
            // handleLoadLatestThreadVersion() below.
            setThreadConflict(true);
            setThreadError(
              "Эта нить изменилась в другом месте. Загрузите актуальную версию перед повторным сохранением."
            );
            break;
          case "thread_unavailable":
            setThreadError("Эта нить мысли больше не существует.");
            break;
          case "annotation_unavailable":
            setThreadError("Один или несколько выбранных фрагментов больше недоступны. Обновите страницу и попробуйте снова.");
            break;
          case "not_authenticated":
            setThreadError("Сессия истекла. Войдите снова, чтобы сохранить нить.");
            break;
          default:
            setThreadError("Не удалось сохранить нить мысли.");
        }
      } else {
        setThreadError("Не удалось сохранить нить мысли.");
      }
    } finally {
      setSavingThread(false);
    }
  }

  // THOUGHT THREAD OPTIMISTIC CONCURRENCY v1: the visitor's explicit
  // response to a save conflict -- fetches a fresh, RLS-backed read of
  // this exact Thread and replaces the composer's fields with it,
  // including a fresh editingThreadExpectedUpdatedAt so the next save
  // attempt is based on the version actually just loaded. Deliberately
  // never called automatically -- only this one button click discards the
  // visitor's unsaved local edits, and only after they were already shown
  // the conflict message.
  async function handleLoadLatestThreadVersion(): Promise<void> {
    if (!editingThreadId) return;

    setLoadingLatestThread(true);
    try {
      // Fresh, RLS-backed reads of both Threads and annotations -- not a
      // single transactional snapshot, but close enough in time that we can
      // also refresh the annotation cards this conflict may be about (e.g.
      // a fragment Reader appended in another tab), on top of the
      // membership fix below which does not depend on this succeeding.
      const [threads, annotations] = await Promise.all([listThoughtThreads(), listAnnotationsForUser()]);
      const fresh = threads.find(candidate => candidate.id === editingThreadId);

      if (!fresh) {
        // Deleted elsewhere in the meantime -- nothing left to reload.
        resetThreadComposer();
        setThreadError("Эта нить мысли больше не существует.");
        return;
      }

      // Bring in any books behind the freshly-loaded annotations that this
      // tab's catalog doesn't already know about, so new fragment cards can
      // render a title/author instead of "Книга больше не найдена". Minimal
      // on purpose -- this is not a full Atlas reload.
      const unknownWorkIds = Array.from(
        new Set(annotations.map(annotation => annotation.workId).filter(workId => !getBookById(workId)))
      );
      if (unknownWorkIds.length) {
        await fetchAndMergeWorksByIds(unknownWorkIds);
      }

      setThreadTitle(fresh.title);
      setThreadQuestion(fresh.question ?? "");
      setThreadSynthesis(fresh.synthesisNote ?? "");
      // THOUGHT THREAD OPTIMISTIC CONCURRENCY v1 correction: same invariant
      // as openEditThread() above -- fresh.annotationIds IS the server's
      // Thread membership and must be kept as-is. Filtering it through the
      // annotation objects we just fetched (or the stale ones from before)
      // would silently drop any id the annotations read didn't happen to
      // return, then this becomes the new "expected" save baseline and the
      // very next save deletes that id with no conflict -- the exact bug
      // this reload action exists to fix, just reproduced one level deeper.
      // If an id is genuinely gone (annotation actually deleted), the
      // server's own AK002 on the next save is what surfaces that -- not a
      // silent client-side drop here.
      setSelectedAnnotationIds([...fresh.annotationIds]);
      setEditingThreadExpectedUpdatedAt(fresh.updatedAt);
      setAtlas(current => ({
        ...current,
        annotations,
        threads: current.threads.map(candidate => (candidate.id === fresh.id ? fresh : candidate))
      }));
      setThreadConflict(false);
      setThreadError(null);
    } catch (loadError) {
      console.error("Failed to load the latest Thought Thread version:", loadError);
      setThreadError("Не удалось загрузить актуальную версию нити. Попробуйте ещё раз.");
    } finally {
      setLoadingLatestThread(false);
    }
  }

  async function handleDeleteThread(thread: ThoughtThread): Promise<void> {
    if (!window.confirm(`Удалить нить «${thread.title}»? Сохранённые цитаты и заметки останутся.`)) return;

    setDeletingThreadId(thread.id);
    setThreadError(null);
    try {
      await deleteThoughtThread(thread.id);
      await refreshThreads();
      if (editingThreadId === thread.id) resetThreadComposer();
    } catch (deleteError) {
      console.error("Thought Thread delete failed:", deleteError);
      setThreadError("Не удалось удалить нить мысли.");
    } finally {
      setDeletingThreadId(null);
    }
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
              Atlas использует вашу библиотеку, выделения и заметки как реальные сигналы чтения. Автоматические связи между книгами по-прежнему строятся только из проверяемых данных AN.KI. Нити мысли ниже существуют только потому, что вы сами связали конкретные фрагменты.
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
              <h2>{atlas.threads.length}</h2>
              <p className="settings-section-note">нитей мысли создано</p>
            </div>
            <div className="subscription-block">
              <h2>{atlas.connections.length}</h2>
              <p className="settings-section-note">проверяемых связей найдено</p>
            </div>
          </section>

          <section className="notes-group" aria-label="Нити мысли">
            <header className="notes-group-header">
              <div>
                <p className="eyebrow">Thought Threads</p>
                <h2 className="notes-group-title">Нити мысли</h2>
                <p className="notes-group-author">
                  Связывайте сохранённые фрагменты из разных книг в одну проблему, вопрос или собственную мыслительную линию.
                </p>
              </div>
              {atlas.annotations.length >= 2 && !isThreadComposerOpen && (
                <button type="button" className="primary-button" onClick={openCreateThread}>
                  Создать нить
                </button>
              )}
            </header>

            {threadError && <p className="notes-card-error">{threadError}</p>}

            {atlas.annotations.length === 0 && (
              <GuestNotice message="Сначала сохраните несколько фрагментов во время чтения — из них можно будет собрать первую нить мысли." />
            )}

            {atlas.annotations.length === 1 && (
              <GuestNotice message="У вас уже есть один сохранённый фрагмент. Для создания первой нити нужен ещё хотя бы один." />
            )}

            {isThreadComposerOpen && (
              <article className="notes-card">
                <p className="eyebrow">{editingThreadId ? "Редактирование нити" : "Новая нить"}</p>

                <input
                  type="text"
                  className="notes-search-input"
                  value={threadTitle}
                  maxLength={200}
                  placeholder="Название нити — например, «Свобода и ответственность»"
                  aria-label="Название нити мысли"
                  onChange={event => setThreadTitle(event.target.value)}
                />

                <textarea
                  className="annotation-note-input"
                  value={threadQuestion}
                  placeholder="Вопрос, который проходит через эти фрагменты (необязательно)"
                  aria-label="Вопрос нити мысли"
                  onChange={event => setThreadQuestion(event.target.value)}
                />

                <textarea
                  className="annotation-note-input"
                  value={threadSynthesis}
                  placeholder="Ваша итоговая или промежуточная мысль об этой нити (необязательно)"
                  aria-label="Итоговая мысль нити"
                  onChange={event => setThreadSynthesis(event.target.value)}
                />

                <p className="settings-section-note">
                  Выбрано фрагментов: {selectedAnnotationIds.length}
                  {!editingThreadId ? " · для создания нужно минимум 2" : ""}
                </p>

                <div className="notes-group-items">
                  {atlas.annotations.map(annotation => {
                    const book = getBookById(annotation.workId);
                    const checked = selectedAnnotationIds.includes(annotation.id);
                    return (
                      <label key={annotation.id} className="notes-card">
                        <div className="notes-card-actions">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAnnotation(annotation.id)}
                            aria-label={`Добавить фрагмент из ${book?.title ?? "книги"}`}
                          />
                          <strong>{book?.title ?? "Книга больше не найдена"}</strong>
                          {book?.authorName ? <span>· {book.authorName}</span> : null}
                        </div>
                        <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>
                        {annotation.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
                      </label>
                    );
                  })}
                </div>

                {isThreadConflict && (
                  <>
                    <p className="settings-section-note">
                      Это заменит несохранённые изменения в форме актуальной версией из базы.
                    </p>
                    <div className="notes-card-actions">
                      <button
                        type="button"
                        className="text-link"
                        disabled={isLoadingLatestThread}
                        onClick={() => void handleLoadLatestThreadVersion()}
                      >
                        {isLoadingLatestThread ? "Загрузка…" : "Загрузить актуальную версию"}
                      </button>
                    </div>
                  </>
                )}

                <div className="notes-card-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isSavingThread}
                    onClick={() => void handleSaveThread()}
                  >
                    {isSavingThread ? "Сохранение…" : editingThreadId ? "Сохранить изменения" : "Создать нить"}
                  </button>
                  <button type="button" className="text-link" disabled={isSavingThread} onClick={resetThreadComposer}>
                    Отмена
                  </button>
                </div>
              </article>
            )}

            {!isThreadComposerOpen && atlas.threads.length === 0 && atlas.annotations.length >= 2 && (
              <p className="settings-section-note">
                Пока ни одной нити нет. Выберите несколько сохранённых фрагментов и свяжите их собственной формулировкой.
              </p>
            )}

            <div className="notes-group-items">
              {atlas.threads.map(thread => {
                const items = thread.annotationIds
                  .map(id => annotationById.get(id))
                  .filter((annotation): annotation is Annotation => Boolean(annotation));
                const workCount = new Set(items.map(item => item.workId)).size;

                return (
                  <article key={thread.id} className="notes-card">
                    <p className="eyebrow">Нить мысли</p>
                    <h3 className="plan-card-name">{thread.title}</h3>
                    {thread.question && (
                      <p className="settings-section-note"><strong>Вопрос:</strong> {thread.question}</p>
                    )}
                    {thread.synthesisNote && <p className="notes-card-note">{thread.synthesisNote}</p>}
                    <p className="settings-section-note">
                      {items.length} сохранённых фрагментов · {workCount} книг
                    </p>

                    {items.length <= 1 && (
                      <p className="settings-section-note">
                        Часть исходной памяти этой нити могла быть удалена. Сама нить и ваша итоговая мысль сохранены.
                      </p>
                    )}

                    <div className="notes-group-items">
                      {items.map(annotation => {
                        const book = getBookById(annotation.workId);
                        return (
                          <div key={`${thread.id}-${annotation.id}`} className="notes-card">
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
                          </div>
                        );
                      })}
                    </div>

                    <div className="notes-card-actions">
                      <button type="button" className="text-link" onClick={() => openEditThread(thread)}>
                        Изменить нить
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        disabled={deletingThreadId === thread.id}
                        onClick={() => void handleDeleteThread(thread)}
                      >
                        {deletingThreadId === thread.id ? "Удаление…" : "Удалить нить"}
                      </button>
                    </div>
                    <p className="notes-card-date">{formatDate(thread.updatedAt)}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <AtlasQuestionsSection
            annotationCount={atlas.annotations.length}
            annotationById={annotationById}
            onOpenAnnotationInReader={resolveAndOpenMemory}
          />

          <AtlasContradictionsSection
            annotationCount={atlas.annotations.length}
            annotationById={annotationById}
            onOpenAnnotationInReader={resolveAndOpenMemory}
          />

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
            <GuestNotice message="Для первой автоматической связи нужны хотя бы две книги из вашей реальной истории чтения." />
          ) : atlas.connections.length === 0 ? (
            <GuestNotice message="Книги уже в Atlas, но по текущим проверяемым метаданным между ними пока нет достаточно сильной автоматической связи." />
          ) : (
            <section className="subscription-plans" aria-label="Автоматические связи между книгами">
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
              Следующий интеллектуальный слой сможет предлагать смысловые связи между уже существующими сигналами: общие идеи в сохранённых фрагментах, противоречия, повторяющиеся вопросы и развитие темы между книгами. Но созданные вами нити останутся явными пользовательскими связями, а не догадкой AI.
            </p>
          </section>

          {(readingCount > 0 || finishedCount > 0) && (
            <p className="settings-section-note">
              Сейчас в библиотеке: читаете — {readingCount}, завершено — {finishedCount}. Книг с личной памятью — {memoryWorkCount}.
            </p>
          )}
        </>
      )}
    </ShellPage>
  );
}
