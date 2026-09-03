import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useAuth } from "../../auth/supabaseAuth";
import { fetchAndMergeWorksByIds, listLibrary, type LibraryEntry } from "../../api/userLibrary";
import { listAnnotationsForUser, type Annotation } from "../../api/annotations";
import { listAtlasMemorySignals, type AtlasMemorySignal } from "../../api/atlasMemory";
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
import { AtlasUnfinishedLinesSection } from "./AtlasUnfinishedLinesSection";
import { AtlasCanonSection } from "./AtlasCanonSection";
import { AtlasOverview, type AtlasSectionId } from "./AtlasOverview";
import {
  AtlasPersistentMemorySection,
  isVisibleAtlasMemorySignal
} from "./AtlasPersistentMemorySection";

function AtlasBackToOverviewLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="notes-card-actions">
      <button type="button" className="text-link" onClick={onClick}>
        ↑ К оглавлению Atlas
      </button>
    </div>
  );
}

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
  memorySignals: AtlasMemorySignal[];
  activeBooks: Book[];
  connections: AtlasConnection[];
}

const EMPTY_ATLAS: AtlasState = {
  entries: [],
  annotations: [],
  threads: [],
  memorySignals: [],
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

function isThreadOpen(thread: ThoughtThread): boolean {
  const hasQuestion = Boolean(thread.question && thread.question.trim().length > 0);
  const hasSynthesis = Boolean(thread.synthesisNote && thread.synthesisNote.trim().length > 0);
  return hasQuestion && !hasSynthesis;
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
  const [editingThreadExpectedUpdatedAt, setEditingThreadExpectedUpdatedAt] = useState<string | null>(null);
  const [isThreadComposerOpen, setThreadComposerOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadQuestion, setThreadQuestion] = useState("");
  const [threadSynthesis, setThreadSynthesis] = useState("");
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [isSavingThread, setSavingThread] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [isThreadConflict, setThreadConflict] = useState(false);
  const [isLoadingLatestThread, setLoadingLatestThread] = useState(false);

  const overviewRef = useRef<HTMLDivElement | null>(null);
  const canonRef = useRef<HTMLDivElement | null>(null);
  const threadsRef = useRef<HTMLDivElement | null>(null);
  const unfinishedRef = useRef<HTMLDivElement | null>(null);
  const questionsRef = useRef<HTMLDivElement | null>(null);
  const contradictionsRef = useRef<HTMLDivElement | null>(null);
  const memoryRef = useRef<HTMLDivElement | null>(null);
  const connectionsRef = useRef<HTMLDivElement | null>(null);

  function scrollToSection(id: AtlasSectionId): void {
    const targets: Record<AtlasSectionId, RefObject<HTMLDivElement | null>> = {
      canon: canonRef,
      threads: threadsRef,
      unfinished: unfinishedRef,
      questions: questionsRef,
      contradictions: contradictionsRef,
      memory: memoryRef,
      connections: connectionsRef
    };
    targets[id].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToOverview(): void {
    overviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
        const [entries, annotations, threads, memorySignals] = await Promise.all([
          listLibrary(),
          listAnnotationsForUser(),
          listThoughtThreads(),
          listAtlasMemorySignals()
        ]);

        const activeEntries = entries.filter(entry => entry.status === "reading" || entry.status === "finished");
        const libraryWorkIds = activeEntries.map(entry => entry.workId);
        const annotationWorkIds = annotations.map(annotation => annotation.workId);
        const memorySignalWorkIds = memorySignals
          .filter(isVisibleAtlasMemorySignal)
          .map(signal => signal.workId)
          .filter((workId): workId is string => Boolean(workId));
        const workIds = Array.from(new Set([...libraryWorkIds, ...annotationWorkIds, ...memorySignalWorkIds]));

        await fetchAndMergeWorksByIds(workIds);

        if (cancelled) return;

        const activeBooks = workIds
          .map(workId => getBookById(workId))
          .filter((book): book is Book => Boolean(book));

        setAtlas({
          entries,
          annotations,
          threads,
          memorySignals,
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

  const visibleMemorySignals = useMemo(
    () => atlas.memorySignals.filter(isVisibleAtlasMemorySignal),
    [atlas.memorySignals]
  );

  const readingCount = atlas.entries.filter(entry => entry.status === "reading").length;
  const finishedCount = atlas.entries.filter(entry => entry.status === "finished").length;
  const wantToReadCount = atlas.entries.filter(entry => entry.status === "want_to_read").length;
  const memoryWorkCount = new Set(
    visibleMemorySignals.map(signal => signal.workId).filter((workId): workId is string => Boolean(workId))
  ).size;
  const openThreadsCount = atlas.threads.filter(isThreadOpen).length;
  const connectionsStrongCount = atlas.connections.filter(connection => connection.strength === "strong").length;

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

  async function resolveAndOpenMemoryById(annotationId: string): Promise<boolean> {
    const existing = annotationById.get(annotationId);
    if (existing) return resolveAndOpenMemory(existing);

    let fresh: Annotation[];
    try {
      fresh = await listAnnotationsForUser();
    } catch (refreshError) {
      console.error("Atlas: refreshing annotations for exact reopen failed:", refreshError);
      return false;
    }

    const found = fresh.find(candidate => candidate.id === annotationId);
    if (!found) return false;

    if (!getBookById(found.workId)) {
      try {
        await fetchAndMergeWorksByIds([found.workId]);
      } catch (mergeError) {
        console.error("Atlas: merging Work for exact reopen failed:", mergeError);
      }
    }

    setAtlas(current =>
      current.annotations.some(candidate => candidate.id === found.id)
        ? current
        : { ...current, annotations: [...current.annotations, found] }
    );

    return resolveAndOpenMemory(found);
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
    setEditingThreadExpectedUpdatedAt(thread.updatedAt);
    setThreadTitle(thread.title);
    setThreadQuestion(thread.question ?? "");
    setThreadSynthesis(thread.synthesisNote ?? "");
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
    const [threads, memorySignals] = await Promise.all([
      listThoughtThreads(),
      listAtlasMemorySignals()
    ]);
    setAtlas(current => ({ ...current, threads, memorySignals }));
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
          throw new ThoughtThreadReplaceError("conflict", "Отсутствует версия нити для сохранения.");
        }
        await replaceThoughtThread(editingThreadId, input, editingThreadExpectedUpdatedAt);
      } else {
        await createThoughtThread(input);
      }
      await refreshThreads();
      resetThreadComposer();
    } catch (saveError) {
      console.error("Thought Thread save failed:", saveError);

      if (saveError instanceof ThoughtThreadReplaceError) {
        switch (saveError.kind) {
          case "conflict":
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

  async function handleLoadLatestThreadVersion(): Promise<void> {
    if (!editingThreadId) return;

    setLoadingLatestThread(true);
    try {
      const [threads, annotations, memorySignals] = await Promise.all([
        listThoughtThreads(),
        listAnnotationsForUser(),
        listAtlasMemorySignals()
      ]);
      const fresh = threads.find(candidate => candidate.id === editingThreadId);

      if (!fresh) {
        resetThreadComposer();
        setThreadError("Эта нить мысли больше не существует.");
        return;
      }

      const unknownWorkIds = Array.from(
        new Set(annotations.map(annotation => annotation.workId).filter(workId => !getBookById(workId)))
      );
      if (unknownWorkIds.length) {
        await fetchAndMergeWorksByIds(unknownWorkIds);
      }

      setThreadTitle(fresh.title);
      setThreadQuestion(fresh.question ?? "");
      setThreadSynthesis(fresh.synthesisNote ?? "");
      setSelectedAnnotationIds([...fresh.annotationIds]);
      setEditingThreadExpectedUpdatedAt(fresh.updatedAt);
      setAtlas(current => ({
        ...current,
        annotations,
        memorySignals,
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
          <div ref={overviewRef}>
            <AtlasOverview
              booksCount={atlas.activeBooks.length}
              fragmentsCount={atlas.annotations.length}
              memorySignalsCount={visibleMemorySignals.length}
              memoryWorkCount={memoryWorkCount}
              threadsCount={atlas.threads.length}
              openThreadsCount={openThreadsCount}
              connectionsCount={atlas.connections.length}
              connectionsStrongCount={connectionsStrongCount}
              onNavigate={scrollToSection}
            />
          </div>

          <div ref={canonRef}>
            <AtlasCanonSection libraryEntries={atlas.entries} onOpenBookDetail={onOpenBookDetail} />
            <AtlasBackToOverviewLink onClick={scrollToOverview} />
          </div>

          <section ref={threadsRef} className="notes-group" aria-label="Нити мысли">
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

            <AtlasBackToOverviewLink onClick={scrollToOverview} />
          </section>

          <div ref={unfinishedRef}>
            <AtlasUnfinishedLinesSection
              threads={atlas.threads}
              annotationById={annotationById}
              onOpenEvidence={resolveAndOpenMemoryById}
              onThreadUpdated={refreshThreads}
            />
            <AtlasBackToOverviewLink onClick={scrollToOverview} />
          </div>

          <div ref={questionsRef}>
            <AtlasQuestionsSection
              annotationCount={atlas.annotations.length}
              annotationById={annotationById}
              onOpenAnnotationInReader={resolveAndOpenMemory}
            />
            <AtlasBackToOverviewLink onClick={scrollToOverview} />
          </div>

          <div ref={contradictionsRef}>
            <AtlasContradictionsSection
              annotationCount={atlas.annotations.length}
              annotationById={annotationById}
              onOpenAnnotationInReader={resolveAndOpenMemory}
            />
            <AtlasBackToOverviewLink onClick={scrollToOverview} />
          </div>

          <section ref={memoryRef} className="notes-group" aria-label="Постоянная память Atlas">
            <AtlasPersistentMemorySection
              signals={atlas.memorySignals}
              annotationById={annotationById}
              unavailableAnnotationId={unavailableId}
              onOpenBookDetail={onOpenBookDetail}
              onOpenAnnotation={handleOpenMemory}
            />
            <AtlasBackToOverviewLink onClick={scrollToOverview} />
          </section>

          {wantToReadCount > 0 && (
            <p className="settings-section-note">
              Ещё {wantToReadCount} книг в «Хочу прочитать» сохраняются в аккаунте, но сами по себе не считаются интеллектуальной историей Atlas: книга входит в активную память, когда чтение началось, появилась закладка или сохранённая мысль.
            </p>
          )}

          <section ref={connectionsRef} className="notes-group" aria-label="Автоматические связи между книгами">
            <header className="notes-group-header">
              <div>
                <p className="eyebrow">Connections</p>
                <h2 className="notes-group-title">Связи книг</h2>
                <p className="notes-group-author">Автоматические связи между прочитанными книгами по проверяемым метаданным.</p>
              </div>
            </header>

            {atlas.activeBooks.length < 2 ? (
              <GuestNotice message="Для первой автоматической связи нужны хотя бы две книги из вашей реальной истории чтения." />
            ) : atlas.connections.length === 0 ? (
              <GuestNotice message="Книги уже в Atlas, но по текущим проверяемым метаданным между ними пока нет достаточно сильной автоматической связи." />
            ) : (
              <div className="subscription-plans" aria-label="Найденные связи">
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
              </div>
            )}

            <AtlasBackToOverviewLink onClick={scrollToOverview} />
          </section>

          {(readingCount > 0 || finishedCount > 0 || visibleMemorySignals.length > 0) && (
            <p className="settings-section-note">
              Сейчас в библиотеке: читаете — {readingCount}, завершено — {finishedCount}. В постоянной памяти — {visibleMemorySignals.length} сигналов по {memoryWorkCount} книгам.
            </p>
          )}
        </>
      )}
    </ShellPage>
  );
}