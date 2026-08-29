import { useEffect, useMemo, useRef, useState } from "react";
import { ShellPage } from "../shared/ShellPage";
import { getBookById } from "../../catalog";
import type { Book as CatalogBook } from "../../catalog/types";
import type { Book as ReaderBook } from "../reader/engine/types";
import type { ReaderNavigationTarget } from "../reader/ReaderView";
import { useAuth } from "../../auth/supabaseAuth";
import { useReaderJurisdiction } from "../book-detail/readerJurisdiction";
import { resolveEditionFile, toReaderBook } from "../../catalog/toReaderBook";
import { LANGUAGE_OPTIONS } from "../../catalog/languages";
import { fetchAndMergeWorksByIds } from "../../api/userLibrary";
import { listAnnotationsForUser, updateAnnotationNote, deleteAnnotation } from "../../api/annotations";
import type { Annotation } from "../../api/annotations";

// NOTES + HIGHLIGHTS PHASE: the real "Заметки" screen -- a personal
// reading card catalog, not a SaaS dashboard. Reuses exactly the pattern
// MyLibraryView.tsx already established for this kind of screen (real
// Supabase data, a single batch Work-metadata fetch via
// omnia-library-catalog's workIds mode, guest/loading/error/empty states,
// same ShellPage frame) -- this is not a second, differently-shaped
// account screen.

interface NotesViewProps {
  onBack: () => void;
  // "Открыть книгу" on a group heading -- opens Book Detail, not Reader
  // directly (a visitor may want to see the Work without re-reading a
  // specific edition).
  onOpenBookDetail: (bookId: string) => void;
  // The important flow (spec requirement): Notes -> a specific annotation
  // -> the exact Edition -> Reader, at that annotation's own position.
  // This view does the rights/jurisdiction check itself (resolveEditionFile,
  // the SAME gate BookDetailView's own "Читать" uses) before ever calling
  // this -- App.tsx/ReaderView never bypass it.
  onOpenAnnotationInReader: (book: ReaderBook, target: ReaderNavigationTarget) => void;
  onRequireSignIn: () => void;
  onOpenLibrary: () => void;
}

type Status = "loading" | "success" | "empty" | "error";

interface AnnotationGroup {
  workId: string;
  book: CatalogBook | undefined;
  items: Annotation[];
}

function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find(option => option.value === code)?.label ?? code;
}

// Multiple-editions requirement: only shown at all when a Work's OWN
// saved annotations span more than one edition_id -- a Work read in only
// one edition never grows an edition tag, so the common case stays quiet.
function editionLabel(book: CatalogBook | undefined, editionId: string): string | null {
  const edition = book?.editions.find(candidate => candidate.id === editionId);
  if (!edition) return null;
  const language = languageLabel(edition.language);
  return edition.translatorName?.trim() ? `${language} · ${edition.translatorName.trim()}` : language;
}

function buildGroups(items: Annotation[]): AnnotationGroup[] {
  const order: string[] = [];
  const byWork = new Map<string, Annotation[]>();
  for (const item of items) {
    if (!byWork.has(item.workId)) {
      byWork.set(item.workId, []);
      order.push(item.workId);
    }
    byWork.get(item.workId)!.push(item);
  }
  return order.map(workId => ({ workId, book: getBookById(workId), items: byWork.get(workId)! }));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export function NotesView({
  onBack,
  onOpenBookDetail,
  onOpenAnnotationInReader,
  onRequireSignIn,
  onOpenLibrary
}: NotesViewProps) {

  const { isAuthenticated } = useAuth();
  const [readerJurisdiction] = useReaderJurisdiction();

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  const [searchQuery, setSearchQuery] = useState("");
  const [bookFilter, setBookFilter] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [unavailableId, setUnavailableId] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  // Batch load, same no-N+1 shape as MyLibraryView.tsx: one
  // listAnnotationsForUser() call for every annotation this visitor has,
  // across every Work/Edition, then a SINGLE fetchAndMergeWorksByIds()
  // call for the distinct Work ids those rows reference -- never one
  // request per annotation or per book.
  useEffect(() => {

    if (!isAuthenticated) {
      setStatus("empty");
      setAnnotations([]);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");

    (async () => {
      try {

        const rows = await listAnnotationsForUser();
        if (requestId !== requestIdRef.current) return;

        const workIds = Array.from(new Set(rows.map(row => row.workId)));
        if (workIds.length > 0) {
          await fetchAndMergeWorksByIds(workIds);
        }
        if (requestId !== requestIdRef.current) return;

        setAnnotations(rows);
        setStatus(rows.length ? "success" : "empty");

      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error("NotesView load failed:", error);
        setStatus("error");
      }
    })();

  }, [isAuthenticated]);

  const allGroups = useMemo(() => buildGroups(annotations), [annotations]);

  const filterOptions = useMemo(
    () => allGroups.map(group => ({ workId: group.workId, title: group.book?.title ?? "Без названия" })),
    [allGroups]
  );

  const visibleGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allGroups
      .filter(group => !bookFilter || group.workId === bookFilter)
      .map(group => ({
        ...group,
        items: query
          ? group.items.filter(item =>
              item.quoteText.toLowerCase().includes(query) ||
              (item.noteText ?? "").toLowerCase().includes(query)
            )
          : group.items
      }))
      .filter(group => group.items.length > 0);
  }, [allGroups, bookFilter, searchQuery]);

  function clearCardError(id: string): void {
    setCardErrors(previous => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  function startEdit(annotation: Annotation): void {
    setEditingId(annotation.id);
    setDraftNote(annotation.noteText ?? "");
    clearCardError(annotation.id);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setDraftNote("");
  }

  async function handleSaveNote(id: string): Promise<void> {

    const value = draftNote.trim();
    setSavingNoteId(id);
    clearCardError(id);

    try {
      const updated = await updateAnnotationNote(id, value.length ? value : null);
      setAnnotations(previous => previous.map(item => (item.id === id ? updated : item)));
      setEditingId(null);
    } catch (error) {
      console.error("updateAnnotationNote failed:", error);
      setCardErrors(previous => ({ ...previous, [id]: "Не удалось сохранить заметку." }));
    } finally {
      setSavingNoteId(null);
    }

  }

  // Idempotent from the caller's own point of view too: a second click
  // while the first delete is still in flight is prevented by the
  // `deletingId` disabled state below, and the underlying DELETE itself
  // is safe to repeat (matches zero rows, not an error) per
  // deleteAnnotation's own comment.
  async function handleDelete(id: string): Promise<void> {

    const previous = annotations;
    setDeletingId(id);
    clearCardError(id);
    setAnnotations(current => current.filter(item => item.id !== id));

    try {
      await deleteAnnotation(id);
    } catch (error) {
      console.error("deleteAnnotation failed:", error);
      setAnnotations(previous);
      setCardErrors(current => ({ ...current, [id]: "Не удалось удалить." }));
    } finally {
      setDeletingId(null);
    }

  }

  // Verifies the Edition is still readable in the current jurisdiction
  // (the exact same resolveEditionFile gate BookDetailView's own "Читать"
  // button runs) BEFORE ever handing anything to onOpenAnnotationInReader
  // -- never a bypass of that rights check, and the annotation itself is
  // never touched either way.
  function handleOpenInReader(annotation: Annotation): void {

    const book = getBookById(annotation.workId);
    const resolved = book ? resolveEditionFile(book, annotation.editionId, readerJurisdiction ?? undefined) : null;

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

  if (!isAuthenticated) {
    return (
      <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Заметки">
        <div className="guest-notice">
          <p className="guest-notice-message">
            Здесь появятся ваши выделения и заметки из книг. Чтобы сохранять их и открывать на любом устройстве, войдите в аккаунт.
          </p>
          <div className="guest-notice-actions">
            <button type="button" className="primary-button" onClick={onRequireSignIn}>Войти</button>
          </div>
        </div>
      </ShellPage>
    );
  }

  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Заметки">

      {status === "loading" && annotations.length === 0 && (
        <div className="empty-state">Загрузка…</div>
      )}

      {status === "error" && (
        <p className="my-library-error">Не удалось загрузить заметки. Попробуйте обновить страницу.</p>
      )}

      {status === "empty" && (
        <div className="guest-notice">
          <p className="guest-notice-message">Здесь появятся ваши выделения и заметки из книг.</p>
          <div className="guest-notice-actions">
            <button type="button" className="primary-button" onClick={onOpenLibrary}>Перейти в библиотеку</button>
          </div>
        </div>
      )}

      {annotations.length > 0 && (
        <>

          <div className="notes-filters">
            <input
              type="search"
              className="notes-search-input"
              placeholder="Искать по цитате или заметке…"
              aria-label="Искать по цитате или заметке"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
            />
            {filterOptions.length > 1 && (
              <select
                className="notes-book-select"
                aria-label="Фильтр по книге"
                value={bookFilter}
                onChange={event => setBookFilter(event.target.value)}
              >
                <option value="">Все книги</option>
                {filterOptions.map(option => (
                  <option key={option.workId} value={option.workId}>{option.title}</option>
                ))}
              </select>
            )}
          </div>

          {visibleGroups.length === 0 && (
            <p className="my-library-error">Ничего не найдено.</p>
          )}

          <div className="notes-groups">
            {visibleGroups.map(group => {

              const showEditionLabel = new Set(group.items.map(item => item.editionId)).size > 1;

              return (
                <section key={group.workId} className="notes-group">

                  <header className="notes-group-header">
                    <div>
                      <h2 className="notes-group-title">{group.book?.title ?? "Книга больше не найдена"}</h2>
                      {group.book?.authorName && (
                        <p className="notes-group-author">{group.book.authorName}</p>
                      )}
                    </div>
                    {group.book && (
                      <button type="button" className="text-link" onClick={() => onOpenBookDetail(group.workId)}>
                        Открыть книгу
                      </button>
                    )}
                  </header>

                  <div className="notes-group-items">
                    {group.items.map(annotation => (
                      <article key={annotation.id} className="notes-card">

                        {showEditionLabel && editionLabel(group.book, annotation.editionId) && (
                          <p className="notes-card-edition">{editionLabel(group.book, annotation.editionId)}</p>
                        )}

                        <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>

                        {editingId === annotation.id ? (
                          <div className="annotation-note-editor">
                            <textarea
                              className="annotation-note-input"
                              placeholder="Добавьте комментарий к этому фрагменту…"
                              value={draftNote}
                              onChange={event => setDraftNote(event.target.value)}
                            />
                            <div className="annotation-note-actions">
                              <button
                                type="button"
                                className="text-link"
                                disabled={savingNoteId === annotation.id}
                                onClick={() => handleSaveNote(annotation.id)}
                              >
                                {savingNoteId === annotation.id ? "Сохранение…" : "Сохранить"}
                              </button>
                              <button type="button" className="text-link" onClick={cancelEdit}>Отмена</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {annotation.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
                            <div className="notes-card-actions">
                              <button type="button" className="text-link" onClick={() => startEdit(annotation)}>
                                {annotation.noteText ? "Изменить заметку" : "Добавить заметку"}
                              </button>
                              <button type="button" className="text-link" onClick={() => handleOpenInReader(annotation)}>
                                Открыть в Reader
                              </button>
                              <button
                                type="button"
                                className="text-link"
                                disabled={deletingId === annotation.id}
                                onClick={() => handleDelete(annotation.id)}
                              >
                                {deletingId === annotation.id ? "Удаление…" : "Удалить"}
                              </button>
                            </div>
                          </>
                        )}

                        {unavailableId === annotation.id && (
                          <p className="book-detail-unavailable">
                            Это издание сейчас недоступно в вашей юрисдикции.
                          </p>
                        )}

                        {cardErrors[annotation.id] && (
                          <p className="notes-card-error">{cardErrors[annotation.id]}</p>
                        )}

                        <p className="notes-card-date">{formatDate(annotation.createdAt)}</p>

                      </article>
                    ))}
                  </div>

                </section>
              );

            })}
          </div>

        </>
      )}

    </ShellPage>
  );

}
